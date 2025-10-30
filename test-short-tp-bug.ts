// Test to reproduce SHORT TP bug
import { describe, it } from 'node:test';

// Simulate the bug
function adjustZoneForTP(zoneLevel: number, direction: 'LONG' | 'SHORT'): number {
  if (direction === 'LONG') {
    return zoneLevel * 0.95;
  } else {
    // FOR SHORT: multiply by 1.05
    return zoneLevel * 1.05;
  }
}

function calculateHybridTP(
  entry: number,
  fixedTP: number,
  zoneLevel: number | null,
  direction: 'LONG' | 'SHORT'
): number {
  if (zoneLevel === null) {
    return fixedTP;
  }
  
  const adjusted = adjustZoneForTP(zoneLevel, direction);
  
  const hybridTP = direction === 'LONG'
    ? Math.min(fixedTP, adjusted)
    : Math.max(fixedTP, adjusted);
  
  return hybridTP;
}

// Test Case: SHORT with RESISTANCE zone (bug scenario)
const entry = 0.02507500;
const sl = 0.02535074;
const R = Math.abs(entry - sl); // 0.00027574

// Fixed TP1 (1.5R from entry)
const fixedTP1 = entry - (1.5 * R); // 0.02466139 (below entry - correct!)

// WRONG: Resistance zone ABOVE entry (should be support BELOW entry!)
const wrongZone = 0.02544400; // Resistance zone from signal

const result = calculateHybridTP(entry, fixedTP1, wrongZone, 'SHORT');

console.log('\n🐛 REPRODUCING SHORT TP BUG:');
console.log(`📍 Entry: ${entry.toFixed(8)}`);
console.log(`📍 SL: ${sl.toFixed(8)}`);
console.log(`📍 R: ${R.toFixed(8)}`);
console.log(`\n🎯 Fixed TP1 (1.5R): ${fixedTP1.toFixed(8)} (${fixedTP1 < entry ? 'below entry ✅' : 'above entry ❌'})`);
console.log(`\n🚫 WRONG Zone (resistance): ${wrongZone.toFixed(8)} (${wrongZone > entry ? 'above entry ❌' : 'below entry ✅'})`);
console.log(`🔧 Adjusted zone (1.05x): ${(wrongZone * 1.05).toFixed(8)}`);
console.log(`\n❌ RESULT TP1: ${result.toFixed(8)} (${result > entry ? 'above entry ❌❌❌ BUG!' : 'below entry ✅'})`);

// Expected: Should use SUPPORT zone BELOW entry
const correctZone = 0.02102400; // Support zone from signal
const correctResult = calculateHybridTP(entry, fixedTP1, correctZone, 'SHORT');

console.log(`\n\n✅ CORRECT Zone (support): ${correctZone.toFixed(8)} (${correctZone < entry ? 'below entry ✅' : 'above entry ❌'})`);
console.log(`🔧 Adjusted zone (1.05x): ${(correctZone * 1.05).toFixed(8)}`);
console.log(`✅ CORRECT TP1: ${correctResult.toFixed(8)} (${correctResult < entry ? 'below entry ✅' : 'above entry ❌'})`);
