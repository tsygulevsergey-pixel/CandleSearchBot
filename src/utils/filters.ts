/**
 * Signal Filters - Check all filters and return skip reasons
 * 
 * Implements 11 standardized filter rules to identify near-miss SKIPs
 */

import { MLContext } from '../services/mlLogger';
import { SkipReason } from '../types/skipReasons';

export interface FilterResult {
  shouldEnter: boolean;
  skipReasons: SkipReason[];
}

/**
 * Check all filters and return skip reasons
 */
export function checkFilters(
  direction: 'LONG' | 'SHORT',
  mlContext: MLContext
): FilterResult {
  const skipReasons: SkipReason[] = [];
  
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
