import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, or } from 'drizzle-orm';
import { Pool } from 'pg';
import { signals, type Signal, type NewSignal } from './schema';
import { calculateTradeOutcome } from '../../utils/tradeOutcomes';

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
    // Загружаем сигналы со статусом 'OPEN'
    return await db.select().from(signals).where(eq(signals.status, 'OPEN'));
  }

  async hasOpenSignal(symbol: string): Promise<boolean> {
    const openSignals = await db.select().from(signals)
      .where(and(
        eq(signals.symbol, symbol),
        eq(signals.status, 'OPEN')
      ));
    return openSignals.length > 0;
  }
  
  /**
   * Подсчет открытых сигналов из определенного семейства (лидер:сектор)
   * Используется для диверсификации рисков - не больше 2-3 сигналов из одного семейства
   * Включает только OPEN сигналы (активные позиции)
   */
  async countOpenSignalsByFamily(symbols: string[]): Promise<number> {
    if (symbols.length === 0) return 0;
    
    // Если только 1 символ, используем eq() без or() (Drizzle требует минимум 2 операнда для or())
    if (symbols.length === 1) {
      const openSignals = await db.select().from(signals).where(
        and(
          eq(signals.status, 'OPEN'),
          eq(signals.symbol, symbols[0])
        )
      );
      return openSignals.length;
    }
    
    // Для множественных символов используем or()
    const openSignals = await db.select().from(signals).where(
      and(
        eq(signals.status, 'OPEN'),
        or(...symbols.map(sym => eq(signals.symbol, sym)))
      )
    );
    
    return openSignals.length;
  }

  async updateSignalStatus(id: number, status: 'TP2_HIT' | 'SL_HIT', currentSl?: string): Promise<void> {
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
      tp3Hit: 0,
      breakevenHit: 0,
      slHit: 0,
      pnlPositive: 0,
      pnlNegative: 0,
      pnlNet: 0,
      byPattern: {} as any,
      byTimeframe: {} as any,
      byDirection: { 
        LONG: { total: 0, tp1: 0, tp2: 0, tp3: 0, breakeven: 0, sl: 0, pnlPositive: 0, pnlNegative: 0, pnlNet: 0 }, 
        SHORT: { total: 0, tp1: 0, tp2: 0, tp3: 0, breakeven: 0, sl: 0, pnlPositive: 0, pnlNegative: 0, pnlNet: 0 } 
      },
    };

    allSignals.forEach((signal) => {
      // Используем централизованную логику расчета PnL
      const outcome = calculateTradeOutcome({
        status: signal.status,
        direction: signal.direction,
        entryPrice: signal.entryPrice,
        tp2Price: signal.tp2Price,
        slPrice: signal.slPrice,
        currentSl: signal.currentSl,
      });

      const pnl = outcome.pnl;

      // Обновляем счетчики статусов
      if (signal.status === 'OPEN') {
        stats.open++;
      } else if (signal.status === 'TP1_HIT') {
        stats.tp1Hit++;
      } else if (signal.status === 'TP2_HIT') {
        stats.tp2Hit++;
      } else if (signal.status === 'TP3_HIT') {
        stats.tp3Hit++;
      } else if (signal.status === 'BE_HIT') {
        stats.breakevenHit++;
      } else if (signal.status === 'SL_HIT') {
        stats.slHit++;
      }

      // Общий PnL
      if (pnl > 0) {
        stats.pnlPositive += pnl;
      } else if (pnl < 0) {
        stats.pnlNegative += pnl;
      }
      stats.pnlNet += pnl;

      // По паттернам
      if (!stats.byPattern[signal.patternType]) {
        stats.byPattern[signal.patternType] = { total: 0, tp1: 0, tp2: 0, tp3: 0, breakeven: 0, sl: 0, open: 0, pnlPositive: 0, pnlNegative: 0, pnlNet: 0 };
      }
      stats.byPattern[signal.patternType].total++;
      if (signal.status === 'TP1_HIT') stats.byPattern[signal.patternType].tp1++;
      if (signal.status === 'TP2_HIT') stats.byPattern[signal.patternType].tp2++;
      if (signal.status === 'TP3_HIT') stats.byPattern[signal.patternType].tp3++;
      if (signal.status === 'BE_HIT') stats.byPattern[signal.patternType].breakeven++;
      if (signal.status === 'SL_HIT') stats.byPattern[signal.patternType].sl++;
      if (signal.status === 'OPEN') stats.byPattern[signal.patternType].open++;
      
      if (pnl > 0) {
        stats.byPattern[signal.patternType].pnlPositive += pnl;
      } else if (pnl < 0) {
        stats.byPattern[signal.patternType].pnlNegative += pnl;
      }
      stats.byPattern[signal.patternType].pnlNet += pnl;

      // По таймфреймам
      if (!stats.byTimeframe[signal.timeframe]) {
        stats.byTimeframe[signal.timeframe] = { total: 0, tp1: 0, tp2: 0, tp3: 0, breakeven: 0, sl: 0, open: 0, pnlPositive: 0, pnlNegative: 0, pnlNet: 0 };
      }
      stats.byTimeframe[signal.timeframe].total++;
      if (signal.status === 'TP1_HIT') stats.byTimeframe[signal.timeframe].tp1++;
      if (signal.status === 'TP2_HIT') stats.byTimeframe[signal.timeframe].tp2++;
      if (signal.status === 'TP3_HIT') stats.byTimeframe[signal.timeframe].tp3++;
      if (signal.status === 'BE_HIT') stats.byTimeframe[signal.timeframe].breakeven++;
      if (signal.status === 'SL_HIT') stats.byTimeframe[signal.timeframe].sl++;
      if (signal.status === 'OPEN') stats.byTimeframe[signal.timeframe].open++;
      
      if (pnl > 0) {
        stats.byTimeframe[signal.timeframe].pnlPositive += pnl;
      } else if (pnl < 0) {
        stats.byTimeframe[signal.timeframe].pnlNegative += pnl;
      }
      stats.byTimeframe[signal.timeframe].pnlNet += pnl;

      // По направлениям
      stats.byDirection[signal.direction].total++;
      if (signal.status === 'TP1_HIT') stats.byDirection[signal.direction].tp1++;
      if (signal.status === 'TP2_HIT') stats.byDirection[signal.direction].tp2++;
      if (signal.status === 'TP3_HIT') stats.byDirection[signal.direction].tp3++;
      if (signal.status === 'BE_HIT') stats.byDirection[signal.direction].breakeven++;
      if (signal.status === 'SL_HIT') stats.byDirection[signal.direction].sl++;
      
      if (pnl > 0) {
        stats.byDirection[signal.direction].pnlPositive += pnl;
      } else if (pnl < 0) {
        stats.byDirection[signal.direction].pnlNegative += pnl;
      }
      stats.byDirection[signal.direction].pnlNet += pnl;
    });

    return stats;
  }
}

export const signalDB = new SignalDB();
