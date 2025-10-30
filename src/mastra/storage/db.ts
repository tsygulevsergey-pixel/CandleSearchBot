import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, or, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { 
  signals, 
  nearMissSkips,
  shadowEvaluations,
  tracking1mShadow,
  parquetExports,
  type Signal, 
  type NewSignal,
  type NearMissSkip,
  type NewNearMissSkip,
  type ShadowEvaluation,
  type NewShadowEvaluation,
  type Tracking1mShadow,
  type NewTracking1mShadow,
  type ParquetExport,
  type NewParquetExport,
} from './schema';
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

  /**
   * Update signal status with partial close tracking
   * 
   * @param id - Signal ID
   * @param status - New status (TP1_HIT, TP2_HIT, TP3_HIT, SL_HIT, BE_HIT)
   * @param currentSl - Optional: Updated stop loss (for BE tracking)
   * @param partialClosed - Optional: Percentage of position closed (0-100)
   * @param beActivated - Optional: Flag indicating breakeven is activated
   * @param pnlR - Optional: PnL in R units (risk units)
   * @param pnlPercent - Optional: PnL in percentage
   */
  async updateSignalStatus(
    id: number, 
    status: 'TP1_HIT' | 'TP2_HIT' | 'TP3_HIT' | 'SL_HIT' | 'BE_HIT',
    currentSl?: string,
    partialClosed?: number,
    beActivated?: boolean,
    pnlR?: number,
    pnlPercent?: number
  ): Promise<void> {
    console.log(`📝 [SignalDB] Updating signal ${id}:`, {
      status,
      currentSl,
      partialClosed,
      beActivated,
      pnlR: pnlR?.toFixed(4),
      pnlPercent: pnlPercent?.toFixed(4),
    });

    const updates: any = {
      status,
      updatedAt: new Date(),
    };
    
    // Update stop loss if provided
    if (currentSl !== undefined) {
      updates.currentSl = currentSl;
    }

    // Update partial close tracking
    if (partialClosed !== undefined) {
      updates.partialClosed = partialClosed.toString();
      console.log(`📊 [SignalDB] Setting partialClosed: ${partialClosed}%`);
    }

    // Update breakeven activation flag
    if (beActivated !== undefined) {
      updates.beActivated = beActivated;
      console.log(`⚖️ [SignalDB] Setting beActivated: ${beActivated}`);
    }

    // Update PnL in R units
    if (pnlR !== undefined) {
      updates.pnlR = pnlR.toFixed(4);
      console.log(`💰 [SignalDB] Setting pnlR: ${pnlR.toFixed(4)}R`);
    }

    // Update PnL in percentage
    if (pnlPercent !== undefined) {
      updates.pnlPercent = pnlPercent.toFixed(4);
      console.log(`💵 [SignalDB] Setting pnlPercent: ${pnlPercent.toFixed(4)}%`);
    }

    // Set exit type (always set since this function only called on status change to closing status)
    updates.exitType = status;
    console.log(`🚪 [SignalDB] Setting exitType: ${status}`);

    await db.update(signals).set(updates).where(eq(signals.id, id));
    console.log(`✅ [SignalDB] Signal ${id} updated successfully`);
  }

  async updateTelegramMessageId(id: number, telegramMessageId: number): Promise<void> {
    await db.update(signals).set({ telegramMessageId }).where(eq(signals.id, id));
  }

  async getStatistics() {
    const allSignals = await db.select().from(signals);
    
    console.log(`📊 [SignalDB] Calculating statistics for ${allSignals.length} signals`);
    
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
      pnlRNet: 0, // NEW: Net PnL in R units
      byPattern: {} as any,
      byTimeframe: {} as any,
      byDirection: { 
        LONG: { total: 0, tp1: 0, tp2: 0, tp3: 0, breakeven: 0, sl: 0, pnlPositive: 0, pnlNegative: 0, pnlNet: 0, pnlRNet: 0 }, 
        SHORT: { total: 0, tp1: 0, tp2: 0, tp3: 0, breakeven: 0, sl: 0, pnlPositive: 0, pnlNegative: 0, pnlNet: 0, pnlRNet: 0 } 
      },
    };

    allSignals.forEach((signal) => {
      // Use stored PnL values instead of recalculating
      // This ensures we use the exact partial close calculations from when the signal closed
      const pnl = signal.pnlPercent ? parseFloat(signal.pnlPercent) : 0;
      const pnlR = signal.pnlR ? parseFloat(signal.pnlR) : 0;
      
      console.log(`📈 [SignalDB] Signal ${signal.id} (${signal.status}): pnl=${pnl.toFixed(4)}%, pnlR=${pnlR.toFixed(4)}R`);

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

      // Общий PnL (percentage and R units)
      if (pnl > 0) {
        stats.pnlPositive += pnl;
      } else if (pnl < 0) {
        stats.pnlNegative += pnl;
      }
      stats.pnlNet += pnl;
      stats.pnlRNet += pnlR; // NEW: Aggregate R units

      // По паттернам
      if (!stats.byPattern[signal.patternType]) {
        stats.byPattern[signal.patternType] = { total: 0, tp1: 0, tp2: 0, tp3: 0, breakeven: 0, sl: 0, open: 0, pnlPositive: 0, pnlNegative: 0, pnlNet: 0, pnlRNet: 0 };
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
      stats.byPattern[signal.patternType].pnlRNet += pnlR; // NEW: Aggregate R units

      // По таймфреймам
      if (!stats.byTimeframe[signal.timeframe]) {
        stats.byTimeframe[signal.timeframe] = { total: 0, tp1: 0, tp2: 0, tp3: 0, breakeven: 0, sl: 0, open: 0, pnlPositive: 0, pnlNegative: 0, pnlNet: 0, pnlRNet: 0 };
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
      stats.byTimeframe[signal.timeframe].pnlRNet += pnlR; // NEW: Aggregate R units

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
      stats.byDirection[signal.direction].pnlRNet += pnlR; // NEW: Aggregate R units
    });

    return stats;
  }
}

export const signalDB = new SignalDB();

// ==================== ML LOGGING CLASSES ====================

/**
 * Database operations for Near-Miss SKIP signals
 */
export class NearMissSkipDB {
  async createNearMissSkip(skip: NewNearMissSkip): Promise<NearMissSkip> {
    const [newSkip] = await db.insert(nearMissSkips).values(skip).returning();
    return newSkip;
  }

  async getNearMissSkipsByDate(date: string): Promise<NearMissSkip[]> {
    return await db.select().from(nearMissSkips)
      .where(sql`DATE(${nearMissSkips.ts}) = ${date}`);
  }

  async getNearMissSkipsByReasonCode(reasonCode: string, date?: string): Promise<NearMissSkip[]> {
    if (date) {
      return await db.select().from(nearMissSkips)
        .where(and(
          sql`${reasonCode} = ANY(${nearMissSkips.skipReasons})`,
          sql`DATE(${nearMissSkips.ts}) = ${date}`
        ));
    }
    return await db.select().from(nearMissSkips)
      .where(sql`${reasonCode} = ANY(${nearMissSkips.skipReasons})`);
  }

  async countNearMissSkipsByReasonToday(reasonCode: string): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const skips = await this.getNearMissSkipsByReasonCode(reasonCode, today);
    return skips.length;
  }

  async getNearMissSkipBySignalId(signalId: string): Promise<NearMissSkip | null> {
    const [skip] = await db.select().from(nearMissSkips)
      .where(eq(nearMissSkips.signalId, signalId));
    return skip || null;
  }
}

/**
 * Database operations for Shadow Evaluations
 */
export class ShadowEvaluationDB {
  async createShadowEvaluation(evaluation: NewShadowEvaluation): Promise<ShadowEvaluation> {
    const [newEval] = await db.insert(shadowEvaluations).values(evaluation).returning();
    return newEval;
  }

  async getActiveShadowEvaluations(): Promise<ShadowEvaluation[]> {
    return await db.select().from(shadowEvaluations)
      .where(eq(shadowEvaluations.isActive, true));
  }

  async updateShadowEvaluation(
    id: number,
    updates: Partial<ShadowEvaluation>
  ): Promise<void> {
    await db.update(shadowEvaluations)
      .set(updates)
      .where(eq(shadowEvaluations.id, id));
  }

  async closeShadowEvaluation(
    id: number,
    closure: {
      finalPnlR: string;
      finalMfe: string;
      finalMae: string;
      firstTouch: string;
      timeToFirstTouchMin: number;
    }
  ): Promise<void> {
    await db.update(shadowEvaluations)
      .set({
        shadowOutcome: closure.firstTouch as any,
        shadowMfeR: closure.finalMfe,
        shadowMaeR: closure.finalMae,
        shadowTimeToFirstTouchMin: closure.timeToFirstTouchMin,
        isActive: false,
        completedAt: new Date(),
      })
      .where(eq(shadowEvaluations.id, id));
  }

  async completeShadowEvaluation(
    id: number, 
    outcome: 'tp1' | 'tp2' | 'sl' | 'timeout',
    mfeR: number,
    maeR: number,
    timeToFirstTouchMin: number
  ): Promise<void> {
    await db.update(shadowEvaluations)
      .set({
        shadowOutcome: outcome,
        shadowMfeR: mfeR.toFixed(4),
        shadowMaeR: maeR.toFixed(4),
        shadowTimeToFirstTouchMin: timeToFirstTouchMin,
        isActive: false,
        completedAt: new Date(),
      })
      .where(eq(shadowEvaluations.id, id));
  }

  async getShadowEvaluationsByDate(date: string): Promise<ShadowEvaluation[]> {
    return await db.select().from(shadowEvaluations)
      .where(sql`DATE(${shadowEvaluations.createdAt}) = ${date}`);
  }

  // Tracking 1m data
  async createTracking1mShadow(tracking: NewTracking1mShadow): Promise<void> {
    await db.insert(tracking1mShadow).values(tracking);
  }

  async addTracking1m(tracking: NewTracking1mShadow): Promise<void> {
    await this.createTracking1mShadow(tracking);
  }

  async getTracking1m(shadowEvalId: number): Promise<Tracking1mShadow[]> {
    return await db.select().from(tracking1mShadow)
      .where(eq(tracking1mShadow.shadowEvalId, shadowEvalId))
      .orderBy(tracking1mShadow.bar1mTs);
  }

  async deleteTracking1m(shadowEvalId: number): Promise<void> {
    await db.delete(tracking1mShadow)
      .where(eq(tracking1mShadow.shadowEvalId, shadowEvalId));
  }

  async calculateMFEMAE(shadowEvalId: number, entryPrice: number, direction: 'LONG' | 'SHORT'): Promise<{ mfe: number; mae: number }> {
    const tracking = await this.getTracking1m(shadowEvalId);
    
    let mfe = 0; // Maximum Favorable Excursion
    let mae = 0; // Maximum Adverse Excursion
    
    tracking.forEach((bar) => {
      const high = parseFloat(bar.high as any);
      const low = parseFloat(bar.low as any);
      
      if (direction === 'LONG') {
        // For LONG: MFE = max profit (high - entry), MAE = max loss (low - entry)
        const profit = (high - entryPrice) / entryPrice;
        const loss = (low - entryPrice) / entryPrice;
        
        mfe = Math.max(mfe, profit);
        mae = Math.min(mae, loss);
      } else {
        // For SHORT: MFE = max profit (entry - low), MAE = max loss (entry - high)
        const profit = (entryPrice - low) / entryPrice;
        const loss = (entryPrice - high) / entryPrice;
        
        mfe = Math.max(mfe, profit);
        mae = Math.min(mae, loss);
      }
    });
    
    return { mfe, mae };
  }
}

/**
 * Database operations for Parquet Exports tracking
 */
export class ParquetExportDB {
  async recordExport(exportRecord: NewParquetExport): Promise<ParquetExport> {
    const [record] = await db.insert(parquetExports).values(exportRecord).returning();
    return record;
  }

  async getExportsByDate(date: string): Promise<ParquetExport[]> {
    return await db.select().from(parquetExports)
      .where(eq(parquetExports.exportDate, date));
  }

  async hasExportForDate(date: string, exportType: string): Promise<boolean> {
    const exports = await db.select().from(parquetExports)
      .where(and(
        eq(parquetExports.exportDate, date),
        eq(parquetExports.exportType, exportType)
      ));
    return exports.length > 0;
  }
}

/**
 * Database operations for Tracking 1m Shadow
 */
export class Tracking1mShadowDB {
  async createTracking1mShadow(tracking: NewTracking1mShadow): Promise<void> {
    await db.insert(tracking1mShadow).values(tracking);
  }

  async getTracking1mByShadowEvalId(shadowEvalId: number): Promise<Tracking1mShadow[]> {
    return await db.select().from(tracking1mShadow)
      .where(eq(tracking1mShadow.shadowEvalId, shadowEvalId))
      .orderBy(tracking1mShadow.bar1mTs);
  }
}

// Export instances
export const nearMissSkipDB = new NearMissSkipDB();
export const shadowEvaluationDB = new ShadowEvaluationDB();
export const parquetExportDB = new ParquetExportDB();
export const tracking1mShadowDB = new Tracking1mShadowDB();
