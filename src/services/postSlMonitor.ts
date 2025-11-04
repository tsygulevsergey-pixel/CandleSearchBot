/**
 * Post-SL Monitor - мониторинг графика ПОСЛЕ закрытия сигнала по SL
 * 
 * Цель:
 * - Проверить, достиг ли бы график TP если бы SL был шире
 * - Понять, было ли направление правильным (но SL слишком tight)
 * - Собрать статистику для оптимизации SL размера
 */

import { binanceClient } from '../utils/binanceClient';
import { signalDB, db } from '../mastra/storage/db';
import { signals } from '../mastra/storage/schema';
import { eq, and, sql as drizzleSql } from 'drizzle-orm';

interface PostSlMonitoringResult {
  outcome: 'reached_tp1' | 'reached_tp2' | 'reached_tp3' | 'went_further_against' | 'sideways';
  maxFavorableR: number; // Максимальная прибыль после SL (в R)
  timeToTpMin: number | null; // Время до достижения TP (null если не достиг)
}

/**
 * Monitor price after SL_HIT for specified duration
 * 
 * @param signal - Signal that was stopped out
 * @param monitorDurationHours - How long to monitor (default: 4 hours)
 */
export async function monitorAfterStopLoss(
  signalId: number,
  monitorDurationHours: number = 4
): Promise<PostSlMonitoringResult> {
  console.log(`📊 [PostSL] Starting post-SL monitoring for signal #${signalId}...`);
  
  // Get signal details
  const signal = await signalDB.getSignalById(signalId);
  if (!signal) {
    throw new Error(`Signal #${signalId} not found`);
  }
  
  if (signal.status !== 'SL_HIT') {
    console.log(`⚠️ [PostSL] Signal #${signalId} status is ${signal.status}, not SL_HIT. Skipping.`);
    return {
      outcome: 'sideways',
      maxFavorableR: 0,
      timeToTpMin: null,
    };
  }
  
  const { symbol, direction, entryPrice, slPrice, tp1Price, tp2Price, tp3Price, updatedAt } = signal;
  const slHitTime = new Date(updatedAt).getTime();
  const monitorUntilTime = slHitTime + monitorDurationHours * 60 * 60 * 1000;
  
  console.log(`📈 [PostSL] Signal details:`, {
    symbol,
    direction,
    entry: parseFloat(entryPrice),
    sl: parseFloat(slPrice),
    tp1: tp1Price ? parseFloat(tp1Price) : null,
    tp2: tp2Price ? parseFloat(tp2Price) : null,
    tp3: tp3Price ? parseFloat(tp3Price) : null,
    slHitTime: new Date(slHitTime).toISOString(),
    monitorUntil: new Date(monitorUntilTime).toISOString(),
  });
  
  // Get candles from SL hit time to monitor end time
  const candles = await binanceClient.getKlinesInRange(
    symbol,
    '15m',
    slHitTime,
    monitorUntilTime,
    100 // 4 hours = 16 candles
  );
  
  console.log(`📊 [PostSL] Fetched ${candles.length} candles for monitoring`);
  
  if (candles.length === 0) {
    console.warn(`⚠️ [PostSL] No candles found for monitoring period`);
    return {
      outcome: 'sideways',
      maxFavorableR: 0,
      timeToTpMin: null,
    };
  }
  
  // Calculate R (risk) for this signal
  const entryP = parseFloat(entryPrice);
  const slPriceNum = parseFloat(slPrice);
  const risk = Math.abs(entryP - slPriceNum);
  
  const tp1PriceNum = tp1Price ? parseFloat(tp1Price) : null;
  const tp2PriceNum = tp2Price ? parseFloat(tp2Price) : null;
  const tp3PriceNum = tp3Price ? parseFloat(tp3Price) : null;
  
  // Track metrics
  let maxFavorableR = 0;
  let outcome: PostSlMonitoringResult['outcome'] = 'sideways';
  let timeToTpMin: number | null = null;
  
  // Analyze each candle
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const candleTime = candle.openTime;
    const minutesAfterSl = Math.floor((candleTime - slHitTime) / (60 * 1000));
    
    // Calculate R based on direction
    let favorableR = 0;
    
    if (direction === 'LONG') {
      // For LONG: favorable move = price going UP
      const maxPrice = Math.max(parseFloat(candle.high), parseFloat(candle.close), parseFloat(candle.open));
      favorableR = (maxPrice - entryP) / risk;
      
      // Check if reached TP levels
      if (tp3PriceNum && maxPrice >= tp3PriceNum && !timeToTpMin) {
        outcome = 'reached_tp3';
        timeToTpMin = minutesAfterSl;
        console.log(`✅ [PostSL] Reached TP3 after ${minutesAfterSl} min! (${maxPrice} >= ${tp3PriceNum})`);
      } else if (tp2PriceNum && maxPrice >= tp2PriceNum && !timeToTpMin) {
        outcome = 'reached_tp2';
        timeToTpMin = minutesAfterSl;
        console.log(`✅ [PostSL] Reached TP2 after ${minutesAfterSl} min! (${maxPrice} >= ${tp2PriceNum})`);
      } else if (tp1PriceNum && maxPrice >= tp1PriceNum && !timeToTpMin) {
        outcome = 'reached_tp1';
        timeToTpMin = minutesAfterSl;
        console.log(`✅ [PostSL] Reached TP1 after ${minutesAfterSl} min! (${maxPrice} >= ${tp1PriceNum})`);
      }
    } else {
      // For SHORT: favorable move = price going DOWN
      const minPrice = Math.min(parseFloat(candle.low), parseFloat(candle.close), parseFloat(candle.open));
      favorableR = (entryP - minPrice) / risk;
      
      // Check if reached TP levels
      if (tp3PriceNum && minPrice <= tp3PriceNum && !timeToTpMin) {
        outcome = 'reached_tp3';
        timeToTpMin = minutesAfterSl;
        console.log(`✅ [PostSL] Reached TP3 after ${minutesAfterSl} min! (${minPrice} <= ${tp3PriceNum})`);
      } else if (tp2PriceNum && minPrice <= tp2PriceNum && !timeToTpMin) {
        outcome = 'reached_tp2';
        timeToTpMin = minutesAfterSl;
        console.log(`✅ [PostSL] Reached TP2 after ${minutesAfterSl} min! (${minPrice} <= ${tp2PriceNum})`);
      } else if (tp1PriceNum && minPrice <= tp1PriceNum && !timeToTpMin) {
        outcome = 'reached_tp1';
        timeToTpMin = minutesAfterSl;
        console.log(`✅ [PostSL] Reached TP1 after ${minutesAfterSl} min! (${minPrice} <= ${tp1PriceNum})`);
      }
    }
    
    // Track max favorable excursion
    if (favorableR > maxFavorableR) {
      maxFavorableR = favorableR;
    }
    
    // Check if went further against (MAE > 1.5R after SL)
    const candleLow = parseFloat(candle.low);
    const candleHigh = parseFloat(candle.high);
    const adverseR = direction === 'LONG'
      ? (entryP - candleLow) / risk
      : (candleHigh - entryP) / risk;
    
    if (adverseR > 1.5 && outcome === 'sideways') {
      outcome = 'went_further_against';
      console.log(`❌ [PostSL] Went further against (MAE: ${adverseR.toFixed(2)}R after SL)`);
    }
  }
  
  // Final outcome
  if (outcome === 'sideways' && maxFavorableR < 0.5) {
    console.log(`📊 [PostSL] Stayed sideways (max favorable: ${maxFavorableR.toFixed(2)}R)`);
  }
  
  console.log(`✅ [PostSL] Monitoring complete:`, {
    outcome,
    maxFavorableR: `${maxFavorableR.toFixed(2)}R`,
    timeToTpMin: timeToTpMin ? `${timeToTpMin} min` : 'N/A',
  });
  
  return {
    outcome,
    maxFavorableR,
    timeToTpMin,
  };
}

/**
 * Background task: Monitor all recently stopped signals
 * 
 * Should be called periodically (e.g., every 15 minutes) to check:
 * - Signals that were stopped in the last 4-6 hours
 * - Haven't been monitored yet (post_sl_monitored_until IS NULL)
 */
export async function monitorRecentStops(): Promise<void> {
  console.log(`🔄 [PostSL] Checking for recent stops to monitor...`);
  
  // Find signals that:
  // 1. Were stopped in last 6 hours
  // 2. Haven't been monitored yet
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  
  const recentStops = await db
    .select()
    .from(signals)
    .where(
      and(
        eq(signals.status, 'SL_HIT'),
        drizzleSql`${signals.updatedAt} > ${sixHoursAgo}`,
        drizzleSql`${signals.postSlMonitoredUntil} IS NULL`
      )
    )
    .limit(10); // Process max 10 at a time
  
  if (recentStops.length === 0) {
    console.log(`✅ [PostSL] No recent stops to monitor`);
    return;
  }
  
  console.log(`📊 [PostSL] Found ${recentStops.length} recent stops to monitor`);
  
  // Monitor each signal
  for (const signal of recentStops) {
    try {
      const result = await monitorAfterStopLoss(signal.id, 4);
      
      // Update database
      await signalDB.updateSignal(signal.id, {
        postSlOutcome: result.outcome,
        postSlMaxFavorableR: result.maxFavorableR.toString(),
        postSlTimeToTpMin: result.timeToTpMin,
        postSlMonitoredUntil: new Date(),
      });
      
      console.log(`✅ [PostSL] Updated signal #${signal.id} with post-SL results`);
    } catch (error) {
      console.error(`❌ [PostSL] Error monitoring signal #${signal.id}:`, error);
    }
    
    // Rate limit: wait 1 second between signals
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`✅ [PostSL] Finished monitoring ${recentStops.length} signals`);
}
