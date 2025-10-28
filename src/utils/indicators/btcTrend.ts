/**
 * BTC Trend Detection (H1 timeframe)
 * 
 * Uses EMA200, ATR, ADX and price action to determine BTC market regime
 * Classification: up, down, neutral
 */

import { EMA, ATR, ADX } from 'technicalindicators';
import { binanceClient } from '../binanceClient';

// Configurable parameters
const NEUTRAL_BAND_ATR_MULTIPLIER = 0.25; // Neutral band = 0.25 × ATR(H1)
const ADX_MIN = 18; // Minimum ADX for trend confirmation
const SLOPE_WINDOW = 24; // 24 bars (1 day on H1)
const CONFIRM_BARS = 3; // Debounce: 3 consecutive bars
const LAST_N_BARS = 4; // Check last 4 bars for direction
const MIN_DIRECTIONAL_BARS = 3; // At least 3 out of 4 bars in same direction

interface BTCTrendResult {
  trend: 'up' | 'down' | 'neutral';
  ema200: number;
  atr: number;
  adx: number;
  price: number;
  confidence: number; // 0-1 score
}

/**
 * Get BTC 1h candles from Binance
 */
async function getBTCCandles1h(limit: number = 250): Promise<any[]> {
  try {
    const klines = await binanceClient.getKlines('BTCUSDT', '1h', limit);
    return klines.map((k: any) => ({
      time: k.openTime,
      open: parseFloat(k.open),
      high: parseFloat(k.high),
      low: parseFloat(k.low),
      close: parseFloat(k.close),
      volume: parseFloat(k.volume),
    }));
  } catch (error) {
    console.error('❌ [BTCTrend] Error fetching BTC candles:', error);
    throw error;
  }
}

/**
 * Detect BTC trend state
 */
export async function detectBTCTrend(): Promise<BTCTrendResult> {
  const candles = await getBTCCandles1h(250);
  
  // Extract OHLC data
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  
  const currentPrice = closes[closes.length - 1];
  
  // Calculate EMA200
  const ema200Values = EMA.calculate({ period: 200, values: closes });
  const currentEMA200 = ema200Values[ema200Values.length - 1];
  
  // Calculate ATR(14)
  const atrValues = ATR.calculate({
    period: 14,
    high: highs,
    low: lows,
    close: closes,
  });
  const currentATR = atrValues[atrValues.length - 1];
  
  // Calculate ADX(14)
  const adxValues = ADX.calculate({
    period: 14,
    high: highs,
    low: lows,
    close: closes,
  });
  const currentADX = adxValues[adxValues.length - 1].adx;
  
  // Neutral band
  const neutralBand = NEUTRAL_BAND_ATR_MULTIPLIER * currentATR;
  
  // Check conditions
  const distanceFromEMA = currentPrice - currentEMA200;
  const aboveEMA = distanceFromEMA >= neutralBand;
  const belowEMA = -distanceFromEMA >= neutralBand;
  const inNeutralZone = Math.abs(distanceFromEMA) < neutralBand;
  
  // EMA200 slope (growing or falling)
  const ema200Older = ema200Values[ema200Values.length - SLOPE_WINDOW];
  const emaGrowing = currentEMA200 > ema200Older;
  const emaFalling = currentEMA200 < ema200Older;
  
  // Direction of last N bars (3 out of 4)
  const lastNCloses = closes.slice(-LAST_N_BARS);
  let upBars = 0;
  let downBars = 0;
  
  for (let i = 1; i < lastNCloses.length; i++) {
    if (lastNCloses[i] > lastNCloses[i - 1]) upBars++;
    if (lastNCloses[i] < lastNCloses[i - 1]) downBars++;
  }
  
  const directionUp = upBars >= MIN_DIRECTIONAL_BARS;
  const directionDown = downBars >= MIN_DIRECTIONAL_BARS;
  
  // ADX strong enough
  const adxStrong = currentADX >= ADX_MIN;
  
  // Determine trend
  let trend: 'up' | 'down' | 'neutral' = 'neutral';
  let confidence = 0;
  
  // UP trend conditions
  if (aboveEMA && emaGrowing && directionUp && adxStrong) {
    trend = 'up';
    confidence = Math.min(1.0, currentADX / 30); // Higher ADX = higher confidence
  }
  // DOWN trend conditions
  else if (belowEMA && emaFalling && directionDown && adxStrong) {
    trend = 'down';
    confidence = Math.min(1.0, currentADX / 30);
  }
  // NEUTRAL (any condition fails)
  else {
    trend = 'neutral';
    confidence = Math.max(0.1, 1 - (currentADX / 30)); // Lower ADX in neutral
  }
  
  return {
    trend,
    ema200: currentEMA200,
    atr: currentATR,
    adx: currentADX,
    price: currentPrice,
    confidence,
  };
}

/**
 * Get EMA200 and VWAP position for any symbol
 */
export async function getEMA200Position(
  symbol: string,
  timeframe: '1h' = '1h'
): Promise<'above' | 'below' | 'crossing'> {
  try {
    const klines = await binanceClient.getKlines(symbol, timeframe, 210);
    const closes = klines.map((k: any) => parseFloat(k.close));
    const currentPrice = closes[closes.length - 1];
    
    const ema200Values = EMA.calculate({ period: 200, values: closes });
    const currentEMA200 = ema200Values[ema200Values.length - 1];
    const prevEMA200 = ema200Values[ema200Values.length - 2];
    
    // Check for crossing
    const priceAbove = currentPrice > currentEMA200;
    const priceWasBelow = closes[closes.length - 2] < prevEMA200;
    const priceBelow = currentPrice < currentEMA200;
    const priceWasAbove = closes[closes.length - 2] > prevEMA200;
    
    if ((priceAbove && priceWasBelow) || (priceBelow && priceWasAbove)) {
      return 'crossing';
    }
    
    return currentPrice > currentEMA200 ? 'above' : 'below';
  } catch (error) {
    console.error(`❌ [EMA200] Error for ${symbol}:`, error);
    return 'below'; // Default fallback
  }
}
