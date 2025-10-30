// Full integration test for SOPHUSDT SHORT signal bug
import { calculateDynamicRiskProfile } from './src/utils/dynamicRiskCalculator';
import type { Candle } from './src/types';

// Mock candles (simplified - we only need enough for ATR calculation)
const mockCandles: Candle[] = Array(300).fill(null).map((_, i) => ({
  time: Date.now() - (300 - i) * 60000,
  open: '0.025',
  high: '0.0255',
  low: '0.0245',
  close: '0.025',
  volume: '1000'
}));

// Real signal data from SOPHUSDT + active 15m zone
const testData = {
  direction: 'SHORT' as const,
  entryPrice: 0.02507500,
  patternExtreme: 0.02535074,
  zones: [
    // Active 15m zone (resistance ABOVE entry for SHORT - where entry was taken)
    { low: 0.024, high: 0.025, tf: '15m', type: 'resistance' as const, strength: 20, touchCount: 2 },
    // Other zones
    { low: 0.02102400, high: 0.02102400, tf: '4h', type: 'support' as const, strength: 20, touchCount: 1 },
    { low: 0.02544400, high: 0.02544400, tf: '4h', type: 'resistance' as const, strength: 20, touchCount: 1 },
  ],
  atr15m: 0.00027574,
  atr1h: 0.00055,
  atr4h: 0.001,
  zoneTestCount24h: 0,
  candles15m: mockCandles,
  candles1h: mockCandles,
  candles4h: mockCandles,
  patternScore: 7,
};

console.log('\n🧪 FULL INTEGRATION TEST: SOPHUSDT SHORT Signal');
console.log('================================================\n');
console.log(`📍 Entry: ${testData.entryPrice.toFixed(8)}`);
console.log(`🛡️ Pattern Extreme (SL basis): ${testData.patternExtreme.toFixed(8)}`);
console.log(`📊 Direction: ${testData.direction}`);
console.log(`\n📊 Zones available:`);
testData.zones.forEach(z => {
  console.log(`   - ${z.type}: ${z.low.toFixed(8)} - ${z.high.toFixed(8)} (${z.tf})`);
});
console.log('\n');

const result = calculateDynamicRiskProfile(testData);

console.log('\n📊 RESULT:');
console.log(`🛡️ SL: ${result.sl.toFixed(8)} (${result.sl > testData.entryPrice ? 'above entry ✅' : 'below entry ❌'})`);
console.log(`🎯 TP1: ${result.tp1?.toFixed(8) || 'null'} (${result.tp1 && result.tp1 < testData.entryPrice ? 'below entry ✅' : 'above entry ❌'})`);
console.log(`🎯 TP2: ${result.tp2?.toFixed(8) || 'null'} (${result.tp2 && result.tp2 < testData.entryPrice ? 'below entry ✅' : 'above entry ❌'})`);
console.log(`🎯 TP3: ${result.tp3?.toFixed(8) || 'null'} (${result.tp3 && result.tp3 < testData.entryPrice ? 'below entry ✅' : 'above entry ❌'})`);

console.log(`\n📊 Expected for SHORT:`);
console.log(`   SL should be ABOVE entry: ${result.sl > testData.entryPrice ? '✅ CORRECT' : '❌ WRONG'}`);
console.log(`   All TPs should be BELOW entry:`);
if (result.tp1) console.log(`     TP1: ${result.tp1 < testData.entryPrice ? '✅ CORRECT' : '❌ WRONG'}`);
if (result.tp2) console.log(`     TP2: ${result.tp2 < testData.entryPrice ? '✅ CORRECT' : '❌ WRONG'}`);
if (result.tp3) console.log(`     TP3: ${result.tp3 < testData.entryPrice ? '✅ CORRECT' : '❌ WRONG'}`);

if (result.tp1 && result.tp1 > testData.entryPrice) {
  console.log('\n❌❌❌ BUG CONFIRMED: TP1 is ABOVE entry for SHORT!');
}
if (result.tp2 && result.tp2 > testData.entryPrice) {
  console.log('❌❌❌ BUG CONFIRMED: TP2 is ABOVE entry for SHORT!');
}
