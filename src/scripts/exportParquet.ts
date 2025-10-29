#!/usr/bin/env tsx
/**
 * ML Data Export to Apache Parquet Format
 * 
 * Exports ML training data from PostgreSQL to Parquet files for analysis.
 * 
 * Usage:
 *   npm run export:ml [-- --days=30]
 *   tsx src/scripts/exportParquet.ts [--days=30]
 */

import { db } from '../mastra/storage/db.js';
import { signals, nearMissSkips, shadowEvaluations, parquetExports } from '../mastra/storage/schema.js';
import { sql, gte } from 'drizzle-orm';
import * as arrow from 'apache-arrow';
import * as fs from 'fs';
import * as path from 'path';

interface ExportOptions {
  days?: number;
  outputDir?: string;
}

async function exportToParquet(options: ExportOptions = {}) {
  const { days = 30, outputDir = './ml_exports' } = options;
  
  console.log(`\n🚀 Starting ML data export to Parquet format`);
  console.log(`📅 Exporting last ${days} days of data`);
  console.log(`📂 Output directory: ${outputDir}\n`);

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  try {
    // ============================================
    // 1. Export SIGNALS (entered trades)
    // ============================================
    console.log('📊 Exporting SIGNALS (entered trades)...');
    
    const signalsData = await db
      .select()
      .from(signals)
      .where(gte(signals.createdAt, cutoffDate))
      .orderBy(signals.createdAt);

    if (signalsData.length > 0) {
      const signalsTable = arrow.tableFromJSON(signalsData.map(row => ({
        id: row.id,
        symbol: row.symbol,
        timeframe: row.timeframe,
        pattern_type: row.patternType,
        direction: row.direction,
        entry_price: parseFloat(row.entryPrice),
        sl_price: parseFloat(row.slPrice),
        tp1_price: row.tp1Price ? parseFloat(row.tp1Price) : null,
        tp2_price: parseFloat(row.tp2Price),
        tp3_price: row.tp3Price ? parseFloat(row.tp3Price) : null,
        initial_sl: row.initialSl ? parseFloat(row.initialSl) : null,
        position_size: row.positionSize ? parseFloat(row.positionSize) : null,
        partial_closed: row.partialClosed ? parseFloat(row.partialClosed) : null,
        be_activated: row.beActivated || false,
        trailing_activated: row.trailingActivated || false,
        exit_type: row.exitType,
        pnl_r: row.pnlR ? parseFloat(row.pnlR) : null,
        pnl_percent: row.pnlPercent ? parseFloat(row.pnlPercent) : null,
        atr_15m: row.atr15m ? parseFloat(row.atr15m) : null,
        atr_h4: row.atrH4 ? parseFloat(row.atrH4) : null,
        // ML context
        dist_to_dir_h1_zone_atr: row.distToDirH1ZoneAtr ? parseFloat(row.distToDirH1ZoneAtr) : null,
        dist_to_dir_h4_zone_atr: row.distToDirH4ZoneAtr ? parseFloat(row.distToDirH4ZoneAtr) : null,
        free_path_r: row.freePathR ? parseFloat(row.freePathR) : null,
        arrival_pattern: row.arrivalPattern,
        // Outcome metrics
        mfe_r: row.mfeR ? parseFloat(row.mfeR) : null,
        mae_r: row.maeR ? parseFloat(row.maeR) : null,
        time_to_tp1_min: row.timeToTp1Min,
        time_to_tp2_min: row.timeToTp2Min,
        time_to_tp3_min: row.timeToTp3Min,
        time_to_sl_min: row.timeToSlMin,
        time_to_be_min: row.timeToBeMin,
        first_touch: row.firstTouch,
        status: row.status,
        created_at: row.createdAt?.toISOString(),
        updated_at: row.updatedAt?.toISOString(),
      })));

      const signalsPath = path.join(outputDir, `signals_${timestamp}.parquet`);
      const signalsWriter = await arrow.RecordBatchFileWriter.writeAll(signalsTable);
      fs.writeFileSync(signalsPath, await signalsWriter.toUint8Array());
      
      console.log(`✅ Exported ${signalsData.length} signals to ${signalsPath}`);
      
      // Record export (using camelCase from schema)
      await db.insert(parquetExports).values({
        exportDate: timestamp,
        exportType: 'trades',
        filePath: signalsPath,
        recordCount: signalsData.length,
      });
    } else {
      console.log(`⚠️  No signals found in last ${days} days`);
    }

    // ============================================
    // 2. Export NEAR_MISS_SKIPS (skipped signals)
    // ============================================
    console.log('\n📊 Exporting NEAR_MISS_SKIPS (skipped signals)...');
    
    const skipsData = await db
      .select()
      .from(nearMissSkips)
      .where(gte(nearMissSkips.createdAt, cutoffDate))
      .orderBy(nearMissSkips.createdAt);

    if (skipsData.length > 0) {
      const skipsTable = arrow.tableFromJSON(skipsData.map(row => ({
        id: row.id,
        signal_id: row.signalId,
        symbol: row.symbol,
        entry_tf: row.entryTf,
        side: row.side,
        pattern_type: row.patternType,
        ts: row.ts?.toISOString(),
        // ATR
        atr_15m: parseFloat(row.atr15m),
        atr_1h: parseFloat(row.atr1h),
        atr_4h: parseFloat(row.atr4h),
        // Trend context
        ema200_1h_pos: row.ema200H1Pos,
        vwap_1h_pos: row.vwap1hPos,
        trend_bias: row.trendBias,
        btc_trend_state: row.btcTrendState,
        // Zones (serialized as JSON string for Parquet)
        zones: JSON.stringify(row.zones),
        in_h4_zone: row.inH4Zone,
        near_h4_support: row.nearH4Support,
        near_h4_resistance: row.nearH4Resistance,
        // Distances
        dist_to_dir_h1_zone_atr: parseFloat(row.distToDirH1ZoneAtr),
        dist_to_dir_h4_zone_atr: parseFloat(row.distToDirH4ZoneAtr),
        free_path_pts: parseFloat(row.freePathPts),
        free_path_atr15: parseFloat(row.freePathAtr15),
        free_path_r: parseFloat(row.freePathR),
        // Quality
        arrival_pattern: row.arrivalPattern,
        zone_touch_count_bucket: row.zoneTouchCountBucket,
        zone_thickness_atr15: parseFloat(row.zoneThicknessAtr15),
        signal_bar_size_atr15: parseFloat(row.signalBarSizeAtr15),
        signal_bar_size_bucket: row.signalBarSizeBucket,
        // Confirmation
        confirm_type: row.confirmType,
        confirm_wait_bars_15m: row.confirmWaitBars15m,
        // Decision
        decision: row.decision,
        skip_reasons: row.skipReasons?.join(','), // Array → CSV string
        ruleset_version: row.rulesetVersion,
        created_at: row.createdAt?.toISOString(),
      })));

      const skipsPath = path.join(outputDir, `near_miss_skips_${timestamp}.parquet`);
      const skipsWriter = await arrow.RecordBatchFileWriter.writeAll(skipsTable);
      fs.writeFileSync(skipsPath, await skipsWriter.toUint8Array());
      
      console.log(`✅ Exported ${skipsData.length} near-miss skips to ${skipsPath}`);
      
      // Record export (using camelCase from schema)
      await db.insert(parquetExports).values({
        exportDate: timestamp,
        exportType: 'near_miss',
        filePath: skipsPath,
        recordCount: skipsData.length,
      });
    } else {
      console.log(`⚠️  No near-miss skips found in last ${days} days`);
    }

    // ============================================
    // 3. Export SHADOW_EVALUATIONS
    // ============================================
    console.log('\n📊 Exporting SHADOW_EVALUATIONS...');
    
    const shadowData = await db
      .select()
      .from(shadowEvaluations)
      .where(gte(shadowEvaluations.createdAt, cutoffDate))
      .orderBy(shadowEvaluations.createdAt);

    if (shadowData.length > 0) {
      const shadowTable = arrow.tableFromJSON(shadowData.map(row => ({
        id: row.id,
        signal_id: row.signalId,
        reason_code: row.reasonCode,
        hypothetical_entry_price: parseFloat(row.hypotheticalEntryPrice),
        hypothetical_entry_time: row.hypotheticalEntryTime?.toISOString(),
        shadow_outcome: row.shadowOutcome,
        shadow_mfe_r: row.shadowMfeR ? parseFloat(row.shadowMfeR) : null,
        shadow_mae_r: row.shadowMaeR ? parseFloat(row.shadowMaeR) : null,
        shadow_time_to_first_touch_min: row.shadowTimeToFirstTouchMin,
        is_active: row.isActive || false,
        completed_at: row.completedAt?.toISOString(),
        created_at: row.createdAt?.toISOString(),
      })));

      const shadowPath = path.join(outputDir, `shadow_evaluations_${timestamp}.parquet`);
      const shadowWriter = await arrow.RecordBatchFileWriter.writeAll(shadowTable);
      fs.writeFileSync(shadowPath, await shadowWriter.toUint8Array());
      
      console.log(`✅ Exported ${shadowData.length} shadow evaluations to ${shadowPath}`);
      
      // Record export (using camelCase from schema)
      await db.insert(parquetExports).values({
        exportDate: timestamp,
        exportType: 'shadow',
        filePath: shadowPath,
        recordCount: shadowData.length,
      });
    } else {
      console.log(`⚠️  No shadow evaluations found in last ${days} days`);
    }

    // ============================================
    // Summary
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('🎉 Export completed successfully!');
    console.log('='.repeat(60));
    console.log(`📂 Files saved to: ${path.resolve(outputDir)}`);
    console.log('\n📖 How to use these files:');
    console.log('   1. Copy to your local machine:');
    console.log(`      scp -r root@YOUR_VPS_IP:${path.resolve(outputDir)} .`);
    console.log('   2. Load in Python with pandas:');
    console.log('      import pandas as pd');
    console.log(`      df = pd.read_parquet('${outputDir}/signals_${timestamp}.parquet')`);
    console.log('   3. Analyze with your ML pipeline!');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Export failed:', error);
    throw error;
  }
}

// CLI argument parsing
const args = process.argv.slice(2);
const options: ExportOptions = {};

for (const arg of args) {
  if (arg.startsWith('--days=')) {
    options.days = parseInt(arg.split('=')[1]);
  } else if (arg.startsWith('--output=')) {
    options.outputDir = arg.split('=')[1];
  }
}

// Run export
exportToParquet(options)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
