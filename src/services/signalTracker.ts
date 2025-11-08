import { signalDB, liveTradesDB } from '../mastra/storage/db';
import { binanceClient } from '../utils/binanceClient';
import { binanceTradeExecutor } from './binanceTradeExecutor';
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
          
          // 🔍 DIAGNOSTIC: Validate currentPrice for trailing stop debugging
          const correlationId = `${signal.symbol}_${signal.id}`;
          if (currentPrice <= 0 || isNaN(currentPrice)) {
            console.error(`❌ [SignalTracker][${correlationId}] CRITICAL: Invalid currentPrice=${currentPrice}`);
            console.error(`   ⚠️ This will corrupt MFE/MAE calculations and prevent trailing stop activation!`);
            console.error(`   ⚠️ Skipping this signal until valid price is available`);
            continue; // Skip this signal to prevent corruption
          }
          
          // ✅ Smart TP3 detection: if tp2 and tp3 are equal (or very close), treat as single-level TP
          // This prevents TP3_HIT misdetection for 15m scalp signals where tp1=tp2=tp3=2R
          const tp2Value = parseFloat(signal.tp2Price);
          const tp3Value = signal.tp3Price ? parseFloat(signal.tp3Price) : null;
          const PRICE_TOLERANCE = tp2Value * 0.0001; // 0.01% tolerance for price equality
          
          // If tp3 exists AND is within tolerance of tp2, treat as null (single-level TP)
          const tp3EqualsTP2 = tp3Value !== null && Math.abs(tp3Value - tp2Value) < PRICE_TOLERANCE;
          const tp3ForCheck = tp3EqualsTP2 ? null : tp3Value;
          
          // ✅ NEW: Track MFE (Maximum Favorable Excursion) and MAE (Maximum Adverse Excursion)
          const entryPrice = parseFloat(signal.entryPrice);
          const slPrice = parseFloat(signal.slPrice);
          const R = Math.abs(entryPrice - slPrice); // 1R = distance from entry to SL
          
          // Calculate current excursion in R units
          let currentExcursion = 0;
          if (signal.direction === 'LONG') {
            currentExcursion = (currentPrice - entryPrice) / R;
          } else {
            currentExcursion = (entryPrice - currentPrice) / R;
          }
          
          // 🔍 DIAGNOSTIC: Log MFE calculation inputs and result
          console.log(`📊 [SignalTracker][${correlationId}] MFE Calculation:`, {
            currentPrice: currentPrice.toFixed(8),
            entryPrice: entryPrice.toFixed(8),
            slPrice: slPrice.toFixed(8),
            R: R.toFixed(8),
            direction: signal.direction,
            currentExcursion: `${currentExcursion.toFixed(3)}R`,
          });
          
          // Update MFE (max profit) and MAE (max loss)
          const currentMFE = signal.mfeR ? parseFloat(signal.mfeR as any) : 0;
          const currentMAE = signal.maeR ? parseFloat(signal.maeR as any) : 0;
          const newMFE = Math.max(currentMFE, currentExcursion);
          const newMAE = Math.min(currentMAE, currentExcursion);
          
          // 🔍 DIAGNOSTIC: Log MFE/MAE updates
          if (newMFE !== currentMFE || newMAE !== currentMAE) {
            console.log(`📈 [SignalTracker][${correlationId}] MFE/MAE Updated:`, {
              oldMFE: `${currentMFE.toFixed(3)}R`,
              newMFE: `${newMFE.toFixed(3)}R`,
              oldMAE: `${currentMAE.toFixed(3)}R`,
              newMAE: `${newMAE.toFixed(3)}R`,
            });
          }
          
          // Update first_touch if not set and any level touched
          let firstTouch = signal.firstTouch;
          if (!firstTouch) {
            const tp1 = signal.tp1Price ? parseFloat(signal.tp1Price) : null;
            const tp2 = tp2Value;
            const tp3 = tp3ForCheck;
            const sl = parseFloat(signal.currentSl);
            
            if (signal.direction === 'LONG') {
              if (tp3 && currentPrice >= tp3) firstTouch = 'tp3';
              else if (tp2 && currentPrice >= tp2) firstTouch = 'tp2';
              else if (tp1 && currentPrice >= tp1) firstTouch = 'tp1';
              else if (currentPrice <= sl) firstTouch = 'sl';
            } else {
              if (tp3 && currentPrice <= tp3) firstTouch = 'tp3';
              else if (tp2 && currentPrice <= tp2) firstTouch = 'tp2';
              else if (tp1 && currentPrice <= tp1) firstTouch = 'tp1';
              else if (currentPrice >= sl) firstTouch = 'sl';
            }
          }
          
          // Update MFE/MAE in database (every check)
          if (newMFE !== currentMFE || newMAE !== currentMAE || (firstTouch && firstTouch !== signal.firstTouch)) {
            await signalDB.updateMFEMAE(signal.id, newMFE, newMAE, firstTouch || undefined);
          }
          
          // ✅ NEW: Trailing Stop 1.0R → 0.5R (только для 15m SCALP_15M стратегии)
          // Когда прибыль достигает 1.0R, переместить SL на +0.5R (вместо breakeven на 0R)
          // Это спасает 93 SL (превращает -1R в +0.5R), теряет только 23 TP
          // Улучшение Win Rate: 43.8% → 56.4% (+12.6%)
          const isTrailingEligible = signal.strategyProfile === 'SCALP_15M';
          const trailingActivated = signal.trailingActivated || false;
          
          // 🔍 DIAGNOSTIC: Log trailing stop eligibility check
          console.log(`🔍 [SignalTracker][${correlationId}] Trailing Stop Check:`, {
            strategyProfile: signal.strategyProfile,
            isTrailingEligible,
            trailingActivated,
            newMFE: `${newMFE.toFixed(3)}R`,
            threshold: '1.0R',
            willActivate: isTrailingEligible && !trailingActivated && newMFE >= 1.0,
          });
          
          if (isTrailingEligible && !trailingActivated && newMFE >= 1.0) {
            // Достигнута прибыль 1.0R - активируем trailing stop на +0.5R
            const trailingSL = signal.direction === 'LONG'
              ? entryPrice + (R * 0.5)  // LONG: SL выше entry на 0.5R
              : entryPrice - (R * 0.5); // SHORT: SL ниже entry на 0.5R
            
            console.log(`🔥 [Trailing Stop][${correlationId}] ACTIVATED at ${newMFE.toFixed(3)}R profit!`);
            console.log(`   📍 Entry: ${entryPrice.toFixed(8)}`);
            console.log(`   📍 Current Price: ${currentPrice.toFixed(8)}`);
            console.log(`   📍 Old SL: ${parseFloat(signal.currentSl).toFixed(8)}`);
            console.log(`   📍 New SL: ${trailingSL.toFixed(8)} (+0.5R from entry)`);
            console.log(`   💰 Profit Protection: -1R loss → +0.5R profit guaranteed`);
            console.log(`   ⏰ Timestamp: ${new Date().toISOString()}`);
            
            // ✅ NEW LOGIC: Always update SL in DB (for paper trading / monitoring)
            // Only update Binance if live trade exists
            console.log(`\n📡 [SignalTracker][${correlationId}] Applying trailing stop...`);
            
            // Get live trade to check if real position exists
            const liveTrade = await liveTradesDB.getLiveTradeBySignalId(signal.id);
            
            if (!liveTrade || !liveTrade.positionSize) {
              // ⚠️ No live trade - update DB ONLY (paper trading mode)
              console.warn(`⚠️ [SignalTracker][${correlationId}] No live trade found - applying trailing in paper mode`);
              console.warn(`   ✅ Will update SL in DB (for monitoring)`);
              console.warn(`   ⏭️ Skip Binance update (no real position)`);
              
              // ✅ Update DB with new trailing SL (same as real trade would have)
              console.log(`💾 [SignalTracker][${correlationId}] Updating trailing stop in DB (paper mode)...`);
              try {
                await signalDB.updateTrailingStop(signal.id, trailingSL.toString(), true);
                signal.currentSl = trailingSL.toString();
                signal.trailingActivated = true;
                console.log(`✅ [SignalTracker][${correlationId}] Trailing stop updated in DB: ${trailingSL.toFixed(8)}`);
                console.log(`   ✅ New SL will be used for TP/SL checks below`);
              } catch (dbError: any) {
                console.error(`❌ [SignalTracker][${correlationId}] DB update failed:`, dbError.message);
                // Continue with original SL if DB update fails
              }
              
              // ✅ Send Telegram notification ONCE (informational, not error)
              if (!signal.trailingAlertSent) {
                const alertMessage = `
📊 <b>TRAILING STOP АКТИВИРОВАН (Paper Mode)</b>

💎 <b>Символ:</b> ${signal.symbol}
📊 <b>ID Сигнала:</b> ${signal.id}
💰 <b>MFE:</b> ${newMFE.toFixed(3)}R (достиг порога 1.0R)

✅ <b>Новый SL:</b> ${trailingSL.toFixed(8)} (+0.5R от entry)
🔒 <b>Защита:</b> +0.5R профит гарантирован

ℹ️ <b>Режим:</b> Paper trading (нет live trade)
⚠️ <b>Внимание:</b> SL на Binance НЕ обновлён (нет реальной позиции)
                `.trim();
                
                await this.sendTelegramMessage(alertMessage, signal.telegramMessageId || undefined);
                await signalDB.updateSignal(signal.id, { trailingAlertSent: true });
              }
            } else {
              // ✅ Live trade exists - proceed with trailing stop activation
              const positionSize = parseFloat(liveTrade.positionSize as string);
              
              // Call Binance API to update SL
              const binanceResult = await binanceTradeExecutor.updateTrailingStop({
                symbol: signal.symbol,
                direction: signal.direction,
                newSlPrice: trailingSL,
                quantity: positionSize,
                signalId: signal.id,
                correlationId,
              });
              
              if (!binanceResult.success) {
                // Binance update failed - DON'T update DB, alert user, but CONTINUE checking TP/SL
                console.error(`❌ [SignalTracker][${correlationId}] Binance SL update FAILED: ${binanceResult.error}`);
                console.error(`   ⚠️ Trailing stop NOT activated - DB and Binance remain in sync`);
                console.error(`   ⚠️ Position still has original SL: ${parseFloat(signal.currentSl).toFixed(8)}`);
                console.error(`   ⚠️ Signal will continue to be monitored for TP/SL with original SL`);
                
                // Send Telegram alert
                const alertMessage = `
⚠️ <b>ОШИБКА ОБНОВЛЕНИЯ TRAILING STOP</b> ⚠️

💎 <b>Символ:</b> ${signal.symbol}
📊 <b>ID Сигнала:</b> ${signal.id}
💰 <b>MFE:</b> ${newMFE.toFixed(3)}R (достиг порога 1.0R)

❌ <b>Ошибка Binance API:</b> ${binanceResult.error}

🔧 <b>Статус:</b> Исходный SL без изменений (${parseFloat(signal.currentSl).toFixed(8)})
⚠️ <b>Требуется:</b> Проверить позицию вручную или проверить подключение к API
                `.trim();
                
                await this.sendTelegramMessage(alertMessage);
                
                // ✅ DON'T use continue - let the signal be checked for TP/SL below
                // Skip DB update but continue monitoring
              } else {
                // ✅ Binance SL updated successfully - update DB and local state
                console.log(`✅ [SignalTracker][${correlationId}] Binance SL updated successfully: ${binanceResult.newSlOrderId}`);
                
                // 🔍 DIAGNOSTIC: Log DB update attempt (after successful Binance update)
                console.log(`💾 [SignalTracker][${correlationId}] Updating trailing stop in DB...`);
                try {
                  await signalDB.updateTrailingStop(signal.id, trailingSL.toString(), true);
                  console.log(`✅ [SignalTracker][${correlationId}] Trailing stop updated in DB successfully`);
                } catch (dbError: any) {
                  console.error(`❌ [SignalTracker][${correlationId}] DB update failed:`, dbError.message);
                  console.error(`   ⚠️ WARNING: Binance has new SL but DB still has old SL - MANUAL FIX REQUIRED`);
                  throw dbError; // Re-throw to prevent false positive
                }
                
                // 🔍 DIAGNOSTIC: Log local state update
                signal.currentSl = trailingSL.toString();
                signal.trailingActivated = true;
                console.log(`✅ [SignalTracker][${correlationId}] Local state updated: currentSl=${signal.currentSl}, trailingActivated=true`);
              }
            }
          }
          
          console.log(`🔍 [SignalTracker] Checking ${signal.symbol} (ID: ${signal.id}):`, {
            currentPrice: currentPrice.toFixed(8),
            high1m: Number(candles[candles.length - 1].high).toFixed(8),
            low1m: Number(candles[candles.length - 1].low).toFixed(8),
            strategyProfile: signal.strategyProfile || 'default',
            tp1: signal.tp1Price ? parseFloat(signal.tp1Price).toFixed(8) : 'null',
            tp2: tp2Value.toFixed(8),
            tp3: tp3ForCheck ? tp3ForCheck.toFixed(8) : `null (${tp3EqualsTP2 ? 'equals tp2' : 'not set'})`,
            sl: parseFloat(signal.currentSl).toFixed(8),
            mfe: `${newMFE.toFixed(2)}R`,
            mae: `${newMAE.toFixed(2)}R`,
            firstTouch: firstTouch || 'none',
            trailingActivated: signal.trailingActivated || false,
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
            signal.status,
            signal.trailingActivated || false // ✅ Pass trailing stop flag for BE_HIT detection
          );

          if (newStatus !== signal.status) {
            console.log(`🔄 [SignalTracker] Status change detected: ${signal.status} → ${newStatus}`);

            // ✅ NEW: Calculate time to TP/SL in minutes
            const signalCreatedAt = new Date(signal.createdAt).getTime();
            const now = Date.now();
            const elapsedMinutes = Math.floor((now - signalCreatedAt) / (1000 * 60));
            
            let timeToTp1Min: number | undefined;
            let timeToTp2Min: number | undefined;
            let timeToTp3Min: number | undefined;
            let timeToSlMin: number | undefined;
            let timeToBeMin: number | undefined;
            
            if (newStatus === 'TP1_HIT') timeToTp1Min = elapsedMinutes;
            else if (newStatus === 'TP2_HIT') timeToTp2Min = elapsedMinutes;
            else if (newStatus === 'TP3_HIT') timeToTp3Min = elapsedMinutes;
            else if (newStatus === 'SL_HIT') timeToSlMin = elapsedMinutes;
            else if (newStatus === 'BE_HIT') timeToBeMin = elapsedMinutes;
            
            console.log(`⏱️ [SignalTracker] Time tracking: ${newStatus} reached after ${elapsedMinutes} minutes`);

            // ✅ Read dynamic strategy parameters from DB (if available)
            // IMPORTANT: Check for null/undefined, not truthiness (0 is valid value!)
            const customPercents = signal.partialCloseP1 !== null && signal.partialCloseP1 !== undefined ? {
              p1: parseFloat(signal.partialCloseP1),
              p2: parseFloat(signal.partialCloseP2!),
              p3: parseFloat(signal.partialCloseP3!),
            } : undefined; // undefined = use defaults (backward compatibility)

            const actualTpR = signal.actualRrTp1 !== null && signal.actualRrTp1 !== undefined ? {
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
              trailingActivated: signal.trailingActivated || false, // ✅ Pass trailing stop flag
            });

            // Update database with all new fields including time tracking
            await signalDB.updateSignalStatus(
              signal.id,
              newStatus as any,
              newSl !== undefined ? newSl.toString() : undefined,
              partialClosed,
              beActivated,
              outcome.pnlR,
              outcome.pnl,
              timeToTp1Min,
              timeToTp2Min,
              timeToTp3Min,
              timeToSlMin,
              timeToBeMin
            );

            console.log(`💰 [SignalTracker] PnL calculated:`, {
              pnlR: outcome.pnlR.toFixed(4),
              pnlPercent: outcome.pnl.toFixed(4),
              partialClosed: `${partialClosed}%`,
              beActivated,
            });

            // ✅ NEW: Start post-SL monitoring for stopped signals
            if (newStatus === 'SL_HIT') {
              console.log(`📊 [PostSL] Signal #${signal.id} stopped, starting post-SL monitoring (4h)...`);
              try {
                const { monitorAfterStopLoss } = await import('./postSlMonitor');
                
                // Monitor in background (don't await - let it run asynchronously)
                monitorAfterStopLoss(signal.id, 4).then(async (result) => {
                  console.log(`✅ [PostSL] Monitoring complete for signal #${signal.id}:`, result);
                  
                  // Update DB with post-SL results
                  await signalDB.updateSignal(signal.id, {
                    postSlOutcome: result.outcome,
                    postSlMaxFavorableR: result.maxFavorableR.toString(),
                    postSlTimeToTpMin: result.timeToTpMin,
                    postSlMonitoredUntil: new Date(),
                  });
                }).catch((error) => {
                  console.error(`❌ [PostSL] Error monitoring signal #${signal.id}:`, error);
                });
              } catch (error) {
                console.error(`❌ [PostSL] Failed to start post-SL monitoring:`, error);
              }
            }

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

🆔 <b>ID Сигнала:</b> ${signal.id}
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
