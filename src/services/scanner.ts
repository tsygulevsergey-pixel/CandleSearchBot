import { binanceClient } from '../utils/binanceClient';
import { patternDetector, calculateATR, analyzeSRZonesTV } from '../utils/candleAnalyzer';
import { riskCalculator } from '../utils/riskCalculator';
import { calculateDynamicRiskProfile } from '../utils/dynamicRiskCalculator';
import { signalDB } from '../mastra/storage/db';
import { getCoinCluster, getCoinsByFamily, getFamilyId } from '../utils/marketClusters';
import { processMLIntegration, extractMLContextFields } from './mlIntegration';
import { enrichMLContextWithRiskProfile } from './mlLogger';
import { zoneTestTracker } from './zoneTestTracker';
import { SKIP_REASONS } from '../types/skipReasons';
import { 
  calculateConfluenceScore, 
  meetsConfluenceRequirement, 
  getConfluenceExplanation,
  type ConfluenceFactors 
} from '../utils/confluenceScoring';
import { detectTrend, isPatternWithTrend } from '../utils/trendDetector';
import axios from 'axios';

export class Scanner {
  private telegramChatId: string;
  private telegramBotToken: string;

  constructor() {
    this.telegramChatId = process.env.TELEGRAM_CHAT_ID || '';
    this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
  }

  async sendTelegramMessage(message: string): Promise<number | null> {
    if (!this.telegramBotToken || !this.telegramChatId) {
      console.warn('⚠️ [Scanner] Telegram credentials not configured, skipping message send');
      return null;
    }

    try {
      const response = await axios.post(`https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`, {
        chat_id: this.telegramChatId,
        text: message,
        parse_mode: 'HTML',
      });
      console.log('✅ [Scanner] Telegram message sent successfully');
      return response.data.result.message_id;
    } catch (error: any) {
      console.error('❌ [Scanner] Failed to send Telegram message:', error.message);
      return null;
    }
  }

  async scanTimeframe(timeframe: string): Promise<void> {
    const startTime = Date.now();
    console.log(`\n🔍 [Scanner] Starting PARALLEL scan for ${timeframe}...`);

    try {
      const pairs = await binanceClient.getTradingPairs();
      console.log(`📊 [Scanner] Scanning ${pairs.length} pairs on ${timeframe} with 20 parallel workers...`);

      const BATCH_SIZE = 20; // 20 монет параллельно (безопасно для Binance rate limit)
      let processedCount = 0;
      let signalsFound = 0;

      // Обрабатываем батчами для контроля rate limit
      for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
        const batch = pairs.slice(i, i + BATCH_SIZE);
        const batchStartTime = Date.now();
        
        // Параллельная обработка батча
        await Promise.all(batch.map(async (symbol) => {
          try {
            const candles = await binanceClient.getKlines(symbol, timeframe, 350);
            
            if (candles.length < 300) {
              console.log(`⚠️ [Scanner] Insufficient candles for ${symbol} (need 300, got ${candles.length}), skipping`);
              return;
            }
            
            // LOG: Проверка полученных данных
            const firstCandle = candles[0];
            const lastCandle = candles[candles.length - 1];
            console.log(`📊 [Scanner] ${symbol} ${timeframe}: Got ${candles.length} candles`);
            console.log(`   First: ${new Date(firstCandle.openTime).toISOString()} | OHLC: ${firstCandle.open}/${firstCandle.high}/${firstCandle.low}/${firstCandle.close}`);
            console.log(`   Last:  ${new Date(lastCandle.openTime).toISOString()} | OHLC: ${lastCandle.open}/${lastCandle.high}/${lastCandle.low}/${lastCandle.close}`);

            // Skip dead coins (ATR = 0) BEFORE pattern detection for performance
            const atr = calculateATR(candles);
            if (atr === 0) {
              console.log(`⏭️ [Scanner] Skipping ${symbol} - dead coin (ATR=0)`);
              return;
            }

            const patterns = patternDetector.detectAllPatterns(candles, timeframe);

            for (const pattern of patterns) {
              // Validate pattern has all required fields (including candleClosePrice)
              if (!pattern.detected || !pattern.type || !pattern.direction || !pattern.candleClosePrice) {
                continue;
              }
              
              // Optional: Validate last candle is fully closed (5s buffer)
              const lastCandle = candles[candles.length - 1];
              const buffer = 5000;
              if (lastCandle.closeTime > Date.now() - buffer) {
                console.log(`⏭️ [Scanner] Skipping ${symbol} - last candle not fully closed yet`);
                continue;
              }

              // Проверяем, есть ли уже открытый сигнал на эту монету
              const hasOpenSignal = await signalDB.hasOpenSignal(symbol);
              if (hasOpenSignal) {
                console.log(`⏭️ [Scanner] Skipping ${symbol} - already has an open signal`);
                continue;
              }
              
              // 🔥 КЛАСТЕРИЗАЦИЯ: определяем кластер для отображения в сообщении
              const cluster = getCoinCluster(symbol);
              
              // TEMPORARILY DISABLED - testing without family limits
              /*
              const familyId = getFamilyId(cluster);
              const familyCoins = getCoinsByFamily(cluster.leader, cluster.sector);
              const familySymbols = familyCoins.map(c => c.symbol);
              const openFamilySignals = await signalDB.countOpenSignalsByFamily(familySymbols);
              
              const MAX_SIGNALS_PER_FAMILY = 3; // Максимум 2-3 сигнала из одного семейства
              
              if (openFamilySignals >= MAX_SIGNALS_PER_FAMILY) {
                console.log(`⏭️ [Scanner] Skipping ${symbol} (${familyId}) - family limit reached (${openFamilySignals}/${MAX_SIGNALS_PER_FAMILY} signals)`);
                continue;
              }
              
              console.log(`✅ [Scanner] Family check passed: ${symbol} (${familyId}) - ${openFamilySignals}/${MAX_SIGNALS_PER_FAMILY} signals`);
              */

              // PATTERN-BASED ENTRY STRATEGY:
              // Entry = pattern candle close price (the moment pattern completes)
              // This ensures entry price matches the actual pattern formation point
              const entryPrice = pattern.candleClosePrice;
              
              // LOG: Детальная информация о паттерне
              console.log(`\n🎯 [Scanner] PATTERN DETECTED on ${symbol} ${timeframe}:`);
              console.log(`   Pattern Type: ${pattern.type}`);
              console.log(`   Direction: ${pattern.direction}`);
              console.log(`   Entry (candleClosePrice): ${entryPrice}`);
              console.log(`   Last candle close time: ${new Date(lastCandle.closeTime).toISOString()}`);
              
              // ⚡ 15M TREND-BASED LOGIC
              if (timeframe === '15m') {
                console.log(`\n📈 [15m Trend Filter] Applying trend-based filtering for ${symbol}...`);
                
                // Step 1: Detect trend on 15m candles
                console.log(`📊 [15m Trend Filter] Step 1: Detecting trend on 15m timeframe...`);
                // Convert candles to match trendDetector's expected type (number fields)
                const candlesForTrend = candles.map(c => ({
                  high: Number(c.high),
                  low: Number(c.low),
                  close: Number(c.close),
                  open: Number(c.open),
                  timestamp: c.openTime,
                }));
                const trend = detectTrend(candlesForTrend, entryPrice);
                console.log(`📊 [15m Trend Filter] Trend detected: ${trend.direction} (strength: ${trend.strength}%)`);
                console.log(`   📊 EMA20: ${trend.ema20.toFixed(8)}, EMA50: ${trend.ema50.toFixed(8)}`);
                console.log(`   📊 Swing: ${trend.details.swingStructure}, EMA aligned: ${trend.details.emaAlignment}, Price vs EMA: ${trend.details.priceVsEma}`);
                
                // Step 2: Check if pattern aligns with trend (minStrength=60)
                console.log(`📊 [15m Trend Filter] Step 2: Checking pattern alignment with trend (minStrength=60)...`);
                const isAligned = isPatternWithTrend(pattern.direction, trend, 60);
                
                if (!isAligned) {
                  console.log(`❌ [15m Trend Filter] Signal REJECTED - pattern NOT aligned with trend`);
                  console.log(`   ⚠️ Pattern: ${pattern.direction}, Trend: ${trend.direction} (${trend.strength}%), Required: 60%`);
                  console.log(`   ⚠️ Skipping ${symbol} - 15m patterns MUST align with trend (LONG+UPTREND or SHORT+DOWNTREND)`);
                  
                  // Log as near-miss skip for ML analysis
                  const { logNearMissSkip: logNearMissSkipFull } = await import('./nearMissLogger');
                  await logNearMissSkipFull({
                    symbol,
                    timeframe,
                    patternType: pattern.type,
                    entryPrice,
                    direction: pattern.direction,
                    skipReason: SKIP_REASONS.TREND_MISALIGNMENT,
                    skipCategory: 'directional',
                    confluenceScore: 0,
                    confluenceFactors: {} as any,
                    patternScore: pattern.score || 0,
                    patternScoreFactors: {},
                    mlContext: {
                      trendDirection: trend.direction,
                      trendStrength: trend.strength,
                      ema20: trend.ema20,
                      ema50: trend.ema50,
                    } as any,
                    atr15m: calculateATR(candles),
                    atr1h: 0,
                    atr4h: 0,
                  });
                  
                  continue; // Skip this signal
                }
                
                console.log(`✅ [15m Trend Filter] Pattern ALIGNED with trend - proceeding with signal`);
                console.log(`   ✅ Pattern: ${pattern.direction}, Trend: ${trend.direction} (${trend.strength}%)`);
                
                // Step 3: Use calculate15mRiskProfile for trend-aligned 15m signals
                console.log(`🎯 [15m Risk] Calculating 15m-specific risk profile for ${symbol}...`);
                const riskProfile = riskCalculator.calculate15mRiskProfile(
                  pattern.type,
                  pattern.direction,
                  entryPrice,
                  candles
                );
                
                console.log(`✅ [15m Risk] Risk profile calculated: SL=${riskProfile.sl.toFixed(8)}, TP=${riskProfile.tp2.toFixed(8)} (2R)`);
                console.log(`   📊 R=${riskProfile.meta.riskR.toFixed(8)}, TP R:R=${riskProfile.meta.tp2R.toFixed(2)}R`);
                
                // Create minimal enriched ML context for 15m (no multi-TF data needed)
                const enrichedMLContext = {
                  trendDirection: trend.direction,
                  trendStrength: trend.strength,
                  ema20: trend.ema20,
                  ema50: trend.ema50,
                  swingStructure: trend.details.swingStructure,
                  patternScore: pattern.score || 0,
                  actualRR_tp1: riskProfile.meta.tp1R,
                  actualRR_tp2: riskProfile.meta.tp2R,
                  actualRR_tp3: riskProfile.meta.tp3R,
                  confluenceScore: 0, // Not used for 15m
                  confluenceDetails: {},
                };
                
                // Create signal for 15m (trend-aligned)
                // ✅ CRITICAL: Set 100% close at TP2 for 15m (not 50/30/20)
                const signal = await signalDB.createSignal({
                  symbol,
                  timeframe,
                  patternType: pattern.type,
                  entryPrice: entryPrice.toString(),
                  slPrice: riskProfile.sl.toString(),
                  tp1Price: riskProfile.tp1.toString(),
                  tp2Price: riskProfile.tp2.toString(),
                  tp3Price: riskProfile.tp3.toString(),
                  currentSl: riskProfile.sl.toString(),
                  initialSl: riskProfile.initialSl.toString(),
                  atr15m: riskProfile.atr15m.toString(),
                  atrH4: '0', // Not used for 15m
                  direction: pattern.direction,
                  status: 'OPEN',
                  // ✅ Single-level TP: 100% close at TP2 (2R)
                  partialCloseP1: '0',   // 0% at TP1 (TP1=TP2=TP3 anyway)
                  partialCloseP2: '100', // 100% at TP2 (full close)
                  partialCloseP3: '0',   // 0% at TP3 (not used)
                  strategyProfile: 'SCALP_15M', // Trend-based scalping
                  // ✅ Store actual R values for PnL calc
                  actualRrTp1: riskProfile.meta.tp1R.toString(),
                  actualRrTp2: riskProfile.meta.tp2R.toString(),
                  actualRrTp3: riskProfile.meta.tp3R.toString(),
                });
                
                signalsFound++;
                const elapsedSinceClose = Math.max(0, (Date.now() - lastCandle.closeTime) / 1000).toFixed(1);
                const directionText = pattern.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT';
                const patternName = pattern.type.replace('_', ' ').toUpperCase();
                
                const message = `
🚨 <b>15M TREND SIGNAL ⚡</b> 🚨

💎 <b>Монета:</b> ${symbol}
📊 <b>Направление:</b> ${directionText}
⏰ <b>Таймфрейм:</b> ${timeframe}
📈 <b>Паттерн:</b> ${patternName}
🏷️ <b>Кластер:</b> ${cluster.leader} | ${cluster.sector}
📈 <b>Тренд:</b> ${trend.direction} (${trend.strength}%)

💰 <b>Entry:</b> ${entryPrice.toFixed(8)}
🛑 <b>Stop Loss:</b> ${riskProfile.sl.toFixed(8)}
🎯 <b>TP (2R):</b> ${riskProfile.tp2.toFixed(8)}

⚡ <b>R:R:</b> 1:${riskProfile.meta.tp2R.toFixed(2)}
📊 <b>ATR (15m):</b> ${riskProfile.atr15m.toFixed(2)}%
⏱️ <b>Задержка:</b> ${elapsedSinceClose}s

🎯 <b>Стратегия:</b> Trend-based scalping (15m)
              `.trim();
                
                await this.sendTelegramMessage(message);
                console.log(`✅ [Scanner] 15m signal created and sent: ${symbol} ${pattern.direction}`);
                
                // Skip to next pattern (15m logic complete)
                continue;
              }
              
              // 🎯 1H/4H STRATEGY: Calculate risk profile with ATR + S/R zones (existing logic)
              console.log(`🎯 [Scanner] Fetching multi-timeframe data for ${symbol}...`);
              
              // Fetch candles for all timeframes (for ATR + S/R zone analysis)
              const candles1h = await binanceClient.getKlines(symbol, '1h', 350);
              const candles4h = await binanceClient.getKlines(symbol, '4h', 350);
              
              if (candles1h.length < 300 || candles4h.length < 300) {
                console.log(`⚠️ [Scanner] Insufficient multi-TF candles for ${symbol}, skipping`);
                continue;
              }
              
              // 📊 ML INTEGRATION: Collect context (PURELY ADDITIVE - does NOT block trading)
              console.log(`📊 [Scanner] Collecting ML context for ${symbol}...`);
              const mlResult = await processMLIntegration({
                symbol,
                timeframe,
                patternType: pattern.type,
                direction: pattern.direction,
                entryPrice,
                candles15m: candles,
                candles1h,
                candles4h,
              });
              
              // Log what filters would say (for ML analysis) - but DO NOT BLOCK the signal
              if (!mlResult.shouldEnter) {
                console.log(`📝 [Scanner] ML Note: ${symbol} would be skipped by filters (${mlResult.skipReasons.join(', ')}) - but signal proceeds for data collection`);
              } else {
                console.log(`✅ [Scanner] ML Note: ${symbol} passes all ML filters`);
              }
              
              // 🎯 DYNAMIC RISK CALCULATOR: Calculate with zone-aware adaptive SL/TP
              console.log(`🎯 [Scanner] Calculating dynamic risk profile for ${symbol}...`);
              
              // Calculate pattern extreme (low for LONG, high for SHORT)
              const patternExtreme = pattern.direction === 'LONG' 
                ? Math.min(...candles.slice(-3).map(c => Number(c.low)))
                : Math.max(...candles.slice(-3).map(c => Number(c.high)));
              
              // Calculate ATRs
              const atr15m = calculateATR(candles);
              const atr1h = calculateATR(candles1h);
              const atr4h = calculateATR(candles4h);
              
              // Get zone test count from zoneTestTracker
              const zoneTestCount24h = zoneTestTracker.getActiveZoneTestCount(
                symbol,
                pattern.direction,
                mlResult.mlContext.zones,
                24
              );
              
              console.log(`📊 [Scanner] Dynamic input: patternExtreme=${patternExtreme.toFixed(8)}, zoneTestCount24h=${zoneTestCount24h}`);
              
              // Calculate dynamic risk profile
              const dynamicProfile = calculateDynamicRiskProfile({
                direction: pattern.direction,
                entryPrice,
                patternExtreme,
                zones: mlResult.mlContext.zones,
                atr15m,
                atr1h,
                atr4h,
                zoneTestCount24h,
                candles15m: candles,
                candles1h, // For trend analysis
                candles4h, // For trend analysis
                patternScore: pattern.score, // Pattern quality score (0-10)
              });
              
              console.log(`✅ [Scanner] Dynamic risk profile: scenario=${dynamicProfile.scenario}, SL=${dynamicProfile.sl.toFixed(8)}, TP1=${dynamicProfile.tp1?.toFixed(8) || 'null'}, TP2=${dynamicProfile.tp2?.toFixed(8) || 'null'}, TP3=${dynamicProfile.tp3?.toFixed(8) || 'null'}`);
              console.log(`   📊 Metadata: R=${dynamicProfile.riskR.toFixed(8)}, R_avail=${dynamicProfile.rAvailable.toFixed(1)}, clearance15m=${dynamicProfile.clearance15m.toFixed(8)}, clearance1h=${dynamicProfile.clearance1h.toFixed(8)}`);
              console.log(`   🛡️ Veto: ${dynamicProfile.vetoReason}, SL buffer: ${dynamicProfile.slBufferAtr15.toFixed(2)} ATR15`);
              console.log(`   📊 Dynamic Min R:R: ${dynamicProfile.dynamicMinRR.toFixed(2)} (${dynamicProfile.dynamicMinRRReasoning})`);
              console.log(`   📊 Trend: ${dynamicProfile.trendAlignment}, Multi-TF: ${dynamicProfile.multiTFAlignment}, Volatility: ${dynamicProfile.atrVolatility}`);
              console.log(`   📊 R:R Validation: ${dynamicProfile.rrValidation.message}`);
              
              // 🔄 ENRICH ML CONTEXT with dynamic risk profile data (actualRR, trend, etc.)
              console.log(`🔄 [Scanner] Enriching ML context with risk profile data for ${symbol}...`);
              let enrichedMLContext = enrichMLContextWithRiskProfile(
                mlResult.mlContext,
                dynamicProfile,
                pattern.score
              );
              console.log(`✅ [Scanner] ML context enriched with actualRR data`);
              
              // ⭐ CONFLUENCE SCORING: Professional 8-factor system (required: 5/10 for 15m)
              console.log(`\n⭐ [Confluence] Calculating confluence score for ${symbol}...`);
              
              // Calculate volume spike (volume > 1.2x avg of last 20 bars)
              const lastVolume = Number(candles[candles.length - 1].volume);
              const avgVolume = candles.slice(-21, -1).reduce((sum, c) => sum + Number(c.volume), 0) / 20;
              const hasVolumeSpike = lastVolume > avgVolume * 1.2;
              
              // Clean rejection: Pattern detection already checks tail protrusion in Pin Bar
              // For now, give credit if pattern score is high (indicates quality pattern)
              const hasCleanRejection = (pattern.score || 0) >= 7;
              
              const confluenceFactors: ConfluenceFactors = {
                patternQuality: (pattern.score || 0) >= 7,  // Pattern score ≥ 7/10
                atKeyZone: mlResult.mlContext.inH4Zone || mlResult.mlContext.distToEntryZoneH1Atr < 0.5, // At H4 zone or very close to H1 ENTRY zone (support for LONG, resistance for SHORT)
                trendAligned: dynamicProfile.trendAlignment === 'with',  // Trend aligned
                volumeSpike: hasVolumeSpike, // Real volume check: current > 1.2x avg(20)
                zoneFresh: parseInt(mlResult.mlContext.zoneTouchCountBucket) <= 3, // Zone touches ≤ 3
                multiTFconfluence: dynamicProfile.multiTFAlignment || false,  // Multi-TF alignment
                cleanRejection: hasCleanRejection, // High pattern score indicates clean rejection
                rAvailable: dynamicProfile.rAvailable >= 2.0,  // R:R space ≥ 2.0
              };
              
              const confluenceScore = calculateConfluenceScore(confluenceFactors);
              const meetsConfluence = meetsConfluenceRequirement(confluenceScore, timeframe);
              const confluenceExplanation = getConfluenceExplanation(confluenceFactors, confluenceScore, timeframe);
              
              if (!meetsConfluence) {
                console.log(`⚠️ [Scanner] Signal rejected due to insufficient confluence: ${symbol} ${pattern.type}`);
                console.log(`   ❌ ${confluenceExplanation}`);
                
                // Log as near-miss skip for ML analysis with FULL confluence data
                const { logNearMissSkip: logNearMissSkipFull } = await import('./nearMissLogger');
                await logNearMissSkipFull({
                  symbol,
                  timeframe,
                  patternType: pattern.type,
                  entryPrice,
                  direction: pattern.direction,
                  skipReason: SKIP_REASONS.CONFLUENCE_TOO_LOW,
                  skipCategory: 'confluence',
                  confluenceScore,
                  confluenceFactors,
                  patternScore: pattern.score || 0,
                  patternScoreFactors: mlResult.mlContext.pattern_score_factors,
                  mlContext: mlResult.mlContext,
                  atr15m,
                  atr1h,
                  atr4h,
                });
                
                // Skip this signal and continue to next pattern
                continue;
              }
              
              console.log(`✅ [Confluence] Signal meets confluence requirement: ${confluenceExplanation}`);
              
              // Check R:R validation - skip signal if R:R is below dynamic minimum
              if (!dynamicProfile.rrValidation.isValid) {
                console.log(`⚠️ [Scanner] Signal rejected due to insufficient R:R: ${symbol} ${pattern.type}`);
                console.log(`   ❌ TP1 R:R ${dynamicProfile.actualRR.tp1.toFixed(2)} < ${dynamicProfile.dynamicMinRR.toFixed(2)} (required)`);
                
                // Log as near-miss skip for ML analysis with FULL confluence data
                const { logNearMissSkip: logNearMissSkipFull } = await import('./nearMissLogger');
                await logNearMissSkipFull({
                  symbol,
                  timeframe,
                  patternType: pattern.type,
                  entryPrice,
                  direction: pattern.direction,
                  skipReason: SKIP_REASONS.RR_BELOW_DYNAMIC_MIN,
                  skipCategory: 'rr',
                  confluenceScore,
                  confluenceFactors,
                  patternScore: pattern.score || 0,
                  patternScoreFactors: mlResult.mlContext.pattern_score_factors,
                  mlContext: mlResult.mlContext,
                  atr15m,
                  atr1h,
                  atr4h,
                });
                
                // Skip this signal and continue to next pattern
                continue;
              }
              
              console.log(`✅ [Scanner] Signal passed R:R validation, proceeding with trade execution...`);
              
              // Fallback to legacy calculator if dynamic profile has veto or no TPs
              let riskProfile: any;
              if (dynamicProfile.vetoReason !== 'none' || !dynamicProfile.tp1) {
                console.log(`⚠️ [Scanner] Dynamic profile has veto or no space, falling back to legacy calculator`);
                riskProfile = riskCalculator.calculateRiskProfile(
                  pattern.type,
                  pattern.direction,
                  entryPrice,
                  candles,
                  candles1h,
                  candles4h
                );
                console.log(`✅ [Scanner] Legacy risk profile: SL=${riskProfile.sl.toFixed(8)}, TP1=${riskProfile.tp1.toFixed(8)}, TP2=${riskProfile.tp2.toFixed(8)}, TP3=${riskProfile.tp3.toFixed(8)}`);
              } else {
                // Convert dynamic profile to legacy format for compatibility
                riskProfile = {
                  sl: dynamicProfile.sl,
                  tp1: dynamicProfile.tp1,
                  tp2: dynamicProfile.tp2 || dynamicProfile.tp1, // Fallback if tp2 is null
                  tp3: dynamicProfile.tp3 || dynamicProfile.tp2 || dynamicProfile.tp1, // Fallback chain
                  initialSl: dynamicProfile.sl,
                  atr15m: dynamicProfile.riskR, // Use actual risk R as atr15m for consistency
                  atr4h: atr4h,
                  scenario: dynamicProfile.scenario === 'scalp_1R' ? 'trend_continuation' : 'htf_reversal',
                  meta: {
                    riskR: dynamicProfile.riskR,
                    tp1R: dynamicProfile.tp1 ? Math.abs(dynamicProfile.tp1 - entryPrice) / dynamicProfile.riskR : 0,
                    tp2R: dynamicProfile.tp2 ? Math.abs(dynamicProfile.tp2 - entryPrice) / dynamicProfile.riskR : 0,
                    tp3R: dynamicProfile.tp3 ? Math.abs(dynamicProfile.tp3 - entryPrice) / dynamicProfile.riskR : 0,
                  },
                };
              }

              // Add confluence scoring data to enriched ML context (captured at signal entry)
              enrichedMLContext = {
                ...enrichedMLContext,
                confluenceScore,
                confluenceDetails: confluenceFactors,
              };

              // ✅ NEW: Calculate dynamic position management strategy
              let dynamicStrategy = null;
              try {
                const { calculateDynamicStrategy } = await import('../utils/dynamicPositionManager');
                dynamicStrategy = calculateDynamicStrategy({
                  confluenceScore,
                  trendStrength: enrichedMLContext.trendBias === 'long' || enrichedMLContext.trendBias === 'short' ? 'strong' : 'medium',
                  rAvailable: dynamicProfile?.rAvailable || 3.0,
                  atrVolatility: dynamicProfile?.atrVolatility || 'normal',
                });
                console.log(`🎯 [Scanner] Dynamic strategy: ${dynamicStrategy.profile}, TPs: ${dynamicStrategy.tp1R}R/${dynamicStrategy.tp2R}R/${dynamicStrategy.tp3R}R, Close: ${dynamicStrategy.p1}%/${dynamicStrategy.p2}%/${dynamicStrategy.p3}%`);
              } catch (error: any) {
                console.warn(`⚠️ [Scanner] Failed to calculate dynamic strategy, using defaults:`, error.message);
              }

              const signal = await signalDB.createSignal({
                symbol,
                timeframe,
                patternType: pattern.type,
                entryPrice: entryPrice.toString(), // Entry = PATTERN CANDLE CLOSE PRICE
                slPrice: riskProfile.sl.toString(),
                tp1Price: riskProfile.tp1.toString(),
                tp2Price: riskProfile.tp2.toString(),
                tp3Price: riskProfile.tp3.toString(),
                currentSl: riskProfile.sl.toString(),
                initialSl: riskProfile.initialSl.toString(),
                atr15m: riskProfile.atr15m.toString(),
                atrH4: riskProfile.atr4h.toString(),
                direction: pattern.direction,
                status: 'OPEN',
                // ML context fields (enriched with dynamic risk data)
                ...extractMLContextFields(enrichedMLContext),
                // ✅ NEW: Dynamic position management parameters
                ...(dynamicStrategy ? {
                  partialCloseP1: dynamicStrategy.p1.toString(),
                  partialCloseP2: dynamicStrategy.p2.toString(),
                  partialCloseP3: dynamicStrategy.p3.toString(),
                  strategyProfile: dynamicStrategy.profile,
                } : {}),
              });

              signalsFound++;
              // Calculate delay from candle close time, not scan start time
              const elapsedSinceClose = Math.max(0, (Date.now() - lastCandle.closeTime) / 1000).toFixed(1);
              const directionText = pattern.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT';
              const patternName = pattern.type.replace('_', ' ').toUpperCase();
              
              // 📊 S/R ЗОНЫ С 4H (для legacy отображения) - используем старую функцию
              console.log(`📊 [Scanner] Fetching legacy 4H S/R zones for ${symbol}...`);
              let sr4hAnalysis = null;
              try {
                if (candles4h.length >= 300) {
                  sr4hAnalysis = analyzeSRZonesTV(candles4h);
                  console.log(`✅ [Scanner] 4H S/R zones retrieved successfully`);
                }
              } catch (error: any) {
                console.error(`❌ [Scanner] Failed to fetch 4H S/R zones:`, error.message);
              }
              
              // Форматирование S/R зон с 4H (показываем диапазон)
              const supportZoneText = sr4hAnalysis?.nearestSupport 
                ? `${sr4hAnalysis.nearestSupport.lower.toFixed(8)} - ${sr4hAnalysis.nearestSupport.upper.toFixed(8)} (${sr4hAnalysis.nearestSupport.touches} касаний, ${sr4hAnalysis.nearestSupport.strength})`
                : 'Не обнаружена';
              
              const resistanceZoneText = sr4hAnalysis?.nearestResistance
                ? `${sr4hAnalysis.nearestResistance.lower.toFixed(8)} - ${sr4hAnalysis.nearestResistance.upper.toFixed(8)} (${sr4hAnalysis.nearestResistance.touches} касаний, ${sr4hAnalysis.nearestResistance.strength})`
                : 'Не обнаружена';
              
              // Рейтинг сигнала
              const scoreEmoji = pattern.score && pattern.score >= 150 ? '⭐⭐⭐' : '⭐⭐';
              const scoreText = pattern.score ? ` | Score: ${pattern.score}` : '';

              const message = `
🚨 <b>НОВЫЙ СИГНАЛ ${scoreEmoji}</b> 🚨

💎 <b>Монета:</b> ${symbol}
📊 <b>Направление:</b> ${directionText}
⏰ <b>Таймфрейм:</b> ${timeframe}
📈 <b>Паттерн:</b> ${patternName}
🏷️ <b>Кластер:</b> ${cluster.leader} | ${cluster.sector}
🎯 <b>Стратегия:</b> ${riskProfile.scenario === 'htf_reversal' ? 'HTF Разворот' : 'Тренд'}

💰 <b>Entry:</b> ${entryPrice.toFixed(8)}
🛑 <b>Stop Loss:</b> ${riskProfile.sl.toFixed(8)}
🎯 <b>TP1:</b> ${riskProfile.tp1.toFixed(8)} (${riskProfile.meta.tp1R.toFixed(2)}R)
🎯 <b>TP2:</b> ${riskProfile.tp2.toFixed(8)} (${riskProfile.meta.tp2R.toFixed(2)}R)
🎯 <b>TP3:</b> ${riskProfile.tp3.toFixed(8)} (${riskProfile.meta.tp3R.toFixed(2)}R)

📊 <b>ATR:</b> 15m=${riskProfile.atr15m.toFixed(8)} | 4h=${riskProfile.atr4h.toFixed(8)}
📊 <b>S/R Зоны (4H):</b>
📍 <b>Поддержка:</b> ${supportZoneText}
📍 <b>Сопротивление:</b> ${resistanceZoneText}

🆔 Signal ID: ${signal.id}${scoreText}
⚡ <b>Delay:</b> ${elapsedSinceClose}s after candle close
              `.trim();

              const messageId = await this.sendTelegramMessage(message);
              if (messageId) {
                await signalDB.updateTelegramMessageId(signal.id, messageId);
                console.log(`✅ [Scanner] Saved Telegram message_id ${messageId} for signal ${signal.id}`);
              }
              console.log(`🚀 [Scanner] Signal #${signalsFound} sent: ${symbol} ${pattern.type} (${elapsedSinceClose}s after candle close)`);
            }
          } catch (error: any) {
            console.error(`❌ [Scanner] Error scanning ${symbol}:`, error.message);
          }
        }));

        processedCount += batch.length;
        const batchElapsed = ((Date.now() - batchStartTime) / 1000).toFixed(1);
        console.log(`⚡ [Scanner] Batch ${Math.floor(i / BATCH_SIZE) + 1} completed: ${batch.length} coins in ${batchElapsed}s (total: ${processedCount}/${pairs.length})`);
      }

      const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ [Scanner] Completed scan for ${timeframe} in ${totalElapsed}s (${signalsFound} signals found, ~${(pairs.length / parseFloat(totalElapsed)).toFixed(0)} coins/sec)`);
    } catch (error: any) {
      console.error(`❌ [Scanner] Fatal error during ${timeframe} scan:`, error.message);
    }
  }
}

export const scanner = new Scanner();
