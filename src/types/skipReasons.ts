/**
 * Skip reason codes for ML logging
 * Used to track why signals were skipped by filters
 */
export const SKIP_REASONS = {
  // H1 zone proximity
  NEAR_H1_RES_FOR_LONG: 'near_H1_res_for_long',
  NEAR_H1_SUP_FOR_SHORT: 'near_H1_sup_for_short',
  
  // H4 zone proximity
  NEAR_H4_RES_FOR_LONG: 'near_H4_res_for_long',
  NEAR_H4_SUP_FOR_SHORT: 'near_H4_sup_for_short',
  
  // Free path
  FREE_PATH_LT_1_2R: 'free_path_lt_1_2R',
  
  // Arrival pattern
  COMPRESSION_INTO_ZONE: 'compression_into_zone',
  CHOP_IN_ZONE: 'chop_in_zone',
  IMPULSE_DOWN_FOR_LONG: 'impulse_down_for_long',
  IMPULSE_UP_FOR_SHORT: 'impulse_up_for_short',
  
  // Zone fatigue
  ZONE_FATIGUE_GE_3_TOUCHES: 'zone_fatigue_ge_3_touches',
  
  // BTC trend alignment
  BTC_DOWN_FOR_LONG: 'btc_down_for_long',
  BTC_UP_FOR_SHORT: 'btc_up_for_short',
  
  // EMA200 alignment
  BELOW_EMA200_FOR_LONG: 'below_ema200_for_long',
  ABOVE_EMA200_FOR_SHORT: 'above_ema200_for_short',
  
  // Position in 15m range
  MIDRANGE_15M: 'midrange_15m',
  
  // Signal bar size
  OVEREXTENDED_BAR_GT_1_2_ATR15: 'overextended_bar_gt_1_2_ATR15',
  UNDERPOWERED_BAR_LT_0_15_ATR15: 'underpowered_bar_lt_0_15_ATR15',
  
  // Trend alignment
  COUNTERTREND_WITHOUT_CONFIRM: 'countertrend_without_confirm',
  
  // Optional filters
  LIQUIDITY_SPREAD_ISSUE: 'liquidity_spread_issue',
  NEWS_BLACKOUT: 'news_blackout',
  SESSION_BLACKOUT: 'session_blackout',
  
  // NEW: Dynamic S/R veto filters (Блок A)
  H4_VETO_RES_TOO_CLOSE: 'h4_veto_res_too_close', // H4 resistance < 0.7·ATR1h for LONG
  H4_VETO_SUP_TOO_CLOSE: 'h4_veto_sup_too_close', // H4 support < 0.7·ATR1h for SHORT
  H1_VETO_RES_TOO_CLOSE: 'h1_veto_res_too_close', // H1 resistance < 1.0·ATR15 for LONG
  H1_VETO_SUP_TOO_CLOSE: 'h1_veto_sup_too_close', // H1 support < 1.0·ATR15 for SHORT
  
  // NEW: R_available filter (Блок B п.6)
  R_AVAILABLE_LT_1_0: 'r_available_lt_1_0', // Not enough space for trade
  
  // NEW: Bad context filters (Блок B п.9)
  COMPRESSION_RANGE_LT_0_7_ATR15: 'compression_range_lt_0_7_atr15', // Range of last 12 bars < 0.7·ATR15
  WHIPSAW_ZONE: 'whipsaw_zone', // Both sides < 1.0R (saw pattern)
  POLLUTED_ZONE: 'polluted_zone', // Overlapping microzones > 1.5·ATR15
  
  // NEW: "AT zone" validation (Critical: Pattern must form AT zone, not away from it)
  NOT_AT_SUPPORT_ZONE_FOR_LONG: 'not_at_support_zone_for_long', // LONG pattern wick doesn't touch support zone
  NOT_AT_RESISTANCE_ZONE_FOR_SHORT: 'not_at_resistance_zone_for_short', // SHORT pattern wick doesn't touch resistance zone
  
  // NEW: R:R validation (Dynamic minimum R:R requirement)
  RR_BELOW_DYNAMIC_MIN: 'rr_below_dynamic_min', // Actual TP1 R:R < dynamically calculated minimum R:R
  
  // NEW: Confluence scoring (Professional 8-factor confluence requirement)
  CONFLUENCE_TOO_LOW: 'confluence_too_low', // Confluence score below minimum requirement (5/10 for 15m)
  
  // NEW: Professional counter-trend edge cases (based on institutional trading rules)
  COUNTER_TREND_LONG_BELOW_SUPPORT_WITHOUT_REJECTION: 'counter_trend_long_below_support_without_rejection', // LONG below H4 support without rejection pattern (blocks Engulfing, allows Fakey/PPR)
  COUNTER_TREND_SHORT_ABOVE_RESISTANCE_WITHOUT_REJECTION: 'counter_trend_short_above_resistance_without_rejection', // SHORT above H4 resistance without rejection pattern (blocks Engulfing, allows Fakey/PPR)
} as const;

export type SkipReason = typeof SKIP_REASONS[keyof typeof SKIP_REASONS];

export const RULESET_VERSION = 'v1.0.0';
