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
} as const;

export type SkipReason = typeof SKIP_REASONS[keyof typeof SKIP_REASONS];

export const RULESET_VERSION = 'v1.0.0';
