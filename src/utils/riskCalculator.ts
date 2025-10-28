import { Candle } from './binanceClient';
import { analyzeCand } from './candleAnalyzer';
import { calculateATR, atrToPrice } from './atrCalculator';
import { 
  findSRChannels, 
  getNearestSupportChannel, 
  getNearestResistanceChannel, 
  SRChannel,
  getDistanceToChannel,
  isPriceInChannel
} from './srChannels';

export interface RiskLevels {
  sl: number;
  tp1?: number;
  tp2: number;
  tp3?: number;
}

export interface RiskContext {
  atr15m: number;
  atr1h: number;
  atr4h: number;
  zones15m: SRChannel[];
  zones1h: SRChannel[];
  zones4h: SRChannel[];
  nearestSupport15m: SRChannel | null;
  nearestResistance15m: SRChannel | null;
  nearestSupport1h: SRChannel | null;
  nearestResistance1h: SRChannel | null;
  nearestSupport4h: SRChannel | null;
  nearestResistance4h: SRChannel | null;
}

export interface RiskProfile {
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  initialSl: number; // For BE tracking
  atr15m: number;
  atr4h: number;
  scenario: 'htf_reversal' | 'trend_continuation';
  meta: {
    riskR: number;
    tp1R: number;
    tp2R: number;
    tp3R: number;
  };
}

export class RiskCalculator {
  /**
   * 🎯 NEW MAIN METHOD: Calculate complete risk profile with ATR + S/R zones
   * 
   * This is the primary entry point for new strategy implementation
   */
  calculateRiskProfile(
    patternType: string,
    direction: 'LONG' | 'SHORT',
    entryPrice: number,
    candles15m: Candle[],
    candles1h: Candle[],
    candles4h: Candle[]
  ): RiskProfile {
    const logger = console;
    logger.log(`🎯 [RiskCalculator] calculateRiskProfile for ${patternType} ${direction} @ ${entryPrice.toFixed(8)}`);

    // 1. Build context: ATR + S/R zones
    const context = this.buildRiskContext(candles15m, candles1h, candles4h, entryPrice);

    // 2. Classify scenario (HTF reversal vs trend continuation)
    const scenario = this.classifyScenario(
      entryPrice,
      direction,
      context.nearestSupport4h,
      context.nearestResistance4h,
      context.atr4h
    );

    logger.log(`📊 [RiskCalculator] Scenario: ${scenario}`);

    // 3. Calculate ATR-based Stop Loss
    const sl = this.calculateAtrBasedStopLoss(
      patternType,
      direction,
      entryPrice,
      candles15m,
      context,
      scenario
    );

    // 4. Calculate Multi-Level Take Profits
    const tps = this.calculateMultiLevelTps(
      entryPrice,
      sl,
      direction,
      context
    );

    const riskR = Math.abs(entryPrice - sl);

    const profile: RiskProfile = {
      sl,
      tp1: tps.tp1,
      tp2: tps.tp2,
      tp3: tps.tp3,
      initialSl: sl,
      atr15m: context.atr15m,
      atr4h: context.atr4h,
      scenario,
      meta: {
        riskR,
        tp1R: Math.abs(tps.tp1 - entryPrice) / riskR,
        tp2R: Math.abs(tps.tp2 - entryPrice) / riskR,
        tp3R: Math.abs(tps.tp3 - entryPrice) / riskR,
      },
    };

    logger.log(`💰 [RiskCalculator] Profile:`, {
      scenario,
      sl: sl.toFixed(8),
      tp1: tps.tp1.toFixed(8),
      tp2: tps.tp2.toFixed(8),
      tp3: tps.tp3.toFixed(8),
      R: riskR.toFixed(8),
      tp1R: profile.meta.tp1R.toFixed(2),
      tp2R: profile.meta.tp2R.toFixed(2),
      tp3R: profile.meta.tp3R.toFixed(2),
    });

    return profile;
  }

  /**
   * Build context: ATR values + S/R zones for multiple timeframes
   */
  private buildRiskContext(
    candles15m: Candle[],
    candles1h: Candle[],
    candles4h: Candle[],
    currentPrice: number
  ): RiskContext {
    console.log(`🔧 [RiskContext] Building context for price ${currentPrice.toFixed(8)}`);

    // Calculate ATR for each timeframe
    const atr15m = calculateATR(candles15m, 14);
    const atr1h = calculateATR(candles1h, 14);
    const atr4h = calculateATR(candles4h, 14);

    // Find S/R zones for each timeframe
    const zones15m = findSRChannels(candles15m, {
      pivotPeriod: 10,
      maxChannelWidthPercent: 5,
      minStrength: 1,
      maxChannels: 6,
    });

    const zones1h = findSRChannels(candles1h, {
      pivotPeriod: 10,
      maxChannelWidthPercent: 5,
      minStrength: 1,
      maxChannels: 6,
    });

    const zones4h = findSRChannels(candles4h, {
      pivotPeriod: 10,
      maxChannelWidthPercent: 5,
      minStrength: 1,
      maxChannels: 6,
    });

    // Get nearest zones
    const nearestSupport15m = getNearestSupportChannel(zones15m, currentPrice);
    const nearestResistance15m = getNearestResistanceChannel(zones15m, currentPrice);
    const nearestSupport1h = getNearestSupportChannel(zones1h, currentPrice);
    const nearestResistance1h = getNearestResistanceChannel(zones1h, currentPrice);
    const nearestSupport4h = getNearestSupportChannel(zones4h, currentPrice);
    const nearestResistance4h = getNearestResistanceChannel(zones4h, currentPrice);

    console.log(`📊 [RiskContext] ATR: 15m=${atr15m.toFixed(8)}, 1h=${atr1h.toFixed(8)}, 4h=${atr4h.toFixed(8)}`);
    console.log(`📊 [RiskContext] Zones: 15m=${zones15m.length}, 1h=${zones1h.length}, 4h=${zones4h.length}`);

    return {
      atr15m,
      atr1h,
      atr4h,
      zones15m,
      zones1h,
      zones4h,
      nearestSupport15m,
      nearestResistance15m,
      nearestSupport1h,
      nearestResistance1h,
      nearestSupport4h,
      nearestResistance4h,
    };
  }

  /**
   * Classify scenario: HTF reversal (near zone) vs trend continuation
   */
  private classifyScenario(
    entryPrice: number,
    direction: 'LONG' | 'SHORT',
    nearestSupport4h: SRChannel | null,
    nearestResistance4h: SRChannel | null,
    atr4h: number
  ): 'htf_reversal' | 'trend_continuation' {
    const threshold = atrToPrice(atr4h, 0.20); // 0.20×ATR(H4)

    if (direction === 'LONG' && nearestSupport4h) {
      const distance = getDistanceToChannel(entryPrice, nearestSupport4h);
      const isNearZone = distance <= threshold || isPriceInChannel(entryPrice, nearestSupport4h);
      
      if (isNearZone) {
        console.log(`📍 [Scenario] HTF REVERSAL: LONG near H4 support (distance=${distance.toFixed(8)} ≤ ${threshold.toFixed(8)})`);
        return 'htf_reversal';
      }
    }

    if (direction === 'SHORT' && nearestResistance4h) {
      const distance = getDistanceToChannel(entryPrice, nearestResistance4h);
      const isNearZone = distance <= threshold || isPriceInChannel(entryPrice, nearestResistance4h);
      
      if (isNearZone) {
        console.log(`📍 [Scenario] HTF REVERSAL: SHORT near H4 resistance (distance=${distance.toFixed(8)} ≤ ${threshold.toFixed(8)})`);
        return 'htf_reversal';
      }
    }

    console.log(`📍 [Scenario] TREND CONTINUATION: No H4 zone nearby`);
    return 'trend_continuation';
  }

  /**
   * Calculate ATR-based Stop Loss with zone awareness
   */
  private calculateAtrBasedStopLoss(
    patternType: string,
    direction: 'LONG' | 'SHORT',
    entryPrice: number,
    candles15m: Candle[],
    context: RiskContext,
    scenario: 'htf_reversal' | 'trend_continuation'
  ): number {
    const C0 = analyzeCand(candles15m[candles15m.length - 1]);
    const C1 = candles15m.length >= 2 ? analyzeCand(candles15m[candles15m.length - 2]) : null;

    console.log(`🔧 [SL] Calculating for ${scenario}, pattern=${patternType}, direction=${direction}`);

    if (scenario === 'htf_reversal') {
      // HTF reversal: SL = zone_boundary ± ATR buffer
      const atrBuffer = atrToPrice(context.atr15m, 0.30); // 0.25-0.35 ATR buffer (using 0.30 average)

      if (direction === 'LONG') {
        const zone = context.nearestSupport4h || context.nearestSupport15m;
        if (zone) {
          const zoneSL = zone.lower - atrBuffer;
          
          // If pattern extreme is BELOW zone boundary, use it instead
          const patternExtreme = this.getPatternExtreme(patternType, 'LONG', C0, C1);
          const extremeSL = patternExtreme - atrBuffer;
          
          const sl = Math.min(zoneSL, extremeSL); // Use the lower (safer) SL
          console.log(`🔧 [SL HTF] LONG: zone=${zone.lower.toFixed(8)}, zoneSL=${zoneSL.toFixed(8)}, extreme=${patternExtreme.toFixed(8)}, extremeSL=${extremeSL.toFixed(8)} → final=${sl.toFixed(8)}`);
          return sl;
        }
      } else {
        const zone = context.nearestResistance4h || context.nearestResistance15m;
        if (zone) {
          const zoneSL = zone.upper + atrBuffer;
          
          // If pattern extreme is ABOVE zone boundary, use it instead
          const patternExtreme = this.getPatternExtreme(patternType, 'SHORT', C0, C1);
          const extremeSL = patternExtreme + atrBuffer;
          
          const sl = Math.max(zoneSL, extremeSL); // Use the higher (safer) SL
          console.log(`🔧 [SL HTF] SHORT: zone=${zone.upper.toFixed(8)}, zoneSL=${zoneSL.toFixed(8)}, extreme=${patternExtreme.toFixed(8)}, extremeSL=${extremeSL.toFixed(8)} → final=${sl.toFixed(8)}`);
          return sl;
        }
      }
    }

    // Trend continuation OR no zone: SL = local swing + ATR buffer
    const atrBuffer = atrToPrice(context.atr15m, 0.25);
    const patternExtreme = this.getPatternExtreme(patternType, direction, C0, C1);

    const sl = direction === 'LONG' 
      ? patternExtreme - atrBuffer
      : patternExtreme + atrBuffer;

    console.log(`🔧 [SL Trend] ${direction}: extreme=${patternExtreme.toFixed(8)}, buffer=${atrBuffer.toFixed(8)} → sl=${sl.toFixed(8)}`);
    return sl;
  }

  /**
   * Get pattern extreme (low for LONG, high for SHORT)
   */
  private getPatternExtreme(
    patternType: string,
    direction: 'LONG' | 'SHORT',
    C0: ReturnType<typeof analyzeCand>,
    C1: ReturnType<typeof analyzeCand> | null
  ): number {
    if (patternType.startsWith('ppr')) {
      // PPR uses C1 extreme
      if (!C1) throw new Error('PPR requires C1 candle');
      return direction === 'LONG' ? C1.low : C1.high;
    }

    // All other patterns use C0 extreme
    return direction === 'LONG' ? C0.low : C0.high;
  }

  /**
   * Calculate Multi-Level Take Profits with zone awareness
   * 
   * TP1 = min(1R, nearest 15m-zone)
   * TP2 = min(2R, nearest H1-zone)
   * TP3 = min(3R, nearest H4-zone)
   */
  private calculateMultiLevelTps(
    entryPrice: number,
    sl: number,
    direction: 'LONG' | 'SHORT',
    context: RiskContext
  ): { tp1: number; tp2: number; tp3: number } {
    const R = Math.abs(entryPrice - sl);

    console.log(`🎯 [TPs] Calculating for entry=${entryPrice.toFixed(8)}, sl=${sl.toFixed(8)}, R=${R.toFixed(8)}`);

    // Calculate theoretical R-based TPs
    const tp1_R = direction === 'LONG' ? entryPrice + 1 * R : entryPrice - 1 * R;
    const tp2_R = direction === 'LONG' ? entryPrice + 2 * R : entryPrice - 2 * R;
    const tp3_R = direction === 'LONG' ? entryPrice + 3 * R : entryPrice - 3 * R;

    // Get nearest opposing zones
    const opposingZone15m = direction === 'LONG' 
      ? context.nearestResistance15m 
      : context.nearestSupport15m;

    const opposingZone1h = direction === 'LONG'
      ? context.nearestResistance1h
      : context.nearestSupport1h;

    const opposingZone4h = direction === 'LONG'
      ? context.nearestResistance4h
      : context.nearestSupport4h;

    // TP1: min(1R, 15m-zone) - but ONLY if zone is on profitable side of entry!
    let tp1 = tp1_R;
    if (opposingZone15m) {
      const zonePrice = direction === 'LONG' ? opposingZone15m.lower : opposingZone15m.upper;
      // CRITICAL: TP must be on profitable side of entry
      const isProfitableSide = direction === 'LONG' ? zonePrice > entryPrice : zonePrice < entryPrice;
      const isCloserThan1R = (direction === 'LONG' && zonePrice < tp1_R) || (direction === 'SHORT' && zonePrice > tp1_R);
      
      if (isProfitableSide && isCloserThan1R) {
        tp1 = zonePrice;
        console.log(`🎯 [TP1] Using 15m zone ${zonePrice.toFixed(8)} instead of 1R ${tp1_R.toFixed(8)}`);
      } else if (!isProfitableSide) {
        console.log(`⚠️ [TP1] Zone ${zonePrice.toFixed(8)} is on WRONG side of entry ${entryPrice.toFixed(8)}, using 1R ${tp1_R.toFixed(8)}`);
      }
    }

    // TP2: min(2R, H1-zone) - but ONLY if zone is on profitable side AND farther than TP1!
    let tp2 = tp2_R;
    if (opposingZone1h) {
      const zonePrice = direction === 'LONG' ? opposingZone1h.lower : opposingZone1h.upper;
      // CRITICAL: TP must be on profitable side of entry
      const isProfitableSide = direction === 'LONG' ? zonePrice > entryPrice : zonePrice < entryPrice;
      const isCloserThan2R = (direction === 'LONG' && zonePrice < tp2_R) || (direction === 'SHORT' && zonePrice > tp2_R);
      // NEW: TP2 must be farther than TP1
      const isFartherThanTP1 = direction === 'LONG' ? zonePrice > tp1 : zonePrice < tp1;
      
      if (isProfitableSide && isCloserThan2R && isFartherThanTP1) {
        tp2 = zonePrice;
        console.log(`🎯 [TP2] Using 1h zone ${zonePrice.toFixed(8)} instead of 2R ${tp2_R.toFixed(8)}`);
      } else if (!isProfitableSide) {
        console.log(`⚠️ [TP2] Zone ${zonePrice.toFixed(8)} is on WRONG side of entry ${entryPrice.toFixed(8)}, using 2R ${tp2_R.toFixed(8)}`);
      } else if (!isFartherThanTP1) {
        console.log(`⚠️ [TP2] Zone ${zonePrice.toFixed(8)} is too close (not farther than TP1 ${tp1.toFixed(8)}), using 2R ${tp2_R.toFixed(8)}`);
      }
    }

    // TP3: min(3R, H4-zone) - but ONLY if zone is on profitable side AND farther than TP2!
    let tp3 = tp3_R;
    if (opposingZone4h) {
      const zonePrice = direction === 'LONG' ? opposingZone4h.lower : opposingZone4h.upper;
      // CRITICAL: TP must be on profitable side of entry
      const isProfitableSide = direction === 'LONG' ? zonePrice > entryPrice : zonePrice < entryPrice;
      const isCloserThan3R = (direction === 'LONG' && zonePrice < tp3_R) || (direction === 'SHORT' && zonePrice > tp3_R);
      // NEW: TP3 must be farther than TP2
      const isFartherThanTP2 = direction === 'LONG' ? zonePrice > tp2 : zonePrice < tp2;
      
      if (isProfitableSide && isCloserThan3R && isFartherThanTP2) {
        tp3 = zonePrice;
        console.log(`🎯 [TP3] Using 4h zone ${zonePrice.toFixed(8)} instead of 3R ${tp3_R.toFixed(8)}`);
      } else if (!isProfitableSide) {
        console.log(`⚠️ [TP3] Zone ${zonePrice.toFixed(8)} is on WRONG side of entry ${entryPrice.toFixed(8)}, using 3R ${tp3_R.toFixed(8)}`);
      } else if (!isFartherThanTP2) {
        console.log(`⚠️ [TP3] Zone ${zonePrice.toFixed(8)} is too close (not farther than TP2 ${tp2.toFixed(8)}), using 3R ${tp3_R.toFixed(8)}`);
      }
    }

    console.log(`🎯 [TPs] Final: TP1=${tp1.toFixed(8)}, TP2=${tp2.toFixed(8)}, TP3=${tp3.toFixed(8)}`);

    return { tp1, tp2, tp3 };
  }

  /**
   * 🔄 LEGACY METHOD (backward compatibility)
   * Delegates to new calculateRiskProfile()
   * 
   * @deprecated Use calculateRiskProfile() instead
   */
  calculateLevels(
    patternType: string,
    direction: 'LONG' | 'SHORT',
    candleClosePrice: number,
    stopLoss: number
  ): RiskLevels {
    // Legacy method - simple 1:2 R/R calculation
    const R = Math.abs(candleClosePrice - stopLoss);

    let tp2Price: number;

    if (direction === 'LONG') {
      tp2Price = candleClosePrice + 2 * R;
    } else {
      tp2Price = candleClosePrice - 2 * R;
    }

    console.log(`💰 [RiskCalculator LEGACY] Levels for ${patternType} ${direction}:`, {
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

  /**
   * 🔄 LEGACY METHOD (backward compatibility)
   * Simple percentage-based SL calculation
   * 
   * @deprecated Use calculateRiskProfile() instead
   */
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
    
    console.log(`🔧 [RiskCalculator LEGACY] calculateStopLoss for ${patternType} ${direction}:`, {
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
