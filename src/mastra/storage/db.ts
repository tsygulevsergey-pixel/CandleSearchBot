import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { signals, type Signal, type NewSignal } from './schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/mastra',
});

export const db = drizzle(pool);

export class SignalDB {
  async createSignal(signal: NewSignal): Promise<Signal> {
    const [newSignal] = await db.insert(signals).values(signal).returning();
    return newSignal;
  }

  async getOpenSignals(): Promise<Signal[]> {
    return await db.select().from(signals).where(eq(signals.status, 'OPEN'));
  }

  async updateSignalStatus(id: number, status: 'TP1_HIT' | 'TP2_HIT' | 'SL_HIT', currentSl?: string): Promise<void> {
    const updates: any = {
      status,
      updatedAt: new Date(),
    };
    
    if (currentSl !== undefined) {
      updates.currentSl = currentSl;
    }

    await db.update(signals).set(updates).where(eq(signals.id, id));
  }

  async updateTelegramMessageId(id: number, telegramMessageId: number): Promise<void> {
    await db.update(signals).set({ telegramMessageId }).where(eq(signals.id, id));
  }

  async getStatistics() {
    const allSignals = await db.select().from(signals);
    
    const stats: any = {
      total: allSignals.length,
      open: 0,
      tp1Hit: 0,
      tp2Hit: 0,
      slHit: 0,
      byPattern: {} as any,
      byTimeframe: {} as any,
      byDirection: { LONG: { total: 0, tp1: 0, tp2: 0, sl: 0 }, SHORT: { total: 0, tp1: 0, tp2: 0, sl: 0 } },
    };

    allSignals.forEach((signal) => {
      if (signal.status === 'OPEN') stats.open++;
      if (signal.status === 'TP1_HIT') stats.tp1Hit++;
      if (signal.status === 'TP2_HIT') stats.tp2Hit++;
      if (signal.status === 'SL_HIT') stats.slHit++;

      if (!stats.byPattern[signal.patternType]) {
        stats.byPattern[signal.patternType] = { total: 0, tp1: 0, tp2: 0, sl: 0, open: 0 };
      }
      stats.byPattern[signal.patternType].total++;
      if (signal.status === 'TP1_HIT') stats.byPattern[signal.patternType].tp1++;
      if (signal.status === 'TP2_HIT') stats.byPattern[signal.patternType].tp2++;
      if (signal.status === 'SL_HIT') stats.byPattern[signal.patternType].sl++;
      if (signal.status === 'OPEN') stats.byPattern[signal.patternType].open++;

      if (!stats.byTimeframe[signal.timeframe]) {
        stats.byTimeframe[signal.timeframe] = { total: 0, tp1: 0, tp2: 0, sl: 0, open: 0 };
      }
      stats.byTimeframe[signal.timeframe].total++;
      if (signal.status === 'TP1_HIT') stats.byTimeframe[signal.timeframe].tp1++;
      if (signal.status === 'TP2_HIT') stats.byTimeframe[signal.timeframe].tp2++;
      if (signal.status === 'SL_HIT') stats.byTimeframe[signal.timeframe].sl++;
      if (signal.status === 'OPEN') stats.byTimeframe[signal.timeframe].open++;

      stats.byDirection[signal.direction].total++;
      if (signal.status === 'TP1_HIT') stats.byDirection[signal.direction].tp1++;
      if (signal.status === 'TP2_HIT') stats.byDirection[signal.direction].tp2++;
      if (signal.status === 'SL_HIT') stats.byDirection[signal.direction].sl++;
    });

    return stats;
  }
}

export const signalDB = new SignalDB();
