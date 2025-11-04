import * as fs from 'fs';

interface SignalData {
  id: string;
  symbol: string;
  direction: string;
  pattern_type: string;
  status: string;
  pnl_r: string;
  context_trend_before: string;
  context_was_reversal: string;
  context_recent_direction: string;
  pattern_score: string;
  trend_alignment: string;
  clearance_15m: string;
  post_sl_outcome: string;
  mfe_r: string;
  mae_r: string;
  time_to_sl_min: string;
  context_distance_from_ema: string;
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

function analyzeGroup(data: SignalData[], name: string) {
  console.log(`\n📊 ${name.toUpperCase()}`);
  console.log(`   Всего сигналов: ${data.length}\n`);
  
  // Pattern Score distribution
  const scores = data
    .map(d => parseFloat(d.pattern_score))
    .filter(s => !isNaN(s));
  
  if (scores.length > 0) {
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const medianScore = scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)];
    
    console.log(`   📈 Pattern Score:`);
    console.log(`      Average: ${avgScore.toFixed(1)}`);
    console.log(`      Median:  ${medianScore.toFixed(1)}`);
    console.log(`      Min/Max: ${minScore.toFixed(1)} / ${maxScore.toFixed(1)}`);
    
    const score50plus = scores.filter(s => s >= 50).length;
    const score60plus = scores.filter(s => s >= 60).length;
    const score80plus = scores.filter(s => s >= 80).length;
    
    console.log(`      ≥50: ${score50plus} (${(score50plus/scores.length*100).toFixed(1)}%)`);
    console.log(`      ≥60: ${score60plus} (${(score60plus/scores.length*100).toFixed(1)}%)`);
    console.log(`      ≥80: ${score80plus} (${(score80plus/scores.length*100).toFixed(1)}%)`);
  }
  
  // Trend Alignment
  const trendWith = data.filter(d => d.trend_alignment === 'with').length;
  const trendAgainst = data.filter(d => d.trend_alignment === 'against').length;
  const trendNeutral = data.filter(d => d.trend_alignment === 'neutral').length;
  const trendEmpty = data.filter(d => !d.trend_alignment || d.trend_alignment === '').length;
  
  console.log(`\n   🎯 Trend Alignment:`);
  console.log(`      With:    ${trendWith} (${(trendWith/data.length*100).toFixed(1)}%)`);
  console.log(`      Against: ${trendAgainst} (${(trendAgainst/data.length*100).toFixed(1)}%)`);
  console.log(`      Neutral: ${trendNeutral} (${(trendNeutral/data.length*100).toFixed(1)}%)`);
  if (trendEmpty > 0) console.log(`      Empty:   ${trendEmpty} (${(trendEmpty/data.length*100).toFixed(1)}%)`);
  
  // Recent Direction
  const recentBullish = data.filter(d => d.context_recent_direction === 'bullish').length;
  const recentBearish = data.filter(d => d.context_recent_direction === 'bearish').length;
  const recentChoppy = data.filter(d => d.context_recent_direction === 'choppy').length;
  
  console.log(`\n   💨 Recent Direction:`);
  console.log(`      Bullish: ${recentBullish} (${(recentBullish/data.length*100).toFixed(1)}%)`);
  console.log(`      Bearish: ${recentBearish} (${(recentBearish/data.length*100).toFixed(1)}%)`);
  console.log(`      Choppy:  ${recentChoppy} (${(recentChoppy/data.length*100).toFixed(1)}%)`);
  
  // Direction alignment check
  const longBullish = data.filter(d => d.direction === 'LONG' && d.context_recent_direction === 'bullish').length;
  const longTotal = data.filter(d => d.direction === 'LONG').length;
  const shortBearish = data.filter(d => d.direction === 'SHORT' && d.context_recent_direction === 'bearish').length;
  const shortTotal = data.filter(d => d.direction === 'SHORT').length;
  
  if (longTotal > 0) {
    console.log(`      LONG + bullish: ${longBullish}/${longTotal} (${(longBullish/longTotal*100).toFixed(1)}%)`);
  }
  if (shortTotal > 0) {
    console.log(`      SHORT + bearish: ${shortBearish}/${shortTotal} (${(shortBearish/shortTotal*100).toFixed(1)}%)`);
  }
  
  // Was Reversal
  const wasReversal = data.filter(d => d.context_was_reversal === 't').length;
  console.log(`\n   🔄 After Reversal:`);
  console.log(`      Yes: ${wasReversal} (${(wasReversal/data.length*100).toFixed(1)}%)`);
  console.log(`      No:  ${data.length - wasReversal} (${((data.length - wasReversal)/data.length*100).toFixed(1)}%)`);
  
  // Clearance 15m
  const clearances = data
    .map(d => parseFloat(d.clearance_15m))
    .filter(c => !isNaN(c));
  
  if (clearances.length > 0) {
    const avgClearance = clearances.reduce((a, b) => a + b, 0) / clearances.length;
    const clearance05plus = clearances.filter(c => c >= 0.005).length;
    const clearance1plus = clearances.filter(c => c >= 0.01).length;
    
    console.log(`\n   🚧 Clearance 15m:`);
    console.log(`      Average: ${(avgClearance * 100).toFixed(3)}R`);
    console.log(`      ≥0.5R: ${clearance05plus} (${(clearance05plus/clearances.length*100).toFixed(1)}%)`);
    console.log(`      ≥1.0R: ${clearance1plus} (${(clearance1plus/clearances.length*100).toFixed(1)}%)`);
  }
  
  // Pattern types
  const patternCounts: { [key: string]: number } = {};
  data.forEach(d => {
    patternCounts[d.pattern_type] = (patternCounts[d.pattern_type] || 0) + 1;
  });
  
  console.log(`\n   📋 Pattern Types:`);
  Object.entries(patternCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([pattern, count]) => {
      console.log(`      ${pattern}: ${count} (${(count/data.length*100).toFixed(1)}%)`);
    });
}

function compareGroups(tpData: SignalData[], slData: SignalData[]) {
  console.log('\n\n🔍 ============================================');
  console.log('   СРАВНЕНИЕ: TP vs SL');
  console.log('   ============================================\n');
  
  // Pattern Score comparison
  const tpScores = tpData.map(d => parseFloat(d.pattern_score)).filter(s => !isNaN(s));
  const slScores = slData.map(d => parseFloat(d.pattern_score)).filter(s => !isNaN(s));
  
  if (tpScores.length > 0 && slScores.length > 0) {
    const tpAvg = tpScores.reduce((a, b) => a + b, 0) / tpScores.length;
    const slAvg = slScores.reduce((a, b) => a + b, 0) / slScores.length;
    
    console.log('📈 PATTERN SCORE:');
    console.log(`   TP Average: ${tpAvg.toFixed(1)}`);
    console.log(`   SL Average: ${slAvg.toFixed(1)}`);
    console.log(`   Difference: ${(tpAvg - slAvg).toFixed(1)} (${tpAvg > slAvg ? '✅ TP лучше' : '❌ TP хуже'})\n`);
    
    const tpScore50plus = tpScores.filter(s => s >= 50).length / tpScores.length * 100;
    const slScore50plus = slScores.filter(s => s >= 50).length / slScores.length * 100;
    
    console.log(`   ≥50 в TP: ${tpScore50plus.toFixed(1)}%`);
    console.log(`   ≥50 в SL: ${slScore50plus.toFixed(1)}%`);
    console.log(`   Difference: ${(tpScore50plus - slScore50plus).toFixed(1)}%\n`);
  }
  
  // Trend Alignment comparison
  const tpWith = tpData.filter(d => d.trend_alignment === 'with').length / tpData.length * 100;
  const slWith = slData.filter(d => d.trend_alignment === 'with').length / slData.length * 100;
  
  console.log('🎯 TREND ALIGNMENT "WITH":');
  console.log(`   TP: ${tpWith.toFixed(1)}%`);
  console.log(`   SL: ${slWith.toFixed(1)}%`);
  console.log(`   Difference: ${(tpWith - slWith).toFixed(1)}% (${tpWith > slWith ? '✅ TP чаще with' : '❌ SL чаще with'})\n`);
  
  const tpAgainst = tpData.filter(d => d.trend_alignment === 'against').length / tpData.length * 100;
  const slAgainst = slData.filter(d => d.trend_alignment === 'against').length / slData.length * 100;
  
  console.log('🎯 TREND ALIGNMENT "AGAINST":');
  console.log(`   TP: ${tpAgainst.toFixed(1)}%`);
  console.log(`   SL: ${slAgainst.toFixed(1)}%`);
  console.log(`   Difference: ${(tpAgainst - slAgainst).toFixed(1)}% (${tpAgainst < slAgainst ? '✅ TP реже against' : '❌ TP чаще against'})\n`);
  
  // Recent Direction alignment
  const tpLongBullish = tpData.filter(d => d.direction === 'LONG' && d.context_recent_direction === 'bullish').length;
  const tpLongTotal = tpData.filter(d => d.direction === 'LONG').length;
  const slLongBullish = slData.filter(d => d.direction === 'LONG' && d.context_recent_direction === 'bullish').length;
  const slLongTotal = slData.filter(d => d.direction === 'LONG').length;
  
  if (tpLongTotal > 0 && slLongTotal > 0) {
    const tpLongPct = tpLongBullish / tpLongTotal * 100;
    const slLongPct = slLongBullish / slLongTotal * 100;
    
    console.log('💨 LONG + BULLISH MOMENTUM:');
    console.log(`   TP: ${tpLongPct.toFixed(1)}% (${tpLongBullish}/${tpLongTotal})`);
    console.log(`   SL: ${slLongPct.toFixed(1)}% (${slLongBullish}/${slLongTotal})`);
    console.log(`   Difference: ${(tpLongPct - slLongPct).toFixed(1)}% (${tpLongPct > slLongPct ? '✅ TP чаще aligned' : '❌ SL чаще aligned'})\n`);
  }
  
  const tpShortBearish = tpData.filter(d => d.direction === 'SHORT' && d.context_recent_direction === 'bearish').length;
  const tpShortTotal = tpData.filter(d => d.direction === 'SHORT').length;
  const slShortBearish = slData.filter(d => d.direction === 'SHORT' && d.context_recent_direction === 'bearish').length;
  const slShortTotal = slData.filter(d => d.direction === 'SHORT').length;
  
  if (tpShortTotal > 0 && slShortTotal > 0) {
    const tpShortPct = tpShortBearish / tpShortTotal * 100;
    const slShortPct = slShortBearish / slShortTotal * 100;
    
    console.log('💨 SHORT + BEARISH MOMENTUM:');
    console.log(`   TP: ${tpShortPct.toFixed(1)}% (${tpShortBearish}/${tpShortTotal})`);
    console.log(`   SL: ${slShortPct.toFixed(1)}% (${slShortBearish}/${slShortTotal})`);
    console.log(`   Difference: ${(tpShortPct - slShortPct).toFixed(1)}% (${tpShortPct > slShortPct ? '✅ TP чаще aligned' : '❌ SL чаще aligned'})\n`);
  }
  
  // Was Reversal
  const tpReversal = tpData.filter(d => d.context_was_reversal === 't').length / tpData.length * 100;
  const slReversal = slData.filter(d => d.context_was_reversal === 't').length / slData.length * 100;
  
  console.log('🔄 AFTER REVERSAL:');
  console.log(`   TP: ${tpReversal.toFixed(1)}%`);
  console.log(`   SL: ${slReversal.toFixed(1)}%`);
  console.log(`   Difference: ${(tpReversal - slReversal).toFixed(1)}% (${tpReversal < slReversal ? '✅ TP реже после разворота' : '❌ TP чаще после разворота'})\n`);
  
  // Clearance
  const tpClearances = tpData.map(d => parseFloat(d.clearance_15m)).filter(c => !isNaN(c));
  const slClearances = slData.map(d => parseFloat(d.clearance_15m)).filter(c => !isNaN(c));
  
  if (tpClearances.length > 0 && slClearances.length > 0) {
    const tpAvgClearance = tpClearances.reduce((a, b) => a + b, 0) / tpClearances.length;
    const slAvgClearance = slClearances.reduce((a, b) => a + b, 0) / slClearances.length;
    
    console.log('🚧 CLEARANCE 15m:');
    console.log(`   TP Average: ${(tpAvgClearance * 100).toFixed(3)}R`);
    console.log(`   SL Average: ${(slAvgClearance * 100).toFixed(3)}R`);
    console.log(`   Difference: ${((tpAvgClearance - slAvgClearance) * 100).toFixed(3)}R (${tpAvgClearance > slAvgClearance ? '✅ TP больше clearance' : '❌ SL больше clearance'})\n`);
    
    const tpClearance05plus = tpClearances.filter(c => c >= 0.005).length / tpClearances.length * 100;
    const slClearance05plus = slClearances.filter(c => c >= 0.005).length / slClearances.length * 100;
    
    console.log(`   ≥0.5R в TP: ${tpClearance05plus.toFixed(1)}%`);
    console.log(`   ≥0.5R в SL: ${slClearance05plus.toFixed(1)}%`);
    console.log(`   Difference: ${(tpClearance05plus - slClearance05plus).toFixed(1)}%\n`);
  }
}

function generateRecommendations(tpData: SignalData[], slData: SignalData[]) {
  console.log('\n\n✅ ============================================');
  console.log('   ФИНАЛЬНЫЕ РЕКОМЕНДАЦИИ');
  console.log('   ============================================\n');
  
  const tpScores = tpData.map(d => parseFloat(d.pattern_score)).filter(s => !isNaN(s));
  const slScores = slData.map(d => parseFloat(d.pattern_score)).filter(s => !isNaN(s));
  
  // Find optimal pattern_score threshold
  if (tpScores.length > 0 && slScores.length > 0) {
    const tpAvg = tpScores.reduce((a, b) => a + b, 0) / tpScores.length;
    const slAvg = slScores.reduce((a, b) => a + b, 0) / slScores.length;
    
    console.log('1️⃣  PATTERN SCORE THRESHOLD:');
    console.log(`   TP среднее: ${tpAvg.toFixed(1)}`);
    console.log(`   SL среднее: ${slAvg.toFixed(1)}`);
    
    if (tpAvg > slAvg) {
      const threshold = Math.round((tpAvg + slAvg) / 2);
      console.log(`   ✅ РЕКОМЕНДАЦИЯ: pattern_score >= ${threshold}`);
      
      const tpPassed = tpScores.filter(s => s >= threshold).length / tpScores.length * 100;
      const slFiltered = slScores.filter(s => s < threshold).length / slScores.length * 100;
      
      console.log(`   Пройдет TP: ${tpPassed.toFixed(1)}%`);
      console.log(`   Отфильтрует SL: ${slFiltered.toFixed(1)}%`);
    } else {
      console.log(`   ⚠️  ВНИМАНИЕ: Pattern score не отличает TP от SL!`);
      console.log(`   Возможно, approximate scoring не точен.`);
    }
    console.log();
  }
  
  // Check trend alignment
  const tpWith = tpData.filter(d => d.trend_alignment === 'with').length / tpData.length * 100;
  const slWith = slData.filter(d => d.trend_alignment === 'with').length / slData.length * 100;
  
  console.log('2️⃣  TREND ALIGNMENT:');
  console.log(`   TP "with": ${tpWith.toFixed(1)}%`);
  console.log(`   SL "with": ${slWith.toFixed(1)}%`);
  
  if (tpWith > slWith + 10) {
    console.log(`   ✅ РЕКОМЕНДАЦИЯ: Требовать trend_alignment = "with"`);
  } else {
    console.log(`   ⚠️  Trend alignment не сильно отличает TP от SL`);
  }
  console.log();
  
  // Check momentum alignment
  const tpAligned = tpData.filter(d => 
    (d.direction === 'LONG' && d.context_recent_direction === 'bullish') ||
    (d.direction === 'SHORT' && d.context_recent_direction === 'bearish')
  ).length / tpData.length * 100;
  
  const slAligned = slData.filter(d => 
    (d.direction === 'LONG' && d.context_recent_direction === 'bullish') ||
    (d.direction === 'SHORT' && d.context_recent_direction === 'bearish')
  ).length / slData.length * 100;
  
  console.log('3️⃣  MOMENTUM ALIGNMENT:');
  console.log(`   TP aligned: ${tpAligned.toFixed(1)}%`);
  console.log(`   SL aligned: ${slAligned.toFixed(1)}%`);
  
  if (tpAligned > slAligned + 10) {
    console.log(`   ✅ РЕКОМЕНДАЦИЯ: Требовать совпадение direction + recent_direction`);
  } else {
    console.log(`   ⚠️  Momentum alignment не сильно отличает TP от SL`);
  }
  console.log();
  
  // Overall
  console.log('🎯 ОБЩИЙ ВЫВОД:');
  console.log('   Сравните показатели TP vs SL выше.');
  console.log('   Используйте фильтры, где TP ЗНАЧИТЕЛЬНО лучше SL.\n');
  console.log('   ⚠️  ВАЖНО: Учитывайте что TP выборка маленькая (18 сигналов)!');
  console.log('   Данные могут быть не репрезентативными.\n');
}

// Main
const tpFile = process.argv[2];
const slFile = process.argv[3];

if (!tpFile || !slFile) {
  console.error('Usage: npx tsx compareTpVsSl.ts <tp_file.csv> <sl_file.csv>');
  process.exit(1);
}

const tpData = parseCSV(tpFile);
const slData = parseCSV(slFile);

analyzeGroup(tpData, 'Take-Profit Signals');
analyzeGroup(slData, 'Stop-Loss Signals');
compareGroups(tpData, slData);
generateRecommendations(tpData, slData);

console.log('✅ Анализ завершен!\n');
