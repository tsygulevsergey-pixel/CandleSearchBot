/**
 * Dynamic Risk Calculator - новая система из документа A-B-C
 * 
 * Основные изменения:
 * 1. Динамический SL на основе границ зоны + буфер (0.15-0.35 ATR15)
 * 2. Расчёт clearance до противоположных зон
 * 3. R_available = floor((0.9 · clearance) / R, 0.1)
 * 4. Адаптивные TP на основе R_available (1R/2R/3R)
 * 5. Учёт свежести зоны для адаптивного буфера
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
  slBufferAtr15: number; // Actual buffer used (0.15-0.35)
  clearance15m: number;
  clearance1h: number;
  rAvailable: number;
  zoneTestCount24h: number;
  vetoReason: 'h4_res_too_close' | 'h4_sup_too_close' | 'h1_res_too_close' | 'h1_sup_too_close' | 'none';
  
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

  // 3. Calculate dynamic SL buffer
  const slBuffer = calculateSlBuffer(
    atr15m,
    zoneTestCount24h,
    candles15m,
    activeZone,
    direction
  );

  // 4. Calculate SL
  const sl = calculateDynamicSl(
    direction,
    activeZone,
    patternExtreme,
    slBuffer,
    atr15m
  );

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
    slBufferAtr15: slBuffer,
    clearance15m,
    clearance1h,
    rAvailable,
    zoneTestCount24h,
    vetoReason: 'none',
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
 * Блок B п.5: Расчёт динамического SL буфера (0.15-0.35 ATR15)
 */
function calculateSlBuffer(
  atr15m: number,
  zoneTestCount24h: number,
  candles15m: Candle[],
  activeZone: Zone,
  direction: 'LONG' | 'SHORT'
): number {
  let buffer = 0.15; // Base buffer

  // Increase buffer if zone was tested ≥2 times
  if (zoneTestCount24h >= 2) {
    buffer = 0.35;
    console.log(`📊 [SL Buffer] Zone tested ${zoneTestCount24h} times → buffer=0.35`);
  } else {
    // Check for long tails in last 6 bars
    const last6 = candles15m.slice(-6);
    const hasLongTails = last6.some(c => {
      const candleLow = Number(c.low);
      const threshold = activeZone.low - (0.2 * atr15m);
      
      if (direction === 'LONG') {
        return candleLow < threshold;
      } else {
        const candleHigh = Number(c.high);
        const thresholdHigh = activeZone.high + (0.2 * atr15m);
        return candleHigh > thresholdHigh;
      }
    });

    if (hasLongTails) {
      buffer = 0.35;
      console.log(`📊 [SL Buffer] Long tails detected → buffer=0.35`);
    } else {
      buffer = 0.15;
      console.log(`📊 [SL Buffer] Fresh zone, no tails → buffer=0.15`);
    }
  }

  return buffer;
}

/**
 * Блок B п.5: Расчёт динамического SL
 */
function calculateDynamicSl(
  direction: 'LONG' | 'SHORT',
  activeZone: Zone,
  patternExtreme: number,
  slBuffer: number,
  atr15m: number
): number {
  const bufferPrice = slBuffer * atr15m;

  let sl: number;
  
  if (direction === 'LONG') {
    // SL = lower boundary of support - buffer
    sl = activeZone.low - bufferPrice;
    console.log(`🔧 [SL] LONG: zone.low=${activeZone.low.toFixed(8)}, buffer=${bufferPrice.toFixed(8)} → sl=${sl.toFixed(8)}`);
  } else {
    // SL = upper boundary of resistance + buffer
    sl = activeZone.high + bufferPrice;
    console.log(`🔧 [SL] SHORT: zone.high=${activeZone.high.toFixed(8)}, buffer=${bufferPrice.toFixed(8)} → sl=${sl.toFixed(8)}`);
  }

  // Apply min/max constraints
  const minSl = 0.4 * atr15m;
  const zoneHeight = activeZone.high - activeZone.low;
  const maxSl = Math.min(zoneHeight + (0.3 * atr15m), 1.2 * atr15m);

  // Constrain SL distance from entry
  const slDistance = Math.abs(sl - patternExtreme);
  if (slDistance < minSl) {
    console.log(`⚠️ [SL] Too tight (${slDistance.toFixed(8)} < ${minSl.toFixed(8)}), adjusting`);
    sl = direction === 'LONG' 
      ? patternExtreme - minSl 
      : patternExtreme + minSl;
  } else if (slDistance > maxSl) {
    console.log(`⚠️ [SL] Too wide (${slDistance.toFixed(8)} > ${maxSl.toFixed(8)}), adjusting`);
    sl = direction === 'LONG'
      ? patternExtreme - maxSl
      : patternExtreme + maxSl;
  }

  return sl;
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
