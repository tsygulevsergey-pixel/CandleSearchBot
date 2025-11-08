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
    
    // Step 1: Get exchangeInfo to filter only TRADING pairs (excludes delisted coins)
    const exchangeInfoResponse = await binanceRateLimiter.executeRequest(10, async () => {
      return await axiosInstance.get(`${BINANCE_FUTURES_API}/fapi/v1/exchangeInfo`);
    });
    binanceRateLimiter.updateWeightFromResponse(exchangeInfoResponse.headers);
    
    const activeSymbols = new Set(
      exchangeInfoResponse.data.symbols
        .filter((s: any) => 
          s.status === 'TRADING' && 
          s.contractType === 'PERPETUAL' &&
          s.symbol.endsWith('USDT')
        )
        .map((s: any) => s.symbol)
    );
    
    console.log(`✅ [BinanceClient] Found ${activeSymbols.size} active USDT perpetual futures`);
    
    // Step 2: Get 24hr tickers for volume filtering
    const response = await binanceRateLimiter.executeRequest(40, async () => {
      return await axiosInstance.get(`${BINANCE_FUTURES_API}/fapi/v1/ticker/24hr`);
    });

    binanceRateLimiter.updateWeightFromResponse(response.headers);

    const tickers: Ticker24hr[] = response.data;
    const usdtPairs = tickers
      .filter((ticker) => activeSymbols.has(ticker.symbol)) // Only active TRADING pairs
      .filter((ticker) => parseFloat(ticker.quoteVolume) > 10_000_000) // Volume > 10M
      .map((ticker) => ticker.symbol);

    console.log(`✅ [BinanceClient] Found ${usdtPairs.length} active USDT pairs with volume > 10M`);
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

  async getOrderBook(symbol: string, limit: number = 500): Promise<any> {
    console.log(`📖 [BinanceClient] Fetching order book for ${symbol} (limit: ${limit})...`);
    
    const response = await binanceRateLimiter.executeRequest(limit <= 100 ? 2 : 10, async () => {
      return await axiosInstance.get(`${BINANCE_FUTURES_API}/fapi/v1/depth`, {
        params: { symbol, limit },
      });
    });

    binanceRateLimiter.updateWeightFromResponse(response.headers);
    console.log(`✅ [BinanceClient] Order book fetched: ${response.data.bids?.length} bids, ${response.data.asks?.length} asks`);
    
    return response.data;
  }

  async get24hTicker(symbol: string): Promise<Ticker24hr> {
    console.log(`📊 [BinanceClient] Fetching 24h ticker for ${symbol}...`);
    
    const response = await binanceRateLimiter.executeRequest(1, async () => {
      return await axiosInstance.get(`${BINANCE_FUTURES_API}/fapi/v1/ticker/24hr`, {
        params: { symbol },
      });
    });

    binanceRateLimiter.updateWeightFromResponse(response.headers);
    console.log(`✅ [BinanceClient] 24h ticker fetched: volume=${response.data.quoteVolume} USDT`);
    
    return response.data;
  }

  async calculate24hATR(symbol: string): Promise<number> {
    console.log(`📏 [BinanceClient] Calculating 24h ATR for ${symbol}...`);
    
    // Get 96 x 15m candles (24 hours)
    const candles = await this.getKlines(symbol, '15m', 96, false);
    
    if (candles.length < 14) {
      console.warn(`⚠️ [BinanceClient] Not enough candles for ATR calculation (need 14+, got ${candles.length})`);
      return 0;
    }

    // Calculate True Range for each candle
    const trueRanges: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const high = parseFloat(candles[i].high);
      const low = parseFloat(candles[i].low);
      const prevClose = parseFloat(candles[i - 1].close);
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }

    // Calculate average ATR over all available periods
    const atr24h = trueRanges.reduce((sum, tr) => sum + tr, 0) / trueRanges.length;
    
    console.log(`✅ [BinanceClient] 24h ATR calculated: ${atr24h.toFixed(8)} (${candles.length} candles)`);
    return atr24h;
  }

  async getLiquidityMetrics(symbol: string): Promise<{
    spreadPercent: number;
    depth1PctBid: number;
    depth1PctAsk: number;
    orderBookImbalance: number;
    volume24hUsdt: number;
    atr24h: number;
  }> {
    console.log(`💧 [BinanceClient] Collecting liquidity metrics for ${symbol}...`);

    try {
      // Get order book and 24h ticker in parallel
      const [orderBook, ticker24h, atr24h] = await Promise.all([
        this.getOrderBook(symbol, 500),
        this.get24hTicker(symbol),
        this.calculate24hATR(symbol),
      ]);

      const bids: [string, string][] = orderBook.bids || [];
      const asks: [string, string][] = orderBook.asks || [];

      if (bids.length === 0 || asks.length === 0) {
        console.warn(`⚠️ [BinanceClient] Empty order book for ${symbol}`);
        return {
          spreadPercent: 0,
          depth1PctBid: 0,
          depth1PctAsk: 0,
          orderBookImbalance: 0,
          volume24hUsdt: parseFloat(ticker24h.quoteVolume),
          atr24h,
        };
      }

      const bestBid = parseFloat(bids[0][0]);
      const bestAsk = parseFloat(asks[0][0]);
      const midPrice = (bestBid + bestAsk) / 2;

      // 1. Calculate spread
      const spreadPercent = ((bestAsk - bestBid) / midPrice) * 100;

      // 2. Calculate depth at ±1%
      const priceBid1Pct = midPrice * 0.99;
      const priceAsk1Pct = midPrice * 1.01;

      let depth1PctBid = 0;
      let depth1PctAsk = 0;

      // Sum bid liquidity down to -1% from mid
      for (const [price, qty] of bids) {
        const p = parseFloat(price);
        const q = parseFloat(qty);
        if (p >= priceBid1Pct) {
          depth1PctBid += p * q; // USDT value
        } else {
          break;
        }
      }

      // Sum ask liquidity up to +1% from mid
      for (const [price, qty] of asks) {
        const p = parseFloat(price);
        const q = parseFloat(qty);
        if (p <= priceAsk1Pct) {
          depth1PctAsk += p * q; // USDT value
        } else {
          break;
        }
      }

      // 3. Calculate order book imbalance (bid/ask ratio)
      const orderBookImbalance = depth1PctAsk > 0 ? depth1PctBid / depth1PctAsk : 0;

      // 4. 24h volume
      const volume24hUsdt = parseFloat(ticker24h.quoteVolume);

      console.log(`✅ [BinanceClient] Liquidity metrics for ${symbol}:`, {
        spreadPercent: `${spreadPercent.toFixed(4)}%`,
        depth1PctBid: `$${depth1PctBid.toFixed(0)}`,
        depth1PctAsk: `$${depth1PctAsk.toFixed(0)}`,
        orderBookImbalance: orderBookImbalance.toFixed(4),
        volume24hUsdt: `$${volume24hUsdt.toFixed(0)}`,
        atr24h: atr24h.toFixed(8),
      });

      return {
        spreadPercent,
        depth1PctBid,
        depth1PctAsk,
        orderBookImbalance,
        volume24hUsdt,
        atr24h,
      };
    } catch (error: any) {
      console.error(`❌ [BinanceClient] Failed to get liquidity metrics for ${symbol}:`, error.message);
      // Return zeros on error
      return {
        spreadPercent: 0,
        depth1PctBid: 0,
        depth1PctAsk: 0,
        orderBookImbalance: 0,
        volume24hUsdt: 0,
        atr24h: 0,
      };
    }
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
