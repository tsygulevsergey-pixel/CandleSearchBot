/**
 * Trend Detection Module
 * 
 * Determines trend direction on a single timeframe without using higher timeframes.
 * Uses professional trader methods:
 * 1. EMA 20/50 crossover and position
 * 2. Swing structure (Higher Highs/Higher Lows vs Lower Highs/Lower Lows)
 * 3. Price position relative to EMAs
 */

export interface TrendResult {
  direction: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
  strength: number; // 0-100 (confidence in trend)
  ema20: number;
  ema50: number;
  details: {
    emaAlignment: boolean; // true if EMAs are aligned with trend
    priceVsEma: boolean; // true if price is on correct side of EMAs
    swingStructure: 'HH/HL' | 'LH/LL' | 'RANGE';
  };
}

interface Candle {
  high: number;
  low: number;
  close: number;
  open: number;
  timestamp?: number;
}

/**
 * Calculate Exponential Moving Average
 */
function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) {
    throw new Error(`Not enough data for EMA${period}. Need ${period}, got ${prices.length}`);
  }

  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b) / period;

  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }

  return ema;
}

/**
 * Identify swing highs and lows in recent candles
 */
function analyzeSwingStructure(candles: Candle[], lookback: number = 15): 'HH/HL' | 'LH/LL' | 'RANGE' {
  if (candles.length < lookback) {
    return 'RANGE';
  }

  const recentCandles = candles.slice(-lookback);
  
  // Find significant swing points (local highs and lows)
  const swingHighs: number[] = [];
  const swingLows: number[] = [];

  for (let i = 2; i < recentCandles.length - 2; i++) {
    const current = recentCandles[i];
    const prev1 = recentCandles[i - 1];
    const prev2 = recentCandles[i - 2];
    const next1 = recentCandles[i + 1];
    const next2 = recentCandles[i + 2];

    // Swing high: current high is higher than 2 candles before and after
    if (
      current.high > prev1.high &&
      current.high > prev2.high &&
      current.high > next1.high &&
      current.high > next2.high
    ) {
      swingHighs.push(current.high);
    }

    // Swing low: current low is lower than 2 candles before and after
    if (
      current.low < prev1.low &&
      current.low < prev2.low &&
      current.low < next1.low &&
      current.low < next2.low
    ) {
      swingLows.push(current.low);
    }
  }

  // Need at least 2 swing points to determine structure
  if (swingHighs.length < 2 && swingLows.length < 2) {
    return 'RANGE';
  }

  // Check for Higher Highs and Higher Lows (UPTREND)
  const hasHigherHighs = swingHighs.length >= 2 && swingHighs[swingHighs.length - 1] > swingHighs[0];
  const hasHigherLows = swingLows.length >= 2 && swingLows[swingLows.length - 1] > swingLows[0];

  if (hasHigherHighs && hasHigherLows) {
    return 'HH/HL'; // Clear uptrend structure
  }

  // Check for Lower Highs and Lower Lows (DOWNTREND)
  const hasLowerHighs = swingHighs.length >= 2 && swingHighs[swingHighs.length - 1] < swingHighs[0];
  const hasLowerLows = swingLows.length >= 2 && swingLows[swingLows.length - 1] < swingLows[0];

  if (hasLowerHighs && hasLowerLows) {
    return 'LH/LL'; // Clear downtrend structure
  }

  return 'RANGE'; // Mixed or unclear structure
}

/**
 * Detect trend on a single timeframe using professional methods
 * 
 * @param candles - Array of candles (at least 50+ for reliable EMA50)
 * @param currentPrice - Current close price
 * @returns TrendResult with direction, strength, and details
 */
export function detectTrend(candles: Candle[], currentPrice?: number): TrendResult {
  if (candles.length < 50) {
    console.warn(`⚠️ [TrendDetector] Not enough candles for reliable trend detection. Need 50+, got ${candles.length}`);
    return {
      direction: 'SIDEWAYS',
      strength: 0,
      ema20: 0,
      ema50: 0,
      details: {
        emaAlignment: false,
        priceVsEma: false,
        swingStructure: 'RANGE',
      },
    };
  }

  const closePrices = candles.map((c) => c.close);
  const price = currentPrice || closePrices[closePrices.length - 1];

  // Calculate EMAs
  const ema20 = calculateEMA(closePrices, 20);
  const ema50 = calculateEMA(closePrices, 50);

  // Analyze swing structure
  const swingStructure = analyzeSwingStructure(candles, 15);

  // ✅ BALANCED TREND LOGIC: EMA alignment + price above at least ONE EMA
  // UPTREND: (EMA20 > EMA50) AND (Price > EMA20 OR Price > EMA50)
  // DOWNTREND: (EMA20 < EMA50) AND (Price < EMA20 OR Price < EMA50)
  // This allows pullbacks to ONE EMA while filtering price below BOTH EMAs
  let direction: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS' = 'SIDEWAYS';
  let strength = 0;

  // Factor 1: EMA alignment (PRIMARY FACTOR)
  const emaAlignedUp = ema20 > ema50;
  const emaAlignedDown = ema20 < ema50;
  
  // Calculate EMA separation (how strong is the trend)
  const emaSeparation = Math.abs((ema20 - ema50) / ema50) * 100; // in %

  // Factor 2: Price position (REQUIRED for trend direction)
  const priceAboveEma20 = price > ema20;
  const priceBelowEma20 = price < ema20;
  const priceAboveEma50 = price > ema50;
  const priceBelowEma50 = price < ema50;

  // Factor 3: Swing structure (OPTIONAL - for strength boost only)
  const swingUp = swingStructure === 'HH/HL';
  const swingDown = swingStructure === 'LH/LL';

  // ✅ UPTREND: EMA20 > EMA50 AND price above at least ONE EMA
  if (emaAlignedUp && emaSeparation > 0.2 && (priceAboveEma20 || priceAboveEma50)) {
    direction = 'UPTREND';
    strength = 50; // Base strength for EMA alignment

    // Boost strength based on EMA separation
    if (emaSeparation > 1.0) {
      strength += 20; // Strong separation
    } else if (emaSeparation > 0.5) {
      strength += 10; // Moderate separation
    }

    // Boost if price above BOTH EMAs (clean trend continuation)
    if (priceAboveEma20 && priceAboveEma50) {
      strength += 10;
    }

    // Boost if swing structure confirms
    if (swingUp) {
      strength += 10;
    }
  }
  // ✅ DOWNTREND: EMA20 < EMA50 AND price below at least ONE EMA
  else if (emaAlignedDown && emaSeparation > 0.2 && (priceBelowEma20 || priceBelowEma50)) {
    direction = 'DOWNTREND';
    strength = 50; // Base strength for EMA alignment

    // Boost strength based on EMA separation
    if (emaSeparation > 1.0) {
      strength += 20; // Strong separation
    } else if (emaSeparation > 0.5) {
      strength += 10; // Moderate separation
    }

    // Boost if price below BOTH EMAs (clean trend continuation)
    if (priceBelowEma20 && priceBelowEma50) {
      strength += 10;
    }

    // Boost if swing structure confirms
    if (swingDown) {
      strength += 10;
    }
  }
  // SIDEWAYS: EMAs too close OR price violates BOTH EMA checks
  else {
    direction = 'SIDEWAYS';
    strength = 0;
  }

  // Cap strength at 100
  strength = Math.min(strength, 100);

  console.log(`📈 [TrendDetector] Trend Analysis:`, {
    direction,
    strength: `${strength}%`,
    price: price.toFixed(2),
    ema20: ema20.toFixed(2),
    ema50: ema50.toFixed(2),
    emaSeparation: `${emaSeparation.toFixed(2)}%`,
    emaAlignment: emaAlignedUp ? 'UP' : emaAlignedDown ? 'DOWN' : 'NEUTRAL',
    priceVsEma20: priceAboveEma20 ? 'ABOVE' : 'BELOW',
    priceVsEma50: priceAboveEma50 ? 'ABOVE' : 'BELOW',
    swingStructure,
    note: direction !== 'SIDEWAYS' 
      ? '✅ Price above at least ONE EMA - pullback allowed!' 
      : 'EMAs too close OR price below both EMAs',
  });

  return {
    direction,
    strength,
    ema20,
    ema50,
    details: {
      emaAlignment: direction === 'UPTREND' ? emaAlignedUp : emaAlignedDown,
      // ✅ FIX: priceVsEma should reflect new OR condition (at least ONE EMA)
      priceVsEma: direction === 'UPTREND' 
        ? (priceAboveEma20 || priceAboveEma50)  // UPTREND: price above at least one EMA
        : (priceBelowEma20 || priceBelowEma50), // DOWNTREND: price below at least one EMA
      swingStructure,
    },
  };
}

/**
 * Check if pattern direction aligns with trend
 * 
 * @param patternDirection - 'LONG' or 'SHORT'
 * @param trend - TrendResult from detectTrend()
 * @param minStrength - Minimum trend strength to require (default: 60)
 * @returns true if pattern aligns with strong trend
 */
export function isPatternWithTrend(
  patternDirection: 'LONG' | 'SHORT',
  trend: TrendResult,
  minStrength: number = 60
): boolean {
  // Pattern must align with trend direction
  const alignedDirection =
    (patternDirection === 'LONG' && trend.direction === 'UPTREND') ||
    (patternDirection === 'SHORT' && trend.direction === 'DOWNTREND');

  // Trend must be strong enough
  const strongTrend = trend.strength >= minStrength;

  const result = alignedDirection && strongTrend;

  console.log(`🔍 [TrendDetector] Pattern alignment check:`, {
    patternDirection,
    trendDirection: trend.direction,
    trendStrength: `${trend.strength}%`,
    minStrength: `${minStrength}%`,
    aligned: alignedDirection,
    strongEnough: strongTrend,
    result: result ? '✅ WITH TREND' : '❌ AGAINST TREND',
  });

  return result;
}
