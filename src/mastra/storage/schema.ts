import { pgTable, serial, text, timestamp, decimal, pgEnum, integer, boolean } from 'drizzle-orm/pg-core';

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
  positionSize: decimal('position_size', { precision: 5, scale: 2 }).default('100.00'), // % of position (100 = full)
  partialClosed: decimal('partial_closed', { precision: 5, scale: 2 }).default('0.00'), // % already closed
  beActivated: boolean('be_activated').default(false), // Break-even activated?
  trailingActivated: boolean('trailing_activated').default(false), // Trailing stop activated?
  
  // Exit tracking
  exitType: text('exit_type'), // TP1, TP2, TP3, SL, BE, FAIL_SAFE
  
  // PnL tracking
  pnlR: decimal('pnl_r', { precision: 10, scale: 4 }), // Result in R (risk units)
  pnlPercent: decimal('pnl_percent', { precision: 10, scale: 4 }), // Result in %
  
  // ATR context (for analysis)
  atr15m: decimal('atr_15m', { precision: 18, scale: 8 }),
  atrH4: decimal('atr_h4', { precision: 18, scale: 8 }),
  
  // Status
  status: signalStatusEnum('status').default('OPEN').notNull(),
  direction: signalDirectionEnum('direction').notNull(),
  telegramMessageId: integer('telegram_message_id'),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Signal = typeof signals.$inferSelect;
export type NewSignal = typeof signals.$inferInsert;
