/**
 * Professional Confluence Scoring System for 15m Timeframe Trading
 * 
 * Based on professional trading standards:
 * - 15m timeframe = HIGH NOISE → requires MORE confluence than Daily/4H
 * - Professionals use 3-4 out of 8 factors (confluence scoring)
 * - NOT "all or nothing" approach
 * 
 * For 15m: Minimum 5/10 points required (equivalent to 3-4 factors)
 */

export interface ConfluenceFactors {
  // Factor 1: Pattern Quality (+2 points) - CRITICAL
  patternQuality: boolean;      // Pattern score ≥ 7/10
  
  // Factor 2: At Key Zone (+2 points) - CRITICAL  
  atKeyZone: boolean;            // Pattern MUST be at S/R zone in correct direction
  
  // Factor 3: Trend Alignment (+1 point)
  trendAligned: boolean;         // Multi-TF trend aligned (1H/4H same direction)
  
  // Factor 4: Volume Spike (+1 point)
  volumeSpike: boolean;          // Current volume > 1.2x avg(20) - ЖЕЛАТЕЛЕН но НЕ обязателен
  
  // Factor 5: Zone Freshness (+1 point)
  zoneFresh: boolean;            // Zone touches ≤ 3 (fresh zone)
  
  // Factor 6: Multi-TF Confluence (+1 point)
  multiTFconfluence: boolean;    // 1H + 4H zones aligned
  
  // Factor 7: Clean Rejection (+1 point)
  cleanRejection: boolean;       // Tail protrudes beyond recent highs/lows
  
  // Factor 8: R:R Available (+1 point)
  rAvailable: boolean;           // R_available ≥ 2.0 (enough space for TP)
}

/**
 * Calculate confluence score based on 8 professional factors
 * 
 * Scoring weights:
 * - Pattern Quality: +2 (geometry must be correct)
 * - At Key Zone: +2 (NEVER trade mid-air patterns)
 * - Trend Alignment: +1
 * - Volume Spike: +1 (желателен но не обязателен)
 * - Zone Freshness: +1
 * - Multi-TF Confluence: +1
 * - Clean Rejection: +1
 * - R:R Available: +1
 * 
 * Maximum: 10 points
 */
export function calculateConfluenceScore(factors: ConfluenceFactors): number {
  let score = 0;
  
  // CRITICAL factors (+2 each)
  if (factors.patternQuality) {
    score += 2;
    console.log(`   ✅ [Confluence] Pattern Quality (score ≥ 7): +2 points`);
  }
  
  if (factors.atKeyZone) {
    score += 2;
    console.log(`   ✅ [Confluence] At Key S/R Zone: +2 points`);
  }
  
  // IMPORTANT factors (+1 each)
  if (factors.trendAligned) {
    score += 1;
    console.log(`   ✅ [Confluence] Trend Aligned: +1 point`);
  }
  
  if (factors.volumeSpike) {
    score += 1;
    console.log(`   ✅ [Confluence] Volume Spike (>1.2x avg): +1 point`);
  }
  
  if (factors.zoneFresh) {
    score += 1;
    console.log(`   ✅ [Confluence] Fresh Zone (≤3 touches): +1 point`);
  }
  
  if (factors.multiTFconfluence) {
    score += 1;
    console.log(`   ✅ [Confluence] Multi-TF Alignment: +1 point`);
  }
  
  if (factors.cleanRejection) {
    score += 1;
    console.log(`   ✅ [Confluence] Clean Rejection (tail protrusion): +1 point`);
  }
  
  if (factors.rAvailable) {
    score += 1;
    console.log(`   ✅ [Confluence] R:R Space Available (≥2.0R): +1 point`);
  }
  
  console.log(`\n📊 [Confluence] Total Score: ${score}/10`);
  return score;
}

/**
 * Check if confluence score meets minimum requirement for given timeframe
 * 
 * Professional standards:
 * - 15m: 5/10 min (HIGH NOISE → need MORE confluence)
 * - 1h:  4/10 min (medium noise)
 * - 4h:  3/10 min (low noise, more reliable patterns)
 * 
 * Equivalent to "3-4 out of 8 factors" rule used by professionals
 */
export function meetsConfluenceRequirement(
  score: number,
  timeframe: string
): boolean {
  const minRequirements: { [key: string]: number } = {
    '15m': 5,  // HIGH NOISE → требуем больше подтверждений
    '1h': 4,   // Medium noise
    '4h': 3,   // Low noise, more reliable
  };
  
  const minRequired = minRequirements[timeframe] || 4;
  const meets = score >= minRequired;
  
  console.log(`📊 [Confluence] Requirement for ${timeframe}: ${score}/10 >= ${minRequired}/10 → ${meets ? '✅ PASS' : '❌ FAIL'}`);
  
  return meets;
}

/**
 * Get human-readable confluence explanation
 */
export function getConfluenceExplanation(
  factors: ConfluenceFactors,
  score: number,
  timeframe: string
): string {
  const minRequired = timeframe === '15m' ? 5 : timeframe === '1h' ? 4 : 3;
  
  const passed: string[] = [];
  const failed: string[] = [];
  
  if (factors.patternQuality) passed.push('Pattern Quality (+2)');
  else failed.push('Pattern Quality');
  
  if (factors.atKeyZone) passed.push('At Key Zone (+2)');
  else failed.push('At Key Zone');
  
  if (factors.trendAligned) passed.push('Trend Aligned (+1)');
  else failed.push('Trend Aligned');
  
  if (factors.volumeSpike) passed.push('Volume Spike (+1)');
  else failed.push('Volume Spike');
  
  if (factors.zoneFresh) passed.push('Fresh Zone (+1)');
  else failed.push('Fresh Zone');
  
  if (factors.multiTFconfluence) passed.push('Multi-TF (+1)');
  else failed.push('Multi-TF');
  
  if (factors.cleanRejection) passed.push('Clean Rejection (+1)');
  else failed.push('Clean Rejection');
  
  if (factors.rAvailable) passed.push('R:R Available (+1)');
  else failed.push('R:R Available');
  
  return `Confluence ${score}/${minRequired} for ${timeframe}. Passed: [${passed.join(', ')}]. Missing: [${failed.join(', ')}]`;
}
