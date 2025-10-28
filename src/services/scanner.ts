import { binanceClient } from '../utils/binanceClient';
import { patternDetector, calculateATR, analyzeSRZonesTV } from '../utils/candleAnalyzer';
import { riskCalculator } from '../utils/riskCalculator';
import { signalDB } from '../mastra/storage/db';
import { getCoinCluster, getCoinsByFamily, getFamilyId } from '../utils/marketClusters';
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
              
              // 🔥 КЛАСТЕРИЗАЦИЯ: проверяем лимит семейства (лидер:сектор)
              const cluster = getCoinCluster(symbol);
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
              
              // 🎯 NEW STRATEGY: Calculate risk profile with ATR + S/R zones
              console.log(`🎯 [Scanner] Fetching multi-timeframe data for ${symbol}...`);
              
              // Fetch candles for all timeframes (for ATR + S/R zone analysis)
              const candles1h = await binanceClient.getKlines(symbol, '1h', 350);
              const candles4h = await binanceClient.getKlines(symbol, '4h', 350);
              
              if (candles1h.length < 300 || candles4h.length < 300) {
                console.log(`⚠️ [Scanner] Insufficient multi-TF candles for ${symbol}, skipping`);
                continue;
              }
              
              // Calculate comprehensive risk profile with ATR-based SL and multi-level TPs
              const riskProfile = riskCalculator.calculateRiskProfile(
                pattern.type,
                pattern.direction,
                entryPrice,
                candles,    // 15m candles
                candles1h,  // 1h candles
                candles4h   // 4h candles
              );
              
              console.log(`✅ [Scanner] Risk profile calculated: SL=${riskProfile.sl.toFixed(8)}, TP1=${riskProfile.tp1.toFixed(8)}, TP2=${riskProfile.tp2.toFixed(8)}, TP3=${riskProfile.tp3.toFixed(8)}`);

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
