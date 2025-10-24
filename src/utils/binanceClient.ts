import axios, { AxiosResponse } from 'axios';
import { binanceRateLimiter } from './rateLimiter';

const BINANCE_FUTURES_API = 'https://fapi.binance.com';

export interface Candle {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
}

export interface Ticker24hr {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  lastPrice: string;
  lastQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
}

export class BinanceClient {
  async getTradingPairs(): Promise<string[]> {
    console.log('📊 [BinanceClient] Fetching trading pairs from Binance...');
    
    const response = await binanceRateLimiter.executeRequest(40, async () => {
      return await axios.get(`${BINANCE_FUTURES_API}/fapi/v1/ticker/24hr`);
    });

    binanceRateLimiter.updateWeightFromResponse(response.headers);

    const tickers: Ticker24hr[] = response.data;
    const usdtPairs = tickers
      .filter((ticker) => ticker.symbol.endsWith('USDT'))
      .filter((ticker) => parseFloat(ticker.quoteVolume) > 20_000_000)
      .map((ticker) => ticker.symbol);

    console.log(`✅ [BinanceClient] Found ${usdtPairs.length} USDT pairs with volume > 20M`);
    return usdtPairs;
  }

  async getKlines(symbol: string, interval: string, limit: number = 3): Promise<Candle[]> {
    // Request one extra candle because the last one is always the current OPEN candle
    const requestLimit = limit + 1;
    console.log(`📈 [BinanceClient] Fetching ${requestLimit} ${interval} candles for ${symbol} (excluding current open candle)...`);
    
    const response = await binanceRateLimiter.executeRequest(1, async () => {
      return await axios.get(`${BINANCE_FUTURES_API}/fapi/v1/klines`, {
        params: {
          symbol,
          interval,
          limit: requestLimit,
        },
      });
    });

    binanceRateLimiter.updateWeightFromResponse(response.headers);

    const allCandles: Candle[] = response.data.map((k: any) => ({
      openTime: k[0],
      open: k[1],
      high: k[2],
      low: k[3],
      close: k[4],
      volume: k[5],
      closeTime: k[6],
    }));

    // Remove the last candle (current open candle) and return only CLOSED candles
    const closedCandles = allCandles.slice(0, -1);
    console.log(`✅ [BinanceClient] Returning ${closedCandles.length} CLOSED candles (excluded current open candle)`);
    
    return closedCandles;
  }

  async getCurrentPrice(symbol: string): Promise<number> {
    console.log(`💰 [BinanceClient] Fetching current price for ${symbol}...`);
    
    const response = await binanceRateLimiter.executeRequest(1, async () => {
      return await axios.get(`${BINANCE_FUTURES_API}/fapi/v1/ticker/price`, {
        params: { symbol },
      });
    });

    binanceRateLimiter.updateWeightFromResponse(response.headers);

    return parseFloat(response.data.price);
  }
}

export const binanceClient = new BinanceClient();
