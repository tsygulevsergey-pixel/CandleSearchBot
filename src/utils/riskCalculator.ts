import { Candle } from './binanceClient';
import { analyzeCand, SRAnalysis } from './candleAnalyzer';

export interface RiskLevels {
  sl: number;
  tp1: number;
  tp2: number;
}

export class RiskCalculator {
  calculateLevels(
    patternType: string,
    direction: 'LONG' | 'SHORT',
    entryPrice: number,
    candles: Candle[],
    srAnalysis?: SRAnalysis
  ): RiskLevels {
    const slPercentage = 0.0035; // 0.35% offset за зоной
    let slPrice: number;

    // 🛑 НОВАЯ ЛОГИКА: Стоп ЗА S/R зоной (если зона есть)
    if (srAnalysis) {
      if (direction === 'LONG' && srAnalysis.nearestSupport) {
        // LONG: стоп ПОД Support зоной
        const offset = srAnalysis.nearestSupport.lower * slPercentage;
        slPrice = srAnalysis.nearestSupport.lower - offset;
        console.log(`🛑 [RiskCalculator] LONG SL: ЗА Support зоной (${srAnalysis.nearestSupport.lower.toFixed(8)} - ${slPercentage*100}% = ${slPrice.toFixed(8)})`);
      } else if (direction === 'SHORT' && srAnalysis.nearestResistance) {
        // SHORT: стоп НАД Resistance зоной
        const offset = srAnalysis.nearestResistance.upper * slPercentage;
        slPrice = srAnalysis.nearestResistance.upper + offset;
        console.log(`🛑 [RiskCalculator] SHORT SL: ЗА Resistance зоной (${srAnalysis.nearestResistance.upper.toFixed(8)} + ${slPercentage*100}% = ${slPrice.toFixed(8)})`);
      } else {
        // Fallback: если нет подходящей зоны, используем старую логику
        console.log(`⚠️ [RiskCalculator] Нет подходящей S/R зоны, используем fallback логику`);
        slPrice = this.calculateFallbackStopLoss(patternType, direction, candles, slPercentage);
      }
    } else {
      // Fallback: если S/R анализ не передан
      slPrice = this.calculateFallbackStopLoss(patternType, direction, candles, slPercentage);
    }

    const R = Math.abs(entryPrice - slPrice);

    let tp1Price: number;
    let tp2Price: number;

    if (direction === 'LONG') {
      tp1Price = entryPrice + R;
      tp2Price = entryPrice + 2 * R;
    } else {
      tp1Price = entryPrice - R;
      tp2Price = entryPrice - 2 * R;
    }

    console.log(`💰 [RiskCalculator] Levels for ${patternType} ${direction}:`, {
      entry: entryPrice.toFixed(8),
      sl: slPrice.toFixed(8),
      tp1: tp1Price.toFixed(8),
      tp2: tp2Price.toFixed(8),
      R: R.toFixed(8),
    });

    return {
      sl: slPrice,
      tp1: tp1Price,
      tp2: tp2Price,
    };
  }

  private calculateFallbackStopLoss(
    patternType: string,
    direction: 'LONG' | 'SHORT',
    candles: Candle[],
    slPercentage: number
  ): number {
    const C0 = analyzeCand(candles[candles.length - 1]);
    const C1 = candles.length >= 2 ? analyzeCand(candles[candles.length - 2]) : null;

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
