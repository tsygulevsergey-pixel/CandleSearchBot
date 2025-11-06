/**
 * Trade Outcomes Utility
 * 
 * Централизованная логика для расчета PnL и определения типа закрытия сделки.
 * Используется в signalTracker.ts и db.ts для обеспечения консистентности.
 * 
 * SUPPORTS DYNAMIC & FIXED STRATEGIES:
 * - Fixed (default): 50%/30%/20% at 1R/2R/3R (for backward compatibility)
 * - Dynamic: Custom %s and Rs based on market conditions (new signals)
 * 
 * PnL CALCULATION EXAMPLES (Fixed):
 * - TP3 full win: 0.5×1R + 0.3×2R + 0.2×3R = 1.7R
 * - TP2 then BE: 0.5×1R + 0.3×2R + 0.2×0R = 1.1R
 * - TP1 then BE: 0.5×1R + 0.5×0R = 0.5R
 * - SL before TP1: 1.0×(-1R) = -1R
 * 
 * PnL CALCULATION EXAMPLES (Dynamic):
 * - Conservative (60%/30%/10% at 0.8R/1.8R/2.5R): 0.6×0.8 + 0.3×1.8 + 0.1×2.5 = 1.27R
 * - Aggressive (30%/30%/40% at 1.2R/2.5R/4R): 0.3×1.2 + 0.3×2.5 + 0.4×4 = 2.47R
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
  
  // NEW: Dynamic strategy parameters (optional - if not provided, uses defaults)
  customPercents?: { p1: number; p2: number; p3: number }; // Custom partial close %s
  actualTpR?: { tp1R: number; tp2R: number; tp3R: number }; // Actual TP levels in R units
  
  // NEW: Trailing stop flag (for 1.0R → 0.5R trailing stop logic)
  trailingActivated?: boolean; // If true, BE_HIT = +0.5R instead of 0R
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
 * SUPPORTS DYNAMIC & FIXED STRATEGIES:
 * - If customPercents provided → uses dynamic %s (new signals)
 * - If not provided → uses defaults 50/30/20 (old signals, backward compatibility)
 * 
 * @param status - текущий статус сигнала
 * @param previousPartialClosed - предыдущий процент закрытия (для BE_HIT)
 * @param customPercents - кастомные проценты для динамической стратегии (optional)
 * @returns процент закрытой позиции (0-100)
 */
export function calculatePartialClosedPercent(
  status: string,
  previousPartialClosed?: number,
  customPercents?: { p1: number; p2: number; p3: number }
): number {
  console.log(`📊 [TradeOutcomes] calculatePartialClosedPercent: status=${status}, custom=${JSON.stringify(customPercents)}`);

  // ✅ Dynamic strategy (if customPercents provided)
  if (customPercents) {
    switch (status) {
      case 'OPEN':
        return 0;
      case 'TP1_HIT':
        return customPercents.p1; // Dynamic % at TP1
      case 'TP2_HIT':
        return customPercents.p1 + customPercents.p2; // Cumulative
      case 'TP3_HIT':
      case 'BE_HIT':
      case 'SL_HIT':
        return 100; // Full position closed
      default:
        return 0;
    }
  }

  // ✅ Fixed strategy (defaults for backward compatibility)
  switch (status) {
    case 'OPEN':
      return 0;
    case 'TP1_HIT':
      return 50; // Default: Close 50% at TP1
    case 'TP2_HIT':
      return 80; // Default: Close 30% more (total 80%)
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
 * SUPPORTS DYNAMIC & FIXED STRATEGIES:
 * - Fixed (default): 50%/30%/20% at 1R/2R/3R (backward compatibility)
 * - Dynamic: Custom %s and Rs from dynamicPositionManager (new signals)
 * 
 * @param params - параметры сделки (включая опциональные customPercents и actualTpR)
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
    customPercents,  // NEW: dynamic %s
    actualTpR,       // NEW: actual TP levels in R
    trailingActivated, // NEW: trailing stop flag
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
    customPercents: customPercents ? `${customPercents.p1}/${customPercents.p2}/${customPercents.p3}` : 'default',
    actualTpR: actualTpR ? `${actualTpR.tp1R}R/${actualTpR.tp2R}R/${actualTpR.tp3R}R` : 'default',
  });

  // Calculate R (risk) as distance from entry to initial SL
  const R = Math.abs(entryPrice - slPrice);
  
  // ✅ Extract %s: use custom if provided, otherwise defaults
  // IMPORTANT: Use ?? instead of || to properly handle 0 values (e.g., p1=0 for 15m scalp)
  const p1 = customPercents?.p1 ?? 50;
  const p2 = customPercents?.p2 ?? 30;
  const p3 = customPercents?.p3 ?? 20;
  
  // Validation: ensure percentages sum to 100 (allow small floating point errors)
  const sum = p1 + p2 + p3;
  if (Math.abs(sum - 100) > 0.1) {
    console.warn(`⚠️ [TradeOutcomes] Invalid percentages: ${p1}+${p2}+${p3} = ${sum}% (should be 100%)`);
  }
  
  // ✅ Extract R levels: use actual if provided, otherwise calculate from prices
  let tp1R: number, tp2R: number, tp3R: number;
  if (actualTpR) {
    tp1R = actualTpR.tp1R;
    tp2R = actualTpR.tp2R;
    tp3R = actualTpR.tp3R;
  } else {
    // Calculate from prices (fallback for old signals)
    tp1R = Math.abs(tp1Price - entryPrice) / R;
    tp2R = Math.abs(tp2Price - entryPrice) / R;
    tp3R = tp3Price ? Math.abs(tp3Price - entryPrice) / R : 3.0;
  }

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
    description = `TP1 достигнут (${p1}% закрыто)`;
    // TP1: p1% closed at tp1R
    pnlR = (p1 / 100) * tp1R;
    console.log(`🎯 [TradeOutcomes] TP1_HIT: ${p1}% × ${tp1R.toFixed(2)}R = ${pnlR.toFixed(2)}R`);
  } else if (status === 'TP2_HIT') {
    outcomeType = 'TP2_HIT';
    description = `TP2 достигнут (${p1 + p2}% закрыто)`;
    // TP2: p1% at tp1R + p2% at tp2R
    pnlR = (p1 / 100) * tp1R + (p2 / 100) * tp2R;
    console.log(`🎯🎯 [TradeOutcomes] TP2_HIT: ${p1}%×${tp1R.toFixed(2)}R + ${p2}%×${tp2R.toFixed(2)}R = ${pnlR.toFixed(2)}R`);
  } else if (status === 'TP3_HIT') {
    outcomeType = 'TP3_HIT';
    description = 'TP3 достигнут (полная прибыль)';
    // TP3: p1% at tp1R + p2% at tp2R + p3% at tp3R
    pnlR = (p1 / 100) * tp1R + (p2 / 100) * tp2R + (p3 / 100) * tp3R;
    console.log(`🎯🎯🎯 [TradeOutcomes] TP3_HIT: ${p1}%×${tp1R.toFixed(2)}R + ${p2}%×${tp2R.toFixed(2)}R + ${p3}%×${tp3R.toFixed(2)}R = ${pnlR.toFixed(2)}R`);
  } else if (status === 'SL_HIT') {
    outcomeType = 'SL_HIT';
    description = 'Stop Loss сработал';
    // SL: Full position stopped out = -1R
    pnlR = -1.0;
    console.log(`🛑 [TradeOutcomes] SL_HIT: 100% × -1R = ${pnlR.toFixed(2)}R`);
  } else if (status === 'BE_HIT') {
    outcomeType = 'BE_HIT';
    breakeven = true;

    // ✅ NEW: Trailing Stop 1.0R → 0.5R logic
    // If trailing stop was activated (at 1.0R profit), BE_HIT = +0.5R (protected profit)
    // This is for 15m SCALP_15M strategy only (partialClosed = 0, no TP1/TP2 before)
    if (trailingActivated && partialClosed === 0) {
      pnlR = 0.5; // Trailing stop at +0.5R
      description = 'Trailing Stop сработал (+0.5R защищено)';
      console.log(`🔥 [TradeOutcomes] TRAILING STOP HIT: 100% × +0.5R = ${pnlR.toFixed(2)}R`);
    }
    // Standard BE_HIT logic (after partial close at TP1/TP2)
    else {
      // BE_HIT: Breakeven hit after partial close
      // Calculate based on how much was already closed (using custom or default %s)
      const closedAtTP1 = p1;
      const closedAtTP2 = p1 + p2;
      
      if (partialClosed === closedAtTP1) {
        // After TP1: p1% at tp1R + remaining at 0R
        pnlR = (p1 / 100) * tp1R + ((100 - p1) / 100) * 0;
        description = `Breakeven после TP1 (${p1}% прибыль)`;
        console.log(`⚖️ [TradeOutcomes] BE_HIT after TP1: ${p1}%×${tp1R.toFixed(2)}R + ${100-p1}%×0R = ${pnlR.toFixed(2)}R`);
      } else if (partialClosed === closedAtTP2) {
        // After TP2: p1% at tp1R + p2% at tp2R + remaining at 0R
        pnlR = (p1 / 100) * tp1R + (p2 / 100) * tp2R + (p3 / 100) * 0;
        description = `Breakeven после TP2 (${closedAtTP2}% прибыль)`;
        console.log(`⚖️ [TradeOutcomes] BE_HIT after TP2: ${p1}%×${tp1R.toFixed(2)}R + ${p2}%×${tp2R.toFixed(2)}R + ${p3}%×0R = ${pnlR.toFixed(2)}R`);
      } else {
        // Unknown: assume after TP1 (safest assumption)
        pnlR = (p1 / 100) * tp1R;
        description = 'Breakeven сработал (частичная прибыль)';
        console.log(`⚖️ [TradeOutcomes] BE_HIT (default): ${p1}%×${tp1R.toFixed(2)}R = ${pnlR.toFixed(2)}R`);
      }
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
