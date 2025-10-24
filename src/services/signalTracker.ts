import { signalDB } from '../mastra/storage/db';
import { binanceClient } from '../utils/binanceClient';
import { riskCalculator } from '../utils/riskCalculator';
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
          const currentPrice = await binanceClient.getCurrentPrice(signal.symbol);
          
          const { newStatus, newSl } = riskCalculator.checkSignalStatus(
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

            // Определяем тип закрытия
            const entryPrice = parseFloat(signal.entryPrice);
            const tp1Price = parseFloat(signal.tp1Price);
            const tp2Price = parseFloat(signal.tp2Price);
            const slPrice = parseFloat(signal.slPrice);
            const isBreakeven = newStatus === 'SL_HIT' && 
              Math.abs(parseFloat(signal.currentSl) - entryPrice) < entryPrice * 0.0001; // 0.01% tolerance

            let statusEmoji: string;
            let statusText: string;
            let pnl = 0;

            if (newStatus === 'TP1_HIT') {
              statusEmoji = '🎯';
              statusText = 'TP1 ДОСТИГНУТ! SL перенесен в безубыток.';
              // TP1: 50% позиции от entry до TP1
              if (signal.direction === 'LONG') {
                pnl = ((tp1Price - entryPrice) / entryPrice) * 100 * 0.5;
              } else {
                pnl = ((entryPrice - tp1Price) / entryPrice) * 100 * 0.5;
              }
            } else if (newStatus === 'TP2_HIT') {
              statusEmoji = '💎';
              statusText = 'TP2 ДОСТИГНУТ! Полная прибыль!';
              // TP2: 50% от entry до TP1 + 50% от entry до TP2
              if (signal.direction === 'LONG') {
                const pnlTp1 = ((tp1Price - entryPrice) / entryPrice) * 100 * 0.5;
                const pnlTp2 = ((tp2Price - entryPrice) / entryPrice) * 100 * 0.5;
                pnl = pnlTp1 + pnlTp2;
              } else {
                const pnlTp1 = ((entryPrice - tp1Price) / entryPrice) * 100 * 0.5;
                const pnlTp2 = ((entryPrice - tp2Price) / entryPrice) * 100 * 0.5;
                pnl = pnlTp1 + pnlTp2;
              }
            } else if (newStatus === 'SL_HIT') {
              if (isBreakeven) {
                statusEmoji = '⚖️';
                statusText = 'Позиция закрыта в БЕЗУБЫТКЕ после TP1.';
                // Breakeven: 50% закрыто на TP1, 50% в ноль
                if (signal.direction === 'LONG') {
                  pnl = ((tp1Price - entryPrice) / entryPrice) * 100 * 0.5;
                } else {
                  pnl = ((entryPrice - tp1Price) / entryPrice) * 100 * 0.5;
                }
              } else {
                statusEmoji = '🛑';
                statusText = 'STOP LOSS сработал.';
                // SL: полный убыток
                if (signal.direction === 'LONG') {
                  pnl = ((slPrice - entryPrice) / entryPrice) * 100;
                } else {
                  pnl = ((entryPrice - slPrice) / entryPrice) * 100;
                }
              }
            } else {
              statusEmoji = '❓';
              statusText = 'Статус обновлен.';
            }

            // Форматируем PnL
            const pnlSign = pnl >= 0 ? '+' : '';
            const pnlText = pnl !== 0 ? `\n💵 <b>PnL:</b> ${pnlSign}${pnl.toFixed(2)}%` : '';

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
            console.log(`✅ [SignalTracker] Updated signal ${signal.id} to ${newStatus}${isBreakeven ? ' (BREAKEVEN)' : ''}`);
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
