/**
 * Signal Filters - Check all filters and return skip reasons
 * 
 * Implements 11 standardized filter rules to identify near-miss SKIPs
 */

import { MLContext } from '../services/mlLogger';
import { SkipReason } from '../types/skipReasons';
import { Zone } from './indicators/standardPlan';

export interface FilterResult {
  shouldEnter: boolean;
  skipReasons: SkipReason[];
}

/**
 * Check if pattern candle's wick touches support/resistance zone
 * 
 * CRITICAL RULE: Pattern must form AT zone in the CORRECT direction
 * 
 * For LONG:
 *  - Lower wick must touch support zone that is BELOW entry price
 *  - This ensures pattern is bouncing OFF support (not resistance above)
 *  - Check: zone must be below entry AND wick must touch zone
 * 
 * For SHORT:
 *  - Upper wick must touch resistance zone that is ABOVE entry price
 *  - This ensures pattern is rejecting FROM resistance (not support below)
 *  - Check: zone must be above entry AND wick must touch zone
 * 
 * @param entryPrice - Entry price of the pattern (to determine zone direction)
 * @returns true if pattern is AT correct zone, false otherwise
 */
function isPatternAtZone(
  direction: 'LONG' | 'SHORT',
  patternCandleHigh: number,
  patternCandleLow: number,
  entryPrice: number,
  zones: Zone[]
): boolean {
  if (direction === 'LONG') {
    // LONG: Find support zones that are positioned below entry (15m OR 1h only)
    // Zone can touch/overlap entry, but must originate from below (zone.low <= entryPrice)
    const supportZonesBelowEntry = zones.filter(
      z => z.type === 'support' 
        && (z.tf === '15m' || z.tf === '1h')
        && z.low <= entryPrice  // Zone starts at or below entry (allows overlap)
    );
    
    if (supportZonesBelowEntry.length === 0) {
      console.log(`❌ [AT Zone] LONG: No support zones BELOW entry price ${entryPrice.toFixed(8)}`);
      return false;
    }
    
    // Check if lower wick touches any of these support zones
    for (const zone of supportZonesBelowEntry) {
      if (patternCandleLow >= zone.low && patternCandleLow <= zone.high) {
        console.log(`✅ [AT Zone] LONG pattern AT support BELOW entry: wick=${patternCandleLow.toFixed(8)} touches zone [${zone.low.toFixed(8)} - ${zone.high.toFixed(8)}] (${zone.tf}), entry=${entryPrice.toFixed(8)}`);
        return true;
      }
    }
    
    console.log(`❌ [AT Zone] LONG: wick=${patternCandleLow.toFixed(8)} doesn't touch any support zone BELOW entry ${entryPrice.toFixed(8)}`);
    return false;
    
  } else {
    // SHORT: Find resistance zones that are positioned above entry (15m OR 1h only)
    // Zone can touch/overlap entry, but must originate from above (zone.high >= entryPrice)
    const resistanceZonesAboveEntry = zones.filter(
      z => z.type === 'resistance' 
        && (z.tf === '15m' || z.tf === '1h')
        && z.high >= entryPrice  // Zone ends at or above entry (allows overlap)
    );
    
    if (resistanceZonesAboveEntry.length === 0) {
      console.log(`❌ [AT Zone] SHORT: No resistance zones ABOVE entry price ${entryPrice.toFixed(8)}`);
      return false;
    }
    
    // Check if upper wick touches any of these resistance zones
    for (const zone of resistanceZonesAboveEntry) {
      if (patternCandleHigh >= zone.low && patternCandleHigh <= zone.high) {
        console.log(`✅ [AT Zone] SHORT pattern AT resistance ABOVE entry: wick=${patternCandleHigh.toFixed(8)} touches zone [${zone.low.toFixed(8)} - ${zone.high.toFixed(8)}] (${zone.tf}), entry=${entryPrice.toFixed(8)}`);
        return true;
      }
    }
    
    console.log(`❌ [AT Zone] SHORT: wick=${patternCandleHigh.toFixed(8)} doesn't touch any resistance zone ABOVE entry ${entryPrice.toFixed(8)}`);
    return false;
  }
}

/**
 * Check all filters and return skip reasons
 */
export function checkFilters(
  direction: 'LONG' | 'SHORT',
  mlContext: MLContext
): FilterResult {
  const skipReasons: SkipReason[] = [];
  
  // ========== CRITICAL FILTER: "AT ZONE" VALIDATION ==========
  // Pattern MUST form AT support/resistance zone in the CORRECT direction
  // LONG: must bounce from support BELOW entry
  // SHORT: must reject from resistance ABOVE entry
  // This is the MOST IMPORTANT filter - if pattern is not at correct zone, skip immediately
  
  const patternIsAtZone = isPatternAtZone(
    direction,
    mlContext.patternCandleHigh,
    mlContext.patternCandleLow,
    mlContext.entryPrice,
    mlContext.zones
  );
  
  if (!patternIsAtZone) {
    if (direction === 'LONG') {
      skipReasons.push('not_at_support_zone_for_long');
    } else {
      skipReasons.push('not_at_resistance_zone_for_short');
    }
  }
  
  // ========== VETO FILTERS (Блок A - Dynamic S/R) ==========
  
  // VETO FILTER 1: H4 veto - resistance/support too close
  if (mlContext.vetoReason && mlContext.vetoReason.includes('h4_')) {
    if (direction === 'LONG' && mlContext.vetoReason === 'h4_res_too_close') {
      skipReasons.push('h4_veto_res_too_close');
    }
    if (direction === 'SHORT' && mlContext.vetoReason === 'h4_sup_too_close') {
      skipReasons.push('h4_veto_sup_too_close');
    }
  }
  
  // VETO FILTER 2: H1 veto - resistance/support too close
  if (mlContext.vetoReason && mlContext.vetoReason.includes('h1_')) {
    if (direction === 'LONG' && mlContext.vetoReason === 'h1_res_too_close') {
      skipReasons.push('h1_veto_res_too_close');
    }
    if (direction === 'SHORT' && mlContext.vetoReason === 'h1_sup_too_close') {
      skipReasons.push('h1_veto_sup_too_close');
    }
  }
  
  // VETO FILTER 3: R_available < 1.0 (not enough space for trade)
  if (mlContext.rAvailable !== undefined && mlContext.rAvailable < 1.0) {
    skipReasons.push('r_available_lt_1_0');
  }
  
  // ========== BAD CONTEXT FILTERS (Блок B п.9) ==========
  
  // BAD CONTEXT FILTER 1: Whipsaw zone (both clearances < 1.0R)
  // Calculate clearance in R terms (using riskR from context)
  const riskR = mlContext.atr15m; // Approximate R size
  if (
    mlContext.clearance15m !== undefined &&
    mlContext.clearance1h !== undefined &&
    riskR > 0
  ) {
    const clearance15mR = mlContext.clearance15m / riskR;
    const clearance1hR = mlContext.clearance1h / riskR;
    
    if (clearance15mR < 1.0 && clearance1hR < 1.0) {
      skipReasons.push('whipsaw_zone');
    }
  }
  
  // BAD CONTEXT FILTER 2: Compression range < 0.7·ATR15
  // If range of last 12 bars is less than 0.7·ATR15, market is too compressed
  if (mlContext.compressionRangeAtr15 !== undefined && mlContext.compressionRangeAtr15 < 0.7) {
    skipReasons.push('compression_range_lt_0_7_atr15');
  }
  
  // BAD CONTEXT FILTER 3: Polluted zone (overlapping microzones > 1.5·ATR15)
  // Calculate sum of 15m zone thicknesses
  let zoneThicknessSum = 0;
  const zones15m = mlContext.zones.filter(z => z.tf === '15m');
  
  for (const zone of zones15m) {
    zoneThicknessSum += (zone.high - zone.low);
  }
  
  const pollutionThreshold = 1.5 * mlContext.atr15m;
  if (zoneThicknessSum > pollutionThreshold) {
    skipReasons.push('polluted_zone');
  }
  
  // ========== LEGACY FILTERS (Existing) ==========
  
  // FILTER 1: Near H1 opposing zone
  // LONG: Near H1 resistance (< 0.30 ATR15)
  // SHORT: Near H1 support (< 0.30 ATR15)
  if (direction === 'LONG') {
    const h1Resistance = mlContext.zones.find(z => z.type === 'resistance' && z.tf === '1h');
    if (h1Resistance) {
      const distToH1Res = mlContext.distToDirH1ZoneAtr;
      if (distToH1Res < 0.30) {
        skipReasons.push('near_H1_res_for_long');
      }
    }
  } else {
    const h1Support = mlContext.zones.find(z => z.type === 'support' && z.tf === '1h');
    if (h1Support) {
      const distToH1Sup = mlContext.distToDirH1ZoneAtr;
      if (distToH1Sup < 0.30) {
        skipReasons.push('near_H1_sup_for_short');
      }
    }
  }
  
  // FILTER 2: Near H4 opposing zone
  // LONG: Near H4 resistance
  // SHORT: Near H4 support
  if (direction === 'LONG' && mlContext.nearH4Resistance) {
    skipReasons.push('near_H4_res_for_long');
  }
  if (direction === 'SHORT' && mlContext.nearH4Support) {
    skipReasons.push('near_H4_sup_for_short');
  }
  
  // FILTER 3: Free path < 1.2R
  // If free path to nearest opposing 15m zone is < 1.2R, skip
  if (mlContext.freePathR < 1.2) {
    skipReasons.push('free_path_lt_1_2R');
  }
  
  // FILTER 4: Compression into zone
  // If arrival pattern is compression AND in/near H4 zone, skip
  if (mlContext.arrivalPattern === 'compression' && mlContext.inH4Zone) {
    skipReasons.push('compression_into_zone');
  }
  
  // FILTER 5: Zone fatigue (≥3 touches)
  // If trading into H4 zone with ≥3 touches, skip
  const h4Zone = direction === 'LONG'
    ? mlContext.zones.find(z => z.type === 'support' && z.tf === '4h')
    : mlContext.zones.find(z => z.type === 'resistance' && z.tf === '4h');
  
  if (h4Zone && h4Zone.touches && h4Zone.touches >= 3) {
    skipReasons.push('zone_fatigue_ge_3_touches');
  }
  
  // FILTER 6: Wrong impulse direction
  // LONG: Skip if impulse_down
  // SHORT: Skip if impulse_up
  if (direction === 'LONG' && mlContext.arrivalPattern === 'impulse_down') {
    skipReasons.push('impulse_down_for_long');
  }
  if (direction === 'SHORT' && mlContext.arrivalPattern === 'impulse_up') {
    skipReasons.push('impulse_up_for_short');
  }
  
  // FILTER 7: Against BTC trend
  // LONG: Skip if BTC trend is down
  // SHORT: Skip if BTC trend is up
  if (direction === 'LONG' && mlContext.btcTrendState === 'down') {
    skipReasons.push('btc_down_for_long');
  }
  if (direction === 'SHORT' && mlContext.btcTrendState === 'up') {
    skipReasons.push('btc_up_for_short');
  }
  
  // FILTER 8: Against EMA200 H1
  // LONG: Skip if below EMA200 H1
  // SHORT: Skip if above EMA200 H1
  if (direction === 'LONG' && mlContext.ema200H1Pos === 'below') {
    skipReasons.push('below_ema200_for_long');
  }
  if (direction === 'SHORT' && mlContext.ema200H1Pos === 'above') {
    skipReasons.push('above_ema200_for_short');
  }
  
  // FILTER 9: Chop + in zone
  // If arrival pattern is chop AND in H4 zone, skip
  if (mlContext.arrivalPattern === 'chop' && mlContext.inH4Zone) {
    skipReasons.push('chop_in_zone');
  }
  
  // Decision: Enter if NO skip reasons
  const shouldEnter = skipReasons.length === 0;
  
  return {
    shouldEnter,
    skipReasons,
  };
}
