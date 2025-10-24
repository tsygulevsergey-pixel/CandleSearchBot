import { Candle } from './binanceClient';

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
 */
export function analyzeTrend(candles: Candle[]): TrendAnalysis {
  const ema50 = calculateEMA(candles, 50);
  const ema200 = calculateEMA(candles, 200);
  const currentPrice = parseFloat(candles[candles.length - 1].close);

  const isUptrend = currentPrice > ema50 && ema50 > ema200;
  const isDowntrend = currentPrice < ema50 && ema50 < ema200;

  console.log(`📊 [Trend] Price: ${currentPrice.toFixed(2)}, EMA50: ${ema50.toFixed(2)}, EMA200: ${ema200.toFixed(2)} | Uptrend: ${isUptrend}, Downtrend: ${isDowntrend}`);

  return {
    ema50,
    ema200,
    isUptrend,
    isDowntrend,
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

  const isAboveAverage = currentVolume > avgVolume;

  console.log(`📊 [Volume] Current: ${currentVolume.toFixed(0)}, Avg(${last20Volumes.length}): ${avgVolume.toFixed(0)} | Above avg: ${isAboveAverage}`);

  return isAboveAverage;
}

export interface PatternResult {
  detected: boolean;
  type?: 'pinbar_buy' | 'pinbar_sell' | 'fakey_buy' | 'fakey_sell' | 'ppr_buy' | 'ppr_sell' | 'engulfing_buy' | 'engulfing_sell';
  direction?: 'LONG' | 'SHORT';
  entryPrice?: number;
}

export class PatternDetector {
  detectPinBar(candles: Candle[]): PatternResult {
    if (candles.length < 1) return { detected: false };

    const C0 = analyzeCand(candles[candles.length - 1]);

    // ЛОНГ: Зеленая свеча, длинный нижний фитиль
    if (C0.lowerWick >= 2 * C0.body && C0.lowerWick >= 2 * C0.upperWick) {
      const upperThird = C0.low + 0.66 * C0.range;
      const closeInUpperThird = C0.close >= upperThird;
      const smallBody = C0.body <= 0.35 * C0.range;

      if (closeInUpperThird && smallBody && C0.isGreen) {
        console.log(`✅ [Pattern] Pin Bar BUY detected (GREEN candle)`);
        return {
          detected: true,
          type: 'pinbar_buy',
          direction: 'LONG',
          entryPrice: C0.close,
        };
      }
    }

    // ШОРТ: Красная свеча, длинный верхний фитиль
    if (C0.upperWick >= 2 * C0.body && C0.upperWick >= 2 * C0.lowerWick) {
      const lowerThird = C0.high - 0.66 * C0.range;
      const closeInLowerThird = C0.close <= lowerThird;
      const smallBody = C0.body <= 0.35 * C0.range;

      if (closeInLowerThird && smallBody && C0.isRed) {
        console.log(`✅ [Pattern] Pin Bar SELL detected (RED candle)`);
        return {
          detected: true,
          type: 'pinbar_sell',
          direction: 'SHORT',
          entryPrice: C0.close,
        };
      }
    }

    return { detected: false };
  }

  detectFakey(candles: Candle[]): PatternResult {
    if (candles.length < 3) return { detected: false };

    const C0 = analyzeCand(candles[candles.length - 1]);
    const C1 = analyzeCand(candles[candles.length - 2]);
    const C2 = analyzeCand(candles[candles.length - 3]);

    const isC1Inside = C1.high <= C2.high && C1.low >= C2.low;

    if (!isC1Inside) return { detected: false };

    const probeBelow = C0.low < C1.low;
    const closeAbove = C0.close > C1.high;

    // ЛОНГ: C2 зеленая, C1 красная, C0 зеленая
    if (probeBelow && closeAbove && C2.isGreen && C1.isRed && C0.isGreen) {
      console.log(`✅ [Pattern] Fakey BUY detected (GREEN-RED-GREEN)`);
      return {
        detected: true,
        type: 'fakey_buy',
        direction: 'LONG',
        entryPrice: C0.close,
      };
    }

    const probeAbove = C0.high > C1.high;
    const closeBelow = C0.close < C1.low;

    // ШОРТ: C2 красная, C1 зеленая, C0 красная
    if (probeAbove && closeBelow && C2.isRed && C1.isGreen && C0.isRed) {
      console.log(`✅ [Pattern] Fakey SELL detected (RED-GREEN-RED)`);
      return {
        detected: true,
        type: 'fakey_sell',
        direction: 'SHORT',
        entryPrice: C0.close,
      };
    }

    return { detected: false };
  }

  detectPPR(candles: Candle[]): PatternResult {
    if (candles.length < 2) return { detected: false };

    const C0 = analyzeCand(candles[candles.length - 1]);
    const C1 = analyzeCand(candles[candles.length - 2]);

    // ЛОНГ: C1 красная, C0 зеленая, закрепляется выше максимума
    if (C0.close > C1.high && C1.isRed && C0.isGreen) {
      console.log(`✅ [Pattern] ППР BUY detected (RED->GREEN)`);
      return {
        detected: true,
        type: 'ppr_buy',
        direction: 'LONG',
        entryPrice: C0.close,
      };
    }

    // ШОРТ: C1 зеленая, C0 красная, закрепляется ниже минимума
    if (C0.close < C1.low && C1.isGreen && C0.isRed) {
      console.log(`✅ [Pattern] ППР SELL detected (GREEN->RED)`);
      return {
        detected: true,
        type: 'ppr_sell',
        direction: 'SHORT',
        entryPrice: C0.close,
      };
    }

    return { detected: false };
  }

  detectEngulfing(candles: Candle[]): PatternResult {
    if (candles.length < 2) return { detected: false };

    const C0 = analyzeCand(candles[candles.length - 1]);
    const C1 = analyzeCand(candles[candles.length - 2]);

    const engulfs = C0.high >= C1.high && C0.low <= C1.low;

    if (engulfs && C0.isGreen && C1.isRed) {
      const strongBody = C0.body >= C1.body && C0.close > C1.open;
      if (strongBody) {
        console.log(`✅ [Pattern] Engulfing BUY detected`);
        return {
          detected: true,
          type: 'engulfing_buy',
          direction: 'LONG',
          entryPrice: C0.close,
        };
      }
    }

    if (engulfs && C0.isRed && C1.isGreen) {
      const strongBody = C0.body >= C1.body && C0.close < C1.open;
      if (strongBody) {
        console.log(`✅ [Pattern] Engulfing SELL detected`);
        return {
          detected: true,
          type: 'engulfing_sell',
          direction: 'SHORT',
          entryPrice: C0.close,
        };
      }
    }

    return { detected: false };
  }

  detectAllPatterns(candles: Candle[]): PatternResult[] {
    console.log(`\n🔍 [Pattern Detection] Starting pattern detection with ${candles.length} candles`);
    
    const results: PatternResult[] = [];

    // Фильтр 1: Анализ тренда (EMA 50/200)
    const trend = analyzeTrend(candles);
    
    // Фильтр 2: Проверка объема
    const hasGoodVolume = isVolumeAboveAverage(candles);
    if (!hasGoodVolume) {
      console.log(`❌ [Filter] REJECTED - Volume below average, skipping all patterns`);
      return results;
    }

    // Детектируем паттерны
    const pinBar = this.detectPinBar(candles);
    if (pinBar.detected && pinBar.direction) {
      // Фильтр 3: Проверка направления тренда
      const trendAligned = 
        (pinBar.direction === 'LONG' && trend.isUptrend) ||
        (pinBar.direction === 'SHORT' && trend.isDowntrend);

      if (!trendAligned) {
        console.log(`❌ [Filter] Pin Bar ${pinBar.direction} REJECTED - against trend (Uptrend: ${trend.isUptrend}, Downtrend: ${trend.isDowntrend})`);
      } else {
        // Фильтр 4: Проверка резких движений
        const hasSharpMove = hasSharpMoveBefore(candles, pinBar.direction);
        if (hasSharpMove) {
          console.log(`❌ [Filter] Pin Bar ${pinBar.direction} REJECTED - sharp move detected (profit-taking pattern)`);
        } else {
          console.log(`✅ [Filter] Pin Bar ${pinBar.direction} PASSED all filters!`);
          results.push(pinBar);
        }
      }
    }

    const fakey = this.detectFakey(candles);
    if (fakey.detected && fakey.direction) {
      const trendAligned = 
        (fakey.direction === 'LONG' && trend.isUptrend) ||
        (fakey.direction === 'SHORT' && trend.isDowntrend);

      if (!trendAligned) {
        console.log(`❌ [Filter] Fakey ${fakey.direction} REJECTED - against trend`);
      } else {
        const hasSharpMove = hasSharpMoveBefore(candles, fakey.direction);
        if (hasSharpMove) {
          console.log(`❌ [Filter] Fakey ${fakey.direction} REJECTED - sharp move detected`);
        } else {
          console.log(`✅ [Filter] Fakey ${fakey.direction} PASSED all filters!`);
          results.push(fakey);
        }
      }
    }

    const ppr = this.detectPPR(candles);
    if (ppr.detected && ppr.direction) {
      const trendAligned = 
        (ppr.direction === 'LONG' && trend.isUptrend) ||
        (ppr.direction === 'SHORT' && trend.isDowntrend);

      if (!trendAligned) {
        console.log(`❌ [Filter] PPR ${ppr.direction} REJECTED - against trend`);
      } else {
        const hasSharpMove = hasSharpMoveBefore(candles, ppr.direction);
        if (hasSharpMove) {
          console.log(`❌ [Filter] PPR ${ppr.direction} REJECTED - sharp move detected`);
        } else {
          console.log(`✅ [Filter] PPR ${ppr.direction} PASSED all filters!`);
          results.push(ppr);
        }
      }
    }

    const engulfing = this.detectEngulfing(candles);
    if (engulfing.detected && engulfing.direction) {
      const trendAligned = 
        (engulfing.direction === 'LONG' && trend.isUptrend) ||
        (engulfing.direction === 'SHORT' && trend.isDowntrend);

      if (!trendAligned) {
        console.log(`❌ [Filter] Engulfing ${engulfing.direction} REJECTED - against trend`);
      } else {
        const hasSharpMove = hasSharpMoveBefore(candles, engulfing.direction);
        if (hasSharpMove) {
          console.log(`❌ [Filter] Engulfing ${engulfing.direction} REJECTED - sharp move detected`);
        } else {
          console.log(`✅ [Filter] Engulfing ${engulfing.direction} PASSED all filters!`);
          results.push(engulfing);
        }
      }
    }

    console.log(`📊 [Pattern Detection] Total patterns passed filters: ${results.length}`);
    return results;
  }
}

export const patternDetector = new PatternDetector();
