// Test zone filtering for SHORT
type Zone = {
  low: number;
  high: number;
  tf: string;
  type: 'support' | 'resistance';
};

function findNearestResistanceZones(
  entry: number,
  direction: 'LONG' | 'SHORT',
  zones: Zone[],
  count: number = 3
): number[] {
  console.log(`🔍 Finding ${count} nearest ${direction === 'LONG' ? 'resistance' : 'support'} zones for entry ${entry.toFixed(8)}`);
  
  // Filter zones by type and position relative to entry
  const relevantZones = zones.filter(z => {
    if (direction === 'LONG') {
      // For LONG: find resistance zones ABOVE entry
      return z.type === 'resistance' && z.low > entry;
    } else {
      // For SHORT: find support zones BELOW entry
      return z.type === 'support' && z.high < entry;
    }
  });

  console.log(`📊 Filtered ${relevantZones.length} relevant zones from ${zones.length} total zones`);
  relevantZones.forEach(z => {
    console.log(`   - ${z.type}: ${z.low.toFixed(8)} - ${z.high.toFixed(8)} (${z.tf})`);
  });

  // Sort by distance from entry (closest first)
  const sortedZones = relevantZones.sort((a, b) => {
    const distA = direction === 'LONG' 
      ? a.low - entry
      : entry - a.high;
    const distB = direction === 'LONG'
      ? b.low - entry
      : entry - b.high;
    return distA - distB;
  });

  // Extract zone levels (take up to count zones)
  const zoneLevels = sortedZones.slice(0, count).map(z => {
    const level = direction === 'LONG' ? z.low : z.high;
    const dist = Math.abs(level - entry);
    console.log(`   📍 Zone: ${level.toFixed(8)} (${z.tf}, distance: ${dist.toFixed(8)})`);
    return level;
  });

  console.log(`✅ Found ${zoneLevels.length} zones`);
  return zoneLevels;
}

// Test case: SOPHUSDT SHORT signal
const entry = 0.02507500;
const zones: Zone[] = [
  { low: 0.02102400, high: 0.02102400, tf: '4h', type: 'support' },  // Below entry
  { low: 0.02544400, high: 0.02544400, tf: '4h', type: 'resistance' },  // Above entry
];

console.log('\n🧪 TEST: SOPHUSDT SHORT Signal');
console.log(`📍 Entry: ${entry.toFixed(8)}`);
console.log(`📊 Available zones:`);
zones.forEach(z => {
  console.log(`   - ${z.type}: ${z.low.toFixed(8)} - ${z.high.toFixed(8)} (${z.tf})`);
});
console.log('');

const result = findNearestResistanceZones(entry, 'SHORT', zones, 3);

console.log(`\n📊 RESULT:`);
console.log(`Found ${result.length} zones for SHORT:`);
result.forEach((level, i) => {
  console.log(`   TP${i+1} zone: ${level.toFixed(8)} (${level < entry ? 'below entry ✅' : 'above entry ❌'})`);
});

if (result.some(level => level > entry)) {
  console.log('\n❌ BUG DETECTED: Some zones are ABOVE entry for SHORT!');
} else {
  console.log('\n✅ All zones are BELOW entry for SHORT - CORRECT!');
}
