/**
 * Arrival Pattern Detection
 * 
 * Detects how price is approaching a zone:
 * - impulse_up/impulse_down: Large directional bars with expansion
 * - compression: Small bars with range contraction
 * - chop: Choppy, non-directional movement
 */

export type ArrivalPattern = 'impulse_up' | 'impulse_down' | 'compression' | 'chop';

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
}

// Thresholds (V1)
const TR_NORM_BIG = 0.60;      // For impulse bars
const TR_NORM_SMALL = 0.40;    // For compression bars
const BODY_NORM_MIN = 0.35;    // Minimum body for impulse core
const DW_RATIO_EXPAND = 1.15;  // Range expansion for impulse
const DW_RATIO_COMPRESS = 0.70; // Range compression
const OVERLAP_THRESHOLD = 0.50; // 50% overlap
const DIR_SCORE_IMPULSE = 0.60;
const DIR_SCORE_GRIND = 0.50;

/**
 * Calculate True Range normalized by ATR
 */
function calculateTRNorm(candle: Candle, prevClose: number, atr15: number): number {
  const tr = Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - prevClose),
    Math.abs(candle.low - prevClose)
  );
  return tr / atr15;
}

/**
 * Calculate Body size normalized by ATR
 */
function calculateBodyNorm(candle: Candle, atr15: number): number {
  return Math.abs(candle.close - candle.open) / atr15;
}

/**
 * Calculate overlap percentage between current and previous candle
 */
function calculateOverlap(current: Candle, previous: Candle): number {
  const currentRange = current.high - current.low;
  const overlapHigh = Math.min(current.high, previous.high);
  const overlapLow = Math.max(current.low, previous.low);
  const overlap = Math.max(0, overlapHigh - overlapLow);
  
  return currentRange > 0 ? overlap / currentRange : 0;
}

/**
 * Calculate Donchian Width (max high - min low over M bars)
 */
function calculateDonchianWidth(candles: Candle[]): number {
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  return Math.max(...highs) - Math.min(...lows);
}

/**
 * Calculate DW Ratio (current width / width M bars ago)
 */
function calculateDWRatio(candles: Candle[], M: number = 8): number {
  const currentWidth = calculateDonchianWidth(candles.slice(-M));
  const oldWidth = calculateDonchianWidth(candles.slice(-M * 2, -M));
  
  return oldWidth > 0 ? currentWidth / oldWidth : 1;
}

/**
 * Calculate Direction Score (0 = chaos, 1 = all same direction)
 */
function calculateDirScore(candles: Candle[], N: number = 5): number {
  const lastN = candles.slice(-N);
  let directionSum = 0;
  
  for (let i = 1; i < lastN.length; i++) {
    const ret = lastN[i].close - lastN[i - 1].close;
    directionSum += Math.sign(ret);
  }
  
  return Math.abs(directionSum) / (N - 1);
}

/**
 * Detect arrival pattern
 * 
 * @param candles - Array of 15m candles (last 8-10 bars recommended)
 * @param atr15 - ATR(15m) value
 * @returns Arrival pattern classification
 */
export function detectArrivalPattern(candles: Candle[], atr15: number): ArrivalPattern {
  const N = 5; // Window for direction analysis
  const M = 8; // Window for Donchian Width
  
  // Need at least M bars
  if (candles.length < M) {
    return 'chop'; // Not enough data
  }
  
  const lastN = candles.slice(-N);
  const last6 = candles.slice(-6);
  
  // Calculate metrics for last N bars
  const trNorms: number[] = [];
  const bodyNorms: number[] = [];
  const overlaps: number[] = [];
  
  for (let i = 1; i < lastN.length; i++) {
    const prevClose = lastN[i - 1].close;
    trNorms.push(calculateTRNorm(lastN[i], prevClose, atr15));
    bodyNorms.push(calculateBodyNorm(lastN[i], atr15));
  }
  
  for (let i = 1; i < last6.length; i++) {
    overlaps.push(calculateOverlap(last6[i], last6[i - 1]));
  }
  
  const dwRatio = calculateDWRatio(candles, M);
  const dirScore = calculateDirScore(lastN, N);
  
  // Count bars by size
  const bigBars = trNorms.filter(tr => tr >= TR_NORM_BIG).length;
  const smallBars = trNorms.filter(tr => tr <= TR_NORM_SMALL).length;
  const smallBodies = bodyNorms.filter(b => b <= 0.25).length;
  const bigBodies = bodyNorms.filter(b => b >= BODY_NORM_MIN).length;
  const highOverlaps = overlaps.filter(o => o >= OVERLAP_THRESHOLD).length;
  
  // Check direction (up or down)
  const recentCloses = lastN.map(c => c.close);
  const directionUp = recentCloses[recentCloses.length - 1] > recentCloses[0];
  
  // --- IMPULSE Detection ---
  // ≥3 из 5 баров крупные (TR_norm ≥ 0.60)
  // DirScore ≥ 0.60 (направленность)
  // DW_ratio ≥ 1.15 (расширение)
  // ≥2 бара с Body_norm ≥ 0.35 (не пинбары)
  if (
    bigBars >= 3 &&
    dirScore >= DIR_SCORE_IMPULSE &&
    dwRatio >= DW_RATIO_EXPAND &&
    bigBodies >= 2
  ) {
    return directionUp ? 'impulse_up' : 'impulse_down';
  }
  
  // --- COMPRESSION Detection ---
  // ≥5 из 6 последних баров малые (TR_norm ≤ 0.40 и Body_norm ≤ 0.25)
  // DW_ratio ≤ 0.70 (сужение)
  // ≥4 из 6 баров с Overlap ≥ 50%
  if (
    smallBars >= 4 && // Из last 5 (N-1)
    smallBodies >= 4 &&
    dwRatio <= DW_RATIO_COMPRESS &&
    highOverlaps >= 4
  ) {
    return 'compression';
  }
  
  // --- CHOP (default) ---
  // Не выполнены условия impulse и compression
  return 'chop';
}
