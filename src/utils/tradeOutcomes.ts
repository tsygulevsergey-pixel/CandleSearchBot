/**
 * Trade Outcomes Utility
 * 
 * Централизованная логика для расчета PnL и определения типа закрытия сделки.
 * Используется в signalTracker.ts и db.ts для обеспечения консистентности.
 */

export interface TradeOutcome {
  pnl: number;
  isBreakeven: boolean;
  outcomeType: 'TP2_HIT' | 'SL_HIT' | 'OPEN';
  description: string;
}

interface TradeParams {
  status: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: string;
  tp2Price: string;
  slPrice: string;
  currentSl: string;
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
 * Рассчитывает PnL и определяет тип закрытия сделки
 * 
 * @param params - параметры сделки
 * @returns TradeOutcome с PnL, типом закрытия и описанием
 */
export function calculateTradeOutcome(params: TradeParams): TradeOutcome {
  const {
    status,
    direction,
    entryPrice: entryStr,
    tp2Price: tp2Str,
    slPrice: slStr,
    currentSl: currentSlStr,
  } = params;

  const entryPrice = parseFloat(entryStr);
  const tp2Price = parseFloat(tp2Str);
  const slPrice = parseFloat(slStr);
  const currentSl = parseFloat(currentSlStr);

  let pnl = 0;
  let outcomeType: TradeOutcome['outcomeType'] = 'OPEN';
  let description = '';
  let breakeven = false;

  if (status === 'OPEN') {
    outcomeType = 'OPEN';
    description = 'Позиция открыта';
    pnl = 0;
  } else if (status === 'TP2_HIT') {
    outcomeType = 'TP2_HIT';
    description = 'TP2 достигнут (полная прибыль)';
    
    // TP2: 100% позиции закрыто на TP2 (2R)
    if (direction === 'LONG') {
      pnl = ((tp2Price - entryPrice) / entryPrice) * 100;
    } else {
      pnl = ((entryPrice - tp2Price) / entryPrice) * 100;
    }
  } else if (status === 'SL_HIT') {
    outcomeType = 'SL_HIT';
    description = 'Stop Loss сработал';
    
    // SL: полный убыток от entry до SL (-1R)
    if (direction === 'LONG') {
      pnl = ((slPrice - entryPrice) / entryPrice) * 100;
    } else {
      pnl = ((entryPrice - slPrice) / entryPrice) * 100;
    }
  }

  return {
    pnl,
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
 * Получает эмодзи для статуса сделки
 */
export function getStatusEmoji(outcomeType: TradeOutcome['outcomeType']): string {
  switch (outcomeType) {
    case 'TP2_HIT':
      return '💎';
    case 'SL_HIT':
      return '🛑';
    case 'OPEN':
      return '📊';
    default:
      return '❓';
  }
}
