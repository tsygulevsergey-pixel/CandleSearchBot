/**
 * Context Analyzer - анализ рыночного контекста ПЕРЕД сигналом
 * 
 * Помогает понять:
 * - Был ли разворот тренда?
 * - В каком направлении шел график?
 * - Сколько было swing highs/lows?
 * - Насколько далеко от EMA?
 */

export interface Candle {
  high: number;
  low: number;
  close: number;
  open: number;
  openTime: number;
}

export interface ContextAnalysis {
  trendBefore: 'uptrend' | 'downtrend' | 'sideways';
  wasReversal: boolean;
  swingCount20: number;
  recentDirection: 'bullish' | 'bearish' | 'choppy';
  distanceFromEma: number; // % from EMA20
}

/**
 * Detect swing highs and lows in recent candles
 */
function detectSwingPoints(candles: Candle[]): { swingHighs: number; swingLows: number } {
  let swingHighs = 0;
  let swingLows = 0;
  
  // Need at least 3 candles to detect a swing (left, middle, right)
  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];
    
    // Swing High: curr.high > prev.high AND curr.high > next.high
    if (curr.high > prev.high && curr.high > next.high) {
      swingHighs++;
    }
    
    // Swing Low: curr.low < prev.low AND curr.low < next.low
    if (curr.low < prev.low && curr.low < next.low) {
      swingLows++;
    }
  }
  
  return { swingHighs, swingLows };
}

/**
 * Calculate EMA
 */
function calculateEMA(candles: Candle[], period: number): number {
  if (candles.length < period) {
    // Fallback to SMA if not enough data
    return candles.reduce((sum, c) => sum + c.close, 0) / candles.length;
  }
  
  const k = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period;
  
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
  }
  
  return ema;
}

/**
 * Analyze recent candle direction (last 10 candles)
 */
function analyzeRecentDirection(candles: Candle[]): 'bullish' | 'bearish' | 'choppy' {
  const recentCandles = candles.slice(-10);
  let bullish = 0;
  let bearish = 0;
  
  for (const candle of recentCandles) {
    if (candle.close > candle.open) {
      bullish++;
    } else if (candle.close < candle.open) {
      bearish++;
    }
  }
  
  // At least 60% in one direction = trending
  if (bullish >= 6) return 'bullish';
  if (bearish >= 6) return 'bearish';
  return 'choppy';
}

/**
 * Detect if there was a recent reversal
 * 
 * Logic:
 * - Look at last 20 candles
 * - Divide into two halves (first 10 vs last 10)
 * - If first 10 were bullish and last 10 are bearish (or vice versa) = reversal
 */
function detectReversal(candles: Candle[]): boolean {
  if (candles.length < 20) return false;
  
  const recent20 = candles.slice(-20);
  const first10 = recent20.slice(0, 10);
  const last10 = recent20.slice(10, 20);
  
  // Count bullish/bearish candles in each half
  const first10Bullish = first10.filter(c => c.close > c.open).length;
  const last10Bullish = last10.filter(c => c.close > c.open).length;
  
  // First half was bullish (>= 6 out of 10), last half is bearish (<= 4 out of 10)
  const bullishToBearis = first10Bullish >= 6 && last10Bullish <= 4;
  
  // First half was bearish (<= 4 out of 10), last half is bullish (>= 6 out of 10)
  const bearishToBullish = first10Bullish <= 4 && last10Bullish >= 6;
  
  return bullishToBearis || bearishToBullish;
}

/**
 * Main function: Analyze market context before signal
 */
export function analyzeContextBeforeSignal(
  candles: Candle[],
  entryPrice: number
): ContextAnalysis {
  console.log(`🔍 [ContextAnalyzer] Analyzing context with ${candles.length} candles...`);
  
  // Need at least 20 candles for proper analysis
  if (candles.length < 20) {
    console.warn(`⚠️ [ContextAnalyzer] Not enough candles (${candles.length}), returning default`);
    return {
      trendBefore: 'sideways',
      wasReversal: false,
      swingCount20: 0,
      recentDirection: 'choppy',
      distanceFromEma: 0,
    };
  }
  
  // 1. Detect trend using EMA20 vs EMA50
  const ema20 = calculateEMA(candles, 20);
  const ema50 = calculateEMA(candles, 50);
  const lastClose = candles[candles.length - 1].close;
  
  let trendBefore: 'uptrend' | 'downtrend' | 'sideways';
  if (ema20 > ema50 * 1.002) {
    // EMA20 > EMA50 by at least 0.2% = uptrend
    trendBefore = 'uptrend';
  } else if (ema20 < ema50 * 0.998) {
    // EMA20 < EMA50 by at least 0.2% = downtrend
    trendBefore = 'downtrend';
  } else {
    trendBefore = 'sideways';
  }
  
  // 2. Detect reversal
  const wasReversal = detectReversal(candles);
  
  // 3. Count swing points in last 20 candles
  const recent20 = candles.slice(-20);
  const { swingHighs, swingLows } = detectSwingPoints(recent20);
  const swingCount20 = swingHighs + swingLows;
  
  // 4. Recent direction
  const recentDirection = analyzeRecentDirection(candles);
  
  // 5. Distance from EMA20 (percentage)
  const distanceFromEma = ((entryPrice - ema20) / ema20) * 100;
  
  console.log(`✅ [ContextAnalyzer] Analysis complete:`, {
    trendBefore,
    wasReversal,
    swingCount20,
    recentDirection,
    distanceFromEma: `${distanceFromEma.toFixed(2)}%`,
    ema20: ema20.toFixed(8),
    ema50: ema50.toFixed(8),
  });
  
  return {
    trendBefore,
    wasReversal,
    swingCount20,
    recentDirection,
    distanceFromEma,
  };
}

/**
 * Determine if signal context is good or bad
 * 
 * BAD contexts:
 * - LONG signal on downtrend reversal (график шел DOWN → разворот → паттерн LONG)
 * - SHORT signal on uptrend reversal (график шел UP → разворот → паттерн SHORT)
 * - Signal direction opposite to recent direction
 * 
 * GOOD contexts:
 * - LONG on uptrend continuation
 * - SHORT on downtrend continuation
 * - Signal aligns with recent direction
 */
export function isGoodContext(
  signalDirection: 'LONG' | 'SHORT',
  context: ContextAnalysis
): { isGood: boolean; reason: string } {
  // BAD: Going against recent reversal
  if (context.wasReversal) {
    if (signalDirection === 'LONG' && context.recentDirection === 'bearish') {
      return {
        isGood: false,
        reason: 'LONG signal after bearish reversal (график развернулся DOWN)',
      };
    }
    if (signalDirection === 'SHORT' && context.recentDirection === 'bullish') {
      return {
        isGood: false,
        reason: 'SHORT signal after bullish reversal (график развернулся UP)',
      };
    }
  }
  
  // BAD: Going against trend
  if (signalDirection === 'LONG' && context.trendBefore === 'downtrend') {
    return {
      isGood: false,
      reason: 'LONG против downtrend',
    };
  }
  if (signalDirection === 'SHORT' && context.trendBefore === 'uptrend') {
    return {
      isGood: false,
      reason: 'SHORT против uptrend',
    };
  }
  
  // BAD: Too many swings = choppy market
  if (context.swingCount20 > 10) {
    return {
      isGood: false,
      reason: `Choppy market (${context.swingCount20} swings in 20 candles)`,
    };
  }
  
  // GOOD: Aligns with trend and recent direction
  return {
    isGood: true,
    reason: 'Good context: signal aligns with trend and recent direction',
  };
}
