import * as fs from 'fs';

interface SignalData {
  id: string;
  symbol: string;
  direction: string;
  pattern_type: string;
  pattern_score: string;
  trend_alignment: string;
  context_recent_direction: string;
  context_was_reversal: string;
  context_trend_before: string;
  clearance_15m: string;
  mfe_r: string;
  mae_r: string;
  time_to_sl_min: string;
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

function findSafeFilters(tpData: SignalData[], slData: SignalData[]) {
  console.log('🔍 ============================================');
  console.log('   ПОИСК БЕЗОПАСНЫХ ФИЛЬТРОВ (0% ПОТЕРЬ TP)');
  console.log('   ============================================\n');
  
  console.log(`📊 Данные: ${tpData.length} TP, ${slData.length} SL\n`);
  
  // 1. Check "against" trend
  console.log('1️⃣  ФИЛЬТР: Исключить trend_alignment = "against"\n');
  
  const tpAgainst = tpData.filter(d => d.trend_alignment === 'against');
  const slAgainst = slData.filter(d => d.trend_alignment === 'against');
  
  console.log(`   TP с "against": ${tpAgainst.length}/${tpData.length} (${(tpAgainst.length/tpData.length*100).toFixed(1)}%)`);
  console.log(`   SL с "against": ${slAgainst.length}/${slData.length} (${(slAgainst.length/slData.length*100).toFixed(1)}%)`);
  console.log(`   💰 Экономия: ${slAgainst.length} стопов × -1R = +${slAgainst.length}R`);
  console.log(`   ❌ Потеря:  ${tpAgainst.length} тейков × 2R = -${tpAgainst.length * 2}R`);
  console.log(`   📊 ИТОГО:   ${slAgainst.length - tpAgainst.length * 2}R`);
  if (tpAgainst.length === 0) {
    console.log(`   ✅ ИДЕАЛЬНО! Не затрагивает тейки!\n`);
  } else {
    console.log(`   ⚠️  Затрагивает ${tpAgainst.length} тейков\n`);
  }
  
  // 2. Check specific pattern types
  console.log('2️⃣  АНАЛИЗ ПО ТИПАМ ПАТТЕРНОВ\n');
  
  const patternTypes = ['pinbar_sell', 'pinbar_buy', 'fakey_sell', 'fakey_buy', 'engulfing_sell', 'ppr_sell'];
  
  console.log('   Паттерн          | TP   | SL   | TP Win% | SL Loss%');
  console.log('   -----------------|------|------|---------|----------');
  
  for (const pattern of patternTypes) {
    const tpCount = tpData.filter(d => d.pattern_type === pattern).length;
    const slCount = slData.filter(d => d.pattern_type === pattern).length;
    const total = tpCount + slCount;
    
    if (total === 0) continue;
    
    const tpWinRate = total > 0 ? (tpCount / total * 100).toFixed(1) : '0.0';
    const slLossRate = total > 0 ? (slCount / total * 100).toFixed(1) : '0.0';
    
    console.log(`   ${pattern.padEnd(16)} | ${tpCount.toString().padStart(4)} | ${slCount.toString().padStart(4)} | ${tpWinRate.padStart(6)}% | ${slLossRate.padStart(7)}%`);
  }
  console.log('');
  
  // Find worst patterns (high SL rate, no TP)
  const worstPatterns = patternTypes.filter(pattern => {
    const tpCount = tpData.filter(d => d.pattern_type === pattern).length;
    const slCount = slData.filter(d => d.pattern_type === pattern).length;
    return slCount > 0 && tpCount === 0;
  });
  
  if (worstPatterns.length > 0) {
    console.log(`   🔥 Паттерны БЕЗ тейков (только стопы): ${worstPatterns.join(', ')}`);
    const worstSL = worstPatterns.reduce((sum, p) => sum + slData.filter(d => d.pattern_type === p).length, 0);
    console.log(`   ✅ Можно убрать: ${worstSL} стопов БЕЗ ПОТЕРИ ТЕЙКОВ!\n`);
  } else {
    console.log(`   ⚠️  Все паттерны имеют хотя бы 1 тейк\n`);
  }
  
  // 3. Check for SHORT specific issues
  console.log('3️⃣  АНАЛИЗ SHORT vs LONG\n');
  
  const tpLong = tpData.filter(d => d.direction === 'LONG');
  const tpShort = tpData.filter(d => d.direction === 'SHORT');
  const slLong = slData.filter(d => d.direction === 'LONG');
  const slShort = slData.filter(d => d.direction === 'SHORT');
  
  const longTotal = tpLong.length + slLong.length;
  const shortTotal = tpShort.length + slShort.length;
  
  console.log(`   LONG:  ${tpLong.length} TP / ${slLong.length} SL = ${(tpLong.length/longTotal*100).toFixed(1)}% win rate`);
  console.log(`   SHORT: ${tpShort.length} TP / ${slShort.length} SL = ${(tpShort.length/shortTotal*100).toFixed(1)}% win rate`);
  
  if (tpShort.length / shortTotal < 0.3) {
    console.log(`   ⚠️  SHORT имеет низкий win rate (<30%)`);
    console.log(`   💡 Рекомендация: Возможно стоит отключить SHORT сигналы?`);
  }
  console.log('');
  
  // 4. Check choppy momentum for SHORT
  console.log('4️⃣  ФИЛЬТР: SHORT + choppy momentum\n');
  
  const tpShortChoppy = tpData.filter(d => d.direction === 'SHORT' && d.context_recent_direction === 'choppy');
  const slShortChoppy = slData.filter(d => d.direction === 'SHORT' && d.context_recent_direction === 'choppy');
  
  console.log(`   TP SHORT + choppy: ${tpShortChoppy.length}/${tpShort.length} (${(tpShortChoppy.length/tpShort.length*100).toFixed(1)}%)`);
  console.log(`   SL SHORT + choppy: ${slShortChoppy.length}/${slShort.length} (${(slShortChoppy.length/slShort.length*100).toFixed(1)}%)`);
  
  const choppyTotal = tpShortChoppy.length + slShortChoppy.length;
  if (choppyTotal > 0) {
    const choppyWinRate = (tpShortChoppy.length / choppyTotal * 100).toFixed(1);
    console.log(`   Win rate: ${choppyWinRate}%`);
    
    if (parseFloat(choppyWinRate) < 30) {
      console.log(`   ✅ РЕКОМЕНДАЦИЯ: Исключить SHORT + choppy (низкий win rate)`);
      console.log(`   💰 Экономия: ${slShortChoppy.length} стопов`);
      console.log(`   ❌ Потеря:  ${tpShortChoppy.length} тейков (${tpShortChoppy.length * 2}R)\n`);
    }
  }
  
  // 5. Check LONG + bearish/choppy
  console.log('5️⃣  ФИЛЬТР: LONG + bearish/choppy momentum\n');
  
  const tpLongBad = tpData.filter(d => 
    d.direction === 'LONG' && 
    (d.context_recent_direction === 'bearish' || d.context_recent_direction === 'choppy')
  );
  const slLongBad = slData.filter(d => 
    d.direction === 'LONG' && 
    (d.context_recent_direction === 'bearish' || d.context_recent_direction === 'choppy')
  );
  
  console.log(`   TP LONG + bad momentum: ${tpLongBad.length}/${tpLong.length} (${(tpLongBad.length/tpLong.length*100).toFixed(1)}%)`);
  console.log(`   SL LONG + bad momentum: ${slLongBad.length}/${slLong.length} (${(slLongBad.length/slLong.length*100).toFixed(1)}%)`);
  
  const longBadTotal = tpLongBad.length + slLongBad.length;
  if (longBadTotal > 0) {
    const longBadWinRate = (tpLongBad.length / longBadTotal * 100).toFixed(1);
    console.log(`   Win rate: ${longBadWinRate}%`);
    
    if (parseFloat(longBadWinRate) < 30) {
      console.log(`   ✅ РЕКОМЕНДАЦИЯ: Исключить LONG + bearish/choppy`);
      console.log(`   💰 Экономия: ${slLongBad.length} стопов`);
      console.log(`   ❌ Потеря:  ${tpLongBad.length} тейков (${tpLongBad.length * 2}R)\n`);
    } else {
      console.log(`   ⚠️  Win rate приемлемый, фильтр не нужен\n`);
    }
  }
  
  // SUMMARY
  console.log('\n💡 ============================================');
  console.log('   ИТОГОВЫЕ РЕКОМЕНДАЦИИ');
  console.log('   ============================================\n');
  
  let totalSLRemoved = 0;
  let totalTPLost = 0;
  
  // Recommendation 1: Against trend
  if (tpAgainst.length === 0 && slAgainst.length > 0) {
    console.log(`✅ 1. Исключить trend_alignment = "against"`);
    console.log(`   → Убрать: ${slAgainst.length} SL (+${slAgainst.length}R)`);
    console.log(`   → Потеря: 0 TP (0R)`);
    console.log(`   → ИТОГО: +${slAgainst.length}R\n`);
    totalSLRemoved += slAgainst.length;
  }
  
  // Recommendation 2: Worst patterns
  if (worstPatterns.length > 0) {
    const worstSL = worstPatterns.reduce((sum, p) => sum + slData.filter(d => d.pattern_type === p).length, 0);
    console.log(`✅ 2. Исключить паттерны: ${worstPatterns.join(', ')}`);
    console.log(`   → Убрать: ${worstSL} SL (+${worstSL}R)`);
    console.log(`   → Потеря: 0 TP (0R)`);
    console.log(`   → ИТОГО: +${worstSL}R\n`);
    totalSLRemoved += worstSL;
  }
  
  console.log(`🎯 ОБЩИЙ ЭФФЕКТ БЕЗОПАСНЫХ ФИЛЬТРОВ:`);
  console.log(`   Убрать стопов: ${totalSLRemoved} (+${totalSLRemoved}R)`);
  console.log(`   Потеря тейков: ${totalTPLost} (-${totalTPLost * 2}R)`);
  console.log(`   📈 ЧИСТАЯ ПРИБЫЛЬ: +${totalSLRemoved - totalTPLost * 2}R\n`);
  
  if (totalSLRemoved < 10) {
    console.log(`⚠️  МАЛЫЙ ЭФФЕКТ: Безопасные фильтры убирают мало стопов.`);
    console.log(`💡  Возможно нужно пересмотреть стратегию или параметры.\n`);
  }
}

// Main
const tpFile = process.argv[2];
const slFile = process.argv[3];

if (!tpFile || !slFile) {
  console.error('Usage: npx tsx findSafeFilters.ts <tp_file.csv> <sl_file.csv>');
  process.exit(1);
}

const tpData = parseCSV(tpFile);
const slData = parseCSV(slFile);

findSafeFilters(tpData, slData);

console.log('✅ Анализ завершен!\n');
