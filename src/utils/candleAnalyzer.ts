import { Candle } from './binanceClient';

export interface CandleMetrics {
  body: number;
  range: number;
  upperWick: number;
  lowerWick: number;
  isGreen: boolean;
  isRed: boolean;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function analyzeCand(candle: Candle): CandleMetrics {
  const open = parseFloat(candle.open);
  const high = parseFloat(candle.high);
  const low = parseFloat(candle.low);
  const close = parseFloat(candle.close);

  const body = Math.abs(close - open);
  const range = high - low;
  const upperWick = high - Math.max(open, close);
  const lowerWick = Math.min(open, close) - low;
  const isGreen = close > open;
  const isRed = close < open;

  return {
    body,
    range,
    upperWick,
    lowerWick,
    isGreen,
    isRed,
    open,
    high,
    low,
    close,
  };
}

export interface PatternResult {
  detected: boolean;
  type?: 'pinbar_buy' | 'pinbar_sell' | 'fakey_buy' | 'fakey_sell' | 'ppr_buy' | 'ppr_sell' | 'engulfing_buy' | 'engulfing_sell';
  direction?: 'LONG' | 'SHORT';
  entryPrice?: number;
}

export class PatternDetector {
  detectPinBar(candles: Candle[]): PatternResult {
    if (candles.length < 1) return { detected: false };

    const C0 = analyzeCand(candles[candles.length - 1]);

    // ЛОНГ: Зеленая свеча, длинный нижний фитиль
    if (C0.lowerWick >= 2 * C0.body && C0.lowerWick >= 2 * C0.upperWick) {
      const upperThird = C0.low + 0.66 * C0.range;
      const closeInUpperThird = C0.close >= upperThird;
      const smallBody = C0.body <= 0.35 * C0.range;

      if (closeInUpperThird && smallBody && C0.isGreen) {
        console.log(`✅ [Pattern] Pin Bar BUY detected (GREEN candle)`);
        return {
          detected: true,
          type: 'pinbar_buy',
          direction: 'LONG',
          entryPrice: C0.close,
        };
      }
    }

    // ШОРТ: Красная свеча, длинный верхний фитиль
    if (C0.upperWick >= 2 * C0.body && C0.upperWick >= 2 * C0.lowerWick) {
      const lowerThird = C0.high - 0.66 * C0.range;
      const closeInLowerThird = C0.close <= lowerThird;
      const smallBody = C0.body <= 0.35 * C0.range;

      if (closeInLowerThird && smallBody && C0.isRed) {
        console.log(`✅ [Pattern] Pin Bar SELL detected (RED candle)`);
        return {
          detected: true,
          type: 'pinbar_sell',
          direction: 'SHORT',
          entryPrice: C0.close,
        };
      }
    }

    return { detected: false };
  }

  detectFakey(candles: Candle[]): PatternResult {
    if (candles.length < 3) return { detected: false };

    const C0 = analyzeCand(candles[candles.length - 1]);
    const C1 = analyzeCand(candles[candles.length - 2]);
    const C2 = analyzeCand(candles[candles.length - 3]);

    const isC1Inside = C1.high <= C2.high && C1.low >= C2.low;

    if (!isC1Inside) return { detected: false };

    const probeBelow = C0.low < C1.low;
    const closeAbove = C0.close > C1.high;

    // ЛОНГ: C2 зеленая, C1 красная, C0 зеленая
    if (probeBelow && closeAbove && C2.isGreen && C1.isRed && C0.isGreen) {
      console.log(`✅ [Pattern] Fakey BUY detected (GREEN-RED-GREEN)`);
      return {
        detected: true,
        type: 'fakey_buy',
        direction: 'LONG',
        entryPrice: C0.close,
      };
    }

    const probeAbove = C0.high > C1.high;
    const closeBelow = C0.close < C1.low;

    // ШОРТ: C2 красная, C1 зеленая, C0 красная
    if (probeAbove && closeBelow && C2.isRed && C1.isGreen && C0.isRed) {
      console.log(`✅ [Pattern] Fakey SELL detected (RED-GREEN-RED)`);
      return {
        detected: true,
        type: 'fakey_sell',
        direction: 'SHORT',
        entryPrice: C0.close,
      };
    }

    return { detected: false };
  }

  detectPPR(candles: Candle[]): PatternResult {
    if (candles.length < 2) return { detected: false };

    const C0 = analyzeCand(candles[candles.length - 1]);
    const C1 = analyzeCand(candles[candles.length - 2]);

    // ЛОНГ: C1 красная, C0 зеленая, закрепляется выше максимума
    if (C0.close > C1.high && C1.isRed && C0.isGreen) {
      console.log(`✅ [Pattern] ППР BUY detected (RED->GREEN)`);
      return {
        detected: true,
        type: 'ppr_buy',
        direction: 'LONG',
        entryPrice: C0.close,
      };
    }

    // ШОРТ: C1 зеленая, C0 красная, закрепляется ниже минимума
    if (C0.close < C1.low && C1.isGreen && C0.isRed) {
      console.log(`✅ [Pattern] ППР SELL detected (GREEN->RED)`);
      return {
        detected: true,
        type: 'ppr_sell',
        direction: 'SHORT',
        entryPrice: C0.close,
      };
    }

    return { detected: false };
  }

  detectEngulfing(candles: Candle[]): PatternResult {
    if (candles.length < 2) return { detected: false };

    const C0 = analyzeCand(candles[candles.length - 1]);
    const C1 = analyzeCand(candles[candles.length - 2]);

    const engulfs = C0.high >= C1.high && C0.low <= C1.low;

    if (engulfs && C0.isGreen && C1.isRed) {
      const strongBody = C0.body >= C1.body && C0.close > C1.open;
      if (strongBody) {
        console.log(`✅ [Pattern] Engulfing BUY detected`);
        return {
          detected: true,
          type: 'engulfing_buy',
          direction: 'LONG',
          entryPrice: C0.close,
        };
      }
    }

    if (engulfs && C0.isRed && C1.isGreen) {
      const strongBody = C0.body >= C1.body && C0.close < C1.open;
      if (strongBody) {
        console.log(`✅ [Pattern] Engulfing SELL detected`);
        return {
          detected: true,
          type: 'engulfing_sell',
          direction: 'SHORT',
          entryPrice: C0.close,
        };
      }
    }

    return { detected: false };
  }

  detectAllPatterns(candles: Candle[]): PatternResult[] {
    const results: PatternResult[] = [];

    const pinBar = this.detectPinBar(candles);
    if (pinBar.detected) results.push(pinBar);

    const fakey = this.detectFakey(candles);
    if (fakey.detected) results.push(fakey);

    const ppr = this.detectPPR(candles);
    if (ppr.detected) results.push(ppr);

    const engulfing = this.detectEngulfing(candles);
    if (engulfing.detected) results.push(engulfing);

    return results;
  }
}

export const patternDetector = new PatternDetector();
