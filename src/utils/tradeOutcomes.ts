/**
 * Trade Outcomes Utility
 * 
 * Централизованная логика для расчета PnL и определения типа закрытия сделки.
 * Используется в signalTracker.ts и db.ts для обеспечения консистентности.
 * 
 * PARTIAL CLOSE STRATEGY (Aggressive):
 * - TP1 (1R): Close 50% → partialClosed = 50%
 * - TP2 (2R): Close 30% → partialClosed = 80% (50% + 30%)
 * - TP3 (3R): Close 20% → partialClosed = 100% (50% + 30% + 20%)
 * 
 * PnL CALCULATION EXAMPLES:
 * - TP3 full win: 0.5×1R + 0.3×2R + 0.2×3R = 1.7R
 * - TP2 then BE: 0.5×1R + 0.3×2R + 0.2×0R = 1.1R
 * - TP1 then BE: 0.5×1R + 0.5×0R = 0.5R
 * - SL before TP1: 1.0×(-1R) = -1R
 */

export interface TradeOutcome {
  pnl: number; // PnL in percentage
  pnlR: number; // PnL in R units (risk units)
  isBreakeven: boolean;
  outcomeType: 'TP1_HIT' | 'TP2_HIT' | 'TP3_HIT' | 'SL_HIT' | 'BE_HIT' | 'OPEN';
  description: string;
}

interface TradeParams {
  status: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: string;
  tp1Price?: string; // Optional for backward compatibility
  tp2Price: string;
  tp3Price?: string; // Optional for backward compatibility
  slPrice: string;
  currentSl: string;
  partialClosed?: number; // For BE_HIT scenario: how much was already closed (0-100)
}

/**
 * Допуск для определения breakeven (0.01% от entry price)
 */
const BREAKEVEN_TOLERANCE = 0.0001;

/**
 * Проверяет, находится ли currentSl в зоне безубытка
 */
export function isBreakevenSL(currentSl: number, entryPrice: number): boolean {
  return Math.abs(currentSl - entryPrice) < entryPrice * BREAKEVEN_TOLERANCE;
}

/**
 * Рассчитывает процент позиции, которая была закрыта частично
 * 
 * @param status - текущий статус сигнала
 * @param previousPartialClosed - предыдущий процент закрытия (для BE_HIT)
 * @returns процент закрытой позиции (0-100)
 */
export function calculatePartialClosedPercent(
  status: string,
  previousPartialClosed?: number
): number {
  console.log(`📊 [TradeOutcomes] calculatePartialClosedPercent: status=${status}, previous=${previousPartialClosed}`);

  switch (status) {
    case 'OPEN':
      return 0;
    case 'TP1_HIT':
      return 50; // Close 50% at TP1
    case 'TP2_HIT':
      return 80; // Close 30% more (total 80%)
    case 'TP3_HIT':
    case 'BE_HIT':  // BE_HIT closes remaining position = 100%
    case 'SL_HIT':
      return 100; // Full position closed
    default:
      return 0;
  }
}

/**
 * Рассчитывает PnL и определяет тип закрытия сделки
 * 
 * Используется агрессивная стратегия частичного закрытия:
 * - TP1 (1R): закрывается 50% позиции
 * - TP2 (2R): закрывается 30% позиции (всего 80%)
 * - TP3 (3R): закрывается 20% позиции (всего 100%)
 * 
 * @param params - параметры сделки
 * @returns TradeOutcome с PnL (в % и R), типом закрытия и описанием
 */
export function calculateTradeOutcome(params: TradeParams): TradeOutcome {
  const {
    status,
    direction,
    entryPrice: entryStr,
    tp1Price: tp1Str,
    tp2Price: tp2Str,
    tp3Price: tp3Str,
    slPrice: slStr,
    currentSl: currentSlStr,
    partialClosed,
  } = params;

  const entryPrice = parseFloat(entryStr);
  const tp1Price = tp1Str ? parseFloat(tp1Str) : entryPrice; // Fallback to entry
  const tp2Price = parseFloat(tp2Str);
  const tp3Price = tp3Str ? parseFloat(tp3Str) : null;
  const slPrice = parseFloat(slStr);
  const currentSl = parseFloat(currentSlStr);

  console.log(`💰 [TradeOutcomes] Calculating for ${status} ${direction}:`, {
    entry: entryPrice.toFixed(8),
    tp1: tp1Price.toFixed(8),
    tp2: tp2Price.toFixed(8),
    tp3: tp3Price?.toFixed(8) || 'null',
    sl: slPrice.toFixed(8),
    currentSl: currentSl.toFixed(8),
    partialClosed,
  });

  // Calculate R (risk) as distance from entry to initial SL
  const R = Math.abs(entryPrice - slPrice);

  let pnlR = 0; // PnL in R units
  let outcomeType: TradeOutcome['outcomeType'] = 'OPEN';
  let description = '';
  let breakeven = false;

  if (status === 'OPEN') {
    outcomeType = 'OPEN';
    description = 'Позиция открыта';
    pnlR = 0;
  } else if (status === 'TP1_HIT') {
    outcomeType = 'TP1_HIT';
    description = 'TP1 достигнут (50% закрыто)';
    // TP1: 50% closed at 1R = 0.5 × 1R = 0.5R
    pnlR = 0.5 * 1;
    console.log(`🎯 [TradeOutcomes] TP1_HIT: 50% × 1R = ${pnlR.toFixed(2)}R`);
  } else if (status === 'TP2_HIT') {
    outcomeType = 'TP2_HIT';
    description = 'TP2 достигнут (80% закрыто)';
    // TP2: 50% at 1R + 30% at 2R = 0.5×1R + 0.3×2R = 1.1R
    pnlR = 0.5 * 1 + 0.3 * 2;
    console.log(`🎯🎯 [TradeOutcomes] TP2_HIT: 50%×1R + 30%×2R = ${pnlR.toFixed(2)}R`);
  } else if (status === 'TP3_HIT') {
    outcomeType = 'TP3_HIT';
    description = 'TP3 достигнут (полная прибыль)';
    // TP3: 50% at 1R + 30% at 2R + 20% at 3R = 0.5×1R + 0.3×2R + 0.2×3R = 1.7R
    pnlR = 0.5 * 1 + 0.3 * 2 + 0.2 * 3;
    console.log(`🎯🎯🎯 [TradeOutcomes] TP3_HIT: 50%×1R + 30%×2R + 20%×3R = ${pnlR.toFixed(2)}R`);
  } else if (status === 'SL_HIT') {
    outcomeType = 'SL_HIT';
    description = 'Stop Loss сработал';
    // SL: Full position stopped out = -1R
    pnlR = -1.0;
    console.log(`🛑 [TradeOutcomes] SL_HIT: 100% × -1R = ${pnlR.toFixed(2)}R`);
  } else if (status === 'BE_HIT') {
    outcomeType = 'BE_HIT';
    breakeven = true;

    // BE_HIT: Breakeven hit after partial close
    // Determine how much was already closed based on partialClosed param
    if (partialClosed === 50) {
      // After TP1: 50% at 1R + 50% at 0R = 0.5R
      pnlR = 0.5 * 1 + 0.5 * 0;
      description = 'Breakeven после TP1 (50% прибыль)';
      console.log(`⚖️ [TradeOutcomes] BE_HIT after TP1: 50%×1R + 50%×0R = ${pnlR.toFixed(2)}R`);
    } else if (partialClosed === 80) {
      // After TP2: 50% at 1R + 30% at 2R + 20% at 0R = 1.1R
      pnlR = 0.5 * 1 + 0.3 * 2 + 0.2 * 0;
      description = 'Breakeven после TP2 (80% прибыль)';
      console.log(`⚖️ [TradeOutcomes] BE_HIT after TP2: 50%×1R + 30%×2R + 20%×0R = ${pnlR.toFixed(2)}R`);
    } else {
      // Unknown or default: assume after TP1 (safest assumption)
      pnlR = 0.5 * 1;
      description = 'Breakeven сработал (частичная прибыль)';
      console.log(`⚖️ [TradeOutcomes] BE_HIT (default): 50%×1R = ${pnlR.toFixed(2)}R`);
    }
  }

  // Convert pnlR to pnlPercent
  // pnlPercent = pnlR × (R / entryPrice) × 100
  const pnlPercent = (pnlR * R / entryPrice) * 100;

  console.log(`💰 [TradeOutcomes] Result: pnlR=${pnlR.toFixed(4)}, pnlPercent=${pnlPercent.toFixed(4)}%, outcome=${outcomeType}`);

  return {
    pnl: pnlPercent,
    pnlR,
    isBreakeven: breakeven,
    outcomeType,
    description,
  };
}

/**
 * Форматирует PnL для отображения в Telegram
 */
export function formatPnL(pnl: number): string {
  const sign = pnl >= 0 ? '+' : '';
  return `${sign}${pnl.toFixed(2)}%`;
}

/**
 * Форматирует PnL в R единицах для отображения в Telegram
 */
export function formatPnLR(pnlR: number): string {
  const sign = pnlR >= 0 ? '+' : '';
  return `${sign}${pnlR.toFixed(2)}R`;
}

/**
 * Получает эмодзи для статуса сделки
 */
export function getStatusEmoji(outcomeType: TradeOutcome['outcomeType']): string {
  switch (outcomeType) {
    case 'TP1_HIT':
      return '🎯';
    case 'TP2_HIT':
      return '🎯🎯';
    case 'TP3_HIT':
      return '💎';
    case 'SL_HIT':
      return '🛑';
    case 'BE_HIT':
      return '⚖️';
    case 'OPEN':
      return '📊';
    default:
      return '❓';
  }
}
