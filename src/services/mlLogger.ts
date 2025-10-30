/**
 * ML Logger - Handles ML logging for signals (both ENTER and SKIP)
 * 
 * Collects extended context (BTC trend, arrival pattern, zones, distances)
 * and logs near-miss SKIPs for ML analysis
 */

import { v4 as uuidv4 } from 'uuid';
import { nearMissSkipDB, shadowEvaluationDB } from '../mastra/storage/db';
import { detectBTCTrend, getEMA200Position } from '../utils/indicators/btcTrend';
import { getVWAPPosition } from '../utils/indicators/vwap';
import { detectArrivalPattern } from '../utils/indicators/arrivalPattern';
import { calculateStandardPlan, Zone } from '../utils/indicators/standardPlan';
import { SKIP_REASONS, RULESET_VERSION, SkipReason } from '../types/skipReasons';
import { analyzeSRZonesTV, calculateATR } from '../utils/candleAnalyzer';
import type { DynamicRiskProfile } from '../utils/dynamicRiskCalculator';

export interface MLContext {
  // BTC & market regime
  btcTrendState: 'up' | 'down' | 'neutral';
  ema200H1Pos: 'above' | 'below' | 'crossing';
  vwap1hPos: 'above' | 'below';
  trendBias: 'long' | 'short' | 'neutral';
  
  // ATR volatility
  atr15m: number;
  atr1h: number;
  atr4h: number;
  
  // Zones snapshot (6 zones: nearest sup/res × 3 TF)
  zones: Zone[];
  inH4Zone: boolean;
  nearH4Support: boolean;
  nearH4Resistance: boolean;
  
  // Distances
  distToDirH1ZoneAtr: number;
  distToDirH4ZoneAtr: number;
  freePathPts: number;
  freePathAtr15: number;
  freePathR: number;
  
  // NEW: Dynamic S/R fields
  clearance15m: number;
  clearance1h: number;
  rAvailable: number;
  zoneTestCount24h: number;
  vetoReason: 'h4_res_too_close' | 'h4_sup_too_close' | 'h1_res_too_close' | 'h1_sup_too_close' | 'none';
  slBufferAtr15: number;
  
  // Arrival & quality
  arrivalPattern: 'impulse_up' | 'impulse_down' | 'compression' | 'chop';
  compressionRangeAtr15: number; // Range of last 12 bars divided by ATR15
  zoneTouchCountBucket: '0' | '1' | '2' | '>=3';
  zoneThicknessAtr15: number;
  
  // Signal bar
  signalBarSizeAtr15: number;
  signalBarSizeBucket: '<0.15' | '0.15-0.6' | '0.6-1.2' | '>1.2';
  
  // NEW: Pattern candle info (for "AT zone" check)
  patternCandleHigh: number;  // High of pattern candle (C0)
  patternCandleLow: number;   // Low of pattern candle (C0)
  entryPrice: number;         // Entry price (pattern candle close)
  
  // Standard plan
  standardPlan: {
    candidateSL: number;
    freePathR: number;
    slMode: 'htf_anchor' | 'swing_priority';
  };
  
  // Pattern Quality Metrics
  pattern_score?: number;              // 0-10 confidence score
  pattern_score_factors?: {            // Breakdown of scoring factors
    tailBodyRatio?: number;            // For Pin Bar
    motherBarSize?: number;            // For Fakey
    penetrationDepth?: number;         // For PPR
    engulfmentStrength?: number;       // For Engulfing
  };
  
  // Stop Loss Metrics
  swing_extreme_price?: number;        // The swing low/high used for SL
  sl_buffer_atr?: number;              // Actual buffer used (0.3-0.5)
  round_number_adjusted?: boolean;     // Was SL adjusted for round number?
  min_distance_from_zone?: number;     // Distance from zone boundary
  
  // Take Profit Metrics
  tp1_limited_by_zone?: boolean;       // Was TP1 limited by resistance?
  tp2_limited_by_zone?: boolean;       // Was TP2 limited by resistance?
  tp3_limited_by_zone?: boolean;       // Was TP3 limited by resistance?
  nearest_resistance_distance_r?: number;  // Distance to nearest zone in R units
  
  // Risk:Reward Metrics
  actual_rr_tp1?: number;              // Actual R:R for TP1
  actual_rr_tp2?: number | null;       // Actual R:R for TP2
  actual_rr_tp3?: number | null;       // Actual R:R for TP3
  dynamic_min_rr?: number;             // Required minimum R:R
  dynamic_min_rr_adjustments?: {       // Breakdown of R:R adjustments
    pattern_score: number;
    zone_freshness: number;
    trend: number;
    multi_tf: number;
    volatility: number;
  };
  dynamic_min_rr_reasoning?: string;   // Human-readable explanation
  trend_alignment?: 'with' | 'against' | 'neutral';  // Trend direction
  multi_tf_alignment?: boolean;        // Are zones aligned across TFs?
  atr_volatility?: 'low' | 'normal' | 'high';  // Volatility classification
  rr_validation_passed?: boolean;      // Did signal pass R:R validation?
  rr_validation_message?: string;      // Validation result message
  
  // Confluence Metrics
  confluenceScore?: number;            // 0-10 confluence score
  confluenceDetails?: any;             // Confluence factors breakdown
}

/**
 * Enrich MLContext with DynamicRiskProfile data
 * Maps all new professional SL/TP metrics from riskProfile to MLContext
 */
export function enrichMLContextWithRiskProfile(
  mlContext: MLContext,
  riskProfile: DynamicRiskProfile,
  patternScore?: number
): MLContext {
  return {
    ...mlContext,
    
    // Pattern Quality Metrics
    pattern_score: patternScore,
    // pattern_score_factors not available in DynamicRiskProfile yet
    
    // Stop Loss Metrics
    swing_extreme_price: riskProfile.swingExtreme,
    sl_buffer_atr: riskProfile.buffer,
    round_number_adjusted: riskProfile.roundNumberAdjusted,
    // min_distance_from_zone not available in DynamicRiskProfile yet
    
    // Take Profit Metrics
    tp1_limited_by_zone: riskProfile.tp1LimitedByZone,
    tp2_limited_by_zone: riskProfile.tp2LimitedByZone,
    tp3_limited_by_zone: riskProfile.tp3LimitedByZone,
    nearest_resistance_distance_r: riskProfile.nearestResistanceDistance,
    
    // Risk:Reward Metrics
    actual_rr_tp1: riskProfile.actualRR.tp1,
    actual_rr_tp2: riskProfile.actualRR.tp2,
    actual_rr_tp3: riskProfile.actualRR.tp3,
    dynamic_min_rr: riskProfile.dynamicMinRR,
    dynamic_min_rr_adjustments: riskProfile.dynamicMinRRAdjustments ? {
      pattern_score: riskProfile.dynamicMinRRAdjustments.patternScore,
      zone_freshness: riskProfile.dynamicMinRRAdjustments.zoneFreshness,
      trend: riskProfile.dynamicMinRRAdjustments.trend,
      multi_tf: riskProfile.dynamicMinRRAdjustments.multiTF,
      volatility: riskProfile.dynamicMinRRAdjustments.volatility,
    } : undefined,
    dynamic_min_rr_reasoning: riskProfile.dynamicMinRRReasoning,
    trend_alignment: riskProfile.trendAlignment,
    multi_tf_alignment: riskProfile.multiTFAlignment,
    atr_volatility: riskProfile.atrVolatility,
    rr_validation_passed: riskProfile.rrValidation.isValid,
    rr_validation_message: riskProfile.rrValidation.message,
    
    // Update existing fields that may have been calculated by DynamicRiskProfile
    clearance15m: riskProfile.clearance15m,
    clearance1h: riskProfile.clearance1h,
    rAvailable: riskProfile.rAvailable,
    zoneTestCount24h: riskProfile.zoneTestCount24h,
    vetoReason: riskProfile.vetoReason,
    slBufferAtr15: riskProfile.slBufferAtr15,
  };
}

/**
 * Collect ML context for a signal
 */
export async function collectMLContext(
  symbol: string,
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  candles15m: any[],
  candles1h: any[],
  candles4h: any[],
  patternExtreme: number // Pattern high/low
): Promise<MLContext> {
  // ATR calculation
  const atr15m = calculateATR(candles15m);
  const atr1h = calculateATR(candles1h);
  const atr4h = calculateATR(candles4h);
  
  // BTC trend
  const btcTrend = await detectBTCTrend();
  
  // EMA200 & VWAP position
  const ema200H1Pos = await getEMA200Position(symbol, '1h');
  const vwap1hPos = await getVWAPPosition(symbol, entryPrice);
  
  // Trend bias (simplified for now - can be enhanced later)
  let trendBias: 'long' | 'short' | 'neutral' = 'neutral';
  if (ema200H1Pos === 'above' && vwap1hPos === 'above') trendBias = 'long';
  else if (ema200H1Pos === 'below' && vwap1hPos === 'below') trendBias = 'short';
  
  // Arrival pattern (last 10 bars of 15m)
  const recent15mCandles = candles15m.slice(-10).map((c: any) => ({
    open: parseFloat(c.open),
    high: parseFloat(c.high),
    low: parseFloat(c.low),
    close: parseFloat(c.close),
  }));
  const arrivalPattern = detectArrivalPattern(recent15mCandles, atr15m);
  
  // S/R zones analysis (using existing function for now)
  const sr15m = analyzeSRZonesTV(candles15m);
  const sr1h = analyzeSRZonesTV(candles1h);
  const sr4h = analyzeSRZonesTV(candles4h);
  
  // Convert to Zone format
  const zones: Zone[] = [];
  
  // 15m zones
  if (sr15m.nearestSupport) {
    zones.push({
      type: 'support',
      low: sr15m.nearestSupport.lower,
      high: sr15m.nearestSupport.upper,
      tf: '15m',
      touches: sr15m.nearestSupport.touches,
      strength: sr15m.nearestSupport.strength,
    });
  }
  if (sr15m.nearestResistance) {
    zones.push({
      type: 'resistance',
      low: sr15m.nearestResistance.lower,
      high: sr15m.nearestResistance.upper,
      tf: '15m',
      touches: sr15m.nearestResistance.touches,
      strength: sr15m.nearestResistance.strength,
    });
  }
  
  // 1h zones
  if (sr1h.nearestSupport) {
    zones.push({
      type: 'support',
      low: sr1h.nearestSupport.lower,
      high: sr1h.nearestSupport.upper,
      tf: '1h',
      touches: sr1h.nearestSupport.touches,
      strength: sr1h.nearestSupport.strength,
    });
  }
  if (sr1h.nearestResistance) {
    zones.push({
      type: 'resistance',
      low: sr1h.nearestResistance.lower,
      high: sr1h.nearestResistance.upper,
      tf: '1h',
      touches: sr1h.nearestResistance.touches,
      strength: sr1h.nearestResistance.strength,
    });
  }
  
  // 4h zones
  if (sr4h.nearestSupport) {
    zones.push({
      type: 'support',
      low: sr4h.nearestSupport.lower,
      high: sr4h.nearestSupport.upper,
      tf: '4h',
      touches: sr4h.nearestSupport.touches,
      strength: sr4h.nearestSupport.strength,
    });
  }
  if (sr4h.nearestResistance) {
    zones.push({
      type: 'resistance',
      low: sr4h.nearestResistance.lower,
      high: sr4h.nearestResistance.upper,
      tf: '4h',
      touches: sr4h.nearestResistance.touches,
      strength: sr4h.nearestResistance.strength,
    });
  }
  
  // Check if in/near H4 zone
  const h4Support = zones.find(z => z.type === 'support' && z.tf === '4h');
  const h4Resistance = zones.find(z => z.type === 'resistance' && z.tf === '4h');
  
  const inH4Zone = (
    (h4Support && entryPrice >= h4Support.low && entryPrice <= h4Support.high) ||
    (h4Resistance && entryPrice >= h4Resistance.low && entryPrice <= h4Resistance.high)
  ) || false;
  
  const nearH4Support = h4Support 
    ? Math.abs(entryPrice - h4Support.high) <= (0.20 * atr4h)
    : false;
  
  const nearH4Resistance = h4Resistance
    ? Math.abs(h4Resistance.low - entryPrice) <= (0.20 * atr4h)
    : false;
  
  // Calculate standard plan for free_path_R
  const h4ZoneEdge = direction === 'LONG' 
    ? (h4Support?.high || h4Support?.low)
    : (h4Resistance?.low || h4Resistance?.high);
  
  const standardPlan = calculateStandardPlan({
    entryPrice,
    direction,
    zones,
    atr15m,
    atr4h,
    patternExtreme,
    inH4Zone,
    nearH4Zone: nearH4Support || nearH4Resistance,
    h4ZoneEdge,
  });
  
  // Distances to directional zones
  const h1DirectionalZone = direction === 'LONG'
    ? zones.find(z => z.type === 'resistance' && z.tf === '1h' && z.low > entryPrice)
    : zones.find(z => z.type === 'support' && z.tf === '1h' && z.high < entryPrice);
  
  const h4DirectionalZone = direction === 'LONG'
    ? h4Resistance
    : h4Support;
  
  const distToDirH1ZoneAtr = h1DirectionalZone
    ? Math.abs((direction === 'LONG' ? h1DirectionalZone.low : h1DirectionalZone.high) - entryPrice) / atr15m
    : 999; // No zone found
  
  const distToDirH4ZoneAtr = h4DirectionalZone
    ? Math.abs((direction === 'LONG' ? h4DirectionalZone.low : h4DirectionalZone.high) - entryPrice) / atr4h
    : 999;
  
  // Signal bar size
  const lastCandle = candles15m[candles15m.length - 1];
  const signalBarSize = parseFloat(lastCandle.high) - parseFloat(lastCandle.low);
  const signalBarSizeAtr15 = signalBarSize / atr15m;
  
  let signalBarSizeBucket: '<0.15' | '0.15-0.6' | '0.6-1.2' | '>1.2';
  if (signalBarSizeAtr15 < 0.15) signalBarSizeBucket = '<0.15';
  else if (signalBarSizeAtr15 < 0.6) signalBarSizeBucket = '0.15-0.6';
  else if (signalBarSizeAtr15 < 1.2) signalBarSizeBucket = '0.6-1.2';
  else signalBarSizeBucket = '>1.2';
  
  // Zone touch count (using H4 zone as example)
  const zoneToCount = direction === 'LONG' ? h4Support : h4Resistance;
  const touchCount = zoneToCount?.touches || 0;
  
  let zoneTouchCountBucket: '0' | '1' | '2' | '>=3';
  if (touchCount === 0) zoneTouchCountBucket = '0';
  else if (touchCount === 1) zoneTouchCountBucket = '1';
  else if (touchCount === 2) zoneTouchCountBucket = '2';
  else zoneTouchCountBucket = '>=3';
  
  // Zone thickness
  const zoneThickness = zoneToCount 
    ? (zoneToCount.high - zoneToCount.low) / atr15m
    : 0;
  
  // Compression range: Calculate range of last 12 bars
  const last12Candles = candles15m.slice(-12);
  let compressionHigh = -Infinity;
  let compressionLow = Infinity;
  
  for (const candle of last12Candles) {
    const high = parseFloat(candle.high);
    const low = parseFloat(candle.low);
    if (high > compressionHigh) compressionHigh = high;
    if (low < compressionLow) compressionLow = low;
  }
  
  const compressionRange = compressionHigh - compressionLow;
  const compressionRangeAtr15 = compressionRange / atr15m;
  
  // Extract pattern candle info (C0 = last closed candle)
  const patternCandleHigh = parseFloat(lastCandle.high);
  const patternCandleLow = parseFloat(lastCandle.low);
  
  return {
    btcTrendState: btcTrend.trend,
    ema200H1Pos,
    vwap1hPos,
    trendBias,
    atr15m,
    atr1h,
    atr4h,
    zones,
    inH4Zone,
    nearH4Support,
    nearH4Resistance,
    distToDirH1ZoneAtr,
    distToDirH4ZoneAtr,
    freePathPts: standardPlan.freePathPts,
    freePathAtr15: standardPlan.freePathAtr15,
    freePathR: standardPlan.freePathR,
    // NEW: Dynamic S/R fields (defaults, will be filled by scanner)
    clearance15m: 0,
    clearance1h: 0,
    rAvailable: 0,
    zoneTestCount24h: 0,
    vetoReason: 'none',
    slBufferAtr15: 0,
    arrivalPattern,
    compressionRangeAtr15,
    zoneTouchCountBucket,
    zoneThicknessAtr15: zoneThickness,
    signalBarSizeAtr15,
    signalBarSizeBucket,
    // NEW: Pattern candle info (for "AT zone" check)
    patternCandleHigh,
    patternCandleLow,
    entryPrice,
    standardPlan: {
      candidateSL: standardPlan.candidateSL,
      freePathR: standardPlan.freePathR,
      slMode: standardPlan.slMode,
    },
  };
}

/**
 * Log a near-miss SKIP signal
 */
export async function logNearMissSkip(
  symbol: string,
  timeframe: string,
  patternType: string,
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  mlContext: MLContext,
  skipReasons: SkipReason[]
): Promise<void> {
  const signalId = uuidv4();
  
  await nearMissSkipDB.createNearMissSkip({
    signalId,
    symbol,
    entryTf: timeframe,
    side: direction,
    patternType,
    ts: new Date(),
    atr15m: mlContext.atr15m.toString(),
    atr1h: mlContext.atr1h.toString(),
    atr4h: mlContext.atr4h.toString(),
    ema200H1Pos: mlContext.ema200H1Pos,
    vwap1hPos: mlContext.vwap1hPos,
    trendBias: mlContext.trendBias,
    btcTrendState: mlContext.btcTrendState,
    zones: mlContext.zones as any, // JSON
    inH4Zone: mlContext.inH4Zone,
    nearH4Support: mlContext.nearH4Support,
    nearH4Resistance: mlContext.nearH4Resistance,
    distToDirH1ZoneAtr: mlContext.distToDirH1ZoneAtr.toFixed(4),
    distToDirH4ZoneAtr: mlContext.distToDirH4ZoneAtr.toFixed(4),
    freePathPts: mlContext.freePathPts.toString(),
    freePathAtr15: mlContext.freePathAtr15.toFixed(4),
    freePathR: mlContext.freePathR.toFixed(4),
    arrivalPattern: mlContext.arrivalPattern,
    zoneTouchCountBucket: mlContext.zoneTouchCountBucket,
    zoneThicknessAtr15: mlContext.zoneThicknessAtr15.toFixed(4),
    signalBarSizeAtr15: mlContext.signalBarSizeAtr15.toFixed(4),
    signalBarSizeBucket: mlContext.signalBarSizeBucket,
    confirmType: null, // TODO: Add confirmation logic later
    confirmWaitBars15m: null,
    // NEW: Dynamic S/R fields
    clearance15m: mlContext.clearance15m.toString(),
    clearance1h: mlContext.clearance1h.toString(),
    rAvailable: mlContext.rAvailable.toFixed(2),
    zoneTestCount24h: mlContext.zoneTestCount24h,
    vetoReason: mlContext.vetoReason,
    slBufferAtr15: mlContext.slBufferAtr15.toFixed(4),
    
    // Pattern Quality Metrics
    patternScore: mlContext.pattern_score?.toFixed(2) ?? null,
    patternScoreFactors: mlContext.pattern_score_factors as any,
    
    // Stop Loss Metrics
    swingExtremePrice: mlContext.swing_extreme_price?.toString() ?? null,
    slBufferAtr: mlContext.sl_buffer_atr?.toFixed(2) ?? null,
    roundNumberAdjusted: mlContext.round_number_adjusted ?? null,
    minDistanceFromZone: mlContext.min_distance_from_zone?.toFixed(4) ?? null,
    
    // Take Profit Metrics
    tp1LimitedByZone: mlContext.tp1_limited_by_zone ?? null,
    tp2LimitedByZone: mlContext.tp2_limited_by_zone ?? null,
    tp3LimitedByZone: mlContext.tp3_limited_by_zone ?? null,
    nearestResistanceDistanceR: mlContext.nearest_resistance_distance_r?.toFixed(2) ?? null,
    
    // Risk:Reward Metrics
    actualRrTp1: mlContext.actual_rr_tp1?.toFixed(2) ?? null,
    actualRrTp2: mlContext.actual_rr_tp2?.toFixed(2) ?? null,
    actualRrTp3: mlContext.actual_rr_tp3?.toFixed(2) ?? null,
    dynamicMinRr: mlContext.dynamic_min_rr?.toFixed(2) ?? null,
    dynamicMinRrAdjustments: mlContext.dynamic_min_rr_adjustments as any,
    dynamicMinRrReasoning: mlContext.dynamic_min_rr_reasoning || null,
    trendAlignment: mlContext.trend_alignment || null,
    multiTfAlignment: mlContext.multi_tf_alignment ?? null,
    atrVolatility: mlContext.atr_volatility || null,
    rrValidationPassed: mlContext.rr_validation_passed ?? null,
    rrValidationMessage: mlContext.rr_validation_message || null,
    
    // Confluence Metrics
    confluenceScore: mlContext.confluenceScore ?? null,
    confluenceDetails: mlContext.confluenceDetails || null,
    
    decision: 'skip',
    skipReasons,
    rulesetVersion: RULESET_VERSION,
  });
  
  console.log(`📝 [MLLogger] Near-miss SKIP logged: ${symbol} ${patternType} (${skipReasons.join(', ')})`);
  
  // Shadow evaluation sampling (10-20% or max 20 per reason/day)
  await sampleForShadowEvaluation(signalId, symbol, direction, entryPrice, mlContext, skipReasons);
}

/**
 * Log an executed signal with full ML context
 * Helper function to format ML context fields for signal insertion
 */
export function formatExecutedSignalMLContext(mlContext: MLContext) {
  return {
    // ATR context
    atr15m: mlContext.atr15m.toString(),
    atrH4: mlContext.atr4h.toString(),
    
    // ML context fields
    distToDirH1ZoneAtr: mlContext.distToDirH1ZoneAtr.toFixed(4),
    distToDirH4ZoneAtr: mlContext.distToDirH4ZoneAtr.toFixed(4),
    freePathR: mlContext.freePathR.toFixed(4),
    arrivalPattern: mlContext.arrivalPattern,
    
    // Dynamic S/R fields
    clearance15m: mlContext.clearance15m.toString(),
    clearance1h: mlContext.clearance1h.toString(),
    rAvailable: mlContext.rAvailable.toFixed(2),
    zoneTestCount24h: mlContext.zoneTestCount24h,
    vetoReason: mlContext.vetoReason,
    slBufferAtr15: mlContext.slBufferAtr15.toFixed(4),
    
    // Pattern Quality Metrics
    patternScore: mlContext.pattern_score?.toFixed(2) || null,
    patternScoreFactors: mlContext.pattern_score_factors as any,
    
    // Stop Loss Metrics
    swingExtremePrice: mlContext.swing_extreme_price?.toString() || null,
    slBufferAtr: mlContext.sl_buffer_atr?.toFixed(2) || null,
    roundNumberAdjusted: mlContext.round_number_adjusted ?? null,
    minDistanceFromZone: mlContext.min_distance_from_zone?.toFixed(4) || null,
    
    // Take Profit Metrics
    tp1LimitedByZone: mlContext.tp1_limited_by_zone ?? null,
    tp2LimitedByZone: mlContext.tp2_limited_by_zone ?? null,
    tp3LimitedByZone: mlContext.tp3_limited_by_zone ?? null,
    nearestResistanceDistanceR: mlContext.nearest_resistance_distance_r?.toFixed(2) || null,
    
    // Risk:Reward Metrics
    actualRrTp1: mlContext.actual_rr_tp1?.toFixed(2) || null,
    actualRrTp2: mlContext.actual_rr_tp2?.toFixed(2) || null,
    actualRrTp3: mlContext.actual_rr_tp3?.toFixed(2) || null,
    dynamicMinRr: mlContext.dynamic_min_rr?.toFixed(2) || null,
    dynamicMinRrAdjustments: mlContext.dynamic_min_rr_adjustments as any,
    dynamicMinRrReasoning: mlContext.dynamic_min_rr_reasoning || null,
    trendAlignment: mlContext.trend_alignment || null,
    multiTfAlignment: mlContext.multi_tf_alignment ?? null,
    atrVolatility: mlContext.atr_volatility || null,
    rrValidationPassed: mlContext.rr_validation_passed ?? null,
    rrValidationMessage: mlContext.rr_validation_message || null,
  };
}

/**
 * Sample for shadow evaluation
 */
async function sampleForShadowEvaluation(
  signalId: string,
  symbol: string,
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  mlContext: MLContext,
  skipReasons: SkipReason[]
): Promise<void> {
  // For each reason, check if we should sample
  for (const reasonCode of skipReasons) {
    const count = await nearMissSkipDB.countNearMissSkipsByReasonToday(reasonCode);
    
    // Sample if: count < 20 AND random < 0.15 (15% sampling rate)
    if (count < 20 && Math.random() < 0.15) {
      await shadowEvaluationDB.createShadowEvaluation({
        signalId,
        reasonCode,
        hypotheticalEntryPrice: entryPrice.toString(),
        hypotheticalEntryTime: new Date(),
        isActive: true,
      });
      
      console.log(`🎯 [MLLogger] Shadow evaluation started for ${symbol} (reason: ${reasonCode})`);
    }
  }
}
