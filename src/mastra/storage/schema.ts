import { pgTable, serial, text, timestamp, decimal, pgEnum } from 'drizzle-orm/pg-core';

export const signalStatusEnum = pgEnum('signal_status', ['OPEN', 'TP1_HIT', 'TP2_HIT', 'SL_HIT']);
export const signalDirectionEnum = pgEnum('signal_direction', ['LONG', 'SHORT']);

export const signals = pgTable('signals', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  timeframe: text('timeframe').notNull(),
  patternType: text('pattern_type').notNull(),
  entryPrice: decimal('entry_price', { precision: 18, scale: 8 }).notNull(),
  slPrice: decimal('sl_price', { precision: 18, scale: 8 }).notNull(),
  tp1Price: decimal('tp1_price', { precision: 18, scale: 8 }).notNull(),
  tp2Price: decimal('tp2_price', { precision: 18, scale: 8 }).notNull(),
  currentSl: decimal('current_sl', { precision: 18, scale: 8 }).notNull(),
  status: signalStatusEnum('status').default('OPEN').notNull(),
  direction: signalDirectionEnum('direction').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Signal = typeof signals.$inferSelect;
export type NewSignal = typeof signals.$inferInsert;
