/**
 * E2E Integration Test: Full Signal Flow
 * Tests the complete pipeline from pattern detection to Telegram delivery
 * 
 * Flow:
 * 1. Pattern Detection → 2. Confluence Scoring → 3. R:R Validation
 * 4. ML Context Collection → 5. Database Recording → 6. Telegram Notification
 */

import { 
  calculateConfluenceScore, 
  meetsConfluenceRequirement, 
  getConfluenceExplanation,
  type ConfluenceFactors 
} from '../utils/confluenceScoring';
import { calculateDynamicRiskProfile } from '../utils/dynamicRiskCalculator';
import { collectMLContext, enrichMLContextWithRiskProfile } from '../services/mlLogger';
import { signalDB } from '../mastra/storage/db';
import { extractMLContextFields } from '../services/mlIntegration';

interface TestScenario {
  name: string;
  symbol: string;
  pattern: {
    type: 'Pin Bar' | 'Engulfing' | 'PPR' | 'Fakey';
    direction: 'LONG' | 'SHORT';
    score: number;
    extreme: number;
  };
  entryPrice: number;
  currentPrice: number;
  atr15m: number;
  atr1h: number;
  atr4h: number;
  mlContext: Partial<any>;
  expectedOutcome: 'PASS_CONFLUENCE' | 'FAIL_CONFLUENCE' | 'FAIL_RR';
}

// Test scenarios covering different confluence/R:R outcomes
const scenarios: TestScenario[] = [
  // ✅ SCENARIO 1: High-quality signal (should pass all filters)
  {
    name: '✅ High-Quality Signal (Pin Bar LONG at H4 zone, trend aligned)',
    symbol: 'BTCUSDT',
    pattern: {
      type: 'Pin Bar',
      direction: 'LONG',
      score: 8.5,
      extreme: 65000, // Pattern low
    },
    entryPrice: 65500,
    currentPrice: 65500,
    atr15m: 250,
    atr1h: 400,
    atr4h: 600,
    mlContext: {
      inH4Zone: true,
      distToDirH1ZoneAtr: 0.3,
      zoneTouchCountBucket: '2',
      clearance15m: 3.5,
      clearance1h: 2.8,
      rAvailable: 2.5,
    },
    expectedOutcome: 'PASS_CONFLUENCE',
  },
  
  // ⚠️ SCENARIO 2: Weak confluence (should be rejected by confluence filter)
  {
    name: '⚠️ Weak Confluence (Engulfing SHORT, countertrend, away from zone)',
    symbol: 'ETHUSDT',
    pattern: {
      type: 'Engulfing',
      direction: 'SHORT',
      score: 6.0,
      extreme: 3200,
    },
    entryPrice: 3180,
    currentPrice: 3180,
    atr15m: 15,
    atr1h: 25,
    atr4h: 40,
    mlContext: {
      inH4Zone: false,
      distToDirH1ZoneAtr: 1.2, // Far from zone
      zoneTouchCountBucket: '5', // Fatigued zone
      clearance15m: 2.0,
      clearance1h: 1.5,
      rAvailable: 1.8,
    },
    expectedOutcome: 'FAIL_CONFLUENCE',
  },
  
  // ⚠️ SCENARIO 3: Good confluence but poor R:R (should be rejected by R:R filter)
  {
    name: '⚠️ Good Confluence but Poor R:R (PPR LONG, strong zone but nearby resistance)',
    symbol: 'SOLUSDT',
    pattern: {
      type: 'PPR',
      direction: 'LONG',
      score: 8.0,
      extreme: 140,
    },
    entryPrice: 142,
    currentPrice: 142,
    atr15m: 3,
    atr1h: 5,
    atr4h: 8,
    mlContext: {
      inH4Zone: true,
      distToDirH1ZoneAtr: 0.2,
      zoneTouchCountBucket: '1', // Fresh zone
      clearance15m: 0.8, // Very tight clearance
      clearance1h: 0.6,
      rAvailable: 0.9, // Insufficient R available
    },
    expectedOutcome: 'FAIL_RR',
  },
];

async function runE2ETest(scenario: TestScenario) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 TEST: ${scenario.name}`);
  console.log(`${'='.repeat(80)}`);
  
  const { symbol, pattern, entryPrice, currentPrice, atr15m, atr1h, atr4h, mlContext } = scenario;
  
  // STEP 1: Pattern Detection (simulated - pattern already "found")
  console.log(`\n📍 STEP 1: Pattern Detection`);
  console.log(`   Symbol: ${symbol}`);
  console.log(`   Pattern: ${pattern.type} ${pattern.direction}`);
  console.log(`   Pattern Score: ${pattern.score}/10`);
  console.log(`   Entry: ${entryPrice}, Extreme: ${pattern.extreme}`);
  console.log(`   ✅ Pattern detected and validated`);
  
  // STEP 2: Confluence Scoring
  console.log(`\n⭐ STEP 2: Confluence Scoring`);
  
  // Simulate volume check (for demo, use pattern score as proxy)
  const hasVolumeSpike = pattern.score >= 7.5;
  const hasCleanRejection = pattern.score >= 7.0;
  
  const confluenceFactors: ConfluenceFactors = {
    patternQuality: pattern.score >= 7,
    atKeyZone: mlContext.inH4Zone || (mlContext.distToDirH1ZoneAtr ?? 1.0) < 0.5,
    trendAligned: true, // Simplified for test
    volumeSpike: hasVolumeSpike,
    zoneFresh: parseInt(mlContext.zoneTouchCountBucket || '0') <= 3,
    multiTFconfluence: true, // Simplified for test
    cleanRejection: hasCleanRejection,
    rAvailable: (mlContext.rAvailable ?? 0) >= 2.0,
  };
  
  const confluenceScore = calculateConfluenceScore(confluenceFactors);
  const meetsConfluence = meetsConfluenceRequirement(confluenceScore, '15m');
  const confluenceExplanation = getConfluenceExplanation(confluenceFactors, confluenceScore, '15m');
  
  console.log(`   ${confluenceExplanation}`);
  console.log(`   Result: ${meetsConfluence ? '✅ PASSED' : '❌ REJECTED'} (min 5/10 required for 15m)`);
  
  if (!meetsConfluence) {
    console.log(`\n🚫 Signal rejected at Confluence stage`);
    console.log(`   ❌ Confluence score ${confluenceScore}/10 < 5/10 (minimum for 15m)`);
    console.log(`   📊 This would be logged to near_miss_skips table with:`);
    console.log(`      - confluence_score: ${confluenceScore}`);
    console.log(`      - skip_category: 'confluence'`);
    console.log(`      - confluence_details: ${JSON.stringify(confluenceFactors)}`);
    
    if (scenario.expectedOutcome === 'FAIL_CONFLUENCE') {
      console.log(`\n✅ TEST PASSED: Signal correctly rejected by confluence filter`);
    } else {
      console.log(`\n❌ TEST FAILED: Expected ${scenario.expectedOutcome} but got FAIL_CONFLUENCE`);
    }
    return;
  }
  
  // STEP 3: Dynamic Risk Profile & R:R Validation
  console.log(`\n📊 STEP 3: Dynamic Risk Profile & R:R Validation`);
  
  // Create mock candles for dynamic risk calculator
  const mockCandles15m = Array(100).fill(null).map((_, i) => ({
    time: Date.now() - i * 15 * 60 * 1000,
    open: currentPrice * (1 + (Math.random() - 0.5) * 0.02),
    high: currentPrice * (1 + Math.random() * 0.01),
    low: currentPrice * (1 - Math.random() * 0.01),
    close: currentPrice * (1 + (Math.random() - 0.5) * 0.02),
    volume: 1000000,
  }));
  
  const mockCandles1h = Array(100).fill(null).map((_, i) => ({
    time: Date.now() - i * 60 * 60 * 1000,
    open: currentPrice * (1 + (Math.random() - 0.5) * 0.03),
    high: currentPrice * (1 + Math.random() * 0.015),
    low: currentPrice * (1 - Math.random() * 0.015),
    close: currentPrice * (1 + (Math.random() - 0.5) * 0.03),
    volume: 1000000,
  }));
  
  const mockCandles4h = Array(100).fill(null).map((_, i) => ({
    time: Date.now() - i * 4 * 60 * 60 * 1000,
    open: currentPrice * (1 + (Math.random() - 0.5) * 0.05),
    high: currentPrice * (1 + Math.random() * 0.025),
    low: currentPrice * (1 - Math.random() * 0.025),
    close: currentPrice * (1 + (Math.random() - 0.5) * 0.05),
    volume: 1000000,
  }));
  
  try {
    const dynamicProfile = await calculateDynamicRiskProfile({
      direction: pattern.direction,
      entryPrice,
      patternExtreme: pattern.extreme,
      candles15m: mockCandles15m as any,
      candles1h: mockCandles1h as any,
      candles4h: mockCandles4h as any,
      clearance15m: mlContext.clearance15m ?? 2.0,
      clearance1h: mlContext.clearance1h ?? 1.5,
      rAvailable: mlContext.rAvailable ?? 2.0,
    });
    
    console.log(`   Stop Loss: ${dynamicProfile.sl} (swing: ${dynamicProfile.swingExtreme}, buffer: ${dynamicProfile.buffer.toFixed(4)})`);
    console.log(`   Take Profits: TP1=${dynamicProfile.tp1}, TP2=${dynamicProfile.tp2}, TP3=${dynamicProfile.tp3}`);
    console.log(`   R:R Ratios: TP1=${dynamicProfile.actualRR.tp1.toFixed(2)}, TP2=${dynamicProfile.actualRR.tp2 ? dynamicProfile.actualRR.tp2.toFixed(2) : 'N/A'}, TP3=${dynamicProfile.actualRR.tp3 ? dynamicProfile.actualRR.tp3.toFixed(2) : 'N/A'}`);
    console.log(`   Dynamic Min R:R: ${dynamicProfile.dynamicMinRR.toFixed(2)} (${dynamicProfile.dynamicMinRRReasoning})`);
    console.log(`   Trend: ${dynamicProfile.trendAlignment}, Multi-TF: ${dynamicProfile.multiTFAlignment}, Volatility: ${dynamicProfile.atrVolatility}`);
    console.log(`   Result: ${dynamicProfile.rrValidation.isValid ? '✅ PASSED' : '❌ REJECTED'} - ${dynamicProfile.rrValidation.message}`);
    
    if (!dynamicProfile.rrValidation.isValid) {
      console.log(`\n🚫 Signal rejected at R:R stage`);
      console.log(`   ❌ TP1 R:R ${dynamicProfile.actualRR.tp1.toFixed(2)} < ${dynamicProfile.dynamicMinRR.toFixed(2)} (required)`);
      console.log(`   📊 This would be logged to near_miss_skips table with:`);
      console.log(`      - confluence_score: ${confluenceScore} (passed confluence, failed R:R)`);
      console.log(`      - skip_category: 'rr'`);
      console.log(`      - skip_reason: 'rr_below_dynamic_min'`);
      
      if (scenario.expectedOutcome === 'FAIL_RR') {
        console.log(`\n✅ TEST PASSED: Signal correctly rejected by R:R filter`);
      } else {
        console.log(`\n❌ TEST FAILED: Expected ${scenario.expectedOutcome} but got FAIL_RR`);
      }
      return;
    }
    
    // STEP 4: ML Context Collection & Enrichment
    console.log(`\n📝 STEP 4: ML Context Collection & Enrichment`);
    
    const fullMLContext = await collectMLContext(
      symbol,
      pattern.direction,
      entryPrice,
      mockCandles15m as any,
      mockCandles1h as any,
      mockCandles4h as any,
      pattern.extreme
    );
    
    const enrichedMLContext = enrichMLContextWithRiskProfile(
      fullMLContext,
      dynamicProfile,
      pattern.score
    );
    
    console.log(`   ✅ ML Context collected and enriched with ${Object.keys(enrichedMLContext).length} fields`);
    console.log(`   Key fields: pattern_score=${enrichedMLContext.pattern_score}, confluence_score=${confluenceScore}`);
    console.log(`   SL metrics: swing_extreme=${enrichedMLContext.swing_extreme_price}, buffer=${enrichedMLContext.sl_buffer_atr}`);
    console.log(`   TP metrics: tp1_limited=${enrichedMLContext.tp1_limited_by_zone}, tp2_limited=${enrichedMLContext.tp2_limited_by_zone}`);
    
    // STEP 5: Database Recording
    console.log(`\n💾 STEP 5: Database Recording`);
    
    const signal = await signalDB.createSignal({
      symbol,
      timeframe: '15m',
      patternType: pattern.type,
      entryPrice: entryPrice.toString(),
      slPrice: dynamicProfile.sl.toString(),
      tp1Price: dynamicProfile.tp1?.toString() || '0',
      tp2Price: dynamicProfile.tp2?.toString() || '0',
      tp3Price: dynamicProfile.tp3?.toString() || '0',
      currentSl: dynamicProfile.sl.toString(),
      initialSl: dynamicProfile.sl.toString(),
      atr15m: atr15m.toString(),
      atrH4: atr4h.toString(),
      direction: pattern.direction,
      status: 'OPEN',
      // ML context fields (enriched with dynamic risk data)
      ...extractMLContextFields(enrichedMLContext),
    });
    
    console.log(`   ✅ Signal logged to database with ID: ${signal.id}`);
    console.log(`   📊 Recorded fields include:`);
    console.log(`      - confluence_score: ${confluenceScore}`);
    console.log(`      - pattern_score: ${pattern.score}`);
    console.log(`      - actual_rr_tp1: ${dynamicProfile.actualRR.tp1.toFixed(2)}`);
    console.log(`      - dynamic_min_rr: ${dynamicProfile.dynamicMinRR.toFixed(2)}`);
    console.log(`      - swing_extreme_price: ${enrichedMLContext.swing_extreme_price}`);
    console.log(`      - sl_buffer_atr: ${enrichedMLContext.sl_buffer_atr}`);
    
    // STEP 6: Telegram Notification (simulated)
    console.log(`\n📱 STEP 6: Telegram Notification`);
    console.log(`   ✅ Would send to Telegram:`);
    console.log(`   🎯 ${pattern.type} ${pattern.direction} Signal`);
    console.log(`   💎 ${symbol} (15m)`);
    console.log(`   📍 Entry: ${entryPrice}`);
    console.log(`   🛡️ SL: ${dynamicProfile.sl} (${(Math.abs(entryPrice - dynamicProfile.sl) / entryPrice * 100).toFixed(2)}%)`);
    console.log(`   🎯 TP1: ${dynamicProfile.tp1} (${dynamicProfile.actualRR.tp1.toFixed(2)}R)`);
    console.log(`   🎯 TP2: ${dynamicProfile.tp2 || 'N/A'} (${dynamicProfile.actualRR.tp2 ? dynamicProfile.actualRR.tp2.toFixed(2) + 'R' : 'N/A'})`);
    console.log(`   🎯 TP3: ${dynamicProfile.tp3 || 'N/A'} (${dynamicProfile.actualRR.tp3 ? dynamicProfile.actualRR.tp3.toFixed(2) + 'R' : 'N/A'})`);
    console.log(`   ⭐ Confluence: ${confluenceScore}/10`);
    console.log(`   📊 Pattern Score: ${pattern.score}/10`);
    
    // STEP 7: Test Statistics Query
    console.log(`\n📈 STEP 7: Statistics Verification`);
    console.log(`   ✅ Signal would appear in statistics as:`);
    console.log(`      - Total signals: +1`);
    console.log(`      - ${pattern.type} pattern: +1`);
    console.log(`      - ${pattern.direction} direction: +1`);
    console.log(`      - 15m timeframe: +1`);
    console.log(`      - Status: OPEN (tracked by SignalTracker)`);
    
    if (scenario.expectedOutcome === 'PASS_CONFLUENCE') {
      console.log(`\n✅ TEST PASSED: Signal correctly passed all filters and was recorded`);
    } else {
      console.log(`\n❌ TEST FAILED: Expected ${scenario.expectedOutcome} but signal passed all filters`);
    }
    
  } catch (error) {
    console.error(`\n❌ ERROR in test execution:`, error);
    console.log(`\n❌ TEST FAILED: Unexpected error`);
  }
}

// Main test runner
async function runAllTests() {
  console.log(`\n${'#'.repeat(80)}`);
  console.log(`# E2E Integration Test: Full Signal Flow Pipeline`);
  console.log(`# Testing: Pattern → Confluence → R:R → ML Context → DB → Telegram`);
  console.log(`${'#'.repeat(80)}`);
  
  for (const scenario of scenarios) {
    await runE2ETest(scenario);
  }
  
  console.log(`\n${'#'.repeat(80)}`);
  console.log(`# All tests completed!`);
  console.log(`${'#'.repeat(80)}\n`);
}

// Run tests
runAllTests().catch(console.error);
