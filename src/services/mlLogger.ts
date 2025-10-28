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
  
  // Arrival & quality
  arrivalPattern: 'impulse_up' | 'impulse_down' | 'compression' | 'chop';
  zoneTouchCountBucket: '0' | '1' | '2' | '>=3';
  zoneThicknessAtr15: number;
  
  // Signal bar
  signalBarSizeAtr15: number;
  signalBarSizeBucket: '<0.15' | '0.15-0.6' | '0.6-1.2' | '>1.2';
  
  // Standard plan
  standardPlan: {
    candidateSL: number;
    freePathR: number;
    slMode: 'htf_anchor' | 'swing_priority';
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
    arrivalPattern,
    zoneTouchCountBucket,
    zoneThicknessAtr15: zoneThickness,
    signalBarSizeAtr15,
    signalBarSizeBucket,
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
    decision: 'skip',
    skipReasons,
    rulesetVersion: RULESET_VERSION,
  });
  
  console.log(`📝 [MLLogger] Near-miss SKIP logged: ${symbol} ${patternType} (${skipReasons.join(', ')})`);
  
  // Shadow evaluation sampling (10-20% or max 20 per reason/day)
  await sampleForShadowEvaluation(signalId, symbol, direction, entryPrice, mlContext, skipReasons);
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
