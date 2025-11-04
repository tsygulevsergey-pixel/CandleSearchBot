/**
 * Backfill MFE/MAE data for closed signals
 * 
 * This script recovers missing MFE/MAE data by:
 * 1. Fetching 1m candle history between signal creation and close
 * 2. Calculating max favorable and adverse excursion
 * 3. Determining first touch (TP or SL)
 * 4. Calculating time to TP/SL
 * 
 * Usage:
 *   npm run backfill-mfe-mae
 * 
 * Options:
 *   --dry-run: Show what would be updated without writing to DB
 *   --limit: Process only N signals (default: all)
 */

import { db } from '../mastra/storage/db.js';
import { signals } from '../mastra/storage/schema.js';
import { eq, and, or, isNull } from 'drizzle-orm';
import { BinanceClient } from '../utils/binanceClient.js';

const binanceClient = new BinanceClient();

interface SignalData {
  id: number;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: string;
  slPrice: string;
  tp1Price: string | null;
  tp2Price: string;
  tp3Price: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

async function calculateMFEMAE(signal: SignalData) {
  console.log(`\n📊 [Backfill] Processing signal #${signal.id} ${signal.symbol} ${signal.direction}`);
  
  const entryPrice = parseFloat(signal.entryPrice);
  const slPrice = parseFloat(signal.slPrice);
  const R = Math.abs(entryPrice - slPrice); // 1R
  
  // Get 1m candles between signal creation and close
  const startTime = signal.createdAt.getTime();
  const endTime = signal.updatedAt.getTime();
  const durationMinutes = Math.ceil((endTime - startTime) / (1000 * 60));
  
  console.log(`   📅 Duration: ${durationMinutes} minutes (${new Date(startTime).toISOString()} → ${new Date(endTime).toISOString()})`);
  
  if (durationMinutes <= 0) {
    console.log(`   ⚠️ Invalid duration, skipping`);
    return null;
  }
  
  // Binance has limit of 1500 candles per request (we use 1000 for safety)
  // For very long signals, we'll analyze only the last 1000 minutes
  const MAX_CANDLES = 1000;
  const candlesToFetch = Math.min(durationMinutes + 10, MAX_CANDLES);
  
  if (durationMinutes > MAX_CANDLES) {
    console.log(`   ⚠️ Signal duration (${durationMinutes}min) > ${MAX_CANDLES}min, analyzing last ${MAX_CANDLES} minutes only`);
  }
  
  let allCandles: any[] = [];
  
  try {
    // Fetch last N candles (includes current/open candle)
    allCandles = await binanceClient.getKlines(
      signal.symbol,
      '1m',
      candlesToFetch,
      true // Include open candle (most recent)
    );
    
    console.log(`   📊 Fetched ${allCandles.length} candles`);
    
    if (allCandles.length === 0) {
      console.log(`   ⚠️ No candles found, skipping`);
      return null;
    }
    
    // Calculate MFE/MAE from candles
    let mfe = 0; // Max favorable excursion
    let mae = 0; // Max adverse excursion
    let firstTouch: string | null = null;
    
    const tp1 = signal.tp1Price ? parseFloat(signal.tp1Price) : null;
    const tp2 = parseFloat(signal.tp2Price);
    const tp3 = signal.tp3Price ? parseFloat(signal.tp3Price) : null;
    const sl = slPrice;
    
    for (const candle of allCandles) {
      const high = Number(candle.high);
      const low = Number(candle.low);
      
      // Calculate excursion at this candle
      let favorableExcursion = 0;
      let adverseExcursion = 0;
      
      if (signal.direction === 'LONG') {
        favorableExcursion = (high - entryPrice) / R;
        adverseExcursion = (low - entryPrice) / R;
        
        // Check first touch
        if (!firstTouch) {
          if (tp3 && high >= tp3) firstTouch = 'tp3';
          else if (high >= tp2) firstTouch = 'tp2';
          else if (tp1 && high >= tp1) firstTouch = 'tp1';
          else if (low <= sl) firstTouch = 'sl';
        }
      } else {
        favorableExcursion = (entryPrice - low) / R;
        adverseExcursion = (entryPrice - high) / R;
        
        // Check first touch
        if (!firstTouch) {
          if (tp3 && low <= tp3) firstTouch = 'tp3';
          else if (low <= tp2) firstTouch = 'tp2';
          else if (tp1 && low <= tp1) firstTouch = 'tp1';
          else if (high >= sl) firstTouch = 'sl';
        }
      }
      
      // Update MFE/MAE
      mfe = Math.max(mfe, favorableExcursion);
      mae = Math.min(mae, adverseExcursion);
    }
    
    // Calculate time to TP/SL
    const timeToTargetMin = Math.floor((endTime - startTime) / (1000 * 60));
    
    let timeToTp1Min: number | null = null;
    let timeToTp2Min: number | null = null;
    let timeToTp3Min: number | null = null;
    let timeToSlMin: number | null = null;
    
    if (signal.status === 'TP1_HIT') timeToTp1Min = timeToTargetMin;
    else if (signal.status === 'TP2_HIT') timeToTp2Min = timeToTargetMin;
    else if (signal.status === 'TP3_HIT') timeToTp3Min = timeToTargetMin;
    else if (signal.status === 'SL_HIT') timeToSlMin = timeToTargetMin;
    
    console.log(`   ✅ MFE: ${mfe.toFixed(2)}R, MAE: ${mae.toFixed(2)}R, First touch: ${firstTouch || 'none'}`);
    console.log(`   ⏱️ Time to ${signal.status}: ${timeToTargetMin} minutes`);
    
    return {
      mfeR: mfe,
      maeR: mae,
      firstTouch,
      timeToTp1Min,
      timeToTp2Min,
      timeToTp3Min,
      timeToSlMin,
    };
  } catch (error: any) {
    console.error(`   ❌ Error fetching candles: ${error.message}`);
    return null;
  }
}

async function backfillMFEMAE(options: { dryRun: boolean; limit?: number }) {
  console.log('🔄 [Backfill] Starting MFE/MAE backfill...\n');
  
  // Find all closed signals with NULL mfe_r
  const closedStatuses = ['TP1_HIT', 'TP2_HIT', 'TP3_HIT', 'SL_HIT', 'BE_HIT'];
  
  const signalsToUpdate = await db
    .select()
    .from(signals)
    .where(
      and(
        or(...closedStatuses.map(status => eq(signals.status, status as any))),
        isNull(signals.mfeR)
      )
    )
    .limit(options.limit || 10000);
  
  console.log(`📊 Found ${signalsToUpdate.length} signals to backfill`);
  
  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - no changes will be written to DB\n');
  }
  
  let processed = 0;
  let updated = 0;
  let failed = 0;
  
  for (const signal of signalsToUpdate) {
    processed++;
    console.log(`\n[${processed}/${signalsToUpdate.length}] Processing signal #${signal.id}...`);
    
    const result = await calculateMFEMAE(signal as any);
    
    if (!result) {
      failed++;
      continue;
    }
    
    if (!options.dryRun) {
      try {
        await db
          .update(signals)
          .set({
            mfeR: result.mfeR.toString(),
            maeR: result.maeR.toString(),
            firstTouch: result.firstTouch || undefined,
            timeToTp1Min: result.timeToTp1Min || undefined,
            timeToTp2Min: result.timeToTp2Min || undefined,
            timeToTp3Min: result.timeToTp3Min || undefined,
            timeToSlMin: result.timeToSlMin || undefined,
          })
          .where(eq(signals.id, signal.id));
        
        console.log(`   ✅ Signal #${signal.id} updated`);
        updated++;
      } catch (error: any) {
        console.error(`   ❌ Failed to update signal #${signal.id}: ${error.message}`);
        failed++;
      }
    } else {
      console.log(`   🔍 [DRY RUN] Would update signal #${signal.id}`);
      updated++;
    }
    
    // Rate limiting: pause between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n✅ Backfill complete!');
  console.log(`📊 Summary:`);
  console.log(`   Total processed: ${processed}`);
  console.log(`   Successfully updated: ${updated}`);
  console.log(`   Failed: ${failed}`);
  
  if (options.dryRun) {
    console.log('\n🔍 This was a DRY RUN - no changes were written to DB');
    console.log('💡 Run without --dry-run to apply changes');
  }
}

// Parse CLI arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIndex = args.indexOf('--limit');
const limit = limitIndex >= 0 ? parseInt(args[limitIndex + 1]) : undefined;

// Run backfill
backfillMFEMAE({ dryRun, limit })
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
