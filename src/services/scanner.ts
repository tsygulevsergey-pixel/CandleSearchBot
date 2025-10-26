import { binanceClient } from '../utils/binanceClient';
import { patternDetector } from '../utils/candleAnalyzer';
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
    console.log(`\n🔍 [Scanner] Starting scan for ${timeframe}...`);

    try {
      const pairs = await binanceClient.getTradingPairs();
      console.log(`📊 [Scanner] Scanning ${pairs.length} pairs on ${timeframe}...`);

      for (const symbol of pairs) {
        try {
          const candles = await binanceClient.getKlines(symbol, timeframe, 200);
          
          if (candles.length < 200) {
            console.log(`⚠️ [Scanner] Insufficient candles for ${symbol} (need 200, got ${candles.length}), skipping`);
            continue;
          }

          const patterns = patternDetector.detectAllPatterns(candles, timeframe);

          for (const pattern of patterns) {
            if (!pattern.detected || !pattern.type || !pattern.direction || !pattern.entryPrice) {
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


            const currentPrice = await binanceClient.getCurrentPrice(symbol);
            const levels = riskCalculator.calculateLevels(
              pattern.type,
              pattern.direction,
              currentPrice,
              candles,
              pattern.srAnalysis // Передаем S/R анализ для расчета стопов ЗА зоной
            );

            const signal = await signalDB.createSignal({
              symbol,
              timeframe,
              patternType: pattern.type,
              entryPrice: currentPrice.toString(),
              slPrice: levels.sl.toString(),
              tp1Price: levels.tp1.toString(),
              tp2Price: levels.tp2.toString(),
              currentSl: levels.sl.toString(),
              direction: pattern.direction,
              status: 'OPEN',
            });

            const directionText = pattern.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT';
            const patternName = pattern.type.replace('_', ' ').toUpperCase();
            
            // Форматирование S/R зон
            const supportZoneText = pattern.srAnalysis?.nearestSupport 
              ? `${pattern.srAnalysis.nearestSupport.price.toFixed(8)} (${pattern.srAnalysis.nearestSupport.touches} касаний)`
              : 'Не обнаружена';
            
            const resistanceZoneText = pattern.srAnalysis?.nearestResistance
              ? `${pattern.srAnalysis.nearestResistance.price.toFixed(8)} (${pattern.srAnalysis.nearestResistance.touches} касаний)`
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

💰 <b>Entry:</b> ${currentPrice.toFixed(8)}
🛑 <b>Stop Loss:</b> ${levels.sl.toFixed(8)}
🎯 <b>Take Profit 1:</b> ${levels.tp1.toFixed(8)}
🎯 <b>Take Profit 2:</b> ${levels.tp2.toFixed(8)}

📊 <b>Зона поддержки:</b> ${supportZoneText}
📊 <b>Зона сопротивления:</b> ${resistanceZoneText}

🆔 Signal ID: ${signal.id}${scoreText}
            `.trim();

            const messageId = await this.sendTelegramMessage(message);
            if (messageId) {
              await signalDB.updateTelegramMessageId(signal.id, messageId);
              console.log(`✅ [Scanner] Saved Telegram message_id ${messageId} for signal ${signal.id}`);
            }
            console.log(`✅ [Scanner] Signal created and sent: ${symbol} ${pattern.type}`);
          }
        } catch (error: any) {
          console.error(`❌ [Scanner] Error scanning ${symbol}:`, error.message);
        }
      }

      console.log(`✅ [Scanner] Completed scan for ${timeframe}`);
    } catch (error: any) {
      console.error(`❌ [Scanner] Fatal error during ${timeframe} scan:`, error.message);
    }
  }
}

export const scanner = new Scanner();
