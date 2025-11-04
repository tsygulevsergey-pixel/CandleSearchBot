import * as fs from 'fs';

interface SignalData {
  id: string;
  symbol: string;
  direction: string;
  pattern_type: string;
  status: string;
  pattern_score: string;
  trend_alignment: string;
  context_recent_direction: string;
  context_was_reversal: string;
  clearance_15m: string;
}

function parseCSV(filePath: string): SignalData[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');
  
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj: any = {};
    headers.forEach((header, i) => {
      obj[header] = values[i] || '';
    });
    return obj as SignalData;
  });
}

function testFilters(tpData: SignalData[], slData: SignalData[]) {
  console.log('🧪 ============================================');
  console.log('   ТЕСТИРОВАНИЕ ПРЕДЛОЖЕННЫХ ФИЛЬТРОВ');
  console.log('   ============================================\n');
  
  console.log(`📊 Исходные данные:`);
  console.log(`   TP сигналов: ${tpData.length}`);
  console.log(`   SL сигналов: ${slData.length}\n`);
  
  // Test Filter 1: pattern_score >= 50
  console.log('1️⃣  ФИЛЬТР: pattern_score >= 50\n');
  
  const tpPassScore50 = tpData.filter(d => {
    const score = parseFloat(d.pattern_score);
    return !isNaN(score) && score >= 50;
  });
  
  const slPassScore50 = slData.filter(d => {
    const score = parseFloat(d.pattern_score);
    return !isNaN(score) && score >= 50;
  });
  
  const tpFailedScore50 = tpData.length - tpPassScore50.length;
  const slRemovedScore50 = slData.length - slPassScore50.length;
  
  console.log(`   ✅ TP ПРОЙДЕТ: ${tpPassScore50.length}/${tpData.length} (${(tpPassScore50.length/tpData.length*100).toFixed(1)}%)`);
  console.log(`   ❌ TP УБЬЕТ:   ${tpFailedScore50}/${tpData.length} (${(tpFailedScore50/tpData.length*100).toFixed(1)}%)`);
  console.log(`   🗑️  SL УБЕРЕТ:  ${slRemovedScore50}/${slData.length} (${(slRemovedScore50/slData.length*100).toFixed(1)}%)`);
  console.log(`   📊 ВЕРДИКТ:    ${tpFailedScore50 > 10 ? '❌ КАТАСТРОФА - Убивает слишком много тейков!' : '✅ Безопасно'}\n`);
  
  // Test Filter 2: trend_alignment = "with"
  console.log('2️⃣  ФИЛЬТР: trend_alignment = "with"\n');
  
  const tpPassTrendWith = tpData.filter(d => d.trend_alignment === 'with');
  const slPassTrendWith = slData.filter(d => d.trend_alignment === 'with');
  
  const tpFailedTrendWith = tpData.length - tpPassTrendWith.length;
  const slRemovedTrendWith = slData.length - slPassTrendWith.length;
  
  console.log(`   ✅ TP ПРОЙДЕТ: ${tpPassTrendWith.length}/${tpData.length} (${(tpPassTrendWith.length/tpData.length*100).toFixed(1)}%)`);
  console.log(`   ❌ TP УБЬЕТ:   ${tpFailedTrendWith}/${tpData.length} (${(tpFailedTrendWith/tpData.length*100).toFixed(1)}%)`);
  console.log(`   🗑️  SL УБЕРЕТ:  ${slRemovedTrendWith}/${slData.length} (${(slRemovedTrendWith/slData.length*100).toFixed(1)}%)`);
  console.log(`   📊 ВЕРДИКТ:    ${tpFailedTrendWith <= 10 && slRemovedTrendWith >= 20 ? '✅ Эффективен' : '⚠️  Не эффективен'}\n`);
  
  // Test Filter 3: Momentum alignment
  console.log('3️⃣  ФИЛЬТР: Momentum Alignment (LONG+bullish, SHORT+bearish)\n');
  
  const tpPassMomentum = tpData.filter(d => 
    (d.direction === 'LONG' && d.context_recent_direction === 'bullish') ||
    (d.direction === 'SHORT' && d.context_recent_direction === 'bearish')
  );
  
  const slPassMomentum = slData.filter(d => 
    (d.direction === 'LONG' && d.context_recent_direction === 'bullish') ||
    (d.direction === 'SHORT' && d.context_recent_direction === 'bearish')
  );
  
  const tpFailedMomentum = tpData.length - tpPassMomentum.length;
  const slRemovedMomentum = slData.length - slPassMomentum.length;
  
  console.log(`   ✅ TP ПРОЙДЕТ: ${tpPassMomentum.length}/${tpData.length} (${(tpPassMomentum.length/tpData.length*100).toFixed(1)}%)`);
  console.log(`   ❌ TP УБЬЕТ:   ${tpFailedMomentum}/${tpData.length} (${(tpFailedMomentum/tpData.length*100).toFixed(1)}%)`);
  console.log(`   🗑️  SL УБЕРЕТ:  ${slRemovedMomentum}/${slData.length} (${(slRemovedMomentum/slData.length*100).toFixed(1)}%)`);
  console.log(`   📊 ВЕРДИКТ:    ${tpFailedMomentum <= 30 && slRemovedMomentum >= 50 ? '✅ Эффективен' : '⚠️  Не эффективен'}\n`);
  
  // Test Filter 4: NOT after reversal
  console.log('4️⃣  ФИЛЬТР: Избегать сигналов ПОСЛЕ разворота\n');
  
  const tpPassNotReversal = tpData.filter(d => d.context_was_reversal !== 't');
  const slPassNotReversal = slData.filter(d => d.context_was_reversal !== 't');
  
  const tpFailedNotReversal = tpData.length - tpPassNotReversal.length;
  const slRemovedNotReversal = slData.length - slPassNotReversal.length;
  
  console.log(`   ✅ TP ПРОЙДЕТ: ${tpPassNotReversal.length}/${tpData.length} (${(tpPassNotReversal.length/tpData.length*100).toFixed(1)}%)`);
  console.log(`   ❌ TP УБЬЕТ:   ${tpFailedNotReversal}/${tpData.length} (${(tpFailedNotReversal/tpData.length*100).toFixed(1)}%)`);
  console.log(`   🗑️  SL УБЕРЕТ:  ${slRemovedNotReversal}/${slData.length} (${(slRemovedNotReversal/slData.length*100).toFixed(1)}%)`);
  console.log(`   📊 ВЕРДИКТ:    ${tpFailedNotReversal <= 40 && slRemovedNotReversal >= 30 ? '✅ Эффективен' : '⚠️  Не эффективен'}\n`);
  
  // Test Filter 5: clearance_15m >= 0.005
  console.log('5️⃣  ФИЛЬТР: clearance_15m >= 0.005 (0.5R свободного пути)\n');
  
  const tpPassClearance = tpData.filter(d => {
    const clearance = parseFloat(d.clearance_15m);
    return !isNaN(clearance) && clearance >= 0.005;
  });
  
  const slPassClearance = slData.filter(d => {
    const clearance = parseFloat(d.clearance_15m);
    return !isNaN(clearance) && clearance >= 0.005;
  });
  
  const tpFailedClearance = tpData.length - tpPassClearance.length;
  const slRemovedClearance = slData.length - slPassClearance.length;
  
  console.log(`   ✅ TP ПРОЙДЕТ: ${tpPassClearance.length}/${tpData.length} (${(tpPassClearance.length/tpData.length*100).toFixed(1)}%)`);
  console.log(`   ❌ TP УБЬЕТ:   ${tpFailedClearance}/${tpData.length} (${(tpFailedClearance/tpData.length*100).toFixed(1)}%)`);
  console.log(`   🗑️  SL УБЕРЕТ:  ${slRemovedClearance}/${slData.length} (${(slRemovedClearance/slData.length*100).toFixed(1)}%)`);
  console.log(`   📊 ВЕРДИКТ:    ${tpFailedClearance <= 30 && slRemovedClearance >= 30 ? '✅ Эффективен' : '⚠️  Не эффективен'}\n`);
  
  // Combined test: Safe filters only
  console.log('\n🔥 ============================================');
  console.log('   КОМБИНИРОВАННЫЙ ТЕСТ: БЕЗОПАСНЫЕ ФИЛЬТРЫ');
  console.log('   ============================================\n');
  
  console.log('Применяем только безопасные фильтры:');
  console.log('  - trend_alignment = "with"');
  console.log('  - НЕ против тренда (already included in "with")');
  console.log('');
  
  const tpPassCombined = tpData.filter(d => 
    d.trend_alignment === 'with'
  );
  
  const slPassCombined = slData.filter(d => 
    d.trend_alignment === 'with'
  );
  
  console.log(`✅ TP ВЫЖИВЕТ: ${tpPassCombined.length}/${tpData.length} (${(tpPassCombined.length/tpData.length*100).toFixed(1)}%)`);
  console.log(`🗑️  SL УБЬЕТ:   ${slData.length - slPassCombined.length}/${slData.length} (${((slData.length - slPassCombined.length)/slData.length*100).toFixed(1)}%)`);
  console.log('');
  console.log(`💡 ИТОГ: Безопасно применять, но эффект минимален.\n`);
  
  // More aggressive test
  console.log('\n🔥 ============================================');
  console.log('   АГРЕССИВНЫЙ ТЕСТ: ВСЕ ФИЛЬТРЫ КРОМЕ PATTERN_SCORE');
  console.log('   ============================================\n');
  
  console.log('Применяем:');
  console.log('  - trend_alignment = "with"');
  console.log('  - Momentum alignment (direction + recent_direction)');
  console.log('  - NOT after reversal');
  console.log('');
  
  const tpPassAggressive = tpData.filter(d => 
    d.trend_alignment === 'with' &&
    ((d.direction === 'LONG' && d.context_recent_direction === 'bullish') ||
     (d.direction === 'SHORT' && d.context_recent_direction === 'bearish')) &&
    d.context_was_reversal !== 't'
  );
  
  const slPassAggressive = slData.filter(d => 
    d.trend_alignment === 'with' &&
    ((d.direction === 'LONG' && d.context_recent_direction === 'bullish') ||
     (d.direction === 'SHORT' && d.context_recent_direction === 'bearish')) &&
    d.context_was_reversal !== 't'
  );
  
  console.log(`✅ TP ВЫЖИВЕТ: ${tpPassAggressive.length}/${tpData.length} (${(tpPassAggressive.length/tpData.length*100).toFixed(1)}%)`);
  console.log(`🗑️  SL УБЬЕТ:   ${slData.length - slPassAggressive.length}/${slData.length} (${((slData.length - slPassAggressive.length)/slData.length*100).toFixed(1)}%)`);
  console.log('');
  
  if (tpPassAggressive.length / tpData.length < 0.5) {
    console.log(`❌ СЛИШКОМ АГРЕССИВНО! Убивает ${((1 - tpPassAggressive.length/tpData.length)*100).toFixed(1)}% тейков!\n`);
  } else if (slData.length - slPassAggressive.length < 30) {
    console.log(`⚠️  СЛАБЫЙ ЭФФЕКТ! Убирает всего ${slData.length - slPassAggressive.length} стопов.\n`);
  } else {
    console.log(`✅ ХОРОШИЙ БАЛАНС!\n`);
  }
}

// Main
const tpFile = process.argv[2];
const slFile = process.argv[3];

if (!tpFile || !slFile) {
  console.error('Usage: npx tsx testFiltersOnTp.ts <tp_file.csv> <sl_file.csv>');
  process.exit(1);
}

const tpData = parseCSV(tpFile);
const slData = parseCSV(slFile);

testFilters(tpData, slData);

console.log('\n✅ Тестирование завершено!\n');
