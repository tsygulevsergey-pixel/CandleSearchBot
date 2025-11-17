import { Candle } from './binanceClient';
import { findSRChannels, getNearestSupportChannel, getNearestResistanceChannel, SRChannel } from './srChannels';

export interface CandleMetrics {
  body: number;
  range: number;
  upperWick: number;
  lowerWick: number;
  isGreen: boolean;
  isRed: boolean;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TrendAnalysis {
  ema50: number;
  ema200: number;
  isUptrend: boolean;
  isDowntrend: boolean;
  isNeutral: boolean; // Добавлено: нейтральный/ranging рынок
  currentPrice: number;
}

export function analyzeCand(candle: Candle): CandleMetrics {
  const open = parseFloat(candle.open);
  const high = parseFloat(candle.high);
  const low = parseFloat(candle.low);
  const close = parseFloat(candle.close);

  const body = Math.abs(close - open);
  const range = high - low;
  const upperWick = high - Math.max(open, close);
  const lowerWick = Math.min(open, close) - low;
  const isGreen = close > open;
  const isRed = close < open;

  return {
    body,
    range,
    upperWick,
    lowerWick,
    isGreen,
    isRed,
    open,
    high,
    low,
    close,
  };
}

/**
 * Расчет EMA (Exponential Moving Average)
 */
export function calculateEMA(candles: Candle[], period: number): number {
  if (candles.length < period) {
    console.warn(`⚠️ [EMA] Недостаточно свечей для EMA${period}: ${candles.length} < ${period}`);
    return 0;
  }

  const closes = candles.map((c) => parseFloat(c.close));
  const multiplier = 2 / (period + 1);

  // Первая SMA как начальная точка
  let ema = closes.slice(0, period).reduce((sum, val) => sum + val, 0) / period;

  // Расчет EMA для остальных свечей
  for (let i = period; i < closes.length; i++) {
    ema = (closes[i] - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * Анализ тренда на основе EMA 50 и EMA 200
 * 
 * UPTREND: Price > EMA50 > EMA200 (strong bull trend)
 * DOWNTREND: Price < EMA50 < EMA200 (strong bear trend)
 * NEUTRAL: Price близко к EMA50 или EMA50 близко к EMA200 (ranging/transition)
 * 
 * Timeframe-aware thresholds для крипто-волатильности
 */
export function analyzeTrend(candles: Candle[], timeframe: string = '15m'): TrendAnalysis {
  const ema50 = calculateEMA(candles, 50);
  const ema200 = calculateEMA(candles, 200);
  const currentPrice = parseFloat(candles[candles.length - 1].close);

  // Timeframe-aware пороги (15m = более волатильно, 4h = менее волатильно)
  let PRICE_THRESHOLD: number;
  let EMA_THRESHOLD: number;
  
  if (timeframe === '15m') {
    PRICE_THRESHOLD = 0.005;  // 0.5% - 15m очень динамичен
    EMA_THRESHOLD = 0.004;    // 0.4%
  } else if (timeframe === '1h') {
    PRICE_THRESHOLD = 0.01;   // 1.0%
    EMA_THRESHOLD = 0.008;    // 0.8%
  } else { // 4h и выше
    PRICE_THRESHOLD = 0.015;  // 1.5%
    EMA_THRESHOLD = 0.012;    // 1.2%
  }
  
  const priceToEma50Distance = Math.abs(currentPrice - ema50) / currentPrice;
  const ema50ToEma200Distance = Math.abs(ema50 - ema200) / ema200;
  
  const priceNearEma50 = priceToEma50Distance < PRICE_THRESHOLD;
  const ema50NearEma200 = ema50ToEma200Distance < EMA_THRESHOLD;

  // NEUTRAL: если цена близко к EMA50 ИЛИ EMA50 близко к EMA200
  const isNeutral = priceNearEma50 || ema50NearEma200;
  
  // UPTREND/DOWNTREND: только если НЕ neutral и есть четкая расстановка
  const isUptrend = !isNeutral && currentPrice > ema50 && ema50 > ema200;
  const isDowntrend = !isNeutral && currentPrice < ema50 && ema50 < ema200;

  const trendType = isUptrend ? 'UPTREND' : isDowntrend ? 'DOWNTREND' : 'NEUTRAL';
  console.log(`📊 [Trend ${timeframe}] ${trendType} | Price: ${currentPrice.toFixed(2)}, EMA50: ${ema50.toFixed(2)}, EMA200: ${ema200.toFixed(2)}`);
  console.log(`   Distance: Price↔EMA50=${(priceToEma50Distance*100).toFixed(2)}%, EMA50↔EMA200=${(ema50ToEma200Distance*100).toFixed(2)}%`);
  console.log(`   Thresholds: Price=${(PRICE_THRESHOLD*100).toFixed(1)}%, EMA=${(EMA_THRESHOLD*100).toFixed(1)}%`);

  return {
    ema50,
    ema200,
    isUptrend,
    isDowntrend,
    isNeutral,
    currentPrice,
  };
}

/**
 * Проверка, был ли резкий рост/падение перед паттерном
 * (детектирует profit-taking паттерны, которые часто fail)
 */
export function hasSharpMoveBefore(candles: Candle[], direction: 'LONG' | 'SHORT'): boolean {
  if (candles.length < 5) return false;

  // Анализируем последние 3-5 свечей ПЕРЕД текущей
  const recentCandles = candles.slice(-5, -1);
  let consecutiveLargeCandles = 0;

  for (const candle of recentCandles) {
    const metrics = analyzeCand(candle);
    const bodyPercent = metrics.body / metrics.range;
    const isLargeBody = bodyPercent > 0.6;

    if (direction === 'LONG') {
      // Ищем подряд идущие зеленые свечи с большими телами
      if (metrics.isGreen && isLargeBody) {
        consecutiveLargeCandles++;
      } else {
        consecutiveLargeCandles = 0;
      }
    } else {
      // Ищем подряд идущие красные свечи с большими телами
      if (metrics.isRed && isLargeBody) {
        consecutiveLargeCandles++;
      } else {
        consecutiveLargeCandles = 0;
      }
    }
  }

  const hasSharpMove = consecutiveLargeCandles >= 3;
  
  if (hasSharpMove) {
    console.log(`⚠️ [Sharp Move] Обнаружено ${consecutiveLargeCandles} подряд больших свечей перед ${direction} паттерном - возможно profit-taking!`);
  }

  return hasSharpMove;
}

/**
 * Проверка объема (должен быть выше среднего)
 */
export function isVolumeAboveAverage(candles: Candle[]): boolean {
  if (candles.length < 21) return true; // Если мало данных, не фильтруем

  const volumes = candles.map((c) => parseFloat(c.volume));
  // Последние 20 свечей ДО текущей: берем с индекса -21 до -1 (не включая -1)
  const last20Volumes = volumes.slice(volumes.length - 21, volumes.length - 1);
  const avgVolume = last20Volumes.reduce((sum, vol) => sum + vol, 0) / last20Volumes.length;
  const currentVolume = volumes[volumes.length - 1];

  // Смягчаем фильтр: 40% от среднего достаточно (было: 85%)
  const threshold = avgVolume * 0.40; // More relaxed - allow patterns with moderate volume
  const isAboveAverage = currentVolume >= threshold;

  console.log(`📊 [Volume] Current: ${currentVolume.toFixed(0)}, Avg(${last20Volumes.length}): ${avgVolume.toFixed(0)}, Threshold(40%): ${threshold.toFixed(0)} | Above avg: ${isAboveAverage}`);

  return isAboveAverage;
}

export interface SRZone {
  type: 'support' | 'resistance';
  price: number; // Центр зоны (среднее значение)
  upper: number; // Верхняя граница зоны
  lower: number; // Нижняя граница зоны
  touches: number; // Количество касаний
  strength: 'weak' | 'medium' | 'strong'; // weak=2, medium=3-4, strong=5+
}

export interface SRAnalysis {
  nearestSupport: SRZone | null;
  nearestResistance: SRZone | null;
  allZones: SRZone[];
}

export interface PatternResult {
  detected: boolean;
  type?: 'pinbar_buy' | 'pinbar_sell' | 'fakey_buy' | 'fakey_sell' | 'ppr_buy' | 'ppr_sell' | 'engulfing_buy' | 'engulfing_sell';
  direction?: 'LONG' | 'SHORT';
  entryPrice?: number;
  candleClosePrice?: number; // NEW: close price of pattern candle for SL/TP calculation
  srAnalysis?: SRAnalysis; // Добавляем S/R зоны
  score?: number; // Добавляем scoring
}

/**
 * Поиск Swing High (локальный максимум)
 * Свеча является Swing High, если 2 свечи слева и 2 справа имеют МЕНЬШИЙ максимум
 */
function findSwingHighs(candles: Candle[], lookback: number = 2): number[] {
  const swingHighs: number[] = [];
  
  for (let i = lookback; i < candles.length - lookback; i++) {
    const currentHigh = parseFloat(candles[i].high);
    let isSwingHigh = true;
    
    // Проверяем lookback свечей слева и справа
    for (let j = 1; j <= lookback; j++) {
      const leftHigh = parseFloat(candles[i - j].high);
      const rightHigh = parseFloat(candles[i + j].high);
      
      if (leftHigh >= currentHigh || rightHigh >= currentHigh) {
        isSwingHigh = false;
        break;
      }
    }
    
    if (isSwingHigh) {
      swingHighs.push(currentHigh);
    }
  }
  
  return swingHighs;
}

/**
 * Поиск Swing Low (локальный минимум)
 * Свеча является Swing Low, если 2 свечи слева и 2 справа имеют БОЛЬШИЙ минимум
 */
function findSwingLows(candles: Candle[], lookback: number = 2): number[] {
  const swingLows: number[] = [];
  
  for (let i = lookback; i < candles.length - lookback; i++) {
    const currentLow = parseFloat(candles[i].low);
    let isSwingLow = true;
    
    // Проверяем lookback свечей слева и справа
    for (let j = 1; j <= lookback; j++) {
      const leftLow = parseFloat(candles[i - j].low);
      const rightLow = parseFloat(candles[i + j].low);
      
      if (leftLow <= currentLow || rightLow <= currentLow) {
        isSwingLow = false;
        break;
      }
    }
    
    if (isSwingLow) {
      swingLows.push(currentLow);
    }
  }
  
  return swingLows;
}

/**
 * Группировка уровней в зоны (clustering)
 * Уровни в пределах tolerance% объединяются в одну зону
 * Ширина зоны = ±1.5% от центра (для крипты, как на TradingView скриншотах)
 */
function clusterLevels(levels: number[], tolerance: number = 0.005, zoneWidthPercent: number = 0.015): SRZone[] {
  if (levels.length === 0) return [];
  
  const sortedLevels = [...levels].sort((a, b) => a - b);
  const zones: SRZone[] = [];
  
  let currentZone: number[] = [sortedLevels[0]];
  
  for (let i = 1; i < sortedLevels.length; i++) {
    const level = sortedLevels[i];
    const zoneCenter = currentZone.reduce((sum, l) => sum + l, 0) / currentZone.length;
    const diff = Math.abs(level - zoneCenter) / zoneCenter;
    
    if (diff <= tolerance) {
      // Уровень близко к текущей зоне - добавляем
      currentZone.push(level);
    } else {
      // Создаем новую зону из накопленных уровней
      if (currentZone.length >= 2) {
        const avgPrice = currentZone.reduce((sum, l) => sum + l, 0) / currentZone.length;
        const touches = currentZone.length;
        const strength: 'weak' | 'medium' | 'strong' = 
          touches >= 5 ? 'strong' : touches >= 3 ? 'medium' : 'weak';
        
        // Рассчитываем границы зоны (ЗОНА, а не линия!)
        const zoneWidth = avgPrice * zoneWidthPercent; // ±1.5% от центра
        
        zones.push({
          type: 'support', // Тип определим позже
          price: avgPrice,
          upper: avgPrice + zoneWidth,
          lower: avgPrice - zoneWidth,
          touches,
          strength,
        });
      }
      
      currentZone = [level];
    }
  }
  
  // Добавляем последнюю зону
  if (currentZone.length >= 2) {
    const avgPrice = currentZone.reduce((sum, l) => sum + l, 0) / currentZone.length;
    const touches = currentZone.length;
    const strength: 'weak' | 'medium' | 'strong' = 
      touches >= 5 ? 'strong' : touches >= 3 ? 'medium' : 'weak';
    
    // Рассчитываем границы зоны (ЗОНА, а не линия!)
    const zoneWidth = avgPrice * zoneWidthPercent; // ±1.5% от центра
    
    zones.push({
      type: 'support',
      price: avgPrice,
      upper: avgPrice + zoneWidth,
      lower: avgPrice - zoneWidth,
      touches,
      strength,
    });
  }
  
  return zones;
}

/**
 * Анализ S/R зон с использованием TradingView алгоритма
 * (Pivot Points + Channel grouping + Strength calculation)
 */
export function analyzeSRZonesTV(candles: Candle[]): SRAnalysis {
  if (candles.length < 300) {
    console.log(`⚠️ [S/R TV] Not enough candles: ${candles.length} < 300`);
    return {
      nearestSupport: null,
      nearestResistance: null,
      allZones: [],
    };
  }
  
  const currentPrice = parseFloat(candles[candles.length - 1].close);
  
  // Используем TradingView алгоритм для поиска каналов
  const channels = findSRChannels(candles, {
    pivotPeriod: 10,
    maxChannelWidthPercent: 5,
    minStrength: 1,
    maxChannels: 6,
    loopbackPeriod: 290,
  });
  
  if (channels.length === 0) {
    console.log(`⚠️ [S/R TV] No channels found`);
    return {
      nearestSupport: null,
      nearestResistance: null,
      allZones: [],
    };
  }
  
  // Преобразуем SRChannel[] в SRZone[]
  // Пропускаем neutral каналы (цена внутри канала), оставляем только чистые support/resistance
  const allZones: SRZone[] = channels
    .filter((ch) => ch.type !== 'neutral')
    .map((ch) => ({
      type: ch.type as 'support' | 'resistance',
      price: (ch.upper + ch.lower) / 2, // Центр канала
      upper: ch.upper,
      lower: ch.lower,
      touches: ch.touchCount, // Только touchCount (strength уже учитывает pivotCount × 20)
      strength: ch.strength > 80 ? 'strong' : ch.strength > 50 ? 'medium' : 'weak',
    }));
  
  // Находим ближайшие Support/Resistance
  const nearestSupport = getNearestSupportChannel(channels, currentPrice);
  const nearestResistance = getNearestResistanceChannel(channels, currentPrice);
  
  const nearestSupportZone = nearestSupport
    ? {
        type: 'support' as const,
        price: (nearestSupport.upper + nearestSupport.lower) / 2,
        upper: nearestSupport.upper,
        lower: nearestSupport.lower,
        touches: nearestSupport.touchCount, // Только touchCount
        strength: nearestSupport.strength > 80 ? 'strong' as const : nearestSupport.strength > 50 ? 'medium' as const : 'weak' as const,
      }
    : null;
  
  const nearestResistanceZone = nearestResistance
    ? {
        type: 'resistance' as const,
        price: (nearestResistance.upper + nearestResistance.lower) / 2,
        upper: nearestResistance.upper,
        lower: nearestResistance.lower,
        touches: nearestResistance.touchCount, // Только touchCount
        strength: nearestResistance.strength > 80 ? 'strong' as const : nearestResistance.strength > 50 ? 'medium' as const : 'weak' as const,
      }
    : null;
  
  console.log(`📊 [S/R TV] Found ${allZones.length} channels`);
  if (nearestSupportZone) {
    console.log(`   📍 Nearest Support ZONE: ${nearestSupportZone.lower.toFixed(4)} - ${nearestSupportZone.upper.toFixed(4)} (center: ${nearestSupportZone.price.toFixed(4)}, ${nearestSupportZone.touches} touches, ${nearestSupportZone.strength})`);
  }
  if (nearestResistanceZone) {
    console.log(`   📍 Nearest Resistance ZONE: ${nearestResistanceZone.lower.toFixed(4)} - ${nearestResistanceZone.upper.toFixed(4)} (center: ${nearestResistanceZone.price.toFixed(4)}, ${nearestResistanceZone.touches} touches, ${nearestResistanceZone.strength})`);
  }
  
  return {
    nearestSupport: nearestSupportZone,
    nearestResistance: nearestResistanceZone,
    allZones,
  };
}

/**
 * Анализ S/R зон на основе 200 свечей (СТАРЫЙ АЛГОРИТМ - сохранен для резерва)
 */
export function analyzeSRZones(candles: Candle[]): SRAnalysis {
  if (candles.length < 50) {
    return {
      nearestSupport: null,
      nearestResistance: null,
      allZones: [],
    };
  }
  
  const currentPrice = parseFloat(candles[candles.length - 1].close);
  
  // Находим все локальные экстремумы
  const swingHighs = findSwingHighs(candles);
  const swingLows = findSwingLows(candles);
  
  console.log(`🔍 [S/R] Found ${swingHighs.length} swing highs, ${swingLows.length} swing lows`);
  
  // Группируем в зоны
  const resistanceZones = clusterLevels(swingHighs, 0.005).map(z => ({ ...z, type: 'resistance' as const }));
  const supportZones = clusterLevels(swingLows, 0.005).map(z => ({ ...z, type: 'support' as const }));
  
  // Фильтруем только зоны с 3+ касаниями (сильные и средние)
  const strongResistances = resistanceZones.filter(z => z.touches >= 3 && z.price > currentPrice);
  const strongSupports = supportZones.filter(z => z.touches >= 3 && z.price < currentPrice);
  
  // Находим ближайшие зоны
  const nearestResistance = strongResistances.length > 0
    ? strongResistances.reduce((closest, zone) => 
        Math.abs(zone.price - currentPrice) < Math.abs(closest.price - currentPrice) ? zone : closest
      )
    : null;
  
  const nearestSupport = strongSupports.length > 0
    ? strongSupports.reduce((closest, zone) => 
        Math.abs(zone.price - currentPrice) < Math.abs(closest.price - currentPrice) ? zone : closest
      )
    : null;
  
  const allZones = [...strongResistances, ...strongSupports];
  
  console.log(`📊 [S/R] Found ${allZones.length} strong zones (3+ touches)`);
  if (nearestSupport) {
    console.log(`   📍 Nearest Support ZONE: ${nearestSupport.lower.toFixed(4)} - ${nearestSupport.upper.toFixed(4)} (center: ${nearestSupport.price.toFixed(4)}, ${nearestSupport.touches} touches, ${nearestSupport.strength})`);
  }
  if (nearestResistance) {
    console.log(`   📍 Nearest Resistance ZONE: ${nearestResistance.lower.toFixed(4)} - ${nearestResistance.upper.toFixed(4)} (center: ${nearestResistance.price.toFixed(4)}, ${nearestResistance.touches} touches, ${nearestResistance.strength})`);
  }
  
  return {
    nearestSupport,
    nearestResistance,
    allZones,
  };
}

/**
 * Проверка близости паттерна к S/R зоне
 * Возвращает расстояние в процентах (null если нет зоны)
 * Если цена ВНУТРИ зоны → расстояние = 0 (идеальный сигнал!)
 */
export function getDistanceToZone(price: number, zone: SRZone | null): number | null {
  if (!zone) return null;
  
  // Цена внутри зоны - идеально!
  if (price >= zone.lower && price <= zone.upper) {
    return 0;
  }
  
  // Цена выше зоны resistance
  if (price > zone.upper) {
    return (price - zone.upper) / price;
  }
  
  // Цена ниже зоны support
  return (zone.lower - price) / price;
}

/**
 * Расчет ATR (Average True Range) для N свечей
 * Exported utility function for dead coin detection
 */
export function calculateATR(candles: Candle[], period: number = 14): number {
  if (candles.length < period + 1) return 0;
  
  let trSum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const curr = candles[i];
    const prev = i > 0 ? candles[i - 1] : curr;
    
    const currHigh = Number(curr.high);
    const currLow = Number(curr.low);
    const prevClose = Number(prev.close);
    
    const high_low = currHigh - currLow;
    const high_prevClose = Math.abs(currHigh - prevClose);
    const low_prevClose = Math.abs(currLow - prevClose);
    
    const tr = Math.max(high_low, high_prevClose, low_prevClose);
    trSum += tr;
  }
  
  return trSum / period;
}

export class PatternDetector {
  /**
   * Расчет ATR (Average True Range) для N свечей
   */
  private calculateATR(candles: Candle[], period: number = 5): number {
    return calculateATR(candles, period);
  }

  detectPinBar(candles: Candle[]): PatternResult {
    // Нужно минимум 6 свечей для ATR и проверки "выступания"
    if (candles.length < 6) return { detected: false };

    // Анализируем последнюю ЗАКРЫТУЮ свечу (Binance API уже исключает формирующуюся свечу)
    const lastCandleRaw = candles[candles.length - 1];
    const C0 = analyzeCand(lastCandleRaw);
    
    // LOG: ДЕТАЛЬНАЯ ИНФОРМАЦИЯ О СВЕЧЕ
    console.log(`\n🔍 [Pinbar] Analyzing LAST candle (index ${candles.length - 1}):`);
    console.log(`   Time: ${new Date(lastCandleRaw.openTime).toISOString()} - ${new Date(lastCandleRaw.closeTime).toISOString()}`);
    console.log(`   RAW OHLC: O=${lastCandleRaw.open}, H=${lastCandleRaw.high}, L=${lastCandleRaw.low}, C=${lastCandleRaw.close}`);
    console.log(`   Entry will be: ${C0.close}`);
    
    // Базовые обозначения
    const R = C0.range; // H - L
    const B = C0.body;  // abs(C - O)
    const U = C0.upperWick; // H - max(O, C)
    const D = C0.lowerWick; // min(O, C) - L
    
    // Пропускаем свечи с нулевым диапазоном
    if (R === 0) {
      console.log(`⏭️ [Pinbar] Skipped: zero range`);
      return { detected: false };
    }
    
    // Параметры пинбара
    const BODY_MAX_FRACTION = 0.33;
    const EDGE_THRESHOLD = 0.25;
    const TAIL_BODY_RATIO_MIN = 2.0;
    const LONG_TAIL_RANGE_MIN = 0.66; // Softened from 0.60 for 15m (66% tail ratio)
    const OPP_TAIL_RANGE_MAX = 0.20;
    const OPP_TAIL_BODY_MAX = 0.50;
    
    // Параметры "выступания"
    const ATR_LOOKBACK = 5;
    const ATR_EPSILON = 0.10; // 10% от ATR
    const TAIL_LOOKBACK = 5;
    
    const atr = this.calculateATR(candles, ATR_LOOKBACK);
    
    console.log(`\n🔍 [Pinbar] Analyzing C0: R=${R.toFixed(8)}, B=${B.toFixed(8)}, U=${U.toFixed(8)}, D=${D.toFixed(8)}, ATR=${atr.toFixed(8)}`);
    
    // ========== ЛОНГ ПИНБАР (нижний хвост) ==========
    const bodyMaxLong = B <= BODY_MAX_FRACTION * R;
    const bodyAtTopLong = U / R <= EDGE_THRESHOLD;
    const longTailBodyLong = D >= TAIL_BODY_RATIO_MIN * B;
    const longTailRangeLong = D >= LONG_TAIL_RANGE_MIN * R;
    const oppTailShortLong = U <= Math.min(OPP_TAIL_RANGE_MAX * R, OPP_TAIL_BODY_MAX * B);
    
    if (bodyMaxLong && bodyAtTopLong && longTailBodyLong && longTailRangeLong && oppTailShortLong) {
      console.log(`   ✅ Geometry LONG: body=${(B/R*100).toFixed(1)}%, bodyAtTop=${(U/R*100).toFixed(1)}%, tailVsBody=${(D/B).toFixed(2)}x, tailVsRange=${(D/R*100).toFixed(1)}%, oppTail=${(U/R*100).toFixed(1)}%`);
      
      // Проверка "выступания" нижнего хвоста (берем 5 свечей ПЕРЕД C0)
      const recentLows = candles.slice(-TAIL_LOOKBACK - 1, -1).map(c => Number(c.low));
      const minRecentLow = Math.min(...recentLows);
      const tailProtrusion = C0.low <= minRecentLow - ATR_EPSILON * atr;
      
      console.log(`   🔎 Tail protrusion check: C0.low=${C0.low.toFixed(8)}, minLow(${TAIL_LOOKBACK})=${minRecentLow.toFixed(8)}, threshold=${(minRecentLow - ATR_EPSILON * atr).toFixed(8)}`);
      
      if (tailProtrusion) {
        console.log(`   ✅✅ [Pattern] Pin Bar BUY detected (цвет НЕ важен, хвост выступает)`);
        console.log(`   🎯 RETURNING Entry=${C0.close}, CandleClose=${C0.close}`);
        
        // 📊 SCORING (0-10): Pin Bar BUY
        let score = 5; // Base score
        
        // 1. Tail/body ratio
        const tailBodyRatio = B > 0 ? D / B : 10; // Very small body = high ratio
        if (tailBodyRatio >= 3.0) {
          score += 2;
          console.log(`   📊 [Score] Tail/body ratio ${tailBodyRatio.toFixed(2)}x ≥ 3.0: +2 points`);
        } else if (tailBodyRatio >= 2.0) {
          score += 1;
          console.log(`   📊 [Score] Tail/body ratio ${tailBodyRatio.toFixed(2)}x ≥ 2.0: +1 point`);
        }
        
        // 2. Clean opposite wick (upper wick should be <10% of range)
        const oppWickPercent = U / R;
        if (oppWickPercent < 0.10) {
          score += 1;
          console.log(`   📊 [Score] Clean opposite wick ${(oppWickPercent*100).toFixed(1)}% < 10%: +1 point`);
        }
        
        // 3. Body <25% of range
        const bodyPercent = B / R;
        if (bodyPercent < 0.25) {
          score += 1;
          console.log(`   📊 [Score] Small body ${(bodyPercent*100).toFixed(1)}% < 25%: +1 point`);
        }
        
        // 4. Body at edge (upper edge for LONG pinbar)
        const bodyFromTop = U / R;
        if (bodyFromTop < 0.25) {
          score += 1;
          console.log(`   📊 [Score] Body at edge ${(bodyFromTop*100).toFixed(1)}% from top < 25%: +1 point`);
        }
        
        // Cap at 10
        score = Math.min(score, 10);
        console.log(`📊 [Pattern Score] PINBAR_BUY: ${score}/10`);
        
        return {
          detected: true,
          type: 'pinbar_buy',
          direction: 'LONG',
          entryPrice: C0.close,
          candleClosePrice: C0.close,
          score,
        };
      } else {
        console.log(`   ❌ REJECT: Tail does NOT protrude below recent lows`);
      }
    }
    
    // ========== ШОРТ ПИНБАР (верхний хвост) ==========
    const bodyMaxShort = B <= BODY_MAX_FRACTION * R;
    const bodyAtBottomShort = D / R <= EDGE_THRESHOLD;
    const longTailBodyShort = U >= TAIL_BODY_RATIO_MIN * B;
    const longTailRangeShort = U >= LONG_TAIL_RANGE_MIN * R;
    const oppTailShortShort = D <= Math.min(OPP_TAIL_RANGE_MAX * R, OPP_TAIL_BODY_MAX * B);
    
    if (bodyMaxShort && bodyAtBottomShort && longTailBodyShort && longTailRangeShort && oppTailShortShort) {
      console.log(`   ✅ Geometry SHORT: body=${(B/R*100).toFixed(1)}%, bodyAtBottom=${(D/R*100).toFixed(1)}%, tailVsBody=${(U/B).toFixed(2)}x, tailVsRange=${(U/R*100).toFixed(1)}%, oppTail=${(D/R*100).toFixed(1)}%`);
      
      // Проверка "выступания" верхнего хвоста (берем 5 свечей ПЕРЕД C0)
      const recentHighs = candles.slice(-TAIL_LOOKBACK - 1, -1).map(c => Number(c.high));
      const maxRecentHigh = Math.max(...recentHighs);
      const tailProtrusion = C0.high >= maxRecentHigh + ATR_EPSILON * atr;
      
      console.log(`   🔎 Tail protrusion check: C0.high=${C0.high.toFixed(8)}, maxHigh(${TAIL_LOOKBACK})=${maxRecentHigh.toFixed(8)}, threshold=${(maxRecentHigh + ATR_EPSILON * atr).toFixed(8)}`);
      
      if (tailProtrusion) {
        console.log(`   ✅✅ [Pattern] Pin Bar SELL detected (цвет НЕ важен, хвост выступает)`);
        console.log(`   🎯 RETURNING Entry=${C0.close}, CandleClose=${C0.close}`);
        
        // 📊 SCORING (0-10): Pin Bar SELL
        let score = 5; // Base score
        
        // 1. Tail/body ratio
        const tailBodyRatio = B > 0 ? U / B : 10; // Very small body = high ratio
        if (tailBodyRatio >= 3.0) {
          score += 2;
          console.log(`   📊 [Score] Tail/body ratio ${tailBodyRatio.toFixed(2)}x ≥ 3.0: +2 points`);
        } else if (tailBodyRatio >= 2.0) {
          score += 1;
          console.log(`   📊 [Score] Tail/body ratio ${tailBodyRatio.toFixed(2)}x ≥ 2.0: +1 point`);
        }
        
        // 2. Clean opposite wick (lower wick should be <10% of range)
        const oppWickPercent = D / R;
        if (oppWickPercent < 0.10) {
          score += 1;
          console.log(`   📊 [Score] Clean opposite wick ${(oppWickPercent*100).toFixed(1)}% < 10%: +1 point`);
        }
        
        // 3. Body <25% of range
        const bodyPercent = B / R;
        if (bodyPercent < 0.25) {
          score += 1;
          console.log(`   📊 [Score] Small body ${(bodyPercent*100).toFixed(1)}% < 25%: +1 point`);
        }
        
        // 4. Body at edge (lower edge for SHORT pinbar)
        const bodyFromBottom = D / R;
        if (bodyFromBottom < 0.25) {
          score += 1;
          console.log(`   📊 [Score] Body at edge ${(bodyFromBottom*100).toFixed(1)}% from bottom < 25%: +1 point`);
        }
        
        // Cap at 10
        score = Math.min(score, 10);
        console.log(`📊 [Pattern Score] PINBAR_SELL: ${score}/10`);
        
        return {
          detected: true,
          type: 'pinbar_sell',
          direction: 'SHORT',
          entryPrice: C0.close,
          candleClosePrice: C0.close,
          score,
        };
      } else {
        console.log(`   ❌ REJECT: Tail does NOT protrude above recent highs`);
      }
    }

    return { detected: false };
  }

  detectFakey(candles: Candle[], timeframe?: string): PatternResult {
    // Нужно минимум 6 свечей: MB + IB(s) + FB + ATR расчет
    if (candles.length < 6) return { detected: false };

    console.log(`\n🔍 [Fakey] Analyzing with ${candles.length} candles (TF: ${timeframe || 'unknown'})...`);

    // Параметры по таймфреймам (REMOVED minMBSize - following professional standards)
    const tfParams = {
      '15m': { epsilon: 0.225, maxConfirmBars: 2 },
      '1h':  { epsilon: 0.175, maxConfirmBars: 3 },
      '4h':  { epsilon: 0.125, maxConfirmBars: 3 },
    };
    
    const params = tfParams[timeframe as keyof typeof tfParams] || tfParams['1h'];
    const { epsilon, maxConfirmBars } = params;
    
    const atr = this.calculateATR(candles, 5);
    
    console.log(`   📊 ATR=${atr.toFixed(8)}, ε=${epsilon} (no MB size minimum)`);

    // Пробуем разные варианты: MB + 1 IB, MB + 2 IB
    for (let numIB = 1; numIB <= 2; numIB++) {
      const requiredBars = 1 + numIB + 1; // MB + IB(s) + FB
      if (candles.length < requiredBars) continue;

      // MB = материнская свеча (последняя закрытая минус requiredBars)
      const MB = analyzeCand(candles[candles.length - requiredBars]);
      
      // IB = inside bar(s) - свечи полностью внутри MB
      const IBs: ReturnType<typeof analyzeCand>[] = [];
      let allInside = true;
      
      for (let i = 1; i <= numIB; i++) {
        const IB = analyzeCand(candles[candles.length - requiredBars + i]);
        if (IB.high > MB.high || IB.low < MB.low) {
          allInside = false;
          break;
        }
        IBs.push(IB);
      }
      
      if (!allInside) continue;
      
      // FB = свеча ложного пробоя (последняя ЗАКРЫТАЯ свеча)
      const FB = analyzeCand(candles[candles.length - 1]);
      
      // Диапазон всех IB
      const IBHigh = Math.max(...IBs.map(ib => ib.high));
      const IBLow = Math.min(...IBs.map(ib => ib.low));
      
      console.log(`\n   🔎 Checking structure: MB + ${numIB} IB + FB`);
      console.log(`      MB: H=${MB.high.toFixed(8)}, L=${MB.low.toFixed(8)}, Range=${MB.range.toFixed(8)}`);
      console.log(`      IB: H=${IBHigh.toFixed(8)}, L=${IBLow.toFixed(8)}`);
      console.log(`      FB: H=${FB.high.toFixed(8)}, L=${FB.low.toFixed(8)}, C=${FB.close.toFixed(8)}`);

      // Professional standard: NO minimum MB size requirement, rely on structure clarity
      console.log(`   ✅ MB structure check: Range=${MB.range.toFixed(8)} (ATR size filter REMOVED per pro standards)`);

      // ========== LONG FAKEY ==========
      // FB пробивает вниз (ложный пробой low IB), но закрывается обратно
      const fbProbeBelowIB = FB.low < IBLow;
      const fbProbeDepth = IBLow - FB.low;
      const fbProbeOK = fbProbeDepth >= epsilon * atr;
      const fbCloseBackInMB = FB.close >= MB.low && FB.close <= MB.high;
      
      if (fbProbeBelowIB && fbProbeOK && fbCloseBackInMB) {
        // Подтверждение: FB закрылся выше IBHigh (пробой противоположного края)
        const confirmedLong = FB.close > IBHigh;
        
        console.log(`   🔍 LONG candidate: probe=${fbProbeDepth.toFixed(8)} (need ${(epsilon * atr).toFixed(8)}), closeBack=${fbCloseBackInMB}, confirm=${confirmedLong}`);
        
        if (confirmedLong) {
          console.log(`   ✅✅ [Pattern] Fakey BUY detected (цвет НЕ важен, ${numIB} IB)`);
          
          // 📊 SCORING (0-10): Fakey BUY
          let score = 6; // Base score
          
          // 1. Mother bar size relative to ATR (≥1.5 ATR = +1 point)
          const mbToAtrRatio = MB.range / atr;
          if (mbToAtrRatio >= 1.5) {
            score += 1;
            console.log(`   📊 [Score] MB size ${mbToAtrRatio.toFixed(2)}x ATR ≥ 1.5: +1 point`);
          }
          
          // 2. Inside bar tightness (already guaranteed by detection, but reward tighter IB)
          const ibTightness = (IBHigh - IBLow) / MB.range;
          if (ibTightness < 0.5) {
            score += 1;
            console.log(`   📊 [Score] IB tightness ${(ibTightness*100).toFixed(1)}% < 50%: +1 point`);
          }
          
          // 3. False break distance (significant move outside MB, check probe depth)
          const probePercent = fbProbeDepth / (epsilon * atr);
          if (probePercent >= 1.5) {
            score += 1;
            console.log(`   📊 [Score] Strong false break ${probePercent.toFixed(2)}x epsilon: +1 point`);
          }
          
          // 4. Clean rejection (close beyond opposite boundary = strong)
          const closeAboveIBRange = (FB.close - IBHigh) / (IBHigh - IBLow || 1);
          if (closeAboveIBRange >= 0.3) {
            score += 1;
            console.log(`   📊 [Score] Strong rejection close ${(closeAboveIBRange*100).toFixed(1)}% beyond IB: +1 point`);
          }
          
          // Cap at 10
          score = Math.min(score, 10);
          console.log(`📊 [Pattern Score] FAKEY_BUY: ${score}/10`);
          
          return {
            detected: true,
            type: 'fakey_buy',
            direction: 'LONG',
            entryPrice: FB.close,
            candleClosePrice: FB.close,
            score,
          };
        }
      }

      // ========== SHORT FAKEY ==========
      // FB пробивает вверх (ложный пробой high IB), но закрывается обратно
      const fbProbeAboveIB = FB.high > IBHigh;
      const fbProbeDepthShort = FB.high - IBHigh;
      const fbProbeOKShort = fbProbeDepthShort >= epsilon * atr;
      const fbCloseBackInMBShort = FB.close >= MB.low && FB.close <= MB.high;
      
      if (fbProbeAboveIB && fbProbeOKShort && fbCloseBackInMBShort) {
        // Подтверждение: FB закрылся ниже IBLow (пробой противоположного края)
        const confirmedShort = FB.close < IBLow;
        
        console.log(`   🔍 SHORT candidate: probe=${fbProbeDepthShort.toFixed(8)} (need ${(epsilon * atr).toFixed(8)}), closeBack=${fbCloseBackInMBShort}, confirm=${confirmedShort}`);
        
        if (confirmedShort) {
          console.log(`   ✅✅ [Pattern] Fakey SELL detected (цвет НЕ важен, ${numIB} IB)`);
          
          // 📊 SCORING (0-10): Fakey SELL
          let score = 6; // Base score
          
          // 1. Mother bar size relative to ATR (≥1.5 ATR = +1 point)
          const mbToAtrRatio = MB.range / atr;
          if (mbToAtrRatio >= 1.5) {
            score += 1;
            console.log(`   📊 [Score] MB size ${mbToAtrRatio.toFixed(2)}x ATR ≥ 1.5: +1 point`);
          }
          
          // 2. Inside bar tightness (already guaranteed by detection, but reward tighter IB)
          const ibTightness = (IBHigh - IBLow) / MB.range;
          if (ibTightness < 0.5) {
            score += 1;
            console.log(`   📊 [Score] IB tightness ${(ibTightness*100).toFixed(1)}% < 50%: +1 point`);
          }
          
          // 3. False break distance (significant move outside MB, check probe depth)
          const probePercent = fbProbeDepthShort / (epsilon * atr);
          if (probePercent >= 1.5) {
            score += 1;
            console.log(`   📊 [Score] Strong false break ${probePercent.toFixed(2)}x epsilon: +1 point`);
          }
          
          // 4. Clean rejection (close beyond opposite boundary = strong)
          const closeBelowIBRange = (IBLow - FB.close) / (IBHigh - IBLow || 1);
          if (closeBelowIBRange >= 0.3) {
            score += 1;
            console.log(`   📊 [Score] Strong rejection close ${(closeBelowIBRange*100).toFixed(1)}% beyond IB: +1 point`);
          }
          
          // Cap at 10
          score = Math.min(score, 10);
          console.log(`📊 [Pattern Score] FAKEY_SELL: ${score}/10`);
          
          return {
            detected: true,
            type: 'fakey_sell',
            direction: 'SHORT',
            entryPrice: FB.close,
            candleClosePrice: FB.close,
            score,
          };
        }
      }
    }

    return { detected: false };
  }

  detectPPR(candles: Candle[], timeframe?: string): PatternResult {
    // PPR = Piercing Pattern Reversal (двухсвечный разворотный паттерн)
    // BULLISH: RED→GREEN, gap down (optional), close >50% body Bar1
    // BEARISH (Dark Cloud): GREEN→RED, gap up (optional), close <50% body Bar1
    
    // Нужно минимум 200 свечей для EMA 50/200 trend check
    if (candles.length < 200) return { detected: false };

    console.log(`\n🔍 [PPR - Piercing Pattern Reversal] Analyzing with ${candles.length} candles (TF: ${timeframe || 'unknown'})...`);

    // ✅ NEW: Check trend FIRST (PPR only works after established trend)
    const trend = analyzeTrend(candles, timeframe || '15m');
    
    console.log(`   📊 Trend Context: ${trend.isUptrend ? 'UPTREND' : trend.isDowntrend ? 'DOWNTREND' : 'NEUTRAL'}`);
    console.log(`      Price: ${trend.currentPrice.toFixed(2)}, EMA50: ${trend.ema50.toFixed(2)}, EMA200: ${trend.ema200.toFixed(2)}`);

    const atr = this.calculateATR(candles, 5);
    console.log(`   📊 ATR=${atr.toFixed(8)}`);

    // Bar₁ и Bar₂ (последние две ЗАКРЫТЫЕ свечи)
    const Bar1 = analyzeCand(candles[candles.length - 2]); // Первая свеча паттерна
    const Bar2 = analyzeCand(candles[candles.length - 1]); // Вторая свеча паттерна (последняя ЗАКРЫТАЯ)
    
    console.log(`\n   🔎 Checking 2-bar Piercing Pattern:`);
    console.log(`      Bar₁: O=${Bar1.open.toFixed(8)}, C=${Bar1.close.toFixed(8)}, H=${Bar1.high.toFixed(8)}, L=${Bar1.low.toFixed(8)}, body=${Bar1.body.toFixed(8)}, color=${Bar1.isGreen ? 'GREEN' : 'RED'}`);
    console.log(`      Bar₂: O=${Bar2.open.toFixed(8)}, C=${Bar2.close.toFixed(8)}, H=${Bar2.high.toFixed(8)}, L=${Bar2.low.toFixed(8)}, body=${Bar2.body.toFixed(8)}, color=${Bar2.isGreen ? 'GREEN' : 'RED'}`);

    // ========== BULLISH PIERCING PATTERN ==========
    // 1. Bar₁ = RED (медвежья)
    // 2. Bar₂ = GREEN (бычья) ← КРИТИЧНО: должна быть зеленой!
    // 3. Gap down: OPTIONAL (bonus to score, not required)
    // 4. Close₂ > 50% body Bar₁ (закрытие выше середины тела)
    // 5. Not full engulfing (Close₂ < Open₁)
    // 6. ✅ NEW: Requires DOWNTREND
    
    if (Bar1.isRed && Bar2.isGreen) {
      // ✅ NEW: Требуется DOWNTREND
      if (!trend.isDowntrend) {
        console.log(`   ❌ BULLISH PPR requires DOWNTREND (current: ${trend.isUptrend ? 'UPTREND' : 'NEUTRAL'})`);
        return { detected: false };
      }
      
      console.log(`   ✅ BULLISH PPR color sequence: RED→GREEN, DOWNTREND ✅`);
      
      const bar1BodyMid = (Bar1.open + Bar1.close) / 2;
      
      // ✅ Gap check с increased tolerance: 25% ATR (было 15%)
      // ✅ Gap now OPTIONAL - gives bonus to score but doesn't block pattern
      const gapTolerance = 0.25 * atr;
      const gapThreshold = Bar1.close - gapTolerance;
      const hasGap = Bar2.open < gapThreshold;
      
      const closesAboveMid = Bar2.close > bar1BodyMid;
      const closesWithinBar1Range = Bar2.close < Bar1.open; // Не полное поглощение
      
      console.log(`   🔍 BULLISH PIERCING candidate (RED→GREEN, DOWNTREND ✅):`);
      console.log(`      Gap down (O₂ < C₁-tol): ${Bar2.open.toFixed(8)} < ${gapThreshold.toFixed(8)} = ${hasGap ? '✅ BONUS' : '⚪ OPTIONAL'} (tolerance=${gapTolerance.toFixed(8)})`);
      console.log(`      Close above 50% body: ${Bar2.close.toFixed(8)} > ${bar1BodyMid.toFixed(8)} = ${closesAboveMid ? '✅' : '❌'}`);
      console.log(`      Not full engulfing (C₂ < O₁): ${Bar2.close.toFixed(8)} < ${Bar1.open.toFixed(8)} = ${closesWithinBar1Range ? '✅' : '❌'}`);
      
      // ✅ NEW: Gap is OPTIONAL - only require core conditions
      if (closesAboveMid && closesWithinBar1Range) {
        const penetration = ((Bar2.close - Bar1.close) / Bar1.body) * 100;
        console.log(`   ✅✅ [Pattern] PPR BUY detected (Bullish Piercing Pattern, penetration=${penetration.toFixed(1)}%, gap=${hasGap ? 'YES' : 'NO'})`);
        
        // 📊 SCORING (0-10): PPR BUY
        let score = 6; // Base score
        
        // 1. Penetration depth (>50% already guaranteed, reward deeper penetration)
        const penetrationPercent = (Bar2.close - Bar1.close) / Bar1.body;
        if (penetrationPercent > 0.7) {
          score += 1;
          console.log(`   📊 [Score] Deep penetration ${(penetrationPercent*100).toFixed(1)}% > 70%: +1 point`);
        }
        
        // 2. ✅ NEW: Gap size (OPTIONAL - bonus if present)
        if (hasGap) {
          const gapSize = Bar1.close - Bar2.open;
          const gapToAtrRatio = gapSize / atr;
          if (gapToAtrRatio > 0.2) {
            score += 1;
            console.log(`   📊 [Score] Has gap ${gapToAtrRatio.toFixed(2)}x ATR > 0.2: +1 point`);
          }
        } else {
          console.log(`   📊 [Score] No gap (optional, no penalty)`);
        }
        
        // 3. Bar2 strength (large body)
        const bar2BodyToAtrRatio = Bar2.body / atr;
        if (bar2BodyToAtrRatio >= 0.7) {
          score += 1;
          console.log(`   📊 [Score] Strong Bar2 body ${bar2BodyToAtrRatio.toFixed(2)}x ATR ≥ 0.7: +1 point`);
        }
        
        // 4. Clean structure (small wicks on Bar2)
        const bar2TotalWicks = (Bar2.upperWick + Bar2.lowerWick) / Bar2.range;
        if (bar2TotalWicks < 0.3) {
          score += 1;
          console.log(`   📊 [Score] Clean Bar2 wicks ${(bar2TotalWicks*100).toFixed(1)}% < 30%: +1 point`);
        }
        
        // Cap at 10
        score = Math.min(score, 10);
        console.log(`📊 [Pattern Score] PPR_BUY: ${score}/10`);
        
        return {
          detected: true,
          type: 'ppr_buy',
          direction: 'LONG',
          entryPrice: Bar2.close,
          candleClosePrice: Bar2.close,
          score,
        };
      }
    }

    // ========== BEARISH DARK CLOUD COVER ==========
    // 1. Bar₁ = GREEN (бычья)
    // 2. Bar₂ = RED (медвежья) ← КРИТИЧНО: должна быть красной!
    // 3. Gap up: OPTIONAL (bonus to score, not required)
    // 4. Close₂ < 50% body Bar₁ (закрытие ниже середины тела)
    // 5. Not full engulfing (Close₂ > Open₁)
    // 6. ✅ NEW: Requires UPTREND
    
    if (Bar1.isGreen && Bar2.isRed) {
      // ✅ NEW: Требуется UPTREND
      if (!trend.isUptrend) {
        console.log(`   ❌ BEARISH PPR requires UPTREND (current: ${trend.isDowntrend ? 'DOWNTREND' : 'NEUTRAL'})`);
        return { detected: false };
      }
      
      console.log(`   ✅ BEARISH PPR color sequence: GREEN→RED, UPTREND ✅`);
      
      const bar1BodyMid = (Bar1.open + Bar1.close) / 2;
      
      // ✅ Gap check с increased tolerance: 25% ATR (было 15%)
      // ✅ Gap now OPTIONAL - gives bonus to score but doesn't block pattern
      const gapTolerance = 0.25 * atr;
      const gapThreshold = Bar1.close + gapTolerance;
      const hasGap = Bar2.open > gapThreshold;
      
      const closesBelowMid = Bar2.close < bar1BodyMid;
      const closesWithinBar1Range = Bar2.close > Bar1.open; // Не полное поглощение
      
      console.log(`   🔍 BEARISH DARK CLOUD candidate (GREEN→RED, UPTREND ✅):`);
      console.log(`      Gap up (O₂ > C₁+tol): ${Bar2.open.toFixed(8)} > ${gapThreshold.toFixed(8)} = ${hasGap ? '✅ BONUS' : '⚪ OPTIONAL'} (tolerance=${gapTolerance.toFixed(8)})`);
      console.log(`      Close below 50% body: ${Bar2.close.toFixed(8)} < ${bar1BodyMid.toFixed(8)} = ${closesBelowMid ? '✅' : '❌'}`);
      console.log(`      Not full engulfing (C₂ > O₁): ${Bar2.close.toFixed(8)} > ${Bar1.open.toFixed(8)} = ${closesWithinBar1Range ? '✅' : '❌'}`);
      
      // ✅ NEW: Gap is OPTIONAL - only require core conditions
      if (closesBelowMid && closesWithinBar1Range) {
        const penetration = ((Bar1.close - Bar2.close) / Bar1.body) * 100;
        console.log(`   ✅✅ [Pattern] PPR SELL detected (Bearish Dark Cloud Cover, penetration=${penetration.toFixed(1)}%, gap=${hasGap ? 'YES' : 'NO'})`);
        
        // 📊 SCORING (0-10): PPR SELL
        let score = 6; // Base score
        
        // 1. Penetration depth (>50% already guaranteed, reward deeper penetration)
        const penetrationPercent = (Bar1.close - Bar2.close) / Bar1.body;
        if (penetrationPercent > 0.7) {
          score += 1;
          console.log(`   📊 [Score] Deep penetration ${(penetrationPercent*100).toFixed(1)}% > 70%: +1 point`);
        }
        
        // 2. ✅ NEW: Gap size (OPTIONAL - bonus if present)
        if (hasGap) {
          const gapSize = Bar2.open - Bar1.close;
          const gapToAtrRatio = gapSize / atr;
          if (gapToAtrRatio > 0.2) {
            score += 1;
            console.log(`   📊 [Score] Has gap ${gapToAtrRatio.toFixed(2)}x ATR > 0.2: +1 point`);
          }
        } else {
          console.log(`   📊 [Score] No gap (optional, no penalty)`);
        }
        
        // 3. Bar2 strength (large body)
        const bar2BodyToAtrRatio = Bar2.body / atr;
        if (bar2BodyToAtrRatio >= 0.7) {
          score += 1;
          console.log(`   📊 [Score] Strong Bar2 body ${bar2BodyToAtrRatio.toFixed(2)}x ATR ≥ 0.7: +1 point`);
        }
        
        // 4. Clean structure (small wicks on Bar2)
        const bar2TotalWicks = (Bar2.upperWick + Bar2.lowerWick) / Bar2.range;
        if (bar2TotalWicks < 0.3) {
          score += 1;
          console.log(`   📊 [Score] Clean Bar2 wicks ${(bar2TotalWicks*100).toFixed(1)}% < 30%: +1 point`);
        }
        
        // Cap at 10
        score = Math.min(score, 10);
        console.log(`📊 [Pattern Score] PPR_SELL: ${score}/10`);
        
        return {
          detected: true,
          type: 'ppr_sell',
          direction: 'SHORT',
          entryPrice: Bar2.close,
          candleClosePrice: Bar2.close,
          score,
        };
      }
    }

    console.log(`   ❌ No PPR pattern detected`);
    return { detected: false };
  }

  detectEngulfing(candles: Candle[], timeframe?: string): PatternResult {
    // Нужно минимум 200 свечей для EMA 50/200 trend check
    if (candles.length < 200) return { detected: false };

    console.log(`\n🔍 [Engulfing] Analyzing with ${candles.length} candles (TF: ${timeframe || 'unknown'})...`);

    // ✅ NEW: Check trend FIRST (Engulfing only works after established trend)
    const trend = analyzeTrend(candles, timeframe || '15m');
    
    console.log(`   📊 Trend Context: ${trend.isUptrend ? 'UPTREND' : trend.isDowntrend ? 'DOWNTREND' : 'NEUTRAL'}`);
    console.log(`      Price: ${trend.currentPrice.toFixed(2)}, EMA50: ${trend.ema50.toFixed(2)}, EMA200: ${trend.ema200.toFixed(2)}`);

    // Bar₁ и Bar₂ (последние две ЗАКРЫТЫЕ свечи)
    const Bar1 = analyzeCand(candles[candles.length - 2]); // C1 (поглощаемая, первая свеча паттерна)
    const Bar2 = analyzeCand(candles[candles.length - 1]); // C0 (поглощающая, последняя ЗАКРЫТАЯ)
    
    console.log(`\n   🔎 Checking Engulfing:`);
    console.log(`      Bar₁: O=${Bar1.open.toFixed(8)}, C=${Bar1.close.toFixed(8)}, B=${Bar1.body.toFixed(8)}, color=${Bar1.isGreen ? 'GREEN' : 'RED'}`);
    console.log(`      Bar₂: O=${Bar2.open.toFixed(8)}, C=${Bar2.close.toFixed(8)}, H=${Bar2.high.toFixed(8)}, L=${Bar2.low.toFixed(8)}, B=${Bar2.body.toFixed(8)}, R=${Bar2.range.toFixed(8)}, color=${Bar2.isGreen ? 'GREEN' : 'RED'}`);

    // ✅ NEW: Body ratio increased to 1.5x (from 1.2x) for higher quality
    const BODY_RATIO_MIN = 1.5;
    const EDGE_MAX = 0.25;
    
    // Проверка импульсности Bar₂
    const bodyRatioActual = Bar1.body > 0 ? Bar2.body / Bar1.body : 0;
    const bodyRatioOK = bodyRatioActual >= BODY_RATIO_MIN;
    if (!bodyRatioOK) {
      console.log(`   ❌ Body ratio too small: ${bodyRatioActual.toFixed(2)} < ${BODY_RATIO_MIN}`);
      return { detected: false };
    }
    console.log(`   ✅ Body ratio OK: ${bodyRatioActual.toFixed(2)} >= ${BODY_RATIO_MIN} (increased from 1.2x for better quality)`);

    // ========== LONG (бычье поглощение) ==========
    // Цвет: Bar₁ RED, Bar₂ GREEN
    // ✅ NEW: SIMPLIFIED engulfing (NO gamma buffer!)
    // Поглощение body: Bar2.close > Bar1.open && Bar2.open < Bar1.close
    // ✅ NEW: Requires DOWNTREND
    if (Bar1.isRed && Bar2.isGreen) {
      // ✅ NEW: Требуется DOWNTREND
      if (!trend.isDowntrend) {
        console.log(`   ❌ BULLISH Engulfing requires DOWNTREND (current: ${trend.isUptrend ? 'UPTREND' : 'NEUTRAL'})`);
        return { detected: false };
      }
      
      // ✅ SIMPLIFIED: Body engulfment (no gamma buffer!)
      const bodyEngulfed = Bar2.close > Bar1.open && Bar2.open < Bar1.close;
      
      console.log(`   🔍 BUY candidate (цвет: RED→GREEN ✅, DOWNTREND ✅):`);
      console.log(`      Body engulfed: C₂ > O₁ && O₂ < C₁: ${Bar2.close.toFixed(8)} > ${Bar1.open.toFixed(8)} && ${Bar2.open.toFixed(8)} < ${Bar1.close.toFixed(8)} ${bodyEngulfed ? '✅' : '❌'}`);
      
      if (bodyEngulfed) {
        // Проверка закрытия у верха: (H₂ - C₂) / R₂ ≤ 0.25
        const closeAtTopFraction = Bar2.range > 0 ? (Bar2.high - Bar2.close) / Bar2.range : 1;
        const closeAtTopOK = closeAtTopFraction <= EDGE_MAX;
        
        console.log(`      Close at top: ${(closeAtTopFraction * 100).toFixed(1)}% <= ${(EDGE_MAX * 100).toFixed(1)}% ${closeAtTopOK ? '✅' : '❌'}`);
        
        if (closeAtTopOK) {
          console.log(`   ✅✅ [Pattern] Engulfing BUY detected (SIMPLIFIED, DOWNTREND confirmed)`);
          
          // 📊 SCORING (0-10): Engulfing BUY
          let score = 5; // Base score
          
          // 1. Full engulfment (Bar2 fully covers Bar1 range)
          const fullEngulfment = Bar2.low <= Bar1.low && Bar2.high >= Bar1.high;
          if (fullEngulfment) {
            score += 2;
            console.log(`   📊 [Score] Full range engulfment (Bar2 covers Bar1 completely): +2 points`);
          }
          
          // 2. Engulfing strength (Bar2 body ≥2x Bar1 body)
          if (bodyRatioActual >= 2.0) {
            score += 1;
            console.log(`   📊 [Score] Strong engulfing ${bodyRatioActual.toFixed(2)}x body ≥ 2.0: +1 point`);
          }
          
          // 3. Clean structure (Bar2 has small wicks)
          const bar2TotalWicks = (Bar2.upperWick + Bar2.lowerWick) / Bar2.range;
          if (bar2TotalWicks < 0.3) {
            score += 1;
            console.log(`   📊 [Score] Clean structure wicks ${(bar2TotalWicks*100).toFixed(1)}% < 30%: +1 point`);
          }
          
          // 4. Body dominance (Bar2 body ≥80% of range)
          const bodyDominance = Bar2.body / Bar2.range;
          if (bodyDominance >= 0.8) {
            score += 1;
            console.log(`   📊 [Score] Body dominance ${(bodyDominance*100).toFixed(1)}% ≥ 80%: +1 point`);
          }
          
          // Cap at 10
          score = Math.min(score, 10);
          console.log(`📊 [Pattern Score] ENGULFING_BUY: ${score}/10`);
          
          return {
            detected: true,
            type: 'engulfing_buy',
            direction: 'LONG',
            entryPrice: Bar2.close,
            candleClosePrice: Bar2.close,
            score,
          };
        }
      }
    }

    // ========== SHORT (медвежье поглощение) ==========
    // Цвет: Bar₁ GREEN, Bar₂ RED
    // ✅ NEW: SIMPLIFIED engulfing (NO gamma buffer!)
    // Поглощение body: Bar2.close < Bar1.open && Bar2.open > Bar1.close
    // ✅ NEW: Requires UPTREND
    if (Bar1.isGreen && Bar2.isRed) {
      // ✅ NEW: Требуется UPTREND
      if (!trend.isUptrend) {
        console.log(`   ❌ BEARISH Engulfing requires UPTREND (current: ${trend.isDowntrend ? 'DOWNTREND' : 'NEUTRAL'})`);
        return { detected: false };
      }
      
      // ✅ SIMPLIFIED: Body engulfment (no gamma buffer!)
      const bodyEngulfed = Bar2.close < Bar1.open && Bar2.open > Bar1.close;
      
      console.log(`   🔍 SELL candidate (цвет: GREEN→RED ✅, UPTREND ✅):`);
      console.log(`      Body engulfed: C₂ < O₁ && O₂ > C₁: ${Bar2.close.toFixed(8)} < ${Bar1.open.toFixed(8)} && ${Bar2.open.toFixed(8)} > ${Bar1.close.toFixed(8)} ${bodyEngulfed ? '✅' : '❌'}`);
      
      if (bodyEngulfed) {
        // Проверка закрытия у низа: (C₂ - L₂) / R₂ ≤ 0.25
        const closeAtBottomFraction = Bar2.range > 0 ? (Bar2.close - Bar2.low) / Bar2.range : 1;
        const closeAtBottomOK = closeAtBottomFraction <= EDGE_MAX;
        
        console.log(`      Close at bottom: ${(closeAtBottomFraction * 100).toFixed(1)}% <= ${(EDGE_MAX * 100).toFixed(1)}% ${closeAtBottomOK ? '✅' : '❌'}`);
        
        if (closeAtBottomOK) {
          console.log(`   ✅✅ [Pattern] Engulfing SELL detected (SIMPLIFIED, UPTREND confirmed)`);
          
          // 📊 SCORING (0-10): Engulfing SELL
          let score = 5; // Base score
          
          // 1. Full engulfment (Bar2 fully covers Bar1 range)
          const fullEngulfment = Bar2.low <= Bar1.low && Bar2.high >= Bar1.high;
          if (fullEngulfment) {
            score += 2;
            console.log(`   📊 [Score] Full range engulfment (Bar2 covers Bar1 completely): +2 points`);
          }
          
          // 2. Engulfing strength (Bar2 body ≥2x Bar1 body)
          if (bodyRatioActual >= 2.0) {
            score += 1;
            console.log(`   📊 [Score] Strong engulfing ${bodyRatioActual.toFixed(2)}x body ≥ 2.0: +1 point`);
          }
          
          // 3. Clean structure (Bar2 has small wicks)
          const bar2TotalWicks = (Bar2.upperWick + Bar2.lowerWick) / Bar2.range;
          if (bar2TotalWicks < 0.3) {
            score += 1;
            console.log(`   📊 [Score] Clean structure wicks ${(bar2TotalWicks*100).toFixed(1)}% < 30%: +1 point`);
          }
          
          // 4. Body dominance (Bar2 body ≥80% of range)
          const bodyDominance = Bar2.body / Bar2.range;
          if (bodyDominance >= 0.8) {
            score += 1;
            console.log(`   📊 [Score] Body dominance ${(bodyDominance*100).toFixed(1)}% ≥ 80%: +1 point`);
          }
          
          // Cap at 10
          score = Math.min(score, 10);
          console.log(`📊 [Pattern Score] ENGULFING_SELL: ${score}/10`);
          
          return {
            detected: true,
            type: 'engulfing_sell',
            direction: 'SHORT',
            entryPrice: Bar2.close,
            candleClosePrice: Bar2.close,
            score,
          };
        }
      }
    }

    return { detected: false };
  }

  detectAllPatterns(candles: Candle[], timeframe?: string): PatternResult[] {
    console.log(`\n🔍 [Pattern Detection] Starting pattern detection with ${candles.length} candles (TF: ${timeframe || 'unknown'})`);
    
    const results: PatternResult[] = [];

    // Анализ тренда (EMA 50/200) - используем timeframe-aware пороги
    const trend = analyzeTrend(candles, timeframe || '15m');
    
    // Анализ S/R зон (TradingView алгоритм)
    const srAnalysis = analyzeSRZonesTV(candles);
    
    // Проверка объема
    const hasGoodVolume = isVolumeAboveAverage(candles);
    if (!hasGoodVolume) {
      console.log(`❌ [Filter] REJECTED - Volume below average, skipping all patterns`);
      return results;
    }

    // Детектируем паттерны и оцениваем их
    const patterns = [
      this.detectPinBar(candles),
      this.detectFakey(candles, timeframe),
      this.detectPPR(candles, timeframe),
      this.detectEngulfing(candles, timeframe),
    ];

    for (const pattern of patterns) {
      if (!pattern.detected || !pattern.direction || !pattern.entryPrice) continue;

      // Добавляем S/R анализ к паттерну
      pattern.srAnalysis = srAnalysis;

      // === SCORING SYSTEM ===
      let score = 0;
      const patternName = pattern.type?.replace('_buy', '').replace('_sell', '').toUpperCase();
      const isPinbar = pattern.type?.startsWith('pinbar');
      const isFakey = pattern.type?.startsWith('fakey');
      const isPPR = pattern.type?.startsWith('ppr');
      const isEngulfing = pattern.type?.startsWith('engulfing');
      
      console.log(`\n💯 [Scoring] ${patternName} ${pattern.direction}:`);

      // ⛔ СТРОГАЯ ФИЛЬТРАЦИЯ ПО ТРЕНДУ (для ВСЕХ паттернов БЕЗ ИСКЛЮЧЕНИЙ)
      
      // 1. БЛОКИРУЕМ сигналы в NEUTRAL зоне (ranging/переходный рынок)
      if (trend.isNeutral) {
        console.log(`   ⛔ TREND GATING: REJECT - NEUTRAL market (ranging/transition), no clear trend`);
        console.log(`      Price=${trend.currentPrice.toFixed(2)}, EMA50=${trend.ema50.toFixed(2)}, EMA200=${trend.ema200.toFixed(2)}\n`);
        continue;
      }
      
      // 2. БЛОКИРУЕМ контр-трендовые сигналы
      const isCounterTrend = 
        (pattern.direction === 'LONG' && trend.isDowntrend) ||
        (pattern.direction === 'SHORT' && trend.isUptrend);
      
      if (isCounterTrend) {
        console.log(`   ⛔ TREND GATING: REJECT - ${pattern.direction} сигнал ПРОТИВ тренда (Price=${trend.currentPrice.toFixed(2)}, EMA50=${trend.ema50.toFixed(2)}, EMA200=${trend.ema200.toFixed(2)})`);
        console.log(`      Uptrend=${trend.isUptrend}, Downtrend=${trend.isDowntrend}\n`);
        continue;
      }
      
      console.log(`   ✅ TREND CHECK: Passed - ${pattern.direction} aligned with market trend`);

      // 📊 S/R ЗОНЫ - ТОЛЬКО ДЛЯ ИНФОРМАЦИИ И БОНУСНОГО SCORING (НЕ ОБЯЗАТЕЛЬНО!)
      const distanceToSupport = getDistanceToZone(pattern.entryPrice, srAnalysis.nearestSupport);
      const distanceToResistance = getDistanceToZone(pattern.entryPrice, srAnalysis.nearestResistance);
      
      // Цена "у зоны" = расстояние < 0.5% ИЛИ внутри зоны (distance = 0)
      const isNearSupport = distanceToSupport !== null && distanceToSupport <= 0.005;
      const isNearResistance = distanceToResistance !== null && distanceToResistance <= 0.005;

      // Логирование S/R зон с границами (информационно)
      if (srAnalysis.nearestSupport) {
        const zone = srAnalysis.nearestSupport;
        console.log(`   📍 Support ZONE: ${zone.lower.toFixed(4)} - ${zone.upper.toFixed(4)} (center: ${zone.price.toFixed(4)}, ${zone.touches} touches)`);
        console.log(`      Distance: ${distanceToSupport !== null ? (distanceToSupport * 100).toFixed(2) + '%' : 'N/A'}`);
      }
      if (srAnalysis.nearestResistance) {
        const zone = srAnalysis.nearestResistance;
        console.log(`   📍 Resistance ZONE: ${zone.lower.toFixed(4)} - ${zone.upper.toFixed(4)} (center: ${zone.price.toFixed(4)}, ${zone.touches} touches)`);
        console.log(`      Distance: ${distanceToResistance !== null ? (distanceToResistance * 100).toFixed(2) + '%' : 'N/A'}`);
      }

      // 🎁 БОНУСНЫЙ SCORING: даем +100 если паттерн возле правильной зоны, но НЕ ОТКЛОНЯЕМ если далеко
      if (pattern.direction === 'LONG' && isNearSupport) {
        score += 100;
        console.log(`   ✅ S/R BONUS: +100 (LONG возле Support зоны)`);
      } else if (pattern.direction === 'SHORT' && isNearResistance) {
        score += 100;
        console.log(`   ✅ S/R BONUS: +100 (SHORT возле Resistance зоны)`);
      } else {
        console.log(`   ⚪ S/R BONUS: +0 (паттерн вне S/R зон - OK, не отклоняем!)`);
      }

      // 2️⃣ EMA TREND SCORE (для ВСЕХ паттернов включая Pin Bar)
      const trendAligned = 
        (pattern.direction === 'LONG' && trend.isUptrend) ||
        (pattern.direction === 'SHORT' && trend.isDowntrend);
      
      const weakTrend = 
        (pattern.direction === 'LONG' && trend.currentPrice > trend.ema50 && Math.abs(trend.ema50 - trend.ema200) / trend.ema200 < 0.02) ||
        (pattern.direction === 'SHORT' && trend.currentPrice < trend.ema50 && Math.abs(trend.ema50 - trend.ema200) / trend.ema200 < 0.02);

      if (trendAligned) {
        score += 30;
        console.log(`   ✅ Trend: +30 (сильный тренд aligned)`);
      } else if (weakTrend) {
        score += 15;
        console.log(`   ⚠️ Trend: +15 (слабый тренд)`);
      } else {
        score += 0;
        console.log(`   ❌ Trend: +0 (нейтральный тренд)`);
      }

      // 3️⃣ VOLUME SCORE
      const volumes = candles.map((c) => parseFloat(c.volume));
      const last20Volumes = volumes.slice(volumes.length - 21, volumes.length - 1);
      const avgVolume = last20Volumes.reduce((sum, vol) => sum + vol, 0) / last20Volumes.length;
      const currentVolume = volumes[volumes.length - 1];
      const volumeRatio = currentVolume / avgVolume;

      if (volumeRatio > 1.5) {
        score += 30;
        console.log(`   ✅ Volume: +30 (${volumeRatio.toFixed(2)}x average)`);
      } else if (volumeRatio > 1.0) {
        score += 15;
        console.log(`   ⚠️ Volume: +15 (${volumeRatio.toFixed(2)}x average)`);
      } else {
        score += 0;
        console.log(`   ❌ Volume: +0 (${volumeRatio.toFixed(2)}x average)`);
      }

      // 4️⃣ SHARP MOVE SCORE
      const hasSharpMove = hasSharpMoveBefore(candles, pattern.direction);
      if (!hasSharpMove) {
        score += 20;
        console.log(`   ✅ Sharp Move: +20 (нет profit-taking)`);
      } else {
        score += 0;
        console.log(`   ❌ Sharp Move: +0 (обнаружен profit-taking)`);
      }

      // === ИТОГОВАЯ ОЦЕНКА ===
      pattern.score = score;
      console.log(`   🎯 ИТОГО: ${score} баллов`);

      // Минимальный порог для ВСЕХ паттернов (S/R зоны не обязательны)
      let minScore = 50;
      let thresholdLabel = '50';
      
      if (score >= minScore) {
        const quality = score >= 150 ? '⭐⭐⭐ PREMIUM' : '⭐⭐ GOOD';
        console.log(`   ✅ ${quality} - сигнал ПРИНЯТ!\n`);
        results.push(pattern);
      } else {
        console.log(`   ❌ ОТКЛОНЕН (score < ${thresholdLabel})\n`);
      }
    }

    console.log(`📊 [Pattern Detection] Total patterns passed filters: ${results.length}`);
    return results;
  }
}

export const patternDetector = new PatternDetector();
