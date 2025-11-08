import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, or, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { 
  signals, 
  nearMissSkips,
  shadowEvaluations,
  tracking1mShadow,
  parquetExports,
  tradeSettings,
  liveTrades,
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
  type TradeSetting,
  type NewTradeSetting,
  type LiveTrade,
  type NewLiveTrade,
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
   * @param timeToTp1Min - Optional: Time to TP1 in minutes
   * @param timeToTp2Min - Optional: Time to TP2 in minutes
   * @param timeToTp3Min - Optional: Time to TP3 in minutes
   * @param timeToSlMin - Optional: Time to SL in minutes
   * @param timeToBeMin - Optional: Time to BE in minutes
   */
  async updateSignalStatus(
    id: number, 
    status: 'TP1_HIT' | 'TP2_HIT' | 'TP3_HIT' | 'SL_HIT' | 'BE_HIT',
    currentSl?: string,
    partialClosed?: number,
    beActivated?: boolean,
    pnlR?: number,
    pnlPercent?: number,
    timeToTp1Min?: number,
    timeToTp2Min?: number,
    timeToTp3Min?: number,
    timeToSlMin?: number,
    timeToBeMin?: number
  ): Promise<void> {
    console.log(`📝 [SignalDB] Updating signal ${id}:`, {
      status,
      currentSl,
      partialClosed,
      beActivated,
      pnlR: pnlR?.toFixed(4),
      pnlPercent: pnlPercent?.toFixed(4),
      timeToTp1Min,
      timeToTp2Min,
      timeToTp3Min,
      timeToSlMin,
      timeToBeMin,
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

    // ✅ NEW: Update time tracking fields
    if (timeToTp1Min !== undefined) {
      updates.timeToTp1Min = timeToTp1Min;
      console.log(`⏱️ [SignalDB] Setting timeToTp1Min: ${timeToTp1Min} minutes`);
    }
    if (timeToTp2Min !== undefined) {
      updates.timeToTp2Min = timeToTp2Min;
      console.log(`⏱️ [SignalDB] Setting timeToTp2Min: ${timeToTp2Min} minutes`);
    }
    if (timeToTp3Min !== undefined) {
      updates.timeToTp3Min = timeToTp3Min;
      console.log(`⏱️ [SignalDB] Setting timeToTp3Min: ${timeToTp3Min} minutes`);
    }
    if (timeToSlMin !== undefined) {
      updates.timeToSlMin = timeToSlMin;
      console.log(`⏱️ [SignalDB] Setting timeToSlMin: ${timeToSlMin} minutes`);
    }
    if (timeToBeMin !== undefined) {
      updates.timeToBeMin = timeToBeMin;
      console.log(`⏱️ [SignalDB] Setting timeToBeMin: ${timeToBeMin} minutes`);
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

  async getSignalById(id: number): Promise<Signal | null> {
    const result = await db.select().from(signals).where(eq(signals.id, id)).limit(1);
    return result.length > 0 ? result[0] : null;
  }

  async updateSignal(id: number, updates: Partial<NewSignal>): Promise<void> {
    const updateData: any = { ...updates, updatedAt: new Date() };
    await db.update(signals).set(updateData).where(eq(signals.id, id));
  }

  /**
   * Update MFE/MAE tracking for a signal
   * Called by signalTracker every minute to track max profit/loss excursion
   */
  async updateMFEMAE(
    id: number,
    mfeR: number,
    maeR: number,
    firstTouch?: string
  ): Promise<void> {
    const updates: any = {
      mfeR: mfeR.toString(),
      maeR: maeR.toString(),
    };
    
    if (firstTouch) {
      updates.firstTouch = firstTouch;
    }
    
    await db.update(signals).set(updates).where(eq(signals.id, id));
  }

  /**
   * Update trailing stop for a signal (1.0R → 0.5R trailing stop logic)
   * Called when MFE reaches 1.0R to protect +0.5R profit
   */
  async updateTrailingStop(
    id: number,
    newSl: string,
    trailingActivated: boolean
  ): Promise<void> {
    console.log(`🔥 [SignalDB] Updating trailing stop for signal ${id}: SL=${newSl}, trailing=${trailingActivated}`);
    
    await db.update(signals).set({
      currentSl: newSl,
      trailingActivated,
      updatedAt: new Date(),
    }).where(eq(signals.id, id));
    
    console.log(`✅ [SignalDB] Trailing stop updated successfully`);
  }

  /**
   * Get statistics for signals created on specific dates
   * @param dates - Array of date strings in YYYY-MM-DD format, e.g., ['2025-11-01', '2025-11-04']
   */
  async getStatisticsByDates(dates: string[]) {
    const logger = console;
    logger.info(`📊 [SignalDB] Fetching signals for dates: ${dates.join(', ')}`);
    
    // Build SQL condition: WHERE DATE(created_at) IN ('2025-11-01', '2025-11-04')
    const dateConditions = dates.map(date => sql`DATE(${signals.createdAt}) = ${date}`);
    const whereClause = or(...dateConditions);
    
    const allSignals = await db.select().from(signals).where(whereClause!);
    
    logger.info(`📊 [SignalDB] Found ${allSignals.length} signals for specified dates`);
    
    return this.calculateStats(allSignals, `dates: ${dates.join(', ')}`);
  }

  async getStatistics() {
    const allSignals = await db.select().from(signals);
    
    console.log(`📊 [SignalDB] Calculating statistics for ${allSignals.length} signals`);
    
    return this.calculateStats(allSignals, 'all signals');
  }

  /**
   * Internal method to calculate statistics from a list of signals
   * Extracted to avoid code duplication between getStatistics() and getStatisticsByDates()
   */
  private calculateStats(allSignals: any[], context: string = 'signals') {
    console.log(`📊 [SignalDB] Calculating statistics for ${allSignals.length} ${context}`);
    
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
      pnlRNet: 0,
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
      const pnlRaw = signal.pnlPercent ? parseFloat(signal.pnlPercent) : 0;
      const pnlRRaw = signal.pnlR ? parseFloat(signal.pnlR) : 0;
      
      // SAFETY: Filter out NaN values (from old buggy signals in DB)
      const pnl = isNaN(pnlRaw) ? 0 : pnlRaw;
      const pnlR = isNaN(pnlRRaw) ? 0 : pnlRRaw;
      
      if (isNaN(pnlRaw) || isNaN(pnlRRaw)) {
        console.warn(`⚠️ [SignalDB] Signal ${signal.id} has NaN in DB: pnlPercent="${signal.pnlPercent}", pnlR="${signal.pnlR}" - using 0`);
      }
      
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

  /**
   * Clear all signal-related data from the database
   * WARNING: This is a destructive operation that will delete all signals, trades, and evaluations
   */
  async clearAllData(): Promise<{ deletedCounts: { signals: number; nearMissSkips: number; liveTrades: number; shadowEvaluations: number; tracking1m: number } }> {
    console.log('🗑️ [SignalDB] Starting clearAllData - deleting all signal data...');
    
    // Delete in order to respect foreign key constraints
    // tracking_1m_shadow references shadow_evaluations
    const deletedTracking1m = await db.delete(tracking1mShadow);
    const tracking1mCount = deletedTracking1m.rowCount || 0;
    console.log(`✅ [SignalDB] Deleted ${tracking1mCount} tracking_1m_shadow records`);
    
    // shadow_evaluations is independent
    const deletedShadowEvals = await db.delete(shadowEvaluations);
    const shadowEvalsCount = deletedShadowEvals.rowCount || 0;
    console.log(`✅ [SignalDB] Deleted ${shadowEvalsCount} shadow_evaluations records`);
    
    // live_trades references signals
    const deletedLiveTrades = await db.delete(liveTrades);
    const liveTradesCount = deletedLiveTrades.rowCount || 0;
    console.log(`✅ [SignalDB] Deleted ${liveTradesCount} live_trades records`);
    
    // near_miss_skips is independent
    const deletedNearMiss = await db.delete(nearMissSkips);
    const nearMissCount = deletedNearMiss.rowCount || 0;
    console.log(`✅ [SignalDB] Deleted ${nearMissCount} near_miss_skips records`);
    
    // signals (parent table)
    const deletedSignals = await db.delete(signals);
    const signalsCount = deletedSignals.rowCount || 0;
    console.log(`✅ [SignalDB] Deleted ${signalsCount} signals records`);
    
    console.log('✅ [SignalDB] clearAllData completed successfully');
    
    return {
      deletedCounts: {
        signals: signalsCount,
        nearMissSkips: nearMissCount,
        liveTrades: liveTradesCount,
        shadowEvaluations: shadowEvalsCount,
        tracking1m: tracking1mCount,
      }
    };
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

/**
 * Database operations for Trade Settings (global trading toggle)
 */
export class TradeSettingsDB {
  async getTradingEnabled(): Promise<boolean> {
    const [settings] = await db.select().from(tradeSettings).limit(1);
    return settings?.tradingEnabled ?? false;
  }

  async setTradingEnabled(enabled: boolean, updatedBy: string = 'system'): Promise<void> {
    const existing = await db.select().from(tradeSettings).limit(1);
    
    if (existing.length > 0) {
      await db.update(tradeSettings)
        .set({ 
          tradingEnabled: enabled,
          updatedAt: new Date(),
          updatedBy 
        })
        .where(eq(tradeSettings.id, existing[0].id));
    } else {
      await db.insert(tradeSettings).values({ 
        tradingEnabled: enabled,
        updatedBy 
      });
    }
    
    console.log(`🔄 [TradeSettingsDB] Trading ${enabled ? 'enabled' : 'disabled'} by ${updatedBy}`);
  }

  async getSettings(): Promise<TradeSetting | null> {
    const [settings] = await db.select().from(tradeSettings).limit(1);
    return settings || null;
  }
}

/**
 * Database operations for Live Trades (real positions on Binance)
 */
export class LiveTradesDB {
  async createLiveTrade(trade: NewLiveTrade): Promise<LiveTrade> {
    const [newTrade] = await db.insert(liveTrades).values(trade).returning();
    console.log(`✅ [LiveTradesDB] Created live trade ${newTrade.id} for signal ${trade.signalId}`);
    return newTrade;
  }

  async updateLiveTrade(id: number, updates: Partial<NewLiveTrade>): Promise<void> {
    await db.update(liveTrades)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(liveTrades.id, id));
    console.log(`📝 [LiveTradesDB] Updated live trade ${id}`);
  }

  async getLiveTradeBySignalId(signalId: number): Promise<LiveTrade | null> {
    const [trade] = await db.select().from(liveTrades)
      .where(eq(liveTrades.signalId, signalId))
      .limit(1);
    return trade || null;
  }

  async getLiveTradeByEntryOrderId(orderId: string): Promise<LiveTrade | null> {
    const [trade] = await db.select().from(liveTrades)
      .where(eq(liveTrades.entryOrderId, orderId))
      .limit(1);
    return trade || null;
  }

  async getLiveTradeBySlOrderId(orderId: string): Promise<LiveTrade | null> {
    const [trade] = await db.select().from(liveTrades)
      .where(eq(liveTrades.slOrderId, orderId))
      .limit(1);
    return trade || null;
  }

  async getLiveTradeByTpOrderId(orderId: string): Promise<LiveTrade | null> {
    const [trade] = await db.select().from(liveTrades)
      .where(eq(liveTrades.tpOrderId, orderId))
      .limit(1);
    return trade || null;
  }

  async getOpenLiveTrades(): Promise<LiveTrade[]> {
    return await db.select().from(liveTrades)
      .where(eq(liveTrades.status, 'OPEN'));
  }

  async getAllOpenAndPendingTrades(): Promise<LiveTrade[]> {
    return await db.select().from(liveTrades)
      .where(or(
        eq(liveTrades.status, 'OPEN'),
        eq(liveTrades.status, 'OPENING')
      ));
  }

  async closeLiveTrade(
    id: number,
    exitPrice: string,
    exitType: string,
    realizedPnlUsdt: string,
    realizedPnlPercent: string
  ): Promise<void> {
    await db.update(liveTrades)
      .set({
        status: 'CLOSED',
        exitPrice,
        exitType,
        realizedPnlUsdt,
        realizedPnlPercent,
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(liveTrades.id, id));
    console.log(`🔒 [LiveTradesDB] Closed live trade ${id}, PnL: ${realizedPnlUsdt} USDT (${realizedPnlPercent}%)`);
  }

  async setTradeError(id: number, errorMessage: string): Promise<void> {
    await db.update(liveTrades)
      .set({
        status: 'ERROR',
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(liveTrades.id, id));
    console.error(`❌ [LiveTradesDB] Trade ${id} error: ${errorMessage}`);
  }

  async getLiveTradeStats(): Promise<{
    total: number;
    open: number;
    closed: number;
    errors: number;
    totalPnlUsdt: number;
  }> {
    const allTrades = await db.select().from(liveTrades);
    
    const stats = {
      total: allTrades.length,
      open: 0,
      closed: 0,
      errors: 0,
      totalPnlUsdt: 0,
    };

    allTrades.forEach(trade => {
      if (trade.status === 'OPEN' || trade.status === 'OPENING') {
        stats.open++;
      } else if (trade.status === 'CLOSED' || trade.status === 'TP_HIT' || trade.status === 'SL_HIT') {
        stats.closed++;
        if (trade.realizedPnlUsdt) {
          stats.totalPnlUsdt += parseFloat(trade.realizedPnlUsdt);
        }
      } else if (trade.status === 'ERROR') {
        stats.errors++;
      }
    });

    return stats;
  }
}

// Export instances
export const nearMissSkipDB = new NearMissSkipDB();
export const shadowEvaluationDB = new ShadowEvaluationDB();
export const parquetExportDB = new ParquetExportDB();
export const tracking1mShadowDB = new Tracking1mShadowDB();
export const tradeSettingsDB = new TradeSettingsDB();
export const liveTradesDB = new LiveTradesDB();
