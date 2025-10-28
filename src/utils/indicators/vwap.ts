/**
 * VWAP (Volume Weighted Average Price) calculation
 * For 1h timeframe
 */

import { binanceClient } from '../binanceClient';

/**
 * Calculate VWAP for given candles
 */
export function calculateVWAP(candles: any[]): number {
  let sumPV = 0; // Sum of (Price × Volume)
  let sumV = 0;  // Sum of Volume
  
  candles.forEach((candle) => {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    const volume = candle.volume;
    
    sumPV += typicalPrice * volume;
    sumV += volume;
  });
  
  return sumV > 0 ? sumPV / sumV : 0;
}

/**
 * Get VWAP for 1h timeframe (last 24 hours = 24 candles)
 */
export async function calculateVWAP1h(symbol: string): Promise<number> {
  try {
    const klines = await binanceClient.getKlines(symbol, '1h', 24);
    
    const candles = klines.map((k: any) => ({
      high: parseFloat(k.high),
      low: parseFloat(k.low),
      close: parseFloat(k.close),
      volume: parseFloat(k.volume),
    }));
    
    return calculateVWAP(candles);
  } catch (error) {
    console.error(`❌ [VWAP] Error calculating VWAP for ${symbol}:`, error);
    return 0;
  }
}

/**
 * Get VWAP position (above/below) for a symbol
 */
export async function getVWAPPosition(
  symbol: string,
  currentPrice?: number
): Promise<'above' | 'below'> {
  try {
    const vwap = await calculateVWAP1h(symbol);
    
    // If price not provided, fetch current price
    if (!currentPrice) {
      const klines = await binanceClient.getKlines(symbol, '1h', 1);
      currentPrice = parseFloat(klines[0].close);
    }
    
    return currentPrice > vwap ? 'above' : 'below';
  } catch (error) {
    console.error(`❌ [VWAP] Error getting position for ${symbol}:`, error);
    return 'below'; // Default fallback
  }
}
