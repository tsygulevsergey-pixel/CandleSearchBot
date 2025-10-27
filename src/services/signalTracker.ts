import { signalDB } from '../mastra/storage/db';
import { binanceClient } from '../utils/binanceClient';
import { riskCalculator } from '../utils/riskCalculator';
import { calculateTradeOutcome, getStatusEmoji, formatPnL } from '../utils/tradeOutcomes';
import axios from 'axios';

export class SignalTracker {
  private telegramChatId: string;
  private telegramBotToken: string;

  constructor() {
    this.telegramChatId = process.env.TELEGRAM_CHAT_ID || '';
    this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
  }

  async sendTelegramMessage(message: string, replyToMessageId?: number): Promise<void> {
    if (!this.telegramBotToken || !this.telegramChatId) {
      console.warn('⚠️ [SignalTracker] Telegram credentials not configured, skipping message send');
      return;
    }

    try {
      const payload: any = {
        chat_id: this.telegramChatId,
        text: message,
        parse_mode: 'HTML',
      };

      if (replyToMessageId) {
        payload.reply_to_message_id = replyToMessageId;
      }

      await axios.post(`https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`, payload);
      console.log('✅ [SignalTracker] Telegram message sent successfully');
    } catch (error: any) {
      console.error('❌ [SignalTracker] Failed to send Telegram message:', error.message);
    }
  }

  async trackSignals(): Promise<void> {
    console.log('\n👀 [SignalTracker] Checking open signals...');

    try {
      const openSignals = await signalDB.getOpenSignals();
      console.log(`📊 [SignalTracker] Found ${openSignals.length} open signals`);

      for (const signal of openSignals) {
        try {
          // Get last 2 x 1m candles INCLUDING current open candle
          // This ensures we catch TP/SL hits that happen INSIDE the current minute
          const candles = await binanceClient.getKlines(signal.symbol, '1m', 2, true);
          
          if (candles.length === 0) {
            console.warn(`⚠️ [SignalTracker] No 1m candles for ${signal.symbol}, skipping`);
            continue;
          }

          const currentPrice = await binanceClient.getCurrentPrice(signal.symbol);
          
          console.log(`🔍 [SignalTracker] Checking ${signal.symbol} (ID: ${signal.id}):`, {
            currentPrice: currentPrice.toFixed(8),
            high1m: Number(candles[candles.length - 1].high).toFixed(8),
            low1m: Number(candles[candles.length - 1].low).toFixed(8),
            tp1: parseFloat(signal.tp1Price).toFixed(8),
            tp2: parseFloat(signal.tp2Price).toFixed(8),
            sl: parseFloat(signal.currentSl).toFixed(8),
          });
          
          const { newStatus, newSl } = riskCalculator.checkSignalStatusWithCandles(
            candles,
            currentPrice,
            parseFloat(signal.entryPrice),
            parseFloat(signal.currentSl),
            parseFloat(signal.tp1Price),
            parseFloat(signal.tp2Price),
            signal.direction,
            signal.status
          );

          if (newStatus !== signal.status) {
            await signalDB.updateSignalStatus(
              signal.id,
              newStatus as any,
              newSl !== undefined ? newSl.toString() : undefined
            );

            // Используем централизованную логику расчета PnL
            const outcome = calculateTradeOutcome({
              status: newStatus,
              direction: signal.direction,
              entryPrice: signal.entryPrice,
              tp1Price: signal.tp1Price,
              tp2Price: signal.tp2Price,
              slPrice: signal.slPrice,
              currentSl: newSl !== undefined ? newSl.toString() : signal.currentSl,
            });

            const statusEmoji = getStatusEmoji(outcome.outcomeType);
            const statusText = outcome.description.toUpperCase() + (newStatus === 'TP1_HIT' ? ' SL перенесен в безубыток.' : '');
            const pnlText = outcome.pnl !== 0 ? `\n💵 <b>PnL:</b> ${formatPnL(outcome.pnl)}` : '';

            const directionText = signal.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT';

            const message = `
${statusEmoji} <b>ОБНОВЛЕНИЕ СИГНАЛА</b> ${statusEmoji}

🆔 Signal ID: ${signal.id}
💎 <b>Монета:</b> ${signal.symbol}
📊 <b>Направление:</b> ${directionText}
⏰ <b>Таймфрейм:</b> ${signal.timeframe}

<b>${statusText}</b>${pnlText}

💰 <b>Текущая цена:</b> ${currentPrice.toFixed(8)}
${newSl ? `🔄 <b>Новый SL:</b> ${newSl.toFixed(8)}` : ''}
            `.trim();

            await this.sendTelegramMessage(message, signal.telegramMessageId || undefined);
            console.log(`✅ [SignalTracker] Updated signal ${signal.id} to ${newStatus}${outcome.isBreakeven ? ' (BREAKEVEN)' : ''}`);
          }
        } catch (error: any) {
          console.error(`❌ [SignalTracker] Error tracking signal ${signal.id}:`, error.message);
        }
      }

      console.log('✅ [SignalTracker] Completed signal tracking');
    } catch (error: any) {
      console.error('❌ [SignalTracker] Fatal error during signal tracking:', error.message);
    }
  }
}

export const signalTracker = new SignalTracker();
