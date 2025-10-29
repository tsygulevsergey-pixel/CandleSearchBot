/**
 * ML Integration - Helper to integrate ML logging into scanner
 * 
 * Handles:
 * 1. Collection of ML context
 * 2. Filter checks
 * 3. Near-miss skip logging
 * 4. ML context addition to signals
 */

import { collectMLContext, logNearMissSkip, MLContext } from './mlLogger';
import { checkFilters } from '../utils/filters';

export interface MLIntegrationInput {
  symbol: string;
  timeframe: string;
  patternType: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  candles15m: any[];
  candles1h: any[];
  candles4h: any[];
}

export interface MLIntegrationResult {
  shouldEnter: boolean;
  mlContext: MLContext;
  skipReasons: string[];
}

/**
 * Process ML integration for a signal candidate
 * Returns whether to enter the trade and ML context
 */
export async function processMLIntegration(
  input: MLIntegrationInput
): Promise<MLIntegrationResult> {
  const {
    symbol,
    timeframe,
    patternType,
    direction,
    entryPrice,
    candles15m,
    candles1h,
    candles4h,
  } = input;
  
  // Calculate pattern extreme (swing high/low)
  const patternExtreme = calculatePatternExtreme(direction, candles15m);
  
  // Collect ML context
  const mlContext = await collectMLContext(
    symbol,
    direction,
    entryPrice,
    candles15m,
    candles1h,
    candles4h,
    patternExtreme
  );
  
  // Check filters
  const filterResult = checkFilters(direction, mlContext);
  
  // If should skip - log near-miss
  if (!filterResult.shouldEnter) {
    await logNearMissSkip(
      symbol,
      timeframe,
      patternType,
      direction,
      entryPrice,
      mlContext,
      filterResult.skipReasons
    );
  }
  
  return {
    shouldEnter: filterResult.shouldEnter,
    mlContext,
    skipReasons: filterResult.skipReasons,
  };
}

/**
 * Calculate pattern extreme (swing high/low)
 * For LONG: pattern low (support)
 * For SHORT: pattern high (resistance)
 */
function calculatePatternExtreme(
  direction: 'LONG' | 'SHORT',
  candles: any[]
): number {
  // Use last 3 candles to find pattern extreme
  const recentCandles = candles.slice(-3);
  
  if (direction === 'LONG') {
    // Find minimum low
    return Math.min(...recentCandles.map((c: any) => parseFloat(c.low)));
  } else {
    // Find maximum high
    return Math.max(...recentCandles.map((c: any) => parseFloat(c.high)));
  }
}

/**
 * Extract ML context fields for database insert
 * Returns object with ML context fields for signals table
 */
export function extractMLContextFields(mlContext: MLContext) {
  return {
    distToDirH1ZoneAtr: mlContext.distToDirH1ZoneAtr.toFixed(4),
    distToDirH4ZoneAtr: mlContext.distToDirH4ZoneAtr.toFixed(4),
    freePathR: mlContext.freePathR.toFixed(4),
    arrivalPattern: mlContext.arrivalPattern,
    // NEW: Dynamic S/R fields
    clearance15m: mlContext.clearance15m?.toFixed(8) || '0',
    clearance1h: mlContext.clearance1h?.toFixed(8) || '0',
    rAvailable: mlContext.rAvailable?.toFixed(2) || '0',
    zoneTestCount24h: mlContext.zoneTestCount24h || 0, // Keep as number
    vetoReason: mlContext.vetoReason || 'none',
    slBufferAtr15: mlContext.slBufferAtr15?.toFixed(4) || '0',
  };
}
