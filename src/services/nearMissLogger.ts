/**
 * Near Miss Skip Logger - для аналитики отклоненных паттернов
 * 
 * Логирует ВСЕ паттерны которые прошли geometric checks но были отклонены
 * фильтрами. Это позволяет анализировать:
 * - Сколько сделок теряем из-за каждого фильтра
 * - Какие фильтры самые строгие
 * - Confluence distribution отклоненных паттернов
 */

import { nearMissSkipDB } from '../mastra/storage/db';
import type { NewNearMissSkip } from '../mastra/storage/schema';
import type { ConfluenceFactors } from '../utils/confluenceScoring';
import { randomUUID } from 'node:crypto';
import type { SkipReason } from '../types/skipReasons';

// Import MLContext from mlLogger for type compatibility
import type { MLContext } from './mlLogger';

export interface NearMissLogData {
  // Basic info
  symbol: string;
  timeframe: string;
  patternType: string;
  entryPrice: number;
  direction: 'LONG' | 'SHORT';
  
  // Skip reason
  skipReason: string;  // Main reason code
  skipCategory: 'volume' | 'pattern_geometry' | 'directional' | 'confluence' | 'rr' | 'veto' | 'bad_context';
  
  // Confluence scoring
  confluenceScore: number;           // 0-10
  confluenceFactors: ConfluenceFactors;  // All 8 factors
  
  // Pattern quality
  patternScore: number;              // 0-10
  patternScoreFactors?: any;         // {tailBodyRatio, motherBarSize, etc}
  
  // ML context (full context from mlContext)
  mlContext: any;
  
  // ATR context
  atr15m: number;
  atr1h: number;
  atr4h: number;
}

/**
 * Log a near-miss skip для последующей аналитики
 */
export async function logNearMissSkip(data: NearMissLogData): Promise<void> {
  try {
    console.log(`📝 [NearMissLogger] Logging skip: ${data.symbol} ${data.patternType} - ${data.skipReason} (confluence: ${data.confluenceScore}/10)`);
    
    const skipReasons = [data.skipReason]; // Array of reason codes
    
    // Prepare ML context record
    const record: NewNearMissSkip = {
      signalId: randomUUID(), // Generate UUID
      symbol: data.symbol,
      entryTf: data.timeframe,
      side: data.direction,
      patternType: data.patternType,
      ts: new Date(),
      
      // ATR/volatility
      atr15m: data.atr15m.toFixed(8),
      atr1h: data.atr1h.toFixed(8),
      atr4h: data.atr4h.toFixed(8),
      
      // Trend context (from mlContext)
      ema200H1Pos: data.mlContext.ema200H1Pos || 'above',
      vwap1hPos: data.mlContext.vwap1hPos || 'above',
      trendBias: data.mlContext.trendBias || 'neutral',
      btcTrendState: data.mlContext.btcTrendState || 'neutral',
      
      // Zones snapshot
      zones: data.mlContext.zones || [],
      inH4Zone: data.mlContext.inH4Zone ?? false,
      nearH4Support: data.mlContext.nearH4Support ?? false,
      nearH4Resistance: data.mlContext.nearH4Resistance ?? false,
      
      // Distances
      distToDirH1ZoneAtr: data.mlContext.distToDirH1ZoneAtr?.toFixed(4) || '0.0000',
      distToDirH4ZoneAtr: data.mlContext.distToDirH4ZoneAtr?.toFixed(4) || '0.0000',
      freePathPts: data.mlContext.freePathPts?.toFixed(8) || '0.00000000',
      freePathAtr15: data.mlContext.freePathAtr15?.toFixed(4) || '0.0000',
      freePathR: data.mlContext.freePathR?.toFixed(4) || '0.0000',
      
      // Arrival & zone quality
      arrivalPattern: data.mlContext.arrivalPattern || 'chop',
      zoneTouchCountBucket: data.mlContext.zoneTouchCountBucket || '0',
      zoneThicknessAtr15: data.mlContext.zoneThicknessAtr15?.toFixed(4) || '0.0000',
      
      // Signal bar
      signalBarSizeAtr15: data.mlContext.signalBarSizeAtr15?.toFixed(4) || '0.0000',
      signalBarSizeBucket: data.mlContext.signalBarSizeBucket || '<0.15',
      
      // Confirmation
      confirmType: data.mlContext.confirmType || null,
      confirmWaitBars15m: data.mlContext.confirmWaitBars15m ?? null,
      
      // Dynamic S/R fields
      clearance15m: data.mlContext.clearance15m?.toFixed(8) ?? null,
      clearance1h: data.mlContext.clearance1h?.toFixed(8) ?? null,
      rAvailable: data.mlContext.rAvailable?.toFixed(2) ?? null,
      zoneTestCount24h: data.mlContext.zoneTestCount24h ?? null,
      vetoReason: data.mlContext.vetoReason || null,
      slBufferAtr15: data.mlContext.slBufferAtr15?.toFixed(4) ?? null,
      
      // Pattern Quality Metrics
      patternScore: data.patternScore.toFixed(2),
      patternScoreFactors: data.patternScoreFactors || null,
      
      // Stop Loss Metrics (from mlContext if available)
      swingExtremePrice: data.mlContext.swingExtremePrice?.toFixed(8) ?? null,
      slBufferAtr: data.mlContext.slBufferAtr?.toFixed(2) ?? null,
      roundNumberAdjusted: data.mlContext.roundNumberAdjusted ?? null,
      minDistanceFromZone: data.mlContext.minDistanceFromZone?.toFixed(4) ?? null,
      
      // Take Profit Metrics
      tp1LimitedByZone: data.mlContext.tp1LimitedByZone ?? null,
      tp2LimitedByZone: data.mlContext.tp2LimitedByZone ?? null,
      tp3LimitedByZone: data.mlContext.tp3LimitedByZone ?? null,
      nearestResistanceDistanceR: data.mlContext.nearestResistanceDistanceR?.toFixed(2) ?? null,
      
      // Risk:Reward Metrics
      actualRrTp1: data.mlContext.actualRrTp1?.toFixed(2) ?? null,
      actualRrTp2: data.mlContext.actualRrTp2?.toFixed(2) ?? null,
      actualRrTp3: data.mlContext.actualRrTp3?.toFixed(2) ?? null,
      dynamicMinRr: data.mlContext.dynamicMinRr?.toFixed(2) ?? null,
      dynamicMinRrAdjustments: data.mlContext.dynamicMinRrAdjustments || null,
      dynamicMinRrReasoning: data.mlContext.dynamicMinRrReasoning || null,
      trendAlignment: data.mlContext.trendAlignment || null,
      multiTfAlignment: data.mlContext.multiTfAlignment ?? null,
      atrVolatility: data.mlContext.atrVolatility || null,
      rrValidationPassed: data.mlContext.rrValidationPassed ?? null,
      rrValidationMessage: data.mlContext.rrValidationMessage || null,
      
      // Decision
      decision: 'skip',
      skipReasons,
      rulesetVersion: 'v2.0-confluence',
      
      // NEW: Confluence scoring fields
      confluenceScore: data.confluenceScore,
      confluenceDetails: data.confluenceFactors as any,
      skipCategory: data.skipCategory,
    };
    
    await nearMissSkipDB.createNearMissSkip(record);
    console.log(`✅ [NearMissLogger] Skip logged successfully`);
    
  } catch (error) {
    console.error(`❌ [NearMissLogger] Error logging skip:`, error);
    // Don't throw - logging failure shouldn't break scanning
  }
}

/**
 * Wrapper function compatible with mlLogger.ts signature
 * This allows scanner.ts to call logNearMissSkip without code changes
 * 
 * @deprecated Use logNearMissSkipWithConfluence for new code with confluence scoring
 */
export async function logNearMissSkipLegacy(
  symbol: string,
  timeframe: string,
  patternType: string,
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  mlContext: MLContext,
  skipReasons: SkipReason[]
): Promise<void> {
  // Extract pattern score from mlContext if available
  const patternScore = mlContext.pattern_score || 0;
  
  // Read confluence data from mlContext (already calculated by scanner)
  const confluenceScore = mlContext.confluenceScore || 0;
  const confluenceFactors: ConfluenceFactors = mlContext.confluenceDetails || {
    patternQuality: false,
    atKeyZone: false,
    trendAligned: false,
    volumeSpike: false,
    zoneFresh: false,
    multiTFconfluence: false,
    cleanRejection: false,
    rAvailable: false,
  };
  
  // Determine skip category from first skip reason
  const skipCategory: any = skipReasons.length > 0 
    ? (skipReasons[0] as string).toLowerCase().includes('rr') ? 'rr'
    : (skipReasons[0] as string).toLowerCase().includes('veto') ? 'veto'
    : (skipReasons[0] as string).toLowerCase().includes('volume') ? 'volume'
    : (skipReasons[0] as string).toLowerCase().includes('pattern') ? 'pattern_geometry'
    : 'bad_context'
    : 'bad_context';
  
  await logNearMissSkip({
    symbol,
    timeframe,
    patternType,
    entryPrice,
    direction,
    skipReason: skipReasons.join(', '),
    skipCategory,
    confluenceScore,
    confluenceFactors,
    patternScore,
    patternScoreFactors: mlContext.pattern_score_factors,
    mlContext,
    atr15m: mlContext.atr15m,
    atr1h: mlContext.atr1h,
    atr4h: mlContext.atr4h,
  });
}

/**
 * Get skip statistics for analysis
 */
export async function getNearMissStats(date?: string): Promise<any> {
  try {
    // This would query the database for statistics
    // Implementation depends on your analytics needs
    console.log(`📊 [NearMissLogger] Getting stats for date: ${date || 'today'}`);
    return {
      // TODO: Implement statistics queries
      // e.g., count by skip_category, average confluence_score, etc.
    };
  } catch (error) {
    console.error(`❌ [NearMissLogger] Error getting stats:`, error);
    return null;
  }
}
