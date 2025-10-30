import { pgTable, serial, text, timestamp, decimal, pgEnum, integer, boolean, jsonb, date, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Existing enums
export const signalStatusEnum = pgEnum('signal_status', [
  'OPEN', 
  'TP1_HIT', 
  'TP2_HIT', 
  'TP3_HIT', 
  'SL_HIT', 
  'BE_HIT', 
  'FAIL_SAFE'
]);
export const signalDirectionEnum = pgEnum('signal_direction', ['LONG', 'SHORT']);

// New enums for ML logging
export const decisionEnum = pgEnum('decision', ['enter', 'skip']);
export const ema200PositionEnum = pgEnum('ema200_position', ['above', 'below', 'crossing']);
export const vwapPositionEnum = pgEnum('vwap_position', ['above', 'below']);
export const trendBiasEnum = pgEnum('trend_bias', ['long', 'short', 'neutral']);
export const btcTrendStateEnum = pgEnum('btc_trend_state', ['up', 'down', 'neutral']);
export const arrivalPatternEnum = pgEnum('arrival_pattern', ['impulse_up', 'impulse_down', 'compression', 'chop']);
export const confirmTypeEnum = pgEnum('confirm_type', ['bos_1m', 'bos_5m', 'rejection_15m', 'fakey_reentry', 'none']);
export const zoneTouchBucketEnum = pgEnum('zone_touch_bucket', ['0', '1', '2', '>=3']);
export const signalBarSizeBucketEnum = pgEnum('signal_bar_size_bucket', ['<0.15', '0.15-0.6', '0.6-1.2', '>1.2']);
export const shadowOutcomeEnum = pgEnum('shadow_outcome', ['tp1', 'tp2', 'sl', 'timeout']);
export const vetoReasonEnum = pgEnum('veto_reason', ['h4_res_too_close', 'h4_sup_too_close', 'h1_res_too_close', 'h1_sup_too_close', 'none']);
export const trendAlignmentEnum = pgEnum('trend_alignment', ['with', 'against', 'neutral']);
export const atrVolatilityEnum = pgEnum('atr_volatility', ['low', 'normal', 'high']);
export const skipCategoryEnum = pgEnum('skip_category', ['volume', 'pattern_geometry', 'directional', 'confluence', 'rr', 'veto', 'bad_context']);

// Main signals table (existing + new fields for ENTER trades)
export const signals = pgTable('signals', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  timeframe: text('timeframe').notNull(),
  patternType: text('pattern_type').notNull(),
  
  // Price levels
  entryPrice: decimal('entry_price', { precision: 18, scale: 8 }).notNull(),
  slPrice: decimal('sl_price', { precision: 18, scale: 8 }).notNull(),
  tp1Price: decimal('tp1_price', { precision: 18, scale: 8 }),
  tp2Price: decimal('tp2_price', { precision: 18, scale: 8 }).notNull(),
  tp3Price: decimal('tp3_price', { precision: 18, scale: 8 }),
  
  // Dynamic SL tracking
  currentSl: decimal('current_sl', { precision: 18, scale: 8 }).notNull(),
  initialSl: decimal('initial_sl', { precision: 18, scale: 8 }),
  
  // Position management (virtual tracking)
  positionSize: decimal('position_size', { precision: 5, scale: 2 }).default('100.00'),
  partialClosed: decimal('partial_closed', { precision: 5, scale: 2 }).default('0.00'),
  beActivated: boolean('be_activated').default(false),
  trailingActivated: boolean('trailing_activated').default(false),
  
  // Exit tracking
  exitType: text('exit_type'),
  
  // PnL tracking
  pnlR: decimal('pnl_r', { precision: 10, scale: 4 }),
  pnlPercent: decimal('pnl_percent', { precision: 10, scale: 4 }),
  
  // ATR context
  atr15m: decimal('atr_15m', { precision: 18, scale: 8 }),
  atrH4: decimal('atr_h4', { precision: 18, scale: 8 }),
  
  // NEW: ML context fields (for ENTER trades)
  distToDirH1ZoneAtr: decimal('dist_to_dir_h1_zone_atr', { precision: 10, scale: 4 }),
  distToDirH4ZoneAtr: decimal('dist_to_dir_h4_zone_atr', { precision: 10, scale: 4 }),
  freePathR: decimal('free_path_r', { precision: 10, scale: 4 }),
  arrivalPattern: arrivalPatternEnum('arrival_pattern'),
  
  // NEW: Dynamic S/R fields
  clearance15m: decimal('clearance_15m', { precision: 18, scale: 8 }),
  clearance1h: decimal('clearance_1h', { precision: 18, scale: 8 }),
  rAvailable: decimal('r_available', { precision: 10, scale: 2 }),
  zoneTestCount24h: integer('zone_test_count_24h'),
  vetoReason: vetoReasonEnum('veto_reason'),
  slBufferAtr15: decimal('sl_buffer_atr15', { precision: 10, scale: 4 }),
  
  // Pattern Quality Metrics
  patternScore: decimal('pattern_score', { precision: 4, scale: 2 }), // 0-10
  patternScoreFactors: jsonb('pattern_score_factors'), // {tailBodyRatio, motherBarSize, etc}
  
  // Stop Loss Metrics
  swingExtremePrice: decimal('swing_extreme_price', { precision: 18, scale: 8 }),
  slBufferAtr: decimal('sl_buffer_atr', { precision: 4, scale: 2 }), // 0.3-0.5
  roundNumberAdjusted: boolean('round_number_adjusted'),
  minDistanceFromZone: decimal('min_distance_from_zone', { precision: 10, scale: 4 }),
  
  // Take Profit Metrics
  tp1LimitedByZone: boolean('tp1_limited_by_zone'),
  tp2LimitedByZone: boolean('tp2_limited_by_zone'),
  tp3LimitedByZone: boolean('tp3_limited_by_zone'),
  nearestResistanceDistanceR: decimal('nearest_resistance_distance_r', { precision: 10, scale: 2 }),
  
  // Risk:Reward Metrics
  actualRrTp1: decimal('actual_rr_tp1', { precision: 10, scale: 2 }),
  actualRrTp2: decimal('actual_rr_tp2', { precision: 10, scale: 2 }),
  actualRrTp3: decimal('actual_rr_tp3', { precision: 10, scale: 2 }),
  dynamicMinRr: decimal('dynamic_min_rr', { precision: 4, scale: 2 }),
  dynamicMinRrAdjustments: jsonb('dynamic_min_rr_adjustments'), // {pattern_score, zone_freshness, etc}
  dynamicMinRrReasoning: text('dynamic_min_rr_reasoning'),
  trendAlignment: trendAlignmentEnum('trend_alignment'),
  multiTfAlignment: boolean('multi_tf_alignment'),
  atrVolatility: atrVolatilityEnum('atr_volatility'),
  rrValidationPassed: boolean('rr_validation_passed'),
  rrValidationMessage: text('rr_validation_message'),
  
  // NEW: Confluence scoring (for analyzing signal quality at entry)
  confluenceScore: integer('confluence_score'), // 0-10 points
  confluenceDetails: jsonb('confluence_details'), // {patternQuality, atKeyZone, trendAligned, ...}
  
  // NEW: Outcome timing metrics
  mfeR: decimal('mfe_r', { precision: 10, scale: 4 }), // Maximum Favorable Excursion
  maeR: decimal('mae_r', { precision: 10, scale: 4 }), // Maximum Adverse Excursion
  timeToTp1Min: integer('time_to_tp1_min'),
  timeToTp2Min: integer('time_to_tp2_min'),
  timeToTp3Min: integer('time_to_tp3_min'),
  timeToSlMin: integer('time_to_sl_min'),
  timeToBeMin: integer('time_to_be_min'),
  firstTouch: text('first_touch'), // "tp1" | "tp2" | "tp3" | "sl" | "be"
  
  // Status
  status: signalStatusEnum('status').default('OPEN').notNull(),
  direction: signalDirectionEnum('direction').notNull(),
  telegramMessageId: integer('telegram_message_id'),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Near-miss SKIP signals (for ML analysis)
export const nearMissSkips = pgTable('near_miss_skips', {
  id: serial('id').primaryKey(),
  signalId: varchar('signal_id', { length: 36 }).notNull().unique(), // UUID
  symbol: text('symbol').notNull(),
  entryTf: text('entry_tf').notNull(),
  side: signalDirectionEnum('side').notNull(),
  patternType: text('pattern_type').notNull(),
  ts: timestamp('ts').notNull(),
  
  // ATR/volatility
  atr15m: decimal('atr_15m', { precision: 18, scale: 8 }).notNull(),
  atr1h: decimal('atr_1h', { precision: 18, scale: 8 }).notNull(),
  atr4h: decimal('atr_4h', { precision: 18, scale: 8 }).notNull(),
  
  // Trend context
  ema200H1Pos: ema200PositionEnum('ema200_1h_pos').notNull(),
  vwap1hPos: vwapPositionEnum('vwap_1h_pos').notNull(),
  trendBias: trendBiasEnum('trend_bias').notNull(),
  btcTrendState: btcTrendStateEnum('btc_trend_state').notNull(),
  
  // Zones snapshot (JSON: array of 6 zones)
  zones: jsonb('zones').notNull(),
  inH4Zone: boolean('in_h4_zone').notNull(),
  nearH4Support: boolean('near_h4_support').notNull(),
  nearH4Resistance: boolean('near_h4_resistance').notNull(),
  
  // Distances
  distToDirH1ZoneAtr: decimal('dist_to_dir_h1_zone_atr', { precision: 10, scale: 4 }).notNull(),
  distToDirH4ZoneAtr: decimal('dist_to_dir_h4_zone_atr', { precision: 10, scale: 4 }).notNull(),
  freePathPts: decimal('free_path_pts', { precision: 18, scale: 8 }).notNull(),
  freePathAtr15: decimal('free_path_atr15', { precision: 10, scale: 4 }).notNull(),
  freePathR: decimal('free_path_r', { precision: 10, scale: 4 }).notNull(),
  
  // Arrival & zone quality
  arrivalPattern: arrivalPatternEnum('arrival_pattern').notNull(),
  zoneTouchCountBucket: zoneTouchBucketEnum('zone_touch_count_bucket').notNull(),
  zoneThicknessAtr15: decimal('zone_thickness_atr15', { precision: 10, scale: 4 }).notNull(),
  
  // Signal bar
  signalBarSizeAtr15: decimal('signal_bar_size_atr15', { precision: 10, scale: 4 }).notNull(),
  signalBarSizeBucket: signalBarSizeBucketEnum('signal_bar_size_bucket').notNull(),
  
  // Confirmation
  confirmType: confirmTypeEnum('confirm_type'),
  confirmWaitBars15m: integer('confirm_wait_bars_15m'),
  
  // NEW: Dynamic S/R fields
  clearance15m: decimal('clearance_15m', { precision: 18, scale: 8 }),
  clearance1h: decimal('clearance_1h', { precision: 18, scale: 8 }),
  rAvailable: decimal('r_available', { precision: 10, scale: 2 }),
  zoneTestCount24h: integer('zone_test_count_24h'),
  vetoReason: vetoReasonEnum('veto_reason'),
  slBufferAtr15: decimal('sl_buffer_atr15', { precision: 10, scale: 4 }),
  
  // Pattern Quality Metrics
  patternScore: decimal('pattern_score', { precision: 4, scale: 2 }), // 0-10
  patternScoreFactors: jsonb('pattern_score_factors'), // {tailBodyRatio, motherBarSize, etc}
  
  // Stop Loss Metrics
  swingExtremePrice: decimal('swing_extreme_price', { precision: 18, scale: 8 }),
  slBufferAtr: decimal('sl_buffer_atr', { precision: 4, scale: 2 }), // 0.3-0.5
  roundNumberAdjusted: boolean('round_number_adjusted'),
  minDistanceFromZone: decimal('min_distance_from_zone', { precision: 10, scale: 4 }),
  
  // Take Profit Metrics
  tp1LimitedByZone: boolean('tp1_limited_by_zone'),
  tp2LimitedByZone: boolean('tp2_limited_by_zone'),
  tp3LimitedByZone: boolean('tp3_limited_by_zone'),
  nearestResistanceDistanceR: decimal('nearest_resistance_distance_r', { precision: 10, scale: 2 }),
  
  // Risk:Reward Metrics
  actualRrTp1: decimal('actual_rr_tp1', { precision: 10, scale: 2 }),
  actualRrTp2: decimal('actual_rr_tp2', { precision: 10, scale: 2 }),
  actualRrTp3: decimal('actual_rr_tp3', { precision: 10, scale: 2 }),
  dynamicMinRr: decimal('dynamic_min_rr', { precision: 4, scale: 2 }),
  dynamicMinRrAdjustments: jsonb('dynamic_min_rr_adjustments'), // {pattern_score, zone_freshness, etc}
  dynamicMinRrReasoning: text('dynamic_min_rr_reasoning'),
  trendAlignment: trendAlignmentEnum('trend_alignment'),
  multiTfAlignment: boolean('multi_tf_alignment'),
  atrVolatility: atrVolatilityEnum('atr_volatility'),
  rrValidationPassed: boolean('rr_validation_passed'),
  rrValidationMessage: text('rr_validation_message'),
  
  // Decision
  decision: decisionEnum('decision').notNull().default('skip'),
  skipReasons: text('skip_reasons').array().notNull(), // Array of reason codes
  rulesetVersion: text('ruleset_version').notNull(),
  
  // NEW: Confluence scoring (for analyzing why patterns were skipped)
  confluenceScore: integer('confluence_score'), // 0-10 points
  confluenceDetails: jsonb('confluence_details'), // {patternQuality, atKeyZone, trendAligned, ...}
  skipCategory: text('skip_category'), // Main category of skip reason
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Shadow evaluations (for sampled SKIPs)
export const shadowEvaluations = pgTable('shadow_evaluations', {
  id: serial('id').primaryKey(),
  signalId: varchar('signal_id', { length: 36 }).notNull(), // FK to nearMissSkips.signalId
  reasonCode: text('reason_code').notNull(),
  
  hypotheticalEntryPrice: decimal('hypothetical_entry_price', { precision: 18, scale: 8 }).notNull(),
  hypotheticalEntryTime: timestamp('hypothetical_entry_time').notNull(),
  
  shadowOutcome: shadowOutcomeEnum('shadow_outcome'),
  shadowMfeR: decimal('shadow_mfe_r', { precision: 10, scale: 4 }),
  shadowMaeR: decimal('shadow_mae_r', { precision: 10, scale: 4 }),
  shadowTimeToFirstTouchMin: integer('shadow_time_to_first_touch_min'),
  
  // Status tracking
  isActive: boolean('is_active').default(true), // True while tracking, false after completion
  completedAt: timestamp('completed_at'),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 1m tracking for shadow evaluations (temporary, deleted after completion)
export const tracking1mShadow = pgTable('tracking_1m_shadow', {
  id: serial('id').primaryKey(),
  shadowEvalId: integer('shadow_eval_id').notNull(), // FK to shadowEvaluations.id
  bar1mTs: timestamp('bar_1m_ts').notNull(),
  high: decimal('high', { precision: 18, scale: 8 }).notNull(),
  low: decimal('low', { precision: 18, scale: 8 }).notNull(),
});

// Parquet export tracking
export const parquetExports = pgTable('parquet_exports', {
  id: serial('id').primaryKey(),
  exportDate: date('export_date').notNull(),
  exportType: text('export_type').notNull(), // "near_miss" | "trades" | "shadow"
  filePath: text('file_path').notNull(),
  recordCount: integer('record_count').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Type exports
export type Signal = typeof signals.$inferSelect;
export type NewSignal = typeof signals.$inferInsert;
export type NearMissSkip = typeof nearMissSkips.$inferSelect;
export type NewNearMissSkip = typeof nearMissSkips.$inferInsert;
export type ShadowEvaluation = typeof shadowEvaluations.$inferSelect;
export type NewShadowEvaluation = typeof shadowEvaluations.$inferInsert;
export type Tracking1mShadow = typeof tracking1mShadow.$inferSelect;
export type NewTracking1mShadow = typeof tracking1mShadow.$inferInsert;
export type ParquetExport = typeof parquetExports.$inferSelect;
export type NewParquetExport = typeof parquetExports.$inferInsert;
