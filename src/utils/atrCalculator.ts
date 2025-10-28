import { Candle } from './binanceClient';

/**
 * Расчёт True Range (TR) для одной свечи
 * 
 * TR = max(High - Low, |High - PrevClose|, |Low - PrevClose|)
 * 
 * True Range учитывает гэпы между свечами, в отличие от простого Range (High - Low)
 */
export function calculateTrueRange(current: Candle, previous: Candle | null): number {
  const high = parseFloat(current.high);
  const low = parseFloat(current.low);
  
  if (!previous) {
    // Для первой свечи TR = High - Low
    return high - low;
  }
  
  const prevClose = parseFloat(previous.close);
  
  // TR = max(High-Low, |High-PrevClose|, |Low-PrevClose|)
  const highLow = high - low;
  const highPrevClose = Math.abs(high - prevClose);
  const lowPrevClose = Math.abs(low - prevClose);
  
  return Math.max(highLow, highPrevClose, lowPrevClose);
}

/**
 * Расчёт ATR (Average True Range) на заданном периоде
 * 
 * ATR = SMA(TR, period) для первого значения, затем EMA
 * 
 * Стандартный период: 14
 * 
 * @param candles - Массив свечей (минимум period+1 свечей)
 * @param period - Период для ATR (default: 14)
 * @returns ATR значение или 0 если недостаточно данных
 */
export function calculateATR(candles: Candle[], period: number = 14): number {
  if (candles.length < period + 1) {
    console.warn(`⚠️ [ATR] Недостаточно свечей для ATR${period}: ${candles.length} < ${period + 1}`);
    return 0;
  }
  
  // 1. Рассчитываем True Range для каждой свечи
  const trValues: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = calculateTrueRange(candles[i], candles[i - 1]);
    trValues.push(tr);
  }
  
  // 2. Первое значение ATR = SMA(TR, period)
  const initialTRs = trValues.slice(0, period);
  let atr = initialTRs.reduce((sum, tr) => sum + tr, 0) / period;
  
  // 3. Последующие значения ATR = EMA(TR, period)
  // Формула: ATR = (Previous ATR × (period - 1) + Current TR) / period
  for (let i = period; i < trValues.length; i++) {
    atr = ((atr * (period - 1)) + trValues[i]) / period;
  }
  
  console.log(`📊 [ATR] Calculated ATR(${period}) = ${atr.toFixed(8)} from ${candles.length} candles`);
  
  return atr;
}

/**
 * Вспомогательная функция: расчёт ATR для разных таймфреймов
 * 
 * Используется для получения контекста волатильности на multiple timeframes
 */
export interface MultiTimeframeATR {
  atr15m: number;
  atr1h: number;
  atr4h: number;
}

/**
 * Вспомогательная функция: Конвертация ATR в пункты цены
 * 
 * Пример: если ATR = 0.5, то 0.25×ATR = 0.125
 */
export function atrToPrice(atr: number, multiplier: number): number {
  return atr * multiplier;
}

/**
 * Вспомогательная функция: Расчёт расстояния в единицах ATR
 * 
 * Пример: distance = 0.10, ATR = 0.05 → result = 2.0 (расстояние равно 2×ATR)
 */
export function distanceInATR(distance: number, atr: number): number {
  if (atr === 0) return 0;
  return distance / atr;
}
