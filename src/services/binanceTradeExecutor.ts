import { USDMClient, WebsocketClient } from 'binance';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { liveTradesDB, tradeSettingsDB } from '../mastra/storage/db';
import type { Signal } from '../mastra/storage/schema';

export interface TradeResult {
  success: boolean;
  liveTradeId?: number;
  entryOrderId?: string;
  slOrderId?: string;
  tpOrderId?: string;
  error?: string;
}

export class BinanceTradeExecutor {
  private client: USDMClient;
  private wsClient: WebsocketClient;
  private apiKey: string;
  private apiSecret: string;
  private isInitialized: boolean = false;
  private leverage: number = 20;
  private riskPercent: number = 1.0; // 1% risk per trade
  
  // Order tracking for auto-cancellation
  private orderPairs: Map<string, { slOrderId: string; tpOrderId: string; symbol: string }> = new Map();
  
  // WebSocket keepalive
  private listenKey: string | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Use separate API keys for trading (with trading permissions)
    this.apiKey = process.env.BINANCE_TRADING_API_KEY || '';
    this.apiSecret = process.env.BINANCE_TRADING_API_SECRET || '';

    if (!this.apiKey || !this.apiSecret) {
      console.warn('⚠️ [BinanceTradeExecutor] Trading API keys not configured');
      console.warn('⚠️ [BinanceTradeExecutor] Please set BINANCE_TRADING_API_KEY and BINANCE_TRADING_API_SECRET');
    }

    // Setup proxy if configured (same as BinanceClient for consistency)
    const proxyUrl = process.env.PROXY_URL;
    const clientOptions: any = {
      api_key: this.apiKey,
      api_secret: this.apiSecret,
    };

    if (proxyUrl) {
      console.log(`🔒 [BinanceTradeExecutor] Using proxy: ${proxyUrl.replace(/:[^:@]+@/, ':****@')}`);
      const httpsAgent = new HttpsProxyAgent(proxyUrl);
      clientOptions.httpsAgent = httpsAgent;
    } else {
      console.log('🌐 [BinanceTradeExecutor] No proxy configured, using direct connection');
    }

    // Initialize Binance USD-M Futures client with proxy
    this.client = new USDMClient(clientOptions);

    // Initialize WebSocket client for order updates with proxy
    this.wsClient = new WebsocketClient(clientOptions);

    console.log('🚀 [BinanceTradeExecutor] Initialized (using BINANCE_TRADING_API_KEY)');
  }

  /**
   * Initialize trading: set leverage for all symbols and start WebSocket listeners
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('✅ [BinanceTradeExecutor] Already initialized');
      return;
    }

    try {
      console.log('🔧 [BinanceTradeExecutor] Initializing...');
      
      // Test connection
      await this.testConnection();
      
      // Setup WebSocket for order updates
      await this.setupWebSocket();
      
      this.isInitialized = true;
      console.log('✅ [BinanceTradeExecutor] Initialization complete');
    } catch (error: any) {
      console.error('❌ [BinanceTradeExecutor] Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Test connection to Binance Futures API
   */
  private async testConnection(): Promise<void> {
    try {
      console.log('🔌 [BinanceTradeExecutor] Testing connection...');
      const serverTime = await this.client.getExchangeInfo();
      console.log('✅ [BinanceTradeExecutor] Connection successful');
    } catch (error: any) {
      console.error('❌ [BinanceTradeExecutor] Connection test failed:', error.message);
      throw new Error(`Failed to connect to Binance: ${error.message}`);
    }
  }

  /**
   * Setup WebSocket listener for user order updates
   */
  private async setupWebSocket(): Promise<void> {
    console.log('📡 [BinanceTradeExecutor] Setting up WebSocket for order updates...');

    this.wsClient.on('formattedMessage', (data: any) => {
      if (data.eventType === 'ORDER_TRADE_UPDATE') {
        this.handleOrderUpdate(data);
      }
    });

    // Subscribe to user data stream (order updates)
    try {
      // Get listen key
      const response = await this.client.getFuturesUserDataListenKey();
      this.listenKey = response.listenKey;
      console.log(`🔑 [BinanceTradeExecutor] Obtained listen key: ${this.listenKey}`);

      await this.wsClient.subscribeUsdFuturesUserDataStream();
      console.log('✅ [BinanceTradeExecutor] WebSocket subscribed to user data stream');

      // Set up keepalive to extend listen key every 25 minutes
      this.keepAliveInterval = setInterval(async () => {
        try {
          if (this.listenKey) {
            console.log('🔄 [BinanceTradeExecutor] Renewing user data stream listen key...');
            await this.client.keepAliveFuturesUserDataListenKey();
            console.log('✅ [BinanceTradeExecutor] Listen key renewed successfully');
          }
        } catch (error: any) {
          console.error('❌ [BinanceTradeExecutor] Failed to renew listen key:', error.message);
          // Try to resubscribe if renewal fails
          try {
            console.log('🔄 [BinanceTradeExecutor] Attempting to resubscribe to user data stream...');
            await this.setupWebSocket();
          } catch (resubError: any) {
            console.error('❌ [BinanceTradeExecutor] Failed to resubscribe:', resubError.message);
          }
        }
      }, 25 * 60 * 1000); // 25 minutes
      
      console.log('⏰ [BinanceTradeExecutor] Keepalive timer set (25 min intervals)');
    } catch (error: any) {
      console.error('❌ [BinanceTradeExecutor] WebSocket subscription failed:', error.message);
    }
  }

  /**
   * Handle order update from WebSocket
   * - Auto-cancel opposite order when TP or SL is hit
   * - Update live trade status based on order fills
   */
  private async handleOrderUpdate(data: any): Promise<void> {
    const { order } = data;
    const { orderId, symbol, orderStatus, orderType, avgPrice } = order;

    console.log(`📨 [BinanceTradeExecutor] Order update: ${symbol} ${orderType} ${orderStatus} (ID: ${orderId})`);

    // BUG FIX 1: Convert orderId to string for consistent comparison
    const orderIdStr = String(orderId);

    // Only process FILLED orders
    if (orderStatus !== 'FILLED') {
      return;
    }

    console.log(`✅ [BinanceTradeExecutor] Order FILLED: ${symbol} ${orderType} (ID: ${orderIdStr}, Price: ${avgPrice})`);

    // BUG FIX 3: Update live trade status based on order type
    try {
      if (orderType === 'MARKET') {
        // Entry order filled: OPENING → OPEN
        await this.handleEntryOrderFilled(orderIdStr, avgPrice);
      } else if (orderType === 'STOP_MARKET') {
        // SL order filled: OPEN → SL_HIT
        await this.handleSlOrderFilled(orderIdStr, symbol, avgPrice);
      } else if (orderType === 'TAKE_PROFIT_MARKET') {
        // TP order filled: OPEN → TP_HIT
        await this.handleTpOrderFilled(orderIdStr, symbol, avgPrice);
      }
    } catch (error: any) {
      console.error(`❌ [BinanceTradeExecutor] Error updating trade status:`, error.message);
    }
  }

  /**
   * Handle entry (MARKET) order filled
   * Update trade status from OPENING → OPEN
   */
  private async handleEntryOrderFilled(orderId: string, fillPrice: string): Promise<void> {
    console.log(`🎯 [BinanceTradeExecutor] Entry order filled (ID: ${orderId}, Price: ${fillPrice})`);

    const trade = await liveTradesDB.getLiveTradeByEntryOrderId(orderId);
    if (!trade) {
      console.warn(`⚠️ [BinanceTradeExecutor] No trade found for entry order ${orderId}`);
      return;
    }

    if (trade.status !== 'OPENING') {
      console.warn(`⚠️ [BinanceTradeExecutor] Trade ${trade.id} is already ${trade.status}, not OPENING`);
      return;
    }

    await liveTradesDB.updateLiveTrade(trade.id, {
      status: 'OPEN',
      entryPrice: fillPrice,
      openedAt: new Date(),
    });

    console.log(`✅ [BinanceTradeExecutor] Trade ${trade.id} status: OPENING → OPEN @ ${fillPrice}`);
  }

  /**
   * Handle SL (STOP_MARKET) order filled
   * Update trade status to SL_HIT and calculate realized PnL
   */
  private async handleSlOrderFilled(orderId: string, symbol: string, exitPrice: string): Promise<void> {
    console.log(`🛑 [BinanceTradeExecutor] SL order filled (ID: ${orderId}, Price: ${exitPrice})`);

    const trade = await liveTradesDB.getLiveTradeBySlOrderId(orderId);
    if (!trade) {
      console.warn(`⚠️ [BinanceTradeExecutor] No trade found for SL order ${orderId}`);
      return;
    }

    // Calculate realized PnL
    const entryPrice = parseFloat(trade.entryPrice || '0');
    const exitPriceNum = parseFloat(exitPrice);
    const positionSize = parseFloat(trade.positionSize || '0');
    const directionMultiplier = trade.direction === 'LONG' ? 1 : -1;

    // PnL = (exit - entry) × position size × direction multiplier
    // For LONG SL: exit < entry → negative PnL
    // For SHORT SL: exit > entry → negative PnL
    const pnlUsdt = (exitPriceNum - entryPrice) * positionSize * directionMultiplier;
    const pnlPercent = ((exitPriceNum - entryPrice) / entryPrice) * 100 * directionMultiplier;

    console.log(`💰 [BinanceTradeExecutor] SL PnL: ${pnlUsdt.toFixed(2)} USDT (${pnlPercent.toFixed(2)}%)`);

    await liveTradesDB.updateLiveTrade(trade.id, {
      status: 'SL_HIT',
      exitPrice,
      exitType: 'SL_HIT',
      realizedPnlUsdt: pnlUsdt.toFixed(2),
      realizedPnlPercent: pnlPercent.toFixed(2),
      closedAt: new Date(),
    });

    console.log(`✅ [BinanceTradeExecutor] Trade ${trade.id} status: OPEN → SL_HIT @ ${exitPrice}`);

    // Cancel opposite TP order
    await this.cancelOppositeOrder(orderId, symbol, 'STOP_MARKET');
  }

  /**
   * Handle TP (TAKE_PROFIT_MARKET) order filled
   * Update trade status to TP_HIT and calculate realized PnL
   */
  private async handleTpOrderFilled(orderId: string, symbol: string, exitPrice: string): Promise<void> {
    console.log(`🎯 [BinanceTradeExecutor] TP order filled (ID: ${orderId}, Price: ${exitPrice})`);

    const trade = await liveTradesDB.getLiveTradeByTpOrderId(orderId);
    if (!trade) {
      console.warn(`⚠️ [BinanceTradeExecutor] No trade found for TP order ${orderId}`);
      return;
    }

    // Calculate realized PnL
    const entryPrice = parseFloat(trade.entryPrice || '0');
    const exitPriceNum = parseFloat(exitPrice);
    const positionSize = parseFloat(trade.positionSize || '0');
    const directionMultiplier = trade.direction === 'LONG' ? 1 : -1;

    // PnL = (exit - entry) × position size × direction multiplier
    // For LONG TP: exit > entry → positive PnL
    // For SHORT TP: exit < entry → positive PnL
    const pnlUsdt = (exitPriceNum - entryPrice) * positionSize * directionMultiplier;
    const pnlPercent = ((exitPriceNum - entryPrice) / entryPrice) * 100 * directionMultiplier;

    console.log(`💰 [BinanceTradeExecutor] TP PnL: ${pnlUsdt.toFixed(2)} USDT (${pnlPercent.toFixed(2)}%)`);

    await liveTradesDB.updateLiveTrade(trade.id, {
      status: 'TP_HIT',
      exitPrice,
      exitType: 'TP_HIT',
      realizedPnlUsdt: pnlUsdt.toFixed(2),
      realizedPnlPercent: pnlPercent.toFixed(2),
      closedAt: new Date(),
    });

    console.log(`✅ [BinanceTradeExecutor] Trade ${trade.id} status: OPEN → TP_HIT @ ${exitPrice}`);

    // Cancel opposite SL order
    await this.cancelOppositeOrder(orderId, symbol, 'TAKE_PROFIT_MARKET');
  }

  /**
   * Cancel opposite order (SL when TP hits, or TP when SL hits)
   */
  private async cancelOppositeOrder(triggeredOrderId: string, symbol: string, triggeredType: string): Promise<void> {
    console.log(`🔄 [BinanceTradeExecutor] Looking for opposite order to cancel (triggered: ${triggeredOrderId}, type: ${triggeredType})`);

    // Find the order pair for this symbol
    for (const [entryOrderId, orderPair] of this.orderPairs.entries()) {
      if (orderPair.symbol !== symbol) continue;

      let orderIdToCancel: string | null = null;

      if (triggeredType === 'STOP_MARKET' && orderPair.slOrderId === triggeredOrderId) {
        // SL hit → cancel TP
        orderIdToCancel = orderPair.tpOrderId;
      } else if (triggeredType === 'TAKE_PROFIT_MARKET' && orderPair.tpOrderId === triggeredOrderId) {
        // TP hit → cancel SL
        orderIdToCancel = orderPair.slOrderId;
      }

      if (orderIdToCancel) {
        try {
          await this.client.cancelOrder({ symbol, orderId: parseInt(orderIdToCancel) });
          console.log(`✅ [BinanceTradeExecutor] Cancelled opposite order ${orderIdToCancel} for ${symbol}`);
          
          // Remove from tracking
          this.orderPairs.delete(entryOrderId);
        } catch (error: any) {
          console.error(`❌ [BinanceTradeExecutor] Failed to cancel order ${orderIdToCancel}:`, error.message);
        }
        break;
      }
    }
  }

  /**
   * Get current Futures account balance (USDT)
   */
  async getAccountBalance(): Promise<number> {
    try {
      console.log('💰 [BinanceTradeExecutor] Fetching account balance...');
      const accountInfo = await this.client.getBalance();
      
      const usdtBalance = accountInfo.find((asset: any) => asset.asset === 'USDT');
      const balance = usdtBalance ? parseFloat(String(usdtBalance.availableBalance)) : 0;
      
      console.log(`💵 [BinanceTradeExecutor] USDT Balance: ${balance.toFixed(2)}`);
      return balance;
    } catch (error: any) {
      console.error('❌ [BinanceTradeExecutor] Failed to get balance:', error.message);
      throw error;
    }
  }

  /**
   * Get maximum allowed leverage for a symbol
   */
  private async getMaxLeverage(symbol: string): Promise<number> {
    try {
      console.log(`🔍 [BinanceTradeExecutor] Fetching max leverage for ${symbol}...`);
      
      const brackets = await this.client.getNotionalAndLeverageBrackets({ symbol });
      
      if (!brackets || brackets.length === 0) {
        console.warn(`⚠️ [BinanceTradeExecutor] No leverage brackets found for ${symbol}, defaulting to 20x`);
        return 20;
      }

      // Get the first bracket (lowest position size tier) which has the highest leverage
      const firstBracket = brackets[0];
      const maxLeverage = firstBracket.brackets?.[0]?.initialLeverage || 20;
      
      console.log(`✅ [BinanceTradeExecutor] ${symbol}: Max leverage = ${maxLeverage}x`);
      return maxLeverage;
    } catch (error: any) {
      console.error(`❌ [BinanceTradeExecutor] Failed to get max leverage for ${symbol}:`, error.message);
      console.log(`⚠️ [BinanceTradeExecutor] Defaulting to 20x leverage`);
      return 20;
    }
  }

  /**
   * Set leverage and margin type for a symbol
   */
  private async setupSymbol(symbol: string): Promise<number> {
    console.log(`🔧 [BinanceTradeExecutor] Setting up ${symbol}...`);

    try {
      // Set margin type to ISOLATED
      try {
        await this.client.setMarginType({ symbol, marginType: 'ISOLATED' });
        console.log(`✅ [BinanceTradeExecutor] ${symbol}: Set margin type to ISOLATED`);
      } catch (error: any) {
        // Error -4046 means margin type already set
        if (error.code === -4046) {
          console.log(`ℹ️ [BinanceTradeExecutor] ${symbol}: Margin type already set to ISOLATED`);
        } else {
          throw error;
        }
      }

      // Get max leverage for this symbol
      const maxLeverage = await this.getMaxLeverage(symbol);
      
      // Use minimum of requested leverage and max allowed leverage
      const actualLeverage = Math.min(this.leverage, maxLeverage);
      
      if (actualLeverage < this.leverage) {
        console.log(`⚠️ [BinanceTradeExecutor] ${symbol}: Requested ${this.leverage}x but max is ${maxLeverage}x, using ${actualLeverage}x`);
      }

      // Set leverage
      await this.client.setLeverage({ symbol, leverage: actualLeverage });
      console.log(`✅ [BinanceTradeExecutor] ${symbol}: Set leverage to ${actualLeverage}x`);
      
      return actualLeverage;
    } catch (error: any) {
      console.error(`❌ [BinanceTradeExecutor] Failed to setup ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Calculate position size based on 1% risk
   * 
   * Formula:
   * Risk Amount = Account Balance × Risk% = $1000 × 1% = $10
   * Position Size = (Risk Amount / |Entry - SL|) × Leverage
   */
  private calculatePositionSize(
    accountBalance: number,
    entryPrice: number,
    slPrice: number,
    leverage: number
  ): { positionSize: number; riskAmount: number; positionValueUsdt: number } {
    const riskAmount = accountBalance * (this.riskPercent / 100);
    const slDistance = Math.abs(entryPrice - slPrice);
    const slDistancePercent = slDistance / entryPrice;
    
    // Position size calculation considering leverage
    // With 20x leverage, we can open a position worth 20x our margin
    // Position Value = Risk / SL Distance Percent
    // Actual Crypto Amount = Position Value / Entry Price
    const positionValueUsdt = riskAmount / slDistancePercent;
    const positionSize = positionValueUsdt / entryPrice;

    console.log(`📊 [BinanceTradeExecutor] Position Sizing:`);
    console.log(`   Account Balance: $${accountBalance.toFixed(2)}`);
    console.log(`   Risk Amount (${this.riskPercent}%): $${riskAmount.toFixed(2)}`);
    console.log(`   Entry: $${entryPrice.toFixed(8)}`);
    console.log(`   SL: $${slPrice.toFixed(8)}`);
    console.log(`   SL Distance: $${slDistance.toFixed(8)} (${(slDistancePercent * 100).toFixed(2)}%)`);
    console.log(`   Position Value (USDT): $${positionValueUsdt.toFixed(2)}`);
    console.log(`   Position Size: ${positionSize.toFixed(8)} (${leverage}x leverage)`);

    return { positionSize, riskAmount, positionValueUsdt };
  }

  /**
   * Round quantity to symbol's step size
   */
  private async roundQuantity(symbol: string, quantity: number): Promise<number> {
    try {
      const exchangeInfo = await this.client.getExchangeInfo();
      const symbolInfo = exchangeInfo.symbols.find((s: any) => s.symbol === symbol);
      
      if (!symbolInfo) {
        throw new Error(`Symbol ${symbol} not found in exchange info`);
      }

      const lotSizeFilter = symbolInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE') as any;
      if (!lotSizeFilter) {
        throw new Error(`LOT_SIZE filter not found for ${symbol}`);
      }
      const stepSize = parseFloat(lotSizeFilter.stepSize);

      const precision = stepSize.toString().split('.')[1]?.length || 0;
      const rounded = Math.floor(quantity / stepSize) * stepSize;
      
      console.log(`🔢 [BinanceTradeExecutor] Rounded ${quantity} → ${rounded.toFixed(precision)} (step: ${stepSize})`);
      return parseFloat(rounded.toFixed(precision));
    } catch (error: any) {
      console.error(`❌ [BinanceTradeExecutor] Failed to round quantity:`, error.message);
      // Fallback: round to 3 decimals
      return parseFloat(quantity.toFixed(3));
    }
  }

  /**
   * Round price to symbol's tick size
   */
  private async roundPrice(symbol: string, price: number): Promise<number> {
    try {
      const exchangeInfo = await this.client.getExchangeInfo();
      const symbolInfo = exchangeInfo.symbols.find((s: any) => s.symbol === symbol);
      
      if (!symbolInfo) {
        throw new Error(`Symbol ${symbol} not found in exchange info`);
      }

      const priceFilter = symbolInfo.filters.find((f: any) => f.filterType === 'PRICE_FILTER') as any;
      if (!priceFilter) {
        throw new Error(`PRICE_FILTER not found for ${symbol}`);
      }
      const tickSize = parseFloat(priceFilter.tickSize);

      const precision = tickSize.toString().split('.')[1]?.length || 0;
      const rounded = Math.round(price / tickSize) * tickSize;
      
      return parseFloat(rounded.toFixed(precision));
    } catch (error: any) {
      console.error(`❌ [BinanceTradeExecutor] Failed to round price:`, error.message);
      // Fallback: round to 2 decimals
      return parseFloat(price.toFixed(2));
    }
  }

  /**
   * Open a trade based on a signal
   * Steps:
   * 1. Get account balance
   * 2. Set leverage and margin type (get actual leverage allowed)
   * 3. Calculate position size (1% risk with actual leverage)
   * 4. Place market order (entry)
   * 5. Place stop-loss order (STOP_MARKET)
   * 6. Place take-profit order (TAKE_PROFIT_MARKET)
   * 7. Save to database
   */
  async openTrade(signal: Signal): Promise<TradeResult> {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🚀 [BinanceTradeExecutor] Opening trade for signal ${signal.id}`);
    console.log(`   Symbol: ${signal.symbol}`);
    console.log(`   Direction: ${signal.direction}`);
    console.log(`   Entry: ${signal.entryPrice}`);
    console.log(`   SL: ${signal.slPrice}`);
    console.log(`   TP: ${signal.tp2Price}`);
    console.log(`${'='.repeat(80)}\n`);

    try {
      // Check if trading is enabled
      const tradingEnabled = await tradeSettingsDB.getTradingEnabled();
      if (!tradingEnabled) {
        console.log('⚠️ [BinanceTradeExecutor] Trading is disabled, skipping');
        return { success: false, error: 'Trading disabled' };
      }

      // Check if live trade already exists for this signal
      const existingTrade = await liveTradesDB.getLiveTradeBySignalId(signal.id);
      if (existingTrade) {
        console.log(`⚠️ [BinanceTradeExecutor] Trade already exists for signal ${signal.id}`);
        return { success: false, error: 'Trade already exists' };
      }

      // Ensure initialized
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Step 1: Get account balance
      const accountBalance = await this.getAccountBalance();
      if (accountBalance === 0) {
        throw new Error('Zero account balance');
      }

      // Step 2: Setup symbol (leverage + margin type) FIRST to get actual leverage
      const actualLeverage = await this.setupSymbol(signal.symbol);

      // Step 3: Calculate position size using ACTUAL leverage
      const entryPrice = parseFloat(signal.entryPrice);
      const slPrice = parseFloat(signal.slPrice);
      const tpPrice = parseFloat(signal.tp2Price); // Use TP2 as main target

      const { positionSize, riskAmount, positionValueUsdt } = this.calculatePositionSize(
        accountBalance,
        entryPrice,
        slPrice,
        actualLeverage  // Use actual leverage, not requested
      );

      // Round quantities and prices
      const roundedQuantity = await this.roundQuantity(signal.symbol, positionSize);
      const roundedSlPrice = await this.roundPrice(signal.symbol, slPrice);
      const roundedTpPrice = await this.roundPrice(signal.symbol, tpPrice);

      // Create live trade record (OPENING status)
      const liveTrade = await liveTradesDB.createLiveTrade({
        signalId: signal.id,
        symbol: signal.symbol,
        direction: signal.direction,
        leverage: actualLeverage,  // Use actual leverage, not requested
        marginType: 'ISOLATED',
        accountBalance: accountBalance.toString(),
        riskPercent: this.riskPercent.toString(),
        riskAmount: riskAmount.toString(),
        positionSize: roundedQuantity.toString(),
        positionValueUsdt: positionValueUsdt.toString(),
        slPrice: roundedSlPrice.toString(),
        tpPrice: roundedTpPrice.toString(),
        status: 'OPENING',
      });

      console.log(`📝 [BinanceTradeExecutor] Created live trade record ID: ${liveTrade.id}`);

      // Step 4: Place market order (entry)
      const side = signal.direction === 'LONG' ? 'BUY' : 'SELL';
      console.log(`📤 [BinanceTradeExecutor] Placing ${side} market order for ${roundedQuantity} ${signal.symbol}...`);

      const marketOrder = await this.client.submitNewOrder({
        symbol: signal.symbol,
        side,
        type: 'MARKET',
        quantity: roundedQuantity,
      });

      console.log(`✅ [BinanceTradeExecutor] Market order filled:`, {
        orderId: marketOrder.orderId,
        avgPrice: marketOrder.avgPrice,
        executedQty: marketOrder.executedQty,
      });

      const filledPrice = parseFloat(String(marketOrder.avgPrice || entryPrice));

      // Step 5: Place stop-loss order
      const slSide = signal.direction === 'LONG' ? 'SELL' : 'BUY';
      console.log(`📤 [BinanceTradeExecutor] Placing SL order at ${roundedSlPrice}...`);

      const slOrder = await this.client.submitNewOrder({
        symbol: signal.symbol,
        side: slSide,
        type: 'STOP_MARKET',
        quantity: roundedQuantity,
        stopPrice: roundedSlPrice,
        workingType: 'MARK_PRICE', // Use mark price to avoid manipulation
        priceProtect: 'TRUE', // Prevent execution at extreme prices
      });

      console.log(`✅ [BinanceTradeExecutor] SL order placed:`, {
        orderId: slOrder.orderId,
        stopPrice: roundedSlPrice,
      });

      // Step 6: Place take-profit order
      const tpSide = signal.direction === 'LONG' ? 'SELL' : 'BUY';
      console.log(`📤 [BinanceTradeExecutor] Placing TP order at ${roundedTpPrice}...`);

      const tpOrder = await this.client.submitNewOrder({
        symbol: signal.symbol,
        side: tpSide,
        type: 'TAKE_PROFIT_MARKET',
        quantity: roundedQuantity,
        stopPrice: roundedTpPrice,
        workingType: 'MARK_PRICE',
        priceProtect: 'TRUE',
      });

      console.log(`✅ [BinanceTradeExecutor] TP order placed:`, {
        orderId: tpOrder.orderId,
        stopPrice: roundedTpPrice,
      });

      // Track order pair for auto-cancellation
      this.orderPairs.set(marketOrder.orderId.toString(), {
        slOrderId: slOrder.orderId.toString(),
        tpOrderId: tpOrder.orderId.toString(),
        symbol: signal.symbol,
      });

      // Step 7: Update live trade record
      await liveTradesDB.updateLiveTrade(liveTrade.id, {
        entryOrderId: marketOrder.orderId.toString(),
        slOrderId: slOrder.orderId.toString(),
        tpOrderId: tpOrder.orderId.toString(),
        entryPrice: filledPrice.toString(),
        status: 'OPEN',
        openedAt: new Date(),
      });

      console.log(`\n${'='.repeat(80)}`);
      console.log(`✅ [BinanceTradeExecutor] Trade opened successfully!`);
      console.log(`   Live Trade ID: ${liveTrade.id}`);
      console.log(`   Entry Order: ${marketOrder.orderId} @ ${filledPrice}`);
      console.log(`   SL Order: ${slOrder.orderId} @ ${roundedSlPrice}`);
      console.log(`   TP Order: ${tpOrder.orderId} @ ${roundedTpPrice}`);
      console.log(`   Position Size: ${roundedQuantity} ${signal.symbol}`);
      console.log(`   Position Value: $${positionValueUsdt.toFixed(2)}`);
      console.log(`   Risk: $${riskAmount.toFixed(2)} (${this.riskPercent}%)`);
      console.log(`${'='.repeat(80)}\n`);

      return {
        success: true,
        liveTradeId: liveTrade.id,
        entryOrderId: marketOrder.orderId.toString(),
        slOrderId: slOrder.orderId.toString(),
        tpOrderId: tpOrder.orderId.toString(),
      };
    } catch (error: any) {
      console.error(`❌ [BinanceTradeExecutor] Failed to open trade:`, error.message);
      console.error(error);

      // Save error to database if live trade was created
      const existingTrade = await liveTradesDB.getLiveTradeBySignalId(signal.id);
      if (existingTrade) {
        await liveTradesDB.setTradeError(existingTrade.id, error.message);
      }

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Cleanup resources on shutdown
   * Clear keepalive interval and close WebSocket connection
   */
  async cleanup(): Promise<void> {
    console.log('🧹 [BinanceTradeExecutor] Cleaning up resources...');

    // Clear keepalive interval
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
      console.log('✅ [BinanceTradeExecutor] Keepalive interval cleared');
    }

    // Close listen key
    if (this.listenKey) {
      try {
        await this.client.closeFuturesUserDataListenKey();
        console.log('✅ [BinanceTradeExecutor] Listen key closed');
      } catch (error: any) {
        console.error('❌ [BinanceTradeExecutor] Failed to close listen key:', error.message);
      }
      this.listenKey = null;
    }

    console.log('✅ [BinanceTradeExecutor] Cleanup complete');
  }
}

// Export singleton instance
export const binanceTradeExecutor = new BinanceTradeExecutor();
