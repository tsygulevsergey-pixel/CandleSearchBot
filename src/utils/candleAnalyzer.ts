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

export interface SRZone {
  type: 'support' | 'resistance';
  price: number;
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
 */
function clusterLevels(levels: number[], tolerance: number = 0.005): SRZone[] {
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
        
        zones.push({
          type: 'support', // Тип определим позже
          price: avgPrice,
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
    
    zones.push({
      type: 'support',
      price: avgPrice,
      touches,
      strength,
    });
  }
  
  return zones;
}

/**
 * Анализ S/R зон на основе 200 свечей
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
    console.log(`   📍 Nearest Support: ${nearestSupport.price.toFixed(4)} (${nearestSupport.touches} touches, ${nearestSupport.strength})`);
  }
  if (nearestResistance) {
    console.log(`   📍 Nearest Resistance: ${nearestResistance.price.toFixed(4)} (${nearestResistance.touches} touches, ${nearestResistance.strength})`);
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
 */
export function getDistanceToZone(price: number, zone: SRZone | null): number | null {
  if (!zone) return null;
  return Math.abs(price - zone.price) / zone.price;
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

    // Анализ тренда (EMA 50/200)
    const trend = analyzeTrend(candles);
    
    // Анализ S/R зон
    const srAnalysis = analyzeSRZones(candles);
    
    // Проверка объема
    const hasGoodVolume = isVolumeAboveAverage(candles);
    if (!hasGoodVolume) {
      console.log(`❌ [Filter] REJECTED - Volume below average, skipping all patterns`);
      return results;
    }

    // Детектируем паттерны и оцениваем их
    const patterns = [
      this.detectPinBar(candles),
      this.detectFakey(candles),
      this.detectPPR(candles),
      this.detectEngulfing(candles),
    ];

    for (const pattern of patterns) {
      if (!pattern.detected || !pattern.direction || !pattern.entryPrice) continue;

      // Добавляем S/R анализ к паттерну
      pattern.srAnalysis = srAnalysis;

      // === SCORING SYSTEM ===
      let score = 0;
      const patternName = pattern.type?.replace('_buy', '').replace('_sell', '').toUpperCase();
      
      console.log(`\n💯 [Scoring] ${patternName} ${pattern.direction}:`);

      // 1️⃣ S/R ZONE SCORE (КРИТИЧНЫЙ GATING ФИЛЬТР)
      const distanceToSupport = getDistanceToZone(pattern.entryPrice, srAnalysis.nearestSupport);
      const distanceToResistance = getDistanceToZone(pattern.entryPrice, srAnalysis.nearestResistance);
      
      const isNearSupport = distanceToSupport !== null && distanceToSupport < 0.005; // < 0.5%
      const isNearResistance = distanceToResistance !== null && distanceToResistance < 0.005;

      // GATING: Отклоняем паттерны у НЕПРАВИЛЬНОЙ зоны
      if (pattern.direction === 'LONG') {
        if (isNearResistance && !isNearSupport) {
          // LONG у Resistance - REJECT
          console.log(`   ❌ S/R GATING: REJECT - LONG у Resistance зоны (неправильная сторона)\n`);
          continue;
        }
        if (isNearSupport) {
          score += 100;
          console.log(`   ✅ S/R: +100 (у Support зоны ${srAnalysis.nearestSupport?.price.toFixed(4)})`);
        } else {
          score += 50;
          console.log(`   ⚠️ S/R: +50 (НЕ у зоны - слабый сигнал)`);
        }
      } else { // SHORT
        if (isNearSupport && !isNearResistance) {
          // SHORT у Support - REJECT
          console.log(`   ❌ S/R GATING: REJECT - SHORT у Support зоны (неправильная сторона)\n`);
          continue;
        }
        if (isNearResistance) {
          score += 100;
          console.log(`   ✅ S/R: +100 (у Resistance зоны ${srAnalysis.nearestResistance?.price.toFixed(4)})`);
        } else {
          score += 50;
          console.log(`   ⚠️ S/R: +50 (НЕ у зоны - слабый сигнал)`);
        }
      }

      // 2️⃣ EMA TREND SCORE
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
        console.log(`   ❌ Trend: +0 (против тренда)`);
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

      // Минимальный порог: 130 баллов (GOOD signal)
      if (score >= 130) {
        const quality = score >= 150 ? '⭐⭐⭐ PREMIUM' : '⭐⭐ GOOD';
        console.log(`   ✅ ${quality} - сигнал ПРИНЯТ!\n`);
        results.push(pattern);
      } else {
        console.log(`   ❌ ОТКЛОНЕН (score < 130)\n`);
      }
    }

    console.log(`📊 [Pattern Detection] Total patterns passed filters: ${results.length}`);
    return results;
  }
}

export const patternDetector = new PatternDetector();
