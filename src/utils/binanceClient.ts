import axios, { AxiosInstance } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { binanceRateLimiter } from './rateLimiter';

const BINANCE_FUTURES_API = 'https://fapi.binance.com';

// Создаем axios instance с прокси (если указан в environment)
function createAxiosInstance(): AxiosInstance {
  const proxyUrl = process.env.PROXY_URL;
  
  if (proxyUrl) {
    console.log(`🔒 [BinanceClient] Using proxy: ${proxyUrl.replace(/:[^:@]+@/, ':****@')}`); // Скрываем пароль в логах
    const httpsAgent = new HttpsProxyAgent(proxyUrl);
    return axios.create({
      httpsAgent,
      timeout: 30000,
    });
  }
  
  console.log('🌐 [BinanceClient] No proxy configured, using direct connection');
  return axios.create({ timeout: 30000 });
}

const axiosInstance = createAxiosInstance();

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
      return await axiosInstance.get(`${BINANCE_FUTURES_API}/fapi/v1/ticker/24hr`);
    });

    binanceRateLimiter.updateWeightFromResponse(response.headers);

    const tickers: Ticker24hr[] = response.data;
    const usdtPairs = tickers
      .filter((ticker) => ticker.symbol.endsWith('USDT'))
      .filter((ticker) => parseFloat(ticker.quoteVolume) > 10_000_000) // More pairs to scan
      .map((ticker) => ticker.symbol);

    console.log(`✅ [BinanceClient] Found ${usdtPairs.length} USDT pairs with volume > 10M`);
    return usdtPairs;
  }

  async getKlines(
    symbol: string, 
    interval: string, 
    limit: number = 3,
    includeOpenCandle: boolean = false
  ): Promise<Candle[]> {
    // Request one extra candle if we need to exclude the open candle
    const requestLimit = includeOpenCandle ? limit : limit + 1;
    const candleType = includeOpenCandle ? 'including current open candle' : 'excluding current open candle';
    console.log(`📈 [BinanceClient] Fetching ${requestLimit} ${interval} candles for ${symbol} (${candleType})...`);
    
    const response = await binanceRateLimiter.executeRequest(1, async () => {
      return await axiosInstance.get(`${BINANCE_FUTURES_API}/fapi/v1/klines`, {
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

    // Return all candles (including open) or only closed candles
    const candles = includeOpenCandle ? allCandles : allCandles.slice(0, -1);
    console.log(`✅ [BinanceClient] Returning ${candles.length} candles (${candleType})`);
    
    return candles;
  }

  async getKlinesInRange(
    symbol: string,
    interval: string,
    startTime: number,
    endTime: number,
    limit: number = 500
  ): Promise<Candle[]> {
    console.log(`📈 [BinanceClient] Fetching ${interval} candles for ${symbol} from ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}...`);
    
    const response = await binanceRateLimiter.executeRequest(1, async () => {
      return await axiosInstance.get(`${BINANCE_FUTURES_API}/fapi/v1/klines`, {
        params: {
          symbol,
          interval,
          startTime,
          endTime,
          limit,
        },
      });
    });

    binanceRateLimiter.updateWeightFromResponse(response.headers);

    const candles: Candle[] = response.data.map((k: any) => ({
      openTime: k[0],
      open: k[1],
      high: k[2],
      low: k[3],
      close: k[4],
      volume: k[5],
      closeTime: k[6],
    }));

    console.log(`✅ [BinanceClient] Fetched ${candles.length} candles in range`);
    return candles;
  }

  async getCurrentPrice(symbol: string): Promise<number> {
    console.log(`💰 [BinanceClient] Fetching current price for ${symbol}...`);
    
    const response = await binanceRateLimiter.executeRequest(1, async () => {
      return await axiosInstance.get(`${BINANCE_FUTURES_API}/fapi/v1/ticker/price`, {
        params: { symbol },
      });
    });

    binanceRateLimiter.updateWeightFromResponse(response.headers);

    return parseFloat(response.data.price);
  }
}

export const binanceClient = new BinanceClient();
