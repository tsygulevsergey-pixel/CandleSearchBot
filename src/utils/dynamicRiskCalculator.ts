/**
 * Dynamic Risk Calculator - Professional SL/TP System
 * 
 * Key Features:
 * 1. Professional SL using swing extremes (last 5 candles) instead of zone boundaries
 * 2. Adaptive buffer (0.3-0.5 ATR) based on volatility (ATR vs average ATR)
 * 3. Round number protection - adjusts SL away from psychological levels
 * 4. Minimum distance validation from zone boundary (0.5 ATR)
 * 5. Clearance calculation to opposing zones
 * 6. R_available = floor((0.9 · clearance) / R, 0.1)
 * 7. Adaptive TPs based on R_available (1R/2R/3R)
 */

import type { Zone } from './indicators/standardPlan';
import type { Candle } from './binanceClient';

export interface DynamicRiskProfile {
  sl: number;
  tp1: number | null; // May be null if R_available < 1.0
  tp2: number | null;
  tp3: number | null;
  
  // Metadata
  riskR: number;
  slBufferAtr15: number; // Actual buffer used (0.3-0.5)
  clearance15m: number;
  clearance1h: number;
  rAvailable: number;
  zoneTestCount24h: number;
  vetoReason: 'h4_res_too_close' | 'h4_sup_too_close' | 'h1_res_too_close' | 'h1_sup_too_close' | 'none';
  
  // New professional SL metadata
  swingExtreme: number;
  buffer: number;
  roundNumberAdjusted: boolean;
  
  // For ML logging
  scenario: 'scalp_1R' | 'swing_2R' | 'trend_3R' | 'skip_no_space';
}

export interface DynamicRiskInput {
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  patternExtreme: number; // Low for LONG, high for SHORT
  zones: Zone[];
  atr15m: number;
  atr1h: number;
  atr4h: number;
  zoneTestCount24h: number; // How many times active zone was tested
  candles15m: Candle[]; // For detecting long tails
}

/**
 * Основная функция для расчёта динамического риск-профиля
 */
export function calculateDynamicRiskProfile(input: DynamicRiskInput): DynamicRiskProfile {
  const {
    direction,
    entryPrice,
    patternExtreme,
    zones,
    atr15m,
    atr1h,
    atr4h,
    zoneTestCount24h,
    candles15m,
  } = input;

  console.log(`🎯 [DynamicRisk] Calculating for ${direction} @ ${entryPrice.toFixed(8)}`);

  // 1. Check veto filters (H4/H1)
  const vetoResult = checkVetoFilters(direction, entryPrice, zones, atr15m, atr1h);
  if (vetoResult.veto) {
    // If veto triggered, return minimal profile (will be skipped by filters)
    return {
      sl: direction === 'LONG' ? entryPrice - atr15m : entryPrice + atr15m,
      tp1: null,
      tp2: null,
      tp3: null,
      riskR: atr15m,
      slBufferAtr15: 0,
      clearance15m: 0,
      clearance1h: 0,
      rAvailable: 0,
      zoneTestCount24h,
      vetoReason: vetoResult.reason,
      swingExtreme: entryPrice,
      buffer: 0,
      roundNumberAdjusted: false,
      scenario: 'skip_no_space',
    };
  }

  // 2. Get active zone (15m support for LONG, 15m resistance for SHORT)
  const activeZone = zones.find(z => 
    z.tf === '15m' && 
    z.type === (direction === 'LONG' ? 'support' : 'resistance')
  );

  if (!activeZone) {
    throw new Error(`No active 15m zone found for ${direction}`);
  }

  // 3. Find swing extreme from last 5 candles
  const swingExtreme = findSwingExtreme(candles15m, direction, 5);
  console.log(`🛡️ [SL] Swing extreme found: ${swingExtreme.toFixed(8)}`);

  // 4. Calculate average ATR for adaptive buffer
  const avgAtr = calculateAverageAtr(candles15m, 14);
  console.log(`🛡️ [SL] Current ATR15m: ${atr15m.toFixed(8)}, Avg ATR: ${avgAtr.toFixed(8)}`);

  // 5. Calculate adaptive buffer (0.3-0.5 ATR)
  const adaptiveBuffer = calculateAdaptiveBuffer(atr15m, avgAtr);
  console.log(`🛡️ [SL] Adaptive buffer: ${adaptiveBuffer.toFixed(2)} ATR`);

  // 6. Calculate preliminary SL (swing extreme + buffer)
  const preliminarySL = direction === 'LONG'
    ? swingExtreme - (adaptiveBuffer * atr15m)
    : swingExtreme + (adaptiveBuffer * atr15m);
  console.log(`🛡️ [SL] Before round adjust: ${preliminarySL.toFixed(8)}`);

  // 7. Adjust for round numbers
  const { adjusted: slAfterRound, wasAdjusted: roundNumberAdjusted } = adjustForRoundNumber(
    preliminarySL,
    atr15m,
    direction
  );
  console.log(`🛡️ [SL] Round number adjusted: ${roundNumberAdjusted}`);

  // 8. Validate minimum distance from zone boundary
  const sl = validateMinDistanceFromZone(
    slAfterRound,
    activeZone,
    direction,
    atr15m
  );
  console.log(`🛡️ [SL] Final SL: ${sl.toFixed(8)}`);

  const riskR = Math.abs(entryPrice - sl);

  // 5. Calculate clearance to opposing zones
  const { clearance15m, clearance1h } = calculateClearance(
    direction,
    entryPrice,
    zones
  );

  // 6. Calculate R_available
  const clearance = Math.min(clearance15m, clearance1h);
  const rAvailable = Math.floor((0.9 * clearance / riskR) * 10) / 10; // Round down to 0.1R

  console.log(`📊 [DynamicRisk] clearance15m=${clearance15m.toFixed(8)}, clearance1h=${clearance1h.toFixed(8)}, R=${riskR.toFixed(8)}, R_available=${rAvailable.toFixed(1)}`);

  // 7. Calculate adaptive TPs based on R_available
  const tps = calculateAdaptiveTps(
    direction,
    entryPrice,
    riskR,
    rAvailable,
    clearance,
    zones,
    atr4h
  );

  return {
    sl,
    tp1: tps.tp1,
    tp2: tps.tp2,
    tp3: tps.tp3,
    riskR,
    slBufferAtr15: adaptiveBuffer,
    clearance15m,
    clearance1h,
    rAvailable,
    zoneTestCount24h,
    vetoReason: 'none',
    swingExtreme,
    buffer: adaptiveBuffer,
    roundNumberAdjusted,
    scenario: tps.scenario,
  };
}

/**
 * Блок A: Проверка вето-фильтров H4/H1
 */
function checkVetoFilters(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  zones: Zone[],
  atr15m: number,
  atr1h: number
): { veto: boolean; reason: DynamicRiskProfile['vetoReason'] } {
  
  // Veto H4: LONG - H4 resistance < 0.7·ATR1h, SHORT - H4 support < 0.7·ATR1h
  const h4Threshold = 0.7 * atr1h;
  
  if (direction === 'LONG') {
    const h4Res = zones.find(z => z.tf === '4h' && z.type === 'resistance' && z.low > entryPrice);
    if (h4Res) {
      const distToH4Res = h4Res.low - entryPrice;
      if (distToH4Res < h4Threshold) {
        console.log(`❌ [Veto H4] LONG: H4 resistance too close (${distToH4Res.toFixed(8)} < ${h4Threshold.toFixed(8)})`);
        return { veto: true, reason: 'h4_res_too_close' };
      }
    }
  } else {
    const h4Sup = zones.find(z => z.tf === '4h' && z.type === 'support' && z.high < entryPrice);
    if (h4Sup) {
      const distToH4Sup = entryPrice - h4Sup.high;
      if (distToH4Sup < h4Threshold) {
        console.log(`❌ [Veto H4] SHORT: H4 support too close (${distToH4Sup.toFixed(8)} < ${h4Threshold.toFixed(8)})`);
        return { veto: true, reason: 'h4_sup_too_close' };
      }
    }
  }

  // Veto H1 (when H4 is far): LONG - H1 resistance < 1.0·ATR15, SHORT - H1 support < 1.0·ATR15
  const h1Threshold = 1.0 * atr15m;
  
  if (direction === 'LONG') {
    const h1Res = zones.find(z => z.tf === '1h' && z.type === 'resistance' && z.low > entryPrice);
    if (h1Res) {
      const distToH1Res = h1Res.low - entryPrice;
      if (distToH1Res < h1Threshold) {
        console.log(`❌ [Veto H1] LONG: H1 resistance too close (${distToH1Res.toFixed(8)} < ${h1Threshold.toFixed(8)})`);
        return { veto: true, reason: 'h1_res_too_close' };
      }
    }
  } else {
    const h1Sup = zones.find(z => z.tf === '1h' && z.type === 'support' && z.high < entryPrice);
    if (h1Sup) {
      const distToH1Sup = entryPrice - h1Sup.high;
      if (distToH1Sup < h1Threshold) {
        console.log(`❌ [Veto H1] SHORT: H1 support too close (${distToH1Sup.toFixed(8)} < ${h1Threshold.toFixed(8)})`);
        return { veto: true, reason: 'h1_sup_too_close' };
      }
    }
  }

  return { veto: false, reason: 'none' };
}


/**
 * Блок B п.6: Расчёт clearance до противоположных зон
 */
function calculateClearance(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  zones: Zone[]
): { clearance15m: number; clearance1h: number } {
  
  // For LONG: distance to nearest 15m/1h resistance
  // For SHORT: distance to nearest 15m/1h support
  
  const opposingZone15m = zones.find(z => 
    z.tf === '15m' && 
    z.type === (direction === 'LONG' ? 'resistance' : 'support') &&
    (direction === 'LONG' ? z.low > entryPrice : z.high < entryPrice)
  );

  const opposingZone1h = zones.find(z =>
    z.tf === '1h' &&
    z.type === (direction === 'LONG' ? 'resistance' : 'support') &&
    (direction === 'LONG' ? z.low > entryPrice : z.high < entryPrice)
  );

  const clearance15m = opposingZone15m
    ? Math.abs((direction === 'LONG' ? opposingZone15m.low : opposingZone15m.high) - entryPrice)
    : 999; // No zone = unlimited space

  const clearance1h = opposingZone1h
    ? Math.abs((direction === 'LONG' ? opposingZone1h.low : opposingZone1h.high) - entryPrice)
    : 999;

  console.log(`📏 [Clearance] 15m=${clearance15m.toFixed(8)}, 1h=${clearance1h.toFixed(8)}`);

  return { clearance15m, clearance1h };
}

/**
 * Блок B п.7: Адаптивные TP на основе R_available
 */
function calculateAdaptiveTps(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  riskR: number,
  rAvailable: number,
  clearance: number,
  zones: Zone[],
  atr4h: number
): {
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  scenario: DynamicRiskProfile['scenario'];
} {
  
  console.log(`🎯 [TPs] R_available=${rAvailable.toFixed(1)}, clearance=${clearance.toFixed(8)}`);

  // If R_available < 1.0 → skip
  if (rAvailable < 1.0) {
    console.log(`❌ [TPs] R_available < 1.0 → skip signal`);
    return { tp1: null, tp2: null, tp3: null, scenario: 'skip_no_space' };
  }

  // If 1.0 ≤ R_available < 2.0 → TP = 1.0R (scalp)
  if (rAvailable >= 1.0 && rAvailable < 2.0) {
    const tp1 = direction === 'LONG' 
      ? entryPrice + (1.0 * riskR)
      : entryPrice - (1.0 * riskR);
    
    console.log(`🎯 [TPs] Scalp mode: TP1=${tp1.toFixed(8)}`);
    return { tp1, tp2: null, tp3: null, scenario: 'scalp_1R' };
  }

  // If 2.0 ≤ R_available < 3.0 → TP = 2.0R
  if (rAvailable >= 2.0 && rAvailable < 3.0) {
    const tp1 = direction === 'LONG'
      ? entryPrice + (1.0 * riskR)
      : entryPrice - (1.0 * riskR);
    
    const tp2 = direction === 'LONG'
      ? entryPrice + (2.0 * riskR)
      : entryPrice - (2.0 * riskR);

    console.log(`🎯 [TPs] Swing mode: TP1=${tp1.toFixed(8)}, TP2=${tp2.toFixed(8)}`);
    return { tp1, tp2, tp3: null, scenario: 'swing_2R' };
  }

  // If R_available ≥ 3.0 → check for H4 zone interference
  const h4Zone = zones.find(z =>
    z.tf === '4h' &&
    z.type === (direction === 'LONG' ? 'resistance' : 'support') &&
    (direction === 'LONG' ? z.low > entryPrice : z.high < entryPrice)
  );

  let tp3Target = direction === 'LONG'
    ? entryPrice + (3.0 * riskR)
    : entryPrice - (3.0 * riskR);

  // Check if H4 zone is closer than 3.0R
  if (h4Zone) {
    const distToH4 = Math.abs((direction === 'LONG' ? h4Zone.low : h4Zone.high) - entryPrice);
    const distToTP3 = Math.abs(tp3Target - entryPrice);

    if (distToH4 < distToTP3) {
      // H4 zone closer → use min(3.0R, 0.9·clearance)
      tp3Target = direction === 'LONG'
        ? entryPrice + Math.min(3.0 * riskR, 0.9 * clearance)
        : entryPrice - Math.min(3.0 * riskR, 0.9 * clearance);
      
      console.log(`⚠️ [TP3] H4 zone interference → adjusted to ${tp3Target.toFixed(8)}`);
    }
  }

  const tp1 = direction === 'LONG'
    ? entryPrice + (1.0 * riskR)
    : entryPrice - (1.0 * riskR);

  const tp2 = direction === 'LONG'
    ? entryPrice + (2.0 * riskR)
    : entryPrice - (2.0 * riskR);

  console.log(`🎯 [TPs] Trend mode: TP1=${tp1.toFixed(8)}, TP2=${tp2.toFixed(8)}, TP3=${tp3Target.toFixed(8)}`);
  
  return { tp1, tp2, tp3: tp3Target, scenario: 'trend_3R' };
}

/**
 * Helper: Find swing extreme (lowest low for LONG, highest high for SHORT) in last N candles
 */
function findSwingExtreme(candles: Candle[], direction: 'LONG' | 'SHORT', lookback: number = 5): number {
  // Take last N candles (excluding current open candle)
  const last5Candles = candles.slice(-lookback - 1, -1);
  
  if (last5Candles.length === 0) {
    // Fallback to last candle if not enough data
    const lastCandle = candles[candles.length - 1];
    return direction === 'LONG' ? Number(lastCandle.low) : Number(lastCandle.high);
  }

  if (direction === 'LONG') {
    // Find lowest low
    const swingLow = Math.min(...last5Candles.map(c => Number(c.low)));
    console.log(`🔍 [SwingExtreme] LONG: Lowest low from last ${last5Candles.length} candles = ${swingLow.toFixed(8)}`);
    return swingLow;
  } else {
    // Find highest high
    const swingHigh = Math.max(...last5Candles.map(c => Number(c.high)));
    console.log(`🔍 [SwingExtreme] SHORT: Highest high from last ${last5Candles.length} candles = ${swingHigh.toFixed(8)}`);
    return swingHigh;
  }
}

/**
 * Helper: Determine nearest round number based on price magnitude
 */
function getNearestRoundNumber(price: number): number {
  let roundLevel: number;
  
  if (price < 10) {
    roundLevel = 1;
  } else if (price < 100) {
    roundLevel = 5;
  } else if (price < 1000) {
    roundLevel = 10;
  } else if (price < 10000) {
    roundLevel = 50;
  } else {
    roundLevel = 100;
  }

  // Find nearest round number
  const nearestRound = Math.round(price / roundLevel) * roundLevel;
  console.log(`🔢 [RoundNumber] Price ${price.toFixed(8)} → Round level: ${roundLevel}, Nearest: ${nearestRound.toFixed(8)}`);
  
  return nearestRound;
}

/**
 * Helper: Adjust SL if it's too close to a round number
 */
function adjustForRoundNumber(
  sl: number,
  atr: number,
  direction: 'LONG' | 'SHORT'
): { adjusted: number; wasAdjusted: boolean } {
  const nearestRound = getNearestRoundNumber(sl);
  const distToRound = Math.abs(sl - nearestRound);
  const threshold = Math.abs(sl * 0.005); // ±0.5% of price

  console.log(`🔢 [RoundAdjust] SL=${sl.toFixed(8)}, Nearest round=${nearestRound.toFixed(8)}, Distance=${distToRound.toFixed(8)}, Threshold=${threshold.toFixed(8)}`);

  if (distToRound <= threshold) {
    // Too close to round number - push away by 0.1 ATR
    const adjustment = 0.1 * atr;
    
    let adjustedSL: number;
    if (direction === 'LONG') {
      // For LONG, if SL is near round number, push it lower (away from price)
      adjustedSL = sl < nearestRound ? sl - adjustment : sl - adjustment;
    } else {
      // For SHORT, if SL is near round number, push it higher (away from price)
      adjustedSL = sl > nearestRound ? sl + adjustment : sl + adjustment;
    }

    console.log(`⚠️ [RoundAdjust] SL too close to round number ${nearestRound.toFixed(8)} → Adjusted by ${adjustment.toFixed(8)} to ${adjustedSL.toFixed(8)}`);
    return { adjusted: adjustedSL, wasAdjusted: true };
  }

  return { adjusted: sl, wasAdjusted: false };
}

/**
 * Helper: Calculate adaptive buffer (0.3-0.5 ATR) based on volatility
 */
function calculateAdaptiveBuffer(atr: number, avgAtr: number): number {
  const ratio = atr / avgAtr;
  
  let buffer: number;
  if (ratio > 1.5) {
    buffer = 0.5; // High volatility
    console.log(`📊 [AdaptiveBuffer] High volatility (ATR/Avg = ${ratio.toFixed(2)}) → 0.5 ATR buffer`);
  } else if (ratio >= 0.8) {
    buffer = 0.4; // Normal volatility
    console.log(`📊 [AdaptiveBuffer] Normal volatility (ATR/Avg = ${ratio.toFixed(2)}) → 0.4 ATR buffer`);
  } else {
    buffer = 0.3; // Low volatility
    console.log(`📊 [AdaptiveBuffer] Low volatility (ATR/Avg = ${ratio.toFixed(2)}) → 0.3 ATR buffer`);
  }

  return buffer;
}

/**
 * Helper: Calculate average ATR from recent candles
 */
function calculateAverageAtr(candles: Candle[], period: number = 14): number {
  // Take last N+1 candles to calculate N ATR values
  const recentCandles = candles.slice(-(period + 1));
  
  if (recentCandles.length < 2) {
    // Not enough data, return ATR from last candle
    const lastCandle = candles[candles.length - 1];
    return Number(lastCandle.high) - Number(lastCandle.low);
  }

  let atrSum = 0;
  for (let i = 1; i < recentCandles.length; i++) {
    const curr = recentCandles[i];
    const prev = recentCandles[i - 1];
    
    const high = Number(curr.high);
    const low = Number(curr.low);
    const prevClose = Number(prev.close);
    
    // True Range = max(high - low, |high - prevClose|, |low - prevClose|)
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    
    atrSum += tr;
  }

  const avgAtr = atrSum / (recentCandles.length - 1);
  console.log(`📊 [AvgATR] Calculated from ${recentCandles.length - 1} candles: ${avgAtr.toFixed(8)}`);
  
  return avgAtr;
}

/**
 * Helper: Validate minimum distance from zone boundary
 */
function validateMinDistanceFromZone(
  sl: number,
  activeZone: Zone,
  direction: 'LONG' | 'SHORT',
  atr15m: number
): number {
  const minDistance = 0.5 * atr15m;
  
  const zoneBoundary = direction === 'LONG' ? activeZone.low : activeZone.high;
  const distanceFromZone = Math.abs(sl - zoneBoundary);

  console.log(`🛡️ [ZoneValidation] Distance from zone boundary: ${distanceFromZone.toFixed(8)}, Min required: ${minDistance.toFixed(8)}`);

  if (distanceFromZone < minDistance) {
    const adjustment = minDistance - distanceFromZone;
    const adjustedSL = direction === 'LONG'
      ? sl - adjustment
      : sl + adjustment;
    
    console.log(`⚠️ [ZoneValidation] SL too close to zone boundary → Adjusted by ${adjustment.toFixed(8)} to ${adjustedSL.toFixed(8)}`);
    return adjustedSL;
  }

  console.log(`✅ [ZoneValidation] SL is at safe distance from zone`);
  return sl;
}
