/**
 * Dynamic Risk Calculator - Professional SL/TP System
 * 
 * Key Features:
 * 
 * SL CALCULATION:
 * 1. Professional SL using swing extremes (last 5 candles) instead of zone boundaries
 * 2. Adaptive buffer (0.3-0.5 ATR) based on volatility (ATR vs average ATR)
 * 3. Round number protection - adjusts SL away from psychological levels
 * 4. Minimum distance validation from zone boundary (0.5 ATR)
 * 
 * TP CALCULATION (HYBRID APPROACH):
 * 5. Fixed R-multiples: 1.5R, 2.5R, 4.0R as baseline targets
 * 6. Multi-timeframe zone awareness: Finds nearest resistance/support from 15m, 1h, 4h
 * 7. Zone adjustment: Places TP 5% BEFORE zone (0.95x for resistance, 1.05x for support)
 * 8. Hybrid min() approach: TP = min(fixed_R_target, zone_adjusted)
 * 9. Edge case handling: >10R zones ignored, TP ordering validation, min 0.5R distance
 * 10. Extensive logging for transparency and debugging
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
  
  // Hybrid TP metadata
  tp1LimitedByZone: boolean; // Was TP1 limited by resistance?
  tp2LimitedByZone: boolean;
  tp3LimitedByZone: boolean;
  nearestResistanceDistance: number; // Distance to nearest zone in R
  
  // For ML logging
  scenario: 'scalp_1R' | 'swing_2R' | 'trend_3R' | 'skip_no_space';
  
  // Dynamic Min R:R fields
  dynamicMinRR: number;
  dynamicMinRRAdjustments: {
    patternScore: number;
    zoneFreshness: number;
    trend: number;
    multiTF: number;
    volatility: number;
  };
  dynamicMinRRReasoning: string;
  trendAlignment: 'with' | 'against' | 'neutral';
  multiTFAlignment: boolean;
  atrVolatility: 'low' | 'normal' | 'high';
  
  // R:R Validation fields
  actualRR: {
    tp1: number;
    tp2: number | null;
    tp3: number | null;
  };
  rrValidation: {
    isValid: boolean;
    meetsRequirement: {
      tp1: boolean;
      tp2: boolean;
      tp3: boolean;
    };
    message: string;
  };
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
  candles1h?: Candle[]; // For trend analysis
  candles4h?: Candle[]; // For trend analysis
  patternScore?: number; // 0-10 from pattern detection
}

/**
 * Context for calculating dynamic minimum R:R
 */
export interface DynamicMinRRContext {
  patternScore: number;       // 0-10 from pattern detection
  zoneTestCount: number;      // How many times zone has been tested
  trend: 'with' | 'against' | 'neutral';  // Trend alignment
  multiTFAlignment: boolean;  // Are zones aligned across timeframes?
  atrVolatility: 'low' | 'normal' | 'high';  // Relative volatility
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
      tp1LimitedByZone: false,
      tp2LimitedByZone: false,
      tp3LimitedByZone: false,
      nearestResistanceDistance: 0,
      scenario: 'skip_no_space',
      
      // Dynamic min R:R fields (defaults for veto case)
      dynamicMinRR: 2.5, // Maximum penalty for vetoed setups
      dynamicMinRRAdjustments: {
        patternScore: 0,
        zoneFreshness: 0,
        trend: 0,
        multiTF: 0,
        volatility: 0,
      },
      dynamicMinRRReasoning: 'Vetoed by proximity filters',
      trendAlignment: 'neutral',
      multiTFAlignment: false,
      atrVolatility: 'normal',
      
      // R:R Validation fields (defaults for veto case)
      actualRR: {
        tp1: 0,
        tp2: null,
        tp3: null,
      },
      rrValidation: {
        isValid: false,
        meetsRequirement: {
          tp1: false,
          tp2: false,
          tp3: false,
        },
        message: 'Vetoed by proximity filters - no R:R validation performed',
      },
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

  // 8. Calculate dynamic minimum R:R
  console.log(`\n📊 [DynamicRisk] Calculating dynamic minimum R:R...`);
  
  // Determine trend alignment (use 15m candles for trend analysis)
  const trendAlignment = determineTrendAlignment(candles15m, direction);
  
  // Check multi-TF alignment
  const multiTFAlignment = checkMultiTFAlignment(zones, activeZone, direction);
  
  // Classify ATR volatility
  const atrVolatility = classifyAtrVolatility(atr15m, avgAtr);
  
  // Calculate dynamic min R:R
  const dynamicMinRRResult = calculateDynamicMinRR({
    patternScore: input.patternScore ?? 7, // Default to 7 if not provided
    zoneTestCount: zoneTestCount24h,
    trend: trendAlignment,
    multiTFAlignment,
    atrVolatility,
  });

  // 9. Validate R:R requirement
  const rrValidation = validateRRRequirement(
    entryPrice,
    sl,
    tps.tp1,
    tps.tp2,
    tps.tp3,
    dynamicMinRRResult.minRR,
    direction
  );

  console.log('✅ [R:R Validation]', rrValidation.message);
  if (!rrValidation.isValid) {
    console.log('❌ [R:R Validation] Trade rejected:', rrValidation.skipReason);
  }

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
    tp1LimitedByZone: tps.tp1LimitedByZone,
    tp2LimitedByZone: tps.tp2LimitedByZone,
    tp3LimitedByZone: tps.tp3LimitedByZone,
    nearestResistanceDistance: tps.nearestResistanceDistance,
    scenario: tps.scenario,
    
    // Dynamic min R:R fields
    dynamicMinRR: dynamicMinRRResult.minRR,
    dynamicMinRRAdjustments: dynamicMinRRResult.adjustments,
    dynamicMinRRReasoning: dynamicMinRRResult.reasoning,
    trendAlignment,
    multiTFAlignment,
    atrVolatility,
    
    // R:R Validation fields
    actualRR: rrValidation.actualRR,
    rrValidation: {
      isValid: rrValidation.isValid,
      meetsRequirement: rrValidation.meetsRequirement,
      message: rrValidation.message,
    },
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
 * Helper: Find N nearest resistance (LONG) or support (SHORT) zones above/below entry
 */
function findNearestResistanceZones(
  entry: number,
  direction: 'LONG' | 'SHORT',
  zones: Zone[],
  count: number = 3
): number[] {
  console.log(`🔍 [FindZones] Finding ${count} nearest ${direction === 'LONG' ? 'resistance' : 'support'} zones for entry ${entry.toFixed(8)}`);
  
  // Filter zones by type and position relative to entry
  const relevantZones = zones.filter(z => {
    if (direction === 'LONG') {
      // For LONG: find resistance zones ABOVE entry
      return z.type === 'resistance' && z.low > entry;
    } else {
      // For SHORT: find support zones BELOW entry
      return z.type === 'support' && z.high < entry;
    }
  });

  // Sort by distance from entry (closest first)
  const sortedZones = relevantZones.sort((a, b) => {
    const distA = direction === 'LONG' 
      ? a.low - entry
      : entry - a.high;
    const distB = direction === 'LONG'
      ? b.low - entry
      : entry - b.high;
    return distA - distB;
  });

  // Extract zone levels (take up to count zones)
  const zoneLevels = sortedZones.slice(0, count).map(z => {
    const level = direction === 'LONG' ? z.low : z.high;
    const dist = Math.abs(level - entry);
    console.log(`   📍 Zone: ${level.toFixed(8)} (${z.tf}, distance: ${dist.toFixed(8)})`);
    return level;
  });

  console.log(`✅ [FindZones] Found ${zoneLevels.length} zones`);
  return zoneLevels;
}

/**
 * Helper: Adjust zone level to place TP BEFORE the zone (5% buffer)
 */
function adjustZoneForTP(zoneLevel: number, direction: 'LONG' | 'SHORT'): number {
  if (direction === 'LONG') {
    // For LONG: place TP 5% BEFORE resistance (0.95x)
    const adjusted = zoneLevel * 0.95;
    console.log(`📐 [AdjustZone] LONG: ${zoneLevel.toFixed(8)} → ${adjusted.toFixed(8)} (95%)`);
    return adjusted;
  } else {
    // For SHORT: place TP 5% BEFORE support (1.05x)
    const adjusted = zoneLevel * 1.05;
    console.log(`📐 [AdjustZone] SHORT: ${zoneLevel.toFixed(8)} → ${adjusted.toFixed(8)} (105%)`);
    return adjusted;
  }
}

/**
 * Helper: Calculate hybrid TP using min(fixedR, zoneAdjusted)
 */
function calculateHybridTP(
  entry: number,
  stopLoss: number,
  fixedRMultiple: number,
  resistanceLevel: number | null,
  direction: 'LONG' | 'SHORT'
): { tp: number; limitedByZone: boolean } {
  const R = Math.abs(entry - stopLoss);
  
  // Calculate fixed R-target
  const fixedTP = direction === 'LONG'
    ? entry + (fixedRMultiple * R)
    : entry - (fixedRMultiple * R);
  
  console.log(`🧮 [HybridTP] Entry=${entry.toFixed(8)}, R=${R.toFixed(8)}, ${fixedRMultiple}R target=${fixedTP.toFixed(8)}`);
  
  // If no zone, use fixed TP
  if (resistanceLevel === null) {
    console.log(`   ✅ No zone found → using fixed ${fixedRMultiple}R: ${fixedTP.toFixed(8)}`);
    return { tp: fixedTP, limitedByZone: false };
  }
  
  // Check if zone is within reasonable range (≤10R)
  const distToZone = Math.abs(resistanceLevel - entry);
  if (distToZone > 10 * R) {
    console.log(`   ⚠️ Zone too far (${(distToZone / R).toFixed(1)}R) → using fixed ${fixedRMultiple}R: ${fixedTP.toFixed(8)}`);
    return { tp: fixedTP, limitedByZone: false };
  }
  
  // Take minimum (closest to entry)
  const hybridTP = direction === 'LONG'
    ? Math.min(fixedTP, resistanceLevel)
    : Math.max(fixedTP, resistanceLevel);
  
  const wasLimited = hybridTP !== fixedTP;
  
  if (wasLimited) {
    console.log(`   🚧 TP limited by zone: ${fixedTP.toFixed(8)} → ${hybridTP.toFixed(8)}`);
  } else {
    console.log(`   ✅ Fixed TP used (zone further): ${hybridTP.toFixed(8)}`);
  }
  
  return { tp: hybridTP, limitedByZone: wasLimited };
}

/**
 * Блок B п.7: HYBRID TP CALCULATOR - Combines fixed R-multiples with zone awareness
 * 
 * Strategy:
 * 1. Calculate fixed R-targets (1.5R, 2.5R, 4.0R)
 * 2. Find nearest resistance zones (15m, 1h, 4h)
 * 3. Adjust zones by 5% to place TP BEFORE the zone
 * 4. Use min(fixedR, zoneAdjusted) for each TP
 * 5. Validate ordering and minimum distance
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
  tp1LimitedByZone: boolean;
  tp2LimitedByZone: boolean;
  tp3LimitedByZone: boolean;
  nearestResistanceDistance: number;
  scenario: DynamicRiskProfile['scenario'];
} {
  
  console.log(`\n🎯 [TP] === HYBRID TP CALCULATOR ===`);
  console.log(`🎯 [TP] Direction: ${direction}, Entry: ${entryPrice.toFixed(8)}, R: ${riskR.toFixed(8)}`);
  console.log(`🎯 [TP] R_available: ${rAvailable.toFixed(1)}, Clearance: ${clearance.toFixed(8)}`);

  // Step 1: Calculate fixed R-targets
  const fixedTP1 = direction === 'LONG' 
    ? entryPrice + (1.5 * riskR)
    : entryPrice - (1.5 * riskR);
  
  const fixedTP2 = direction === 'LONG'
    ? entryPrice + (2.5 * riskR)
    : entryPrice - (2.5 * riskR);
  
  const fixedTP3 = direction === 'LONG'
    ? entryPrice + (4.0 * riskR)
    : entryPrice - (4.0 * riskR);

  console.log(`🎯 [TP] Fixed R-targets: TP1=${fixedTP1.toFixed(8)} (1.5R), TP2=${fixedTP2.toFixed(8)} (2.5R), TP3=${fixedTP3.toFixed(8)} (4.0R)`);

  // Step 2: Find nearest 3 resistance/support zones
  const nearestZones = findNearestResistanceZones(entryPrice, direction, zones, 3);
  console.log(`🎯 [TP] Found ${nearestZones.length} nearby zones`);

  // Step 3: Adjust zones to place TP BEFORE the zone (5% buffer)
  const adjustedZones = nearestZones.map(z => adjustZoneForTP(z, direction));
  console.log(`🎯 [TP] Adjusted zones (95%/105%):`, adjustedZones.map(z => z.toFixed(8)));

  // Calculate distance to nearest zone in R units
  const nearestResistanceDistance = nearestZones.length > 0
    ? Math.abs(nearestZones[0] - entryPrice) / riskR
    : 999; // No zone = unlimited
  
  console.log(`🎯 [TP] Nearest resistance distance: ${nearestResistanceDistance.toFixed(2)}R`);

  // Step 4: Calculate hybrid TPs using min(fixedR, zoneAdjusted)
  const hybridTP1 = calculateHybridTP(
    entryPrice,
    direction === 'LONG' ? entryPrice - riskR : entryPrice + riskR, // SL
    1.5,
    adjustedZones[0] ?? null,
    direction
  );

  const hybridTP2 = calculateHybridTP(
    entryPrice,
    direction === 'LONG' ? entryPrice - riskR : entryPrice + riskR,
    2.5,
    adjustedZones[1] ?? null,
    direction
  );

  const hybridTP3 = calculateHybridTP(
    entryPrice,
    direction === 'LONG' ? entryPrice - riskR : entryPrice + riskR,
    4.0,
    adjustedZones[2] ?? null,
    direction
  );

  console.log(`🎯 [TP] Hybrid TP1: ${hybridTP1.tp.toFixed(8)} (limited by zone: ${hybridTP1.limitedByZone})`);
  console.log(`🎯 [TP] Hybrid TP2: ${hybridTP2.tp.toFixed(8)} (limited by zone: ${hybridTP2.limitedByZone})`);
  console.log(`🎯 [TP] Hybrid TP3: ${hybridTP3.tp.toFixed(8)} (limited by zone: ${hybridTP3.limitedByZone})`);

  // Step 5: Validate ordering and minimum distance (0.5R)
  let tp1 = hybridTP1.tp;
  let tp2 = hybridTP2.tp;
  let tp3 = hybridTP3.tp;
  let tp1Limited = hybridTP1.limitedByZone;
  let tp2Limited = hybridTP2.limitedByZone;
  let tp3Limited = hybridTP3.limitedByZone;

  // Minimum distance check (0.5R from entry)
  const minDistanceFromEntry = 0.5 * riskR;
  
  const checkMinDistance = (tp: number): boolean => {
    return Math.abs(tp - entryPrice) >= minDistanceFromEntry;
  };

  // Validate TP1 (must be at least 0.5R from entry)
  if (!checkMinDistance(tp1)) {
    console.log(`⚠️ [TP] TP1 too close to entry (<0.5R), adjusting to 0.5R`);
    tp1 = direction === 'LONG' 
      ? entryPrice + minDistanceFromEntry
      : entryPrice - minDistanceFromEntry;
  }

  // Validate ordering: TP1 < TP2 < TP3 (for LONG) or TP1 > TP2 > TP3 (for SHORT)
  if (direction === 'LONG') {
    // For LONG: ensure TP1 < TP2 < TP3
    if (tp2 <= tp1) {
      console.log(`⚠️ [TP] TP2 (${tp2.toFixed(8)}) <= TP1 (${tp1.toFixed(8)}), setting TP2 to null`);
      tp2 = null as any;
      tp2Limited = false;
    }
    if (tp2 && tp3 <= tp2) {
      console.log(`⚠️ [TP] TP3 (${tp3.toFixed(8)}) <= TP2 (${tp2.toFixed(8)}), setting TP3 to null`);
      tp3 = null as any;
      tp3Limited = false;
    }
  } else {
    // For SHORT: ensure TP1 > TP2 > TP3
    if (tp2 >= tp1) {
      console.log(`⚠️ [TP] TP2 (${tp2.toFixed(8)}) >= TP1 (${tp1.toFixed(8)}), setting TP2 to null`);
      tp2 = null as any;
      tp2Limited = false;
    }
    if (tp2 && tp3 >= tp2) {
      console.log(`⚠️ [TP] TP3 (${tp3.toFixed(8)}) >= TP2 (${tp2.toFixed(8)}), setting TP3 to null`);
      tp3 = null as any;
      tp3Limited = false;
    }
  }

  // Determine scenario based on how many TPs are valid
  let scenario: DynamicRiskProfile['scenario'];
  if (!tp1) {
    scenario = 'skip_no_space';
  } else if (!tp2) {
    scenario = 'scalp_1R';
  } else if (!tp3) {
    scenario = 'swing_2R';
  } else {
    scenario = 'trend_3R';
  }

  console.log(`🎯 [TP] Final scenario: ${scenario}`);
  console.log(`🎯 [TP] Final TPs: TP1=${tp1?.toFixed(8) || 'null'}, TP2=${tp2?.toFixed(8) || 'null'}, TP3=${tp3?.toFixed(8) || 'null'}`);
  console.log(`🎯 [TP] === END HYBRID TP CALCULATOR ===\n`);

  return {
    tp1,
    tp2,
    tp3,
    tp1LimitedByZone: tp1Limited,
    tp2LimitedByZone: tp2Limited,
    tp3LimitedByZone: tp3Limited,
    nearestResistanceDistance,
    scenario,
  };
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

/**
 * =========================================
 * DYNAMIC MINIMUM R:R CALCULATOR
 * =========================================
 */

/**
 * Format adjustments for logging
 */
function formatAdjustments(adjustments: Record<string, number>): string {
  const parts: string[] = [];
  
  if (adjustments.patternScore !== 0) {
    const sign = adjustments.patternScore > 0 ? '+' : '';
    parts.push(`${sign}${adjustments.patternScore.toFixed(1)} pattern`);
  }
  
  if (adjustments.zoneFreshness !== 0) {
    const sign = adjustments.zoneFreshness > 0 ? '+' : '';
    parts.push(`${sign}${adjustments.zoneFreshness.toFixed(1)} fresh`);
  }
  
  if (adjustments.trend !== 0) {
    const sign = adjustments.trend > 0 ? '+' : '';
    parts.push(`${sign}${adjustments.trend.toFixed(1)} trend`);
  }
  
  if (adjustments.multiTF !== 0) {
    const sign = adjustments.multiTF > 0 ? '+' : '';
    parts.push(`${sign}${adjustments.multiTF.toFixed(1)} multiTF`);
  }
  
  if (adjustments.volatility !== 0) {
    const sign = adjustments.volatility > 0 ? '+' : '';
    parts.push(`${sign}${adjustments.volatility.toFixed(1)} vol`);
  }
  
  return parts.length > 0 ? `(${parts.join(', ')})` : '';
}

/**
 * Classify ATR volatility relative to average
 */
function classifyAtrVolatility(
  atr: number,
  avgAtr: number
): 'low' | 'normal' | 'high' {
  const ratio = atr / avgAtr;
  
  if (ratio < 0.8) {
    console.log(`📊 [AtrVolatility] Low (${ratio.toFixed(2)}x avg)`);
    return 'low';
  } else if (ratio <= 1.5) {
    console.log(`📊 [AtrVolatility] Normal (${ratio.toFixed(2)}x avg)`);
    return 'normal';
  } else {
    console.log(`📊 [AtrVolatility] High (${ratio.toFixed(2)}x avg)`);
    return 'high';
  }
}

/**
 * Determine trend alignment based on EMA analysis
 * Uses EMA50 vs EMA200 logic from candleAnalyzer
 */
function determineTrendAlignment(
  candles: Candle[],
  direction: 'LONG' | 'SHORT'
): 'with' | 'against' | 'neutral' {
  // Need at least 200 candles for EMA200
  if (candles.length < 200) {
    console.log(`📊 [TrendAlignment] Insufficient candles (${candles.length} < 200) → neutral`);
    return 'neutral';
  }
  
  // Calculate EMAs
  const closes = candles.map(c => Number(c.close));
  const currentPrice = closes[closes.length - 1];
  
  // EMA50
  const multiplier50 = 2 / (50 + 1);
  let ema50 = closes.slice(0, 50).reduce((sum, val) => sum + val, 0) / 50;
  for (let i = 50; i < closes.length; i++) {
    ema50 = (closes[i] - ema50) * multiplier50 + ema50;
  }
  
  // EMA200
  const multiplier200 = 2 / (200 + 1);
  let ema200 = closes.slice(0, 200).reduce((sum, val) => sum + val, 0) / 200;
  for (let i = 200; i < closes.length; i++) {
    ema200 = (closes[i] - ema200) * multiplier200 + ema200;
  }
  
  // Check trend based on direction
  if (direction === 'LONG') {
    // For LONG: with trend = price > EMA50 > EMA200
    const withTrend = currentPrice > ema50 && ema50 > ema200;
    const againstTrend = currentPrice < ema50 && ema50 < ema200;
    
    if (withTrend) {
      console.log(`📊 [TrendAlignment] LONG with trend: price=${currentPrice.toFixed(2)} > ema50=${ema50.toFixed(2)} > ema200=${ema200.toFixed(2)}`);
      return 'with';
    } else if (againstTrend) {
      console.log(`📊 [TrendAlignment] LONG against trend: price=${currentPrice.toFixed(2)} < ema50=${ema50.toFixed(2)} < ema200=${ema200.toFixed(2)}`);
      return 'against';
    } else {
      console.log(`📊 [TrendAlignment] LONG neutral/mixed: price=${currentPrice.toFixed(2)}, ema50=${ema50.toFixed(2)}, ema200=${ema200.toFixed(2)}`);
      return 'neutral';
    }
  } else {
    // For SHORT: with trend = price < EMA50 < EMA200
    const withTrend = currentPrice < ema50 && ema50 < ema200;
    const againstTrend = currentPrice > ema50 && ema50 > ema200;
    
    if (withTrend) {
      console.log(`📊 [TrendAlignment] SHORT with trend: price=${currentPrice.toFixed(2)} < ema50=${ema50.toFixed(2)} < ema200=${ema200.toFixed(2)}`);
      return 'with';
    } else if (againstTrend) {
      console.log(`📊 [TrendAlignment] SHORT against trend: price=${currentPrice.toFixed(2)} > ema50=${ema50.toFixed(2)} > ema200=${ema200.toFixed(2)}`);
      return 'against';
    } else {
      console.log(`📊 [TrendAlignment] SHORT neutral/mixed: price=${currentPrice.toFixed(2)}, ema50=${ema50.toFixed(2)}, ema200=${ema200.toFixed(2)}`);
      return 'neutral';
    }
  }
}

/**
 * Check if zones from multiple timeframes are aligned
 * Returns true if zones from 2+ timeframes are within ±2% of the touched zone
 */
function checkMultiTFAlignment(
  zones: Zone[],
  touchedZone: Zone,
  direction: 'LONG' | 'SHORT'
): boolean {
  // Get the price of the touched zone (center)
  const touchedPrice = (touchedZone.low + touchedZone.high) / 2;
  const tolerance = touchedPrice * 0.02; // ±2%
  
  // Find zones of the same type (support or resistance) from other timeframes
  const sameTypeZones = zones.filter(z => 
    z.type === touchedZone.type && 
    z.tf !== touchedZone.tf // Different timeframe
  );
  
  // Check how many zones are within tolerance
  const alignedZones = sameTypeZones.filter(z => {
    const zonePrice = (z.low + z.high) / 2;
    const distance = Math.abs(zonePrice - touchedPrice);
    return distance <= tolerance;
  });
  
  // Get unique timeframes from aligned zones
  const uniqueTFs = new Set(alignedZones.map(z => z.tf));
  const tfCount = uniqueTFs.size + 1; // +1 for touched zone's TF
  
  const isAligned = tfCount >= 2;
  
  console.log(`📊 [MultiTFAlignment] Touched zone: ${touchedZone.tf} ${touchedZone.type} @ ${touchedPrice.toFixed(8)}`);
  console.log(`📊 [MultiTFAlignment] Found ${alignedZones.length} aligned zones from ${uniqueTFs.size} other timeframes`);
  console.log(`📊 [MultiTFAlignment] Total aligned TFs: ${tfCount} → ${isAligned ? 'ALIGNED' : 'NOT ALIGNED'}`);
  
  return isAligned;
}

/**
 * R:R Validation Result
 */
export interface RRValidationResult {
  isValid: boolean;
  actualRR: {
    tp1: number;
    tp2: number | null;
    tp3: number | null;
  };
  dynamicMinRR: number;
  meetsRequirement: {
    tp1: boolean;
    tp2: boolean;
    tp3: boolean;
  };
  skipReason?: string;
  message: string;
}

/**
 * Calculate actual R:R ratio for a given TP
 */
export function calculateActualRR(
  entry: number,
  stopLoss: number,
  takeProfit: number,
  direction: 'LONG' | 'SHORT'
): number {
  // Calculate actual R:R ratio
  // R = |entry - stopLoss|
  // Reward = |takeProfit - entry|
  // R:R = Reward / R
  
  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(takeProfit - entry);
  
  if (risk === 0) return 0; // Avoid division by zero
  
  return reward / risk;
}

/**
 * Validate that actual R:R meets the dynamically calculated minimum requirement
 */
export function validateRRRequirement(
  entry: number,
  stopLoss: number,
  tp1: number | null,
  tp2: number | null,
  tp3: number | null,
  dynamicMinRR: number,
  direction: 'LONG' | 'SHORT'
): RRValidationResult {
  console.log(`\n📊 [R:R Validation] === VALIDATING R:R REQUIREMENT ===`);
  console.log(`📊 [R:R Validation] Entry: ${entry.toFixed(8)}, SL: ${stopLoss.toFixed(8)}`);
  console.log(`📊 [R:R Validation] TP1: ${tp1?.toFixed(8) || 'null'}, TP2: ${tp2?.toFixed(8) || 'null'}, TP3: ${tp3?.toFixed(8) || 'null'}`);
  console.log(`📊 [R:R Validation] Dynamic Min R:R: ${dynamicMinRR.toFixed(2)}`);
  
  // If TP1 is null, trade is invalid
  if (!tp1) {
    console.log(`❌ [R:R Validation] TP1 is null - trade invalid`);
    return {
      isValid: false,
      actualRR: {
        tp1: 0,
        tp2: null,
        tp3: null,
      },
      dynamicMinRR,
      meetsRequirement: {
        tp1: false,
        tp2: false,
        tp3: false,
      },
      skipReason: 'rr_below_dynamic_min',
      message: 'TP1 is null - insufficient space',
    };
  }
  
  // Calculate actual R:R for each TP
  const actualRR_TP1 = calculateActualRR(entry, stopLoss, tp1, direction);
  const actualRR_TP2 = tp2 ? calculateActualRR(entry, stopLoss, tp2, direction) : null;
  const actualRR_TP3 = tp3 ? calculateActualRR(entry, stopLoss, tp3, direction) : null;
  
  console.log(`📊 [R:R] Actual TP1: ${actualRR_TP1.toFixed(2)}`);
  console.log(`📊 [R:R] Actual TP2: ${actualRR_TP2?.toFixed(2) || 'N/A'}`);
  console.log(`📊 [R:R] Actual TP3: ${actualRR_TP3?.toFixed(2) || 'N/A'}`);
  console.log(`📊 [R:R] Required min: ${dynamicMinRR.toFixed(2)}`);
  
  // Check if TP1 meets minimum requirement
  const tp1Meets = actualRR_TP1 >= dynamicMinRR;
  const tp2Meets = actualRR_TP2 ? actualRR_TP2 >= dynamicMinRR : true;
  const tp3Meets = actualRR_TP3 ? actualRR_TP3 >= dynamicMinRR : true;
  
  console.log(`📊 [R:R] TP1 meets requirement: ${tp1Meets ? '✅' : '❌'}`);
  console.log(`📊 [R:R] TP2 meets requirement: ${tp2Meets ? '✅' : '❌ (or N/A)'}`);
  console.log(`📊 [R:R] TP3 meets requirement: ${tp3Meets ? '✅' : '❌ (or N/A)'}`);
  
  // Trade is valid if TP1 meets requirement
  const isValid = tp1Meets;
  
  let message = '';
  if (!isValid) {
    message = `TP1 R:R ${actualRR_TP1.toFixed(2)} < ${dynamicMinRR.toFixed(2)} (required)`;
  } else {
    message = `TP1 R:R ${actualRR_TP1.toFixed(2)} >= ${dynamicMinRR.toFixed(2)} ✅`;
  }
  
  console.log(`📊 [R:R] Validation result: ${isValid ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`📊 [R:R Validation] === END R:R VALIDATION ===\n`);
  
  return {
    isValid,
    actualRR: {
      tp1: actualRR_TP1,
      tp2: actualRR_TP2,
      tp3: actualRR_TP3,
    },
    dynamicMinRR,
    meetsRequirement: {
      tp1: tp1Meets,
      tp2: tp2Meets,
      tp3: tp3Meets,
    },
    skipReason: isValid ? undefined : 'rr_below_dynamic_min',
    message,
  };
}

/**
 * Calculate dynamic minimum R:R based on setup quality
 */
export function calculateDynamicMinRR(context: DynamicMinRRContext): {
  minRR: number;
  adjustments: {
    patternScore: number;
    zoneFreshness: number;
    trend: number;
    multiTF: number;
    volatility: number;
  };
  reasoning: string;
} {
  console.log(`\n📊 [Dynamic R:R] === CALCULATING DYNAMIC MIN R:R ===`);
  
  let minRR = 1.2; // Base minimum R:R
  const adjustments = {
    patternScore: 0,
    zoneFreshness: 0,
    trend: 0,
    multiTF: 0,
    volatility: 0,
  };
  
  // 1. Pattern Score adjustment (-0.1 to +0.2)
  console.log(`📊 [Dynamic R:R] Pattern score: ${context.patternScore}/10`);
  if (context.patternScore >= 8) {
    minRR -= 0.1;
    adjustments.patternScore = -0.1;
    console.log(`   ✅ Strong pattern (≥8) → -0.1`);
  } else if (context.patternScore <= 5) {
    minRR += 0.2;
    adjustments.patternScore = +0.2;
    console.log(`   ⚠️ Weak pattern (≤5) → +0.2`);
  } else {
    console.log(`   ➡️ Average pattern (6-7) → no adjustment`);
  }
  
  // 2. Zone Freshness adjustment (-0.2 to +0.3)
  console.log(`📊 [Dynamic R:R] Zone test count: ${context.zoneTestCount}`);
  if (context.zoneTestCount === 0) {
    minRR -= 0.2;
    adjustments.zoneFreshness = -0.2;
    console.log(`   ✅ Fresh zone (0 tests) → -0.2`);
  } else if (context.zoneTestCount >= 3) {
    minRR += 0.3;
    adjustments.zoneFreshness = +0.3;
    console.log(`   ⚠️ Tested zone (≥3 tests) → +0.3`);
  } else {
    console.log(`   ➡️ Some tests (1-2) → no adjustment`);
  }
  
  // 3. Trend alignment adjustment (-0.1 to +0.3)
  console.log(`📊 [Dynamic R:R] Trend: ${context.trend}`);
  if (context.trend === 'with') {
    minRR -= 0.1;
    adjustments.trend = -0.1;
    console.log(`   ✅ With trend → -0.1`);
  } else if (context.trend === 'against') {
    minRR += 0.3;
    adjustments.trend = +0.3;
    console.log(`   ⚠️ Against trend → +0.3`);
  } else {
    console.log(`   ➡️ Neutral trend → no adjustment`);
  }
  
  // 4. Multi-TF alignment adjustment (-0.1)
  console.log(`📊 [Dynamic R:R] Multi-TF aligned: ${context.multiTFAlignment}`);
  if (context.multiTFAlignment) {
    minRR -= 0.1;
    adjustments.multiTF = -0.1;
    console.log(`   ✅ Multiple TF zones aligned → -0.1`);
  } else {
    console.log(`   ➡️ No multi-TF alignment → no adjustment`);
  }
  
  // 5. Volatility adjustment (+0.2)
  console.log(`📊 [Dynamic R:R] Volatility: ${context.atrVolatility}`);
  if (context.atrVolatility === 'high') {
    minRR += 0.2;
    adjustments.volatility = +0.2;
    console.log(`   ⚠️ High volatility → +0.2`);
  } else {
    console.log(`   ➡️ ${context.atrVolatility} volatility → no adjustment`);
  }
  
  // Cap at 0.8 - 2.5
  const uncappedRR = minRR;
  minRR = Math.max(0.8, Math.min(2.5, minRR));
  
  if (uncappedRR !== minRR) {
    console.log(`📊 [Dynamic R:R] Capped ${uncappedRR.toFixed(2)} → ${minRR.toFixed(2)}`);
  }
  
  // Generate reasoning string
  const reasoning = `Base 1.2 ${formatAdjustments(adjustments)} = ${minRR.toFixed(2)}`;
  
  console.log(`📊 [Dynamic R:R] Final min R:R: ${minRR.toFixed(2)}`);
  console.log(`📊 [Dynamic R:R] Reasoning: ${reasoning}`);
  console.log(`📊 [Dynamic R:R] === END DYNAMIC MIN R:R ===\n`);
  
  return { minRR, adjustments, reasoning };
}
