import { Candle } from './binanceClient';
import { analyzeCand } from './candleAnalyzer';

export interface RiskLevels {
  sl: number;
  tp1: number;
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

    let tp1Price: number;
    let tp2Price: number;

    if (direction === 'LONG') {
      tp1Price = candleClosePrice + R;
      tp2Price = candleClosePrice + 2 * R;
    } else {
      tp1Price = candleClosePrice - R;
      tp2Price = candleClosePrice - 2 * R;
    }

    console.log(`💰 [RiskCalculator] Levels for ${patternType} ${direction}:`, {
      candleClose: candleClosePrice.toFixed(8),
      sl: stopLoss.toFixed(8),
      tp1: tp1Price.toFixed(8),
      tp2: tp2Price.toFixed(8),
      R: R.toFixed(8),
    });

    return {
      sl: stopLoss,
      tp1: tp1Price,
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

  checkSignalStatus(
    currentPrice: number,
    entryPrice: number,
    currentSl: number,
    tp1: number,
    tp2: number,
    direction: 'LONG' | 'SHORT',
    currentStatus: string
  ): { newStatus: string; newSl?: number } {
    if (direction === 'LONG') {
      if (currentPrice >= tp2) {
        console.log(`🎯 [RiskCalculator] TP2 HIT at ${currentPrice}`);
        return { newStatus: 'TP2_HIT' };
      }

      if (currentPrice >= tp1 && currentStatus === 'OPEN') {
        console.log(`🎯 [RiskCalculator] TP1 HIT at ${currentPrice}, moving SL to breakeven`);
        return { newStatus: 'TP1_HIT', newSl: entryPrice };
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

      if (currentPrice <= tp1 && currentStatus === 'OPEN') {
        console.log(`🎯 [RiskCalculator] TP1 HIT at ${currentPrice}, moving SL to breakeven`);
        return { newStatus: 'TP1_HIT', newSl: entryPrice };
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
