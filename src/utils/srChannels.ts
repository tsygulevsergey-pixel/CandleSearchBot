/**
 * TradingView-style Support/Resistance Channel Detection
 * 
 * Based on "Support Resistance Channels" indicator by LonesomeTheBlue
 * https://www.tradingview.com/script/...
 * 
 * FEATURES:
 * - Finds Pivot Points (local highs/lows)
 * - Groups pivots into channels (ranges, not single prices)
 * - Calculates channel strength (pivot count + touch count)
 * - Returns top-N strongest channels
 * 
 * USAGE:
 * const channels = findSRChannels(candles, {
 *   pivotPeriod: 10,
 *   maxChannelWidthPercent: 5,
 *   minStrength: 1,
 *   maxChannels: 6,
 *   loopbackPeriod: 290
 * });
 * 
 * STATUS: ⚠️ NOT ACTIVE - Implementation ready, awaiting testing
 */

import { Candle } from './binanceClient';

export interface SRChannel {
  upper: number;        // Верхняя граница канала
  lower: number;        // Нижняя граница канала
  strength: number;     // Сила канала (pivot count × 20 + touch count)
  pivotCount: number;   // Количество пивотов в канале
  touchCount: number;   // Количество касаний high/low канала
  type: 'support' | 'resistance' | 'neutral'; // Тип относительно текущей цены
}

export interface SRChannelOptions {
  pivotPeriod?: number;          // Период для Pivot Points (default: 10)
  source?: 'high_low' | 'close_open'; // Источник для пивотов (default: 'high_low')
  maxChannelWidthPercent?: number;    // Макс ширина канала в % (default: 5)
  minStrength?: number;          // Минимальная сила канала (default: 1)
  maxChannels?: number;          // Макс количество каналов (default: 6)
  loopbackPeriod?: number;       // Период для поиска пивотов (default: 290)
  rangeCalculationPeriod?: number; // Период для расчета range (default: 300)
}

interface PivotPoint {
  value: number;
  index: number;
  type: 'high' | 'low';
}

/**
 * Находит Pivot High (локальный максимум)
 * Требует: период свечей слева и справа с меньшими максимумами
 */
function findPivotHigh(candles: Candle[], index: number, period: number, source: 'high_low' | 'close_open'): number | null {
  if (index < period || index >= candles.length - period) {
    return null;
  }

  const getValue = (candle: Candle) => 
    source === 'high_low' ? parseFloat(candle.high) : Math.max(parseFloat(candle.close), parseFloat(candle.open));

  const centerValue = getValue(candles[index]);

  // Проверяем период слева
  for (let i = index - period; i < index; i++) {
    if (getValue(candles[i]) >= centerValue) {
      return null;
    }
  }

  // Проверяем период справа
  for (let i = index + 1; i <= index + period; i++) {
    if (getValue(candles[i]) >= centerValue) {
      return null;
    }
  }

  return centerValue;
}

/**
 * Находит Pivot Low (локальный минимум)
 * Требует: период свечей слева и справа с большими минимумами
 */
function findPivotLow(candles: Candle[], index: number, period: number, source: 'high_low' | 'close_open'): number | null {
  if (index < period || index >= candles.length - period) {
    return null;
  }

  const getValue = (candle: Candle) => 
    source === 'high_low' ? parseFloat(candle.low) : Math.min(parseFloat(candle.close), parseFloat(candle.open));

  const centerValue = getValue(candles[index]);

  // Проверяем период слева
  for (let i = index - period; i < index; i++) {
    if (getValue(candles[i]) <= centerValue) {
      return null;
    }
  }

  // Проверяем период справа
  for (let i = index + 1; i <= index + period; i++) {
    if (getValue(candles[i]) <= centerValue) {
      return null;
    }
  }

  return centerValue;
}

/**
 * Извлекает все Pivot Points из массива свечей
 */
function extractPivotPoints(
  candles: Candle[], 
  period: number, 
  source: 'high_low' | 'close_open',
  loopbackPeriod: number
): PivotPoint[] {
  const pivots: PivotPoint[] = [];
  const startIndex = Math.max(0, candles.length - loopbackPeriod - period);

  for (let i = startIndex; i < candles.length - period; i++) {
    const pivotHigh = findPivotHigh(candles, i, period, source);
    if (pivotHigh !== null) {
      pivots.push({ value: pivotHigh, index: i, type: 'high' });
    }

    const pivotLow = findPivotLow(candles, i, period, source);
    if (pivotLow !== null) {
      pivots.push({ value: pivotLow, index: i, type: 'low' });
    }
  }

  return pivots;
}

/**
 * Группирует пивоты в канал с заданной макс шириной
 * Возвращает границы канала и количество пивотов
 */
function createChannelFromPivot(
  pivotIndex: number,
  allPivots: PivotPoint[],
  maxWidth: number
): { upper: number; lower: number; pivotCount: number } {
  let upper = allPivots[pivotIndex].value;
  let lower = allPivots[pivotIndex].value;
  let pivotCount = 1;

  for (let i = 0; i < allPivots.length; i++) {
    if (i === pivotIndex) continue;

    const pivotValue = allPivots[i].value;
    
    // Проверяем, влезет ли пивот в канал с учетом максимальной ширины
    const potentialLower = Math.min(lower, pivotValue);
    const potentialUpper = Math.max(upper, pivotValue);
    const width = potentialUpper - potentialLower;

    if (width <= maxWidth) {
      lower = potentialLower;
      upper = potentialUpper;
      pivotCount++;
    }
  }

  // Ширина канала определяется естественным разбросом pivots
  // Если в группе 1 pivot → upper = lower (точка)
  // Если в группе несколько pivots → upper > lower (диапазон)
  // Это точно соответствует оригинальному TradingView алгоритму

  return { upper, lower, pivotCount };
}

/**
 * Подсчитывает количество касаний канала свечами
 */
function countChannelTouches(
  candles: Candle[],
  upper: number,
  lower: number,
  loopbackPeriod: number
): number {
  let touchCount = 0;
  const startIndex = Math.max(0, candles.length - loopbackPeriod);

  for (let i = startIndex; i < candles.length; i++) {
    const high = parseFloat(candles[i].high);
    const low = parseFloat(candles[i].low);

    // Проверяем касание канала
    if ((high <= upper && high >= lower) || (low <= upper && low >= lower)) {
      touchCount++;
    }
  }

  return touchCount;
}

/**
 * Рассчитывает силу канала
 * Формула: pivotCount × 20 + touchCount
 */
function calculateChannelStrength(
  pivotCount: number,
  touchCount: number
): number {
  return pivotCount * 20 + touchCount;
}

/**
 * Определяет тип канала относительно текущей цены
 */
function determineChannelType(
  upper: number,
  lower: number,
  currentPrice: number
): 'support' | 'resistance' | 'neutral' {
  if (upper < currentPrice && lower < currentPrice) {
    return 'support';
  } else if (upper > currentPrice && lower > currentPrice) {
    return 'resistance';
  } else {
    return 'neutral'; // Цена внутри канала
  }
}

/**
 * Удаляет каналы, которые перекрываются с более сильными
 */
function removeDuplicateChannels(channels: SRChannel[]): SRChannel[] {
  const result: SRChannel[] = [];

  for (const channel of channels) {
    let isDuplicate = false;

    for (const existingChannel of result) {
      // Проверяем перекрытие
      const overlap = 
        (channel.upper <= existingChannel.upper && channel.upper >= existingChannel.lower) ||
        (channel.lower <= existingChannel.upper && channel.lower >= existingChannel.lower) ||
        (existingChannel.upper <= channel.upper && existingChannel.upper >= channel.lower) ||
        (existingChannel.lower <= channel.upper && existingChannel.lower >= channel.lower);

      if (overlap) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      result.push(channel);
    }
  }

  return result;
}

/**
 * ГЛАВНАЯ ФУНКЦИЯ: Находит S/R каналы в массиве свечей
 * 
 * @param candles - Массив свечей
 * @param options - Опции алгоритма
 * @returns Массив S/R каналов, отсортированных по силе (убывание)
 */
export function findSRChannels(
  candles: Candle[],
  options: SRChannelOptions = {}
): SRChannel[] {
  const {
    pivotPeriod = 10,
    source = 'high_low',
    maxChannelWidthPercent = 5,
    minStrength = 1,
    maxChannels = 6,
    loopbackPeriod = 290,
    rangeCalculationPeriod = 300,
  } = options;

  if (candles.length < rangeCalculationPeriod) {
    console.log(`⚠️ [SRChannels] Not enough candles: ${candles.length} < ${rangeCalculationPeriod}`);
    return [];
  }

  // 1. Рассчитываем максимальную ширину канала
  const recentCandles = candles.slice(-rangeCalculationPeriod);
  const highest = Math.max(...recentCandles.map(c => parseFloat(c.high)));
  const lowest = Math.min(...recentCandles.map(c => parseFloat(c.low)));
  const maxWidth = (highest - lowest) * (maxChannelWidthPercent / 100);

  console.log(`📊 [SRChannels] Range: ${lowest.toFixed(2)}-${highest.toFixed(2)}, MaxWidth: ${maxWidth.toFixed(2)} (${maxChannelWidthPercent}%)`);

  // 2. Извлекаем все Pivot Points
  const pivots = extractPivotPoints(candles, pivotPeriod, source, loopbackPeriod);
  console.log(`🔍 [SRChannels] Found ${pivots.length} pivot points`);

  if (pivots.length === 0) {
    return [];
  }

  // 3. Создаем каналы для каждого пивота
  const candidateChannels: SRChannel[] = [];

  for (let i = 0; i < pivots.length; i++) {
    const { upper, lower, pivotCount } = createChannelFromPivot(i, pivots, maxWidth);
    const touchCount = countChannelTouches(candles, upper, lower, loopbackPeriod);
    const strength = calculateChannelStrength(pivotCount, touchCount);

    if (strength >= minStrength * 20) {
      const currentPrice = parseFloat(candles[candles.length - 1].close);
      const type = determineChannelType(upper, lower, currentPrice);

      candidateChannels.push({
        upper,
        lower,
        strength,
        pivotCount,
        touchCount,
        type,
      });
    }
  }

  // 4. Сортируем по силе (убывание)
  candidateChannels.sort((a, b) => b.strength - a.strength);

  // 5. Удаляем дубликаты (перекрывающиеся каналы)
  const uniqueChannels = removeDuplicateChannels(candidateChannels);

  // 6. Возвращаем топ-N
  const result = uniqueChannels.slice(0, maxChannels);

  console.log(`✅ [SRChannels] Returning ${result.length} channels (sorted by strength)`);
  result.forEach((ch, idx) => {
    console.log(`   ${idx + 1}. ${ch.type.toUpperCase()}: ${ch.lower.toFixed(4)}-${ch.upper.toFixed(4)} | Strength: ${ch.strength} (${ch.pivotCount} pivots, ${ch.touchCount} touches)`);
  });

  return result;
}

/**
 * Вспомогательная функция: Находит ближайший Support канал к текущей цене
 * Support ВСЕГДА должен быть НИЖЕ текущей цены
 */
export function getNearestSupportChannel(channels: SRChannel[], currentPrice: number): SRChannel | null {
  const supportChannels = channels
    .filter(ch => ch.type === 'support' && ch.upper < currentPrice) // Только зоны НИЖЕ цены
    .sort((a, b) => (currentPrice - a.upper) - (currentPrice - b.upper)); // Ближайшая снизу

  return supportChannels.length > 0 ? supportChannels[0] : null;
}

/**
 * Вспомогательная функция: Находит ближайший Resistance канал к текущей цене
 * Resistance ВСЕГДА должен быть ВЫШЕ текущей цены
 */
export function getNearestResistanceChannel(channels: SRChannel[], currentPrice: number): SRChannel | null {
  const resistanceChannels = channels
    .filter(ch => ch.type === 'resistance' && ch.lower > currentPrice) // Только зоны ВЫШЕ цены
    .sort((a, b) => (a.lower - currentPrice) - (b.lower - currentPrice)); // Ближайшая сверху

  return resistanceChannels.length > 0 ? resistanceChannels[0] : null;
}

/**
 * Вспомогательная функция: Проверяет находится ли цена внутри канала
 */
export function isPriceInChannel(price: number, channel: SRChannel): boolean {
  return price >= channel.lower && price <= channel.upper;
}

/**
 * Вспомогательная функция: Рассчитывает расстояние до канала (0 если внутри)
 */
export function getDistanceToChannel(price: number, channel: SRChannel): number {
  if (isPriceInChannel(price, channel)) {
    return 0;
  }
  
  if (price < channel.lower) {
    return channel.lower - price;
  }
  
  return price - channel.upper;
}
