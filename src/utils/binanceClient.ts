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

    const price = parseFloat(response.data.price);
    
    // ✅ CRITICAL: Validate price to prevent MFE/MAE corruption
    // If price is 0, NaN, or Infinity, it will corrupt MFE calculations and prevent trailing stop activation
    if (price <= 0 || isNaN(price) || !isFinite(price)) {
      console.error(`❌ [BinanceClient] INVALID price from API: ${price} for ${symbol}`);
      console.error(`   ⚠️ This will corrupt MFE/MAE calculations - using fallback price`);
      
      // Fallback: Get mid-price from recent 1m candle (more reliable than ticker)
      try {
        console.log(`🔄 [BinanceClient] Attempting fallback: fetching recent 1m candle for ${symbol}...`);
        const candles = await this.getKlines(symbol, '1m', 1, true);
        
        if (candles.length === 0) {
          throw new Error(`No candles available for ${symbol}`);
        }
        
        const lastCandle = candles[candles.length - 1];
        const fallbackPrice = (parseFloat(lastCandle.high) + parseFloat(lastCandle.low)) / 2;
        
        // Validate fallback price
        if (fallbackPrice <= 0 || isNaN(fallbackPrice) || !isFinite(fallbackPrice)) {
          throw new Error(`Fallback price also invalid: ${fallbackPrice}`);
        }
        
        console.log(`✅ [BinanceClient] Using fallback mid-price: ${fallbackPrice} for ${symbol}`);
        console.log(`   📊 Candle: H=${lastCandle.high}, L=${lastCandle.low}, Mid=${fallbackPrice}`);
        
        return fallbackPrice;
      } catch (fallbackError: any) {
        console.error(`❌ [BinanceClient] Fallback price fetch FAILED: ${fallbackError.message}`);
        console.error(`   ⚠️ CRITICAL: No valid price available for ${symbol} - throwing error`);
        throw new Error(`Failed to get valid price for ${symbol}: API returned ${price}, fallback failed: ${fallbackError.message}`);
      }
    }
    
    console.log(`✅ [BinanceClient] Valid price: ${price} for ${symbol}`);
    return price;
  }
}

export const binanceClient = new BinanceClient();
