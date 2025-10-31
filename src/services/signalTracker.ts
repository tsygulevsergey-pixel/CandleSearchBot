import { signalDB } from '../mastra/storage/db';
import { binanceClient } from '../utils/binanceClient';
import { riskCalculator } from '../utils/riskCalculator';
import { 
  calculateTradeOutcome, 
  calculatePartialClosedPercent,
  getStatusEmoji, 
  formatPnL,
  formatPnLR 
} from '../utils/tradeOutcomes';
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
          
          // ✅ Smart TP3 detection: if tp2 and tp3 are equal (or very close), treat as single-level TP
          // This prevents TP3_HIT misdetection for 15m scalp signals where tp1=tp2=tp3=2R
          const tp2Value = parseFloat(signal.tp2Price);
          const tp3Value = signal.tp3Price ? parseFloat(signal.tp3Price) : null;
          const PRICE_TOLERANCE = tp2Value * 0.0001; // 0.01% tolerance for price equality
          
          // If tp3 exists AND is within tolerance of tp2, treat as null (single-level TP)
          const tp3EqualsTP2 = tp3Value !== null && Math.abs(tp3Value - tp2Value) < PRICE_TOLERANCE;
          const tp3ForCheck = tp3EqualsTP2 ? null : tp3Value;
          
          console.log(`🔍 [SignalTracker] Checking ${signal.symbol} (ID: ${signal.id}):`, {
            currentPrice: currentPrice.toFixed(8),
            high1m: Number(candles[candles.length - 1].high).toFixed(8),
            low1m: Number(candles[candles.length - 1].low).toFixed(8),
            strategyProfile: signal.strategyProfile || 'default',
            tp1: signal.tp1Price ? parseFloat(signal.tp1Price).toFixed(8) : 'null',
            tp2: tp2Value.toFixed(8),
            tp3: tp3ForCheck ? tp3ForCheck.toFixed(8) : `null (${tp3EqualsTP2 ? 'equals tp2' : 'not set'})`,
            sl: parseFloat(signal.currentSl).toFixed(8),
          });
          
          const { newStatus, newSl } = riskCalculator.checkSignalStatusWithCandles(
            candles,
            currentPrice,
            parseFloat(signal.entryPrice),
            parseFloat(signal.currentSl),
            signal.tp1Price ? parseFloat(signal.tp1Price) : parseFloat(signal.entryPrice), // TP1 fallback to entry
            tp2Value,
            tp3ForCheck, // ✅ null if tp3=tp2 (single-level), prevents TP3_HIT misdetection
            signal.direction,
            signal.status
          );

          if (newStatus !== signal.status) {
            console.log(`🔄 [SignalTracker] Status change detected: ${signal.status} → ${newStatus}`);

            // ✅ Read dynamic strategy parameters from DB (if available)
            const customPercents = signal.partialCloseP1 ? {
              p1: parseFloat(signal.partialCloseP1),
              p2: parseFloat(signal.partialCloseP2!),
              p3: parseFloat(signal.partialCloseP3!),
            } : undefined; // undefined = use defaults (backward compatibility)

            const actualTpR = signal.actualRrTp1 ? {
              tp1R: parseFloat(signal.actualRrTp1),
              tp2R: parseFloat(signal.actualRrTp2!),
              tp3R: parseFloat(signal.actualRrTp3!),
            } : undefined; // undefined = calculate from prices (backward compatibility)

            // Calculate partial closed percentage (with dynamic or default %s)
            const currentPartialClosed = parseFloat(signal.partialClosed || '0');
            const partialClosed = calculatePartialClosedPercent(newStatus, currentPartialClosed, customPercents);
            
            // Only set beActivated to true when TP1/TP2 hit
            // Leave it undefined (unchanged) for other statuses like BE_HIT
            const beActivated = (newStatus === 'TP1_HIT' || newStatus === 'TP2_HIT') ? true : undefined;
            
            console.log(`📊 [SignalTracker] Partial close calculation:`, {
              previousPartialClosed: currentPartialClosed,
              newPartialClosed: partialClosed,
              customPercents: customPercents ? `${customPercents.p1}/${customPercents.p2}/${customPercents.p3}` : 'default 50/30/20',
              actualTpR: actualTpR ? `${actualTpR.tp1R}R/${actualTpR.tp2R}R/${actualTpR.tp3R}R` : 'calculated from prices',
              beActivated,
            });

            // Используем централизованную логику расчета PnL (с динамическими или default параметрами)
            const outcome = calculateTradeOutcome({
              status: newStatus,
              direction: signal.direction,
              entryPrice: signal.entryPrice,
              tp1Price: signal.tp1Price || undefined,
              tp2Price: signal.tp2Price,
              tp3Price: signal.tp3Price || undefined,
              slPrice: signal.slPrice,
              currentSl: newSl !== undefined ? newSl.toString() : signal.currentSl,
              partialClosed: currentPartialClosed,
              customPercents,  // ✅ Pass dynamic %s (or undefined for defaults)
              actualTpR,       // ✅ Pass actual TP R values (or undefined to calculate)
            });

            // Update database with all new fields
            await signalDB.updateSignalStatus(
              signal.id,
              newStatus as any,
              newSl !== undefined ? newSl.toString() : undefined,
              partialClosed,
              beActivated,
              outcome.pnlR,
              outcome.pnl
            );

            console.log(`💰 [SignalTracker] PnL calculated:`, {
              pnlR: outcome.pnlR.toFixed(4),
              pnlPercent: outcome.pnl.toFixed(4),
              partialClosed: `${partialClosed}%`,
              beActivated,
            });

            const statusEmoji = getStatusEmoji(outcome.outcomeType);
            const statusText = outcome.description.toUpperCase();
            // ✅ FIX: Always show PnL for closed positions (including SL_HIT with negative PnL)
            const pnlText = (newStatus !== 'OPEN')
              ? `\n💵 <b>PnL:</b> ${formatPnL(outcome.pnl)} (${formatPnLR(outcome.pnlR)})` 
              : '';
            const partialClosedText = partialClosed > 0 && partialClosed < 100
              ? `\n📉 <b>Закрыто:</b> ${partialClosed}%`
              : '';

            const directionText = signal.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT';

            const message = `
${statusEmoji} <b>ОБНОВЛЕНИЕ СИГНАЛА</b> ${statusEmoji}

🆔 Signal ID: ${signal.id}
💎 <b>Монета:</b> ${signal.symbol}
📊 <b>Направление:</b> ${directionText}
⏰ <b>Таймфрейм:</b> ${signal.timeframe}

<b>${statusText}</b>${pnlText}${partialClosedText}

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
