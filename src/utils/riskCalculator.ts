import { Candle } from './binanceClient';
import { analyzeCand } from './candleAnalyzer';

export interface RiskLevels {
  sl: number;
  tp2: number;
}

export class RiskCalculator {
  calculateLevels(
    patternType: string,
    direction: 'LONG' | 'SHORT',
    candleClosePrice: number,
    stopLoss: number
  ): RiskLevels {
    // Use candleClosePrice for R calculation and TP levels
    const R = Math.abs(candleClosePrice - stopLoss);

    let tp2Price: number;

    if (direction === 'LONG') {
      tp2Price = candleClosePrice + 2 * R;
    } else {
      tp2Price = candleClosePrice - 2 * R;
    }

    console.log(`💰 [RiskCalculator] Levels for ${patternType} ${direction}:`, {
      candleClose: candleClosePrice.toFixed(8),
      sl: stopLoss.toFixed(8),
      tp2: tp2Price.toFixed(8),
      R: R.toFixed(8),
    });

    return {
      sl: stopLoss,
      tp2: tp2Price,
    };
  }

  calculateStopLoss(
    patternType: string,
    direction: 'LONG' | 'SHORT',
    candles: Candle[],
    slPercentage: number
  ): number {
    // C0 = последняя ЗАКРЫТАЯ свеча (candles[length-1])
    // C1 = предпоследняя ЗАКРЫТАЯ свеча (candles[length-2])
    const C0 = analyzeCand(candles[candles.length - 1]);
    const C1 = candles.length >= 2 ? analyzeCand(candles[candles.length - 2]) : null;
    
    console.log(`🔧 [RiskCalculator] calculateStopLoss for ${patternType} ${direction}:`, {
      C0_high: C0.high.toFixed(8),
      C0_low: C0.low.toFixed(8),
      C1_high: C1?.high.toFixed(8),
      C1_low: C1?.low.toFixed(8),
    });

    if (patternType.startsWith('pinbar')) {
      if (direction === 'LONG') {
        const offset = C0.low * slPercentage;
        return C0.low - offset;
      } else {
        const offset = C0.high * slPercentage;
        return C0.high + offset;
      }
    } else if (patternType.startsWith('fakey')) {
      if (direction === 'LONG') {
        const offset = C0.low * slPercentage;
        return C0.low - offset;
      } else {
        const offset = C0.high * slPercentage;
        return C0.high + offset;
      }
    } else if (patternType.startsWith('ppr')) {
      if (!C1) throw new Error('PPR requires C1 candle');
      if (direction === 'LONG') {
        const offset = C1.low * slPercentage;
        return C1.low - offset;
      } else {
        const offset = C1.high * slPercentage;
        return C1.high + offset;
      }
    } else if (patternType.startsWith('engulfing')) {
      if (direction === 'LONG') {
        const offset = C0.low * slPercentage;
        return C0.low - offset;
      } else {
        const offset = C0.high * slPercentage;
        return C0.high + offset;
      }
    } else {
      throw new Error(`Unknown pattern type: ${patternType}`);
    }
  }

  checkSignalStatusWithCandles(
    candles: Candle[],
    currentPrice: number,
    entryPrice: number,
    currentSl: number,
    tp2: number,
    direction: 'LONG' | 'SHORT',
    currentStatus: string
  ): { newStatus: string; newSl?: number } {
    // Check high/low of ALL recent candles (including current open candle)
    // Priority: TP2 > SL (if both hit in same candle, TP takes precedence)
    
    // Find the overall high/low across all candles
    const high = Math.max(...candles.map(c => Number(c.high)));
    const low = Math.min(...candles.map(c => Number(c.low)));
    
    console.log(`🔍 [RiskCalculator] Checking ${direction} signal with ${candles.length} candle(s) data:`, {
      candleCount: candles.length,
      highAcrossCandles: high.toFixed(8),
      lowAcrossCandles: low.toFixed(8),
      currentPrice: currentPrice.toFixed(8),
      tp2: tp2.toFixed(8),
      currentSl: currentSl.toFixed(8),
      status: currentStatus,
    });

    if (direction === 'LONG') {
      // LONG: Check TP2 first
      if (high >= tp2) {
        console.log(`🎯🎯 [RiskCalculator] TP2 HIT! high=${high.toFixed(8)} >= tp2=${tp2.toFixed(8)}`);
        return { newStatus: 'TP2_HIT' };
      }

      // Check SL (only if TP2 not hit)
      if (low <= currentSl) {
        // Double-check: if TP2 was also hit in the same candle, prioritize TP2
        if (high >= tp2) {
          console.log(`⚠️ [RiskCalculator] Both TP2 and SL hit in same candle! Prioritizing TP2`);
          return { newStatus: 'TP2_HIT' };
        }
        console.log(`🛑 [RiskCalculator] SL HIT! low=${low.toFixed(8)} <= sl=${currentSl.toFixed(8)}`);
        return { newStatus: 'SL_HIT' };
      }
    } else {
      // SHORT: Check TP2 first
      if (low <= tp2) {
        console.log(`🎯🎯 [RiskCalculator] TP2 HIT! low=${low.toFixed(8)} <= tp2=${tp2.toFixed(8)}`);
        return { newStatus: 'TP2_HIT' };
      }

      // Check SL (only if TP2 not hit)
      if (high >= currentSl) {
        // Double-check: if TP2 was also hit in the same candle, prioritize TP2
        if (low <= tp2) {
          console.log(`⚠️ [RiskCalculator] Both TP2 and SL hit in same candle! Prioritizing TP2`);
          return { newStatus: 'TP2_HIT' };
        }
        console.log(`🛑 [RiskCalculator] SL HIT! high=${high.toFixed(8)} >= sl=${currentSl.toFixed(8)}`);
        return { newStatus: 'SL_HIT' };
      }
    }

    return { newStatus: currentStatus };
  }

  checkSignalStatus(
    currentPrice: number,
    entryPrice: number,
    currentSl: number,
    tp2: number,
    direction: 'LONG' | 'SHORT',
    currentStatus: string
  ): { newStatus: string; newSl?: number } {
    if (direction === 'LONG') {
      if (currentPrice >= tp2) {
        console.log(`🎯 [RiskCalculator] TP2 HIT at ${currentPrice}`);
        return { newStatus: 'TP2_HIT' };
      }

      if (currentPrice <= currentSl) {
        console.log(`🛑 [RiskCalculator] SL HIT at ${currentPrice}`);
        return { newStatus: 'SL_HIT' };
      }
    } else {
      if (currentPrice <= tp2) {
        console.log(`🎯 [RiskCalculator] TP2 HIT at ${currentPrice}`);
        return { newStatus: 'TP2_HIT' };
      }

      if (currentPrice >= currentSl) {
        console.log(`🛑 [RiskCalculator] SL HIT at ${currentPrice}`);
        return { newStatus: 'SL_HIT' };
      }
    }

    return { newStatus: currentStatus };
  }
}

export const riskCalculator = new RiskCalculator();
