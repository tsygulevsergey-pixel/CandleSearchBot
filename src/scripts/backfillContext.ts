/**
 * Backfill Context & Post-SL data for existing signals
 * 
 * This script recovers missing context and post-SL data by:
 * 1. Fetching 50x15m candles BEFORE signal creation (for context analysis)
 * 2. Fetching 4h of candles AFTER SL_HIT (for post-SL monitoring)
 * 3. Analyzing and updating DB
 * 
 * Usage:
 *   npx tsx src/scripts/backfillContext.ts
 * 
 * Options:
 *   --dry-run: Show what would be updated without writing to DB
 *   --limit N: Process only N signals (default: all)
 *   --context-only: Only backfill context fields
 *   --post-sl-only: Only backfill post-SL fields
 */

import { db } from '../mastra/storage/db.js';
import { signals } from '../mastra/storage/schema.js';
import { eq, and, isNull, or } from 'drizzle-orm';
import { BinanceClient } from '../utils/binanceClient.js';
import { analyzeContextBeforeSignal } from '../utils/contextAnalyzer.js';
import { PatternDetector } from '../utils/candleAnalyzer.js';
import { calculateEMA } from '../utils/candleAnalyzer.js';
import { findSRChannels } from '../utils/srChannels.js';

const binanceClient = new BinanceClient();

interface SignalData {
  id: number;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  patternType: string;
  entryPrice: string;
  slPrice: string;
  tp1Price: string | null;
  tp2Price: string;
  tp3Price: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  timeframe: string;
}

/**
 * Backfill context data (trend, reversal, etc) for a signal
 */
async function backfillContextData(signal: SignalData, dryRun: boolean) {
  console.log(`\n🔍 [Context] Processing signal #${signal.id} ${signal.symbol}`);
  
  // Only process 15m signals
  if (signal.timeframe !== '15m') {
    console.log(`   ⚠️ Skipping: not a 15m signal (${signal.timeframe})`);
    return null;
  }
  
  try {
    // Calculate time range: need 50 candles BEFORE signal creation
    // 50 * 15min = 750 minutes = 12.5 hours
    const signalTime = signal.createdAt.getTime();
    const startTime = signalTime - (50 * 15 * 60 * 1000); // 50 candles before
    const endTime = signalTime;
    
    console.log(`   📅 Fetching 50x15m candles before signal...`);
    console.log(`      From: ${new Date(startTime).toISOString()}`);
    console.log(`      To:   ${new Date(endTime).toISOString()}`);
    
    // Fetch historical 15m candles
    const candles = await binanceClient.getKlinesInRange(
      signal.symbol,
      '15m',
      startTime,
      endTime,
      50
    );
    
    if (candles.length < 20) {
      console.log(`   ⚠️ Not enough candles (${candles.length}), need at least 20`);
      return null;
    }
    
    console.log(`   ✅ Fetched ${candles.length} candles`);
    
    // Convert BinanceClient.Candle (string) to ContextAnalyzer.Candle (number)
    const convertedCandles = candles.map(c => ({
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
      openTime: c.openTime,
    }));
    
    // Analyze context
    const context = analyzeContextBeforeSignal(convertedCandles, parseFloat(signal.entryPrice));
    
    console.log(`   📊 Context analysis:`);
    console.log(`      Trend: ${context.trendBefore}`);
    console.log(`      Reversal: ${context.wasReversal}`);
    console.log(`      Swings: ${context.swingCount20}`);
    console.log(`      Recent: ${context.recentDirection}`);
    console.log(`      Distance from EMA: ${context.distanceFromEma.toFixed(2)}%`);
    
    if (dryRun) {
      console.log(`   🔸 [DRY RUN] Would update signal #${signal.id}`);
      return context;
    }
    
    // Also calculate pattern_score, trend_alignment, clearance_15m
    console.log(`\n   🔧 Calculating additional metrics...`);
    
    // Pattern Score
    let patternScore: number | null = null;
    try {
      const patternDetector = new PatternDetector();
      let patternResult = { detected: false, score: null } as any;
      
      // Detect pattern based on pattern_type
      if (signal.patternType.includes('pinbar')) {
        patternResult = patternDetector.detectPinBar(candles);
      } else if (signal.patternType.includes('fakey')) {
        patternResult = patternDetector.detectFakey(candles);
      } else if (signal.patternType.includes('ppr')) {
        patternResult = patternDetector.detectPPR(candles, '15m');
      }
      
      if (patternResult.detected && patternResult.score) {
        patternScore = patternResult.score;
        console.log(`      Pattern Score: ${patternScore}/10`);
      } else {
        console.log(`      Pattern Score: Could not recalculate`);
      }
    } catch (error) {
      console.log(`      Pattern Score: Error - ${error}`);
    }
    
    // Trend Alignment
    let trendAlignment: string | null = null;
    try {
      const ema20 = calculateEMA(candles, 20);
      const ema50 = calculateEMA(candles, 50);
      
      let trendDirection: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
      if (ema20 > ema50 * 1.002) {
        trendDirection = 'UPTREND';
      } else if (ema20 < ema50 * 0.998) {
        trendDirection = 'DOWNTREND';
      } else {
        trendDirection = 'SIDEWAYS';
      }
      
      trendAlignment = (
        (signal.direction === 'LONG' && trendDirection === 'UPTREND') ||
        (signal.direction === 'SHORT' && trendDirection === 'DOWNTREND')
      ) ? 'with' : trendDirection === 'SIDEWAYS' ? 'neutral' : 'against';
      
      console.log(`      Trend Alignment: ${trendAlignment} (EMA20=${ema20.toFixed(2)}, EMA50=${ema50.toFixed(2)})`);
    } catch (error) {
      console.log(`      Trend Alignment: Error - ${error}`);
    }
    
    // Clearance 15m (need more candles - 300)
    let clearance15m: string | null = null;
    try {
      // Fetch more candles for S/R zones (300 candles)
      const startTimeExtended = signalTime - (300 * 15 * 60 * 1000);
      const candlesExtended = await binanceClient.getKlinesInRange(
        signal.symbol,
        '15m',
        startTimeExtended,
        endTime,
        300
      );
      
      if (candlesExtended.length >= 300) {
        const zones = findSRChannels(candlesExtended, {
          pivotPeriod: 10,
          maxChannelWidthPercent: 5,
          minStrength: 1,
          maxChannels: 6,
          loopbackPeriod: 290,
          rangeCalculationPeriod: 300,
        });
        
        // Find nearest opposing zone (S/R channels don't have 'tf' field, they're all 15m since we're using 15m candles)
        const opposingZone15m = zones.find(z => 
          z.type === (signal.direction === 'LONG' ? 'resistance' : 'support') &&
          (signal.direction === 'LONG' ? z.lower > parseFloat(signal.entryPrice) : z.upper < parseFloat(signal.entryPrice))
        );
        
        if (opposingZone15m) {
          const clearanceValue = Math.abs(
            (signal.direction === 'LONG' ? opposingZone15m.lower : opposingZone15m.upper) - parseFloat(signal.entryPrice)
          );
          clearance15m = clearanceValue.toString();
          console.log(`      Clearance 15m: ${parseFloat(clearance15m).toFixed(8)}`);
        } else {
          console.log(`      Clearance 15m: No opposing zone found (unlimited)`);
        }
      } else {
        console.log(`      Clearance 15m: Not enough candles (${candlesExtended.length}/300)`);
      }
    } catch (error) {
      console.log(`      Clearance 15m: Error - ${error}`);
    }
    
    // Update database
    await db
      .update(signals)
      .set({
        contextTrendBefore: context.trendBefore,
        contextWasReversal: context.wasReversal,
        contextSwingCount20: context.swingCount20,
        contextRecentDirection: context.recentDirection,
        contextDistanceFromEma: context.distanceFromEma.toString(),
        ...(patternScore !== null && { patternScore: patternScore.toString() }),
        ...(trendAlignment !== null && { trendAlignment: trendAlignment as any }),
        ...(clearance15m !== null && { clearance15m }),
      })
      .where(eq(signals.id, signal.id));
    
    console.log(`   ✅ Updated signal #${signal.id} with context + metrics data`);
    return { context, patternScore, trendAlignment, clearance15m };
    
  } catch (error) {
    console.error(`   ❌ Error processing signal #${signal.id}:`, error);
    return null;
  }
}

/**
 * Backfill post-SL monitoring data for stopped signals
 */
async function backfillPostSlData(signal: SignalData, dryRun: boolean) {
  console.log(`\n📊 [Post-SL] Processing signal #${signal.id} ${signal.symbol}`);
  
  // Only process SL_HIT signals
  if (signal.status !== 'SL_HIT') {
    console.log(`   ⚠️ Skipping: status is ${signal.status}, not SL_HIT`);
    return null;
  }
  
  try {
    // Use updatedAt as SL_HIT time (when signal was last updated to SL_HIT status)
    const slHitTime = signal.updatedAt.getTime();
    const monitorDurationHours = 4;
    const endTime = slHitTime + (monitorDurationHours * 60 * 60 * 1000);
    
    console.log(`   📅 Monitoring 4h after SL_HIT...`);
    console.log(`      SL hit: ${new Date(slHitTime).toISOString()}`);
    console.log(`      Monitor until: ${new Date(endTime).toISOString()}`);
    
    // Fetch 15m candles for 4 hours after SL_HIT
    // 4 hours = 16 candles of 15m
    const candles = await binanceClient.getKlinesInRange(
      signal.symbol,
      '15m',
      slHitTime,
      endTime,
      20 // Extra margin
    );
    
    if (candles.length === 0) {
      console.log(`   ⚠️ No candles found after SL_HIT`);
      return null;
    }
    
    console.log(`   ✅ Fetched ${candles.length} candles after SL_HIT`);
    
    // Analyze what happened after stop
    const entryPrice = parseFloat(signal.entryPrice);
    const slPrice = parseFloat(signal.slPrice);
    const R = Math.abs(entryPrice - slPrice);
    
    const tp1 = signal.tp1Price ? parseFloat(signal.tp1Price) : null;
    const tp2 = parseFloat(signal.tp2Price);
    const tp3 = signal.tp3Price ? parseFloat(signal.tp3Price) : null;
    
    let maxFavorableR = 0;
    let outcome: string = 'sideways';
    let timeToTpMin: number | null = null;
    let reachedTP = false;
    
    for (const candle of candles) {
      const high = parseFloat(candle.high);
      const low = parseFloat(candle.low);
      
      // Calculate favorable excursion (towards TP direction)
      let favorableR = 0;
      let adverseR = 0;
      
      if (signal.direction === 'LONG') {
        favorableR = (high - entryPrice) / R;
        adverseR = (entryPrice - low) / R;
        
        // Check if reached TP
        if (!reachedTP) {
          if (tp3 && high >= tp3) {
            outcome = 'reached_tp3';
            reachedTP = true;
            timeToTpMin = Math.round((candle.openTime - slHitTime) / (1000 * 60));
          } else if (high >= tp2) {
            outcome = 'reached_tp2';
            reachedTP = true;
            timeToTpMin = Math.round((candle.openTime - slHitTime) / (1000 * 60));
          } else if (tp1 && high >= tp1) {
            outcome = 'reached_tp1';
            reachedTP = true;
            timeToTpMin = Math.round((candle.openTime - slHitTime) / (1000 * 60));
          }
        }
      } else {
        // SHORT
        favorableR = (entryPrice - low) / R;
        adverseR = (high - entryPrice) / R;
        
        // Check if reached TP
        if (!reachedTP) {
          if (tp3 && low <= tp3) {
            outcome = 'reached_tp3';
            reachedTP = true;
            timeToTpMin = Math.round((candle.openTime - slHitTime) / (1000 * 60));
          } else if (low <= tp2) {
            outcome = 'reached_tp2';
            reachedTP = true;
            timeToTpMin = Math.round((candle.openTime - slHitTime) / (1000 * 60));
          } else if (tp1 && low <= tp1) {
            outcome = 'reached_tp1';
            reachedTP = true;
            timeToTpMin = Math.round((candle.openTime - slHitTime) / (1000 * 60));
          }
        }
      }
      
      // Track max favorable excursion
      if (favorableR > maxFavorableR) {
        maxFavorableR = favorableR;
      }
      
      // Check if went further against (MAE > 1.5R)
      if (adverseR < -1.5 && !reachedTP) {
        outcome = 'went_further_against';
      }
    }
    
    // If max favorable < 0.5R and didn't reach TP = sideways
    if (!reachedTP && maxFavorableR < 0.5) {
      outcome = 'sideways';
    }
    
    console.log(`   📊 Post-SL analysis:`);
    console.log(`      Outcome: ${outcome}`);
    console.log(`      Max favorable: ${maxFavorableR.toFixed(2)}R`);
    if (timeToTpMin) {
      console.log(`      Time to TP: ${timeToTpMin} minutes`);
    }
    
    if (dryRun) {
      console.log(`   🔸 [DRY RUN] Would update signal #${signal.id}`);
      return { outcome, maxFavorableR, timeToTpMin };
    }
    
    // Update database
    await db
      .update(signals)
      .set({
        postSlOutcome: outcome,
        postSlMaxFavorableR: maxFavorableR.toString(),
        postSlTimeToTpMin: timeToTpMin,
        postSlMonitoredUntil: new Date(endTime),
      })
      .where(eq(signals.id, signal.id));
    
    console.log(`   ✅ Updated signal #${signal.id} with post-SL data`);
    return { outcome, maxFavorableR, timeToTpMin };
    
  } catch (error) {
    console.error(`   ❌ Error processing signal #${signal.id}:`, error);
    return null;
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;
  const contextOnly = args.includes('--context-only');
  const postSlOnly = args.includes('--post-sl-only');
  
  console.log('🔄 [Backfill] Starting context & post-SL backfill...\n');
  if (dryRun) {
    console.log('🔸 DRY RUN MODE - No database changes will be made\n');
  }
  
  let stats = {
    contextProcessed: 0,
    contextSuccess: 0,
    postSlProcessed: 0,
    postSlSuccess: 0,
    patternScoreRecovered: 0,
    trendAlignmentRecovered: 0,
    clearance15mRecovered: 0,
  };
  
  // Backfill CONTEXT data
  if (!postSlOnly) {
    console.log('\n📊 === BACKFILLING CONTEXT DATA ===\n');
    
    const contextSignals = await db
      .select()
      .from(signals)
      .where(
        and(
          eq(signals.timeframe, '15m'),
          or(
            isNull(signals.contextTrendBefore),
            isNull(signals.patternScore),
            isNull(signals.trendAlignment)
          )
        )
      )
      .limit(limit || 1000);
    
    console.log(`Found ${contextSignals.length} signals missing context data\n`);
    
    for (const signal of contextSignals) {
      stats.contextProcessed++;
      const result = await backfillContextData(signal as any, dryRun);
      if (result) {
        stats.contextSuccess++;
        if ((result as any).patternScore !== null) stats.patternScoreRecovered++;
        if ((result as any).trendAlignment !== null) stats.trendAlignmentRecovered++;
        if ((result as any).clearance15m !== null) stats.clearance15mRecovered++;
      }
      
      // Rate limit: wait 200ms between requests (more candles = more API calls)
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  // Backfill POST-SL data
  if (!contextOnly) {
    console.log('\n📊 === BACKFILLING POST-SL DATA ===\n');
    
    const postSlSignals = await db
      .select()
      .from(signals)
      .where(
        and(
          eq(signals.status, 'SL_HIT'),
          isNull(signals.postSlOutcome)
        )
      )
      .limit(limit || 1000);
    
    console.log(`Found ${postSlSignals.length} stopped signals missing post-SL data\n`);
    
    for (const signal of postSlSignals) {
      stats.postSlProcessed++;
      const result = await backfillPostSlData(signal as any, dryRun);
      if (result) {
        stats.postSlSuccess++;
      }
      
      // Rate limit: wait 100ms between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 BACKFILL SUMMARY');
  console.log('='.repeat(60));
  
  if (!postSlOnly) {
    console.log(`\n📍 Context Data:`);
    console.log(`   Processed: ${stats.contextProcessed}`);
    console.log(`   Success: ${stats.contextSuccess}`);
    console.log(`   Failed: ${stats.contextProcessed - stats.contextSuccess}`);
    console.log(`\n📍 Additional Metrics Recovered:`);
    console.log(`   Pattern Score: ${stats.patternScoreRecovered}`);
    console.log(`   Trend Alignment: ${stats.trendAlignmentRecovered}`);
    console.log(`   Clearance 15m: ${stats.clearance15mRecovered}`);
  }
  
  if (!contextOnly) {
    console.log(`\n📍 Post-SL Data:`);
    console.log(`   Processed: ${stats.postSlProcessed}`);
    console.log(`   Success: ${stats.postSlSuccess}`);
    console.log(`   Failed: ${stats.postSlProcessed - stats.postSlSuccess}`);
  }
  
  console.log('\n✅ Backfill complete!\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
