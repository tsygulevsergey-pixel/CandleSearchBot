import * as fs from 'fs';

interface SignalData {
  id: string;
  symbol: string;
  direction: string;
  pattern_type: string;
  status: string;
  mfe_r: string;
  mae_r: string;
  time_to_sl_min: string;
  signal_time: string;
  post_sl_outcome: string;
  post_sl_max_favorable_r: string;
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

function deepAnalysis(tpData: SignalData[], slData: SignalData[]) {
  console.log('\n🔬 ============================================');
  console.log('   ГЛУБОКИЙ АНАЛИЗ: ПОИСК РЕАЛЬНЫХ ПРОБЛЕМ');
  console.log('   ============================================\n');
  
  // 1. Analysis by symbol
  console.log('1️⃣  АНАЛИЗ ПО СИМВОЛАМ (TOP 20 худших)\n');
  
  const symbolStats: Record<string, { tp: number; sl: number; total: number; winRate: number }> = {};
  
  for (const row of tpData) {
    if (!symbolStats[row.symbol]) {
      symbolStats[row.symbol] = { tp: 0, sl: 0, total: 0, winRate: 0 };
    }
    symbolStats[row.symbol].tp++;
    symbolStats[row.symbol].total++;
  }
  
  for (const row of slData) {
    if (!symbolStats[row.symbol]) {
      symbolStats[row.symbol] = { tp: 0, sl: 0, total: 0, winRate: 0 };
    }
    symbolStats[row.symbol].sl++;
    symbolStats[row.symbol].total++;
  }
  
  // Calculate win rates
  for (const symbol in symbolStats) {
    const stats = symbolStats[symbol];
    stats.winRate = stats.total > 0 ? (stats.tp / stats.total) * 100 : 0;
  }
  
  // Sort by worst win rate (with minimum 3 signals)
  const worstSymbols = Object.entries(symbolStats)
    .filter(([_, stats]) => stats.total >= 3)
    .sort((a, b) => a[1].winRate - b[1].winRate)
    .slice(0, 20);
  
  console.log('   Symbol         | TP | SL | Total | Win%  | Вердикт');
  console.log('   ---------------|----|----|-------|-------|------------------');
  
  let badSymbolsCount = 0;
  const badSymbols: string[] = [];
  
  for (const [symbol, stats] of worstSymbols) {
    const verdict = stats.winRate < 30 ? '❌ ПЛОХО' : stats.winRate < 40 ? '⚠️  СРЕДНЕ' : '✅ ОК';
    console.log(`   ${symbol.padEnd(14)} | ${stats.tp.toString().padStart(2)} | ${stats.sl.toString().padStart(2)} | ${stats.total.toString().padStart(5)} | ${stats.winRate.toFixed(1).padStart(5)}% | ${verdict}`);
    
    if (stats.winRate < 30) {
      badSymbolsCount++;
      badSymbols.push(symbol);
    }
  }
  
  console.log(`\n   💡 Найдено ${badSymbolsCount} символов с win rate < 30%`);
  if (badSymbolsCount > 0) {
    const badSymbolsSL = slData.filter(d => badSymbols.includes(d.symbol)).length;
    console.log(`   🗑️  Можно убрать: ${badSymbolsSL} стопов, исключив эти символы\n`);
  } else {
    console.log(`   ⚠️  Все символы имеют приемлемый win rate\n`);
  }
  
  // 2. Fast vs Slow stop-losses
  console.log('\n2️⃣  АНАЛИЗ: БЫСТРЫЕ vs МЕДЛЕННЫЕ СТОПЫ\n');
  
  const fastStops: SignalData[] = [];
  const mediumStops: SignalData[] = [];
  const slowStops: SignalData[] = [];
  const noTimeData: SignalData[] = [];
  
  for (const row of slData) {
    const timeToSL = parseFloat(row.time_to_sl_min);
    if (isNaN(timeToSL)) {
      noTimeData.push(row);
      continue;
    }
    
    if (timeToSL < 30) {
      fastStops.push(row);
    } else if (timeToSL < 120) {
      mediumStops.push(row);
    } else {
      slowStops.push(row);
    }
  }
  
  console.log(`   ⚡ Быстрые (<30 мин):   ${fastStops.length} (${(fastStops.length/slData.length*100).toFixed(1)}%)`);
  console.log(`   ⏱️  Средние (30-120 мин): ${mediumStops.length} (${(mediumStops.length/slData.length*100).toFixed(1)}%)`);
  console.log(`   🐌 Медленные (>120 мин): ${slowStops.length} (${(slowStops.length/slData.length*100).toFixed(1)}%)`);
  console.log(`   ❓ Нет данных:          ${noTimeData.length}\n`);
  
  // Check reversal rates for fast stops
  const fastStopsWithReversal = fastStops.filter(d => 
    d.post_sl_outcome === 'would_hit_tp1' || 
    d.post_sl_outcome === 'would_hit_tp2' ||
    d.post_sl_outcome === 'would_hit_tp3'
  );
  
  console.log(`   💡 Быстрые стопы с разворотом: ${fastStopsWithReversal.length}/${fastStops.length} (${(fastStopsWithReversal.length/fastStops.length*100).toFixed(1)}%)`);
  console.log(`   🔧 Trailing stop или wider SL могли бы спасти эти сигналы\n`);
  
  // 3. MFE/MAE analysis
  console.log('\n3️⃣  АНАЛИЗ MFE/MAE (насколько близко к тейку)\n');
  
  const slWithMFE = slData.filter(d => !isNaN(parseFloat(d.mfe_r)));
  const avgMFE = slWithMFE.reduce((sum, d) => sum + parseFloat(d.mfe_r), 0) / slWithMFE.length;
  
  const almostTP = slData.filter(d => {
    const mfe = parseFloat(d.mfe_r);
    return !isNaN(mfe) && mfe >= 1.5; // Дошли до 1.5R (75% пути до TP1=2R)
  });
  
  console.log(`   📊 Средний MFE (максимум в плюс): ${avgMFE.toFixed(2)}R`);
  console.log(`   🎯 Дошли до ≥1.5R перед стопом: ${almostTP.length}/${slData.length} (${(almostTP.length/slData.length*100).toFixed(1)}%)`);
  console.log(`   💡 Partial close на 1.5R или trailing stop могли бы помочь\n`);
  
  // 4. Pattern type analysis
  console.log('\n4️⃣  АНАЛИЗ ПО ТИПАМ ПАТТЕРНОВ\n');
  
  const patternStats: Record<string, { tp: number; sl: number; winRate: number }> = {};
  
  for (const row of tpData) {
    if (!patternStats[row.pattern_type]) {
      patternStats[row.pattern_type] = { tp: 0, sl: 0, winRate: 0 };
    }
    patternStats[row.pattern_type].tp++;
  }
  
  for (const row of slData) {
    if (!patternStats[row.pattern_type]) {
      patternStats[row.pattern_type] = { tp: 0, sl: 0, winRate: 0 };
    }
    patternStats[row.pattern_type].sl++;
  }
  
  for (const pattern in patternStats) {
    const stats = patternStats[pattern];
    const total = stats.tp + stats.sl;
    stats.winRate = total > 0 ? (stats.tp / total) * 100 : 0;
  }
  
  console.log('   Паттерн          | TP  | SL  | Win%   | Вердикт');
  console.log('   -----------------|-----|-----|--------|------------------');
  
  const sortedPatterns = Object.entries(patternStats)
    .sort((a, b) => b[1].winRate - a[1].winRate);
  
  for (const [pattern, stats] of sortedPatterns) {
    const total = stats.tp + stats.sl;
    const verdict = stats.winRate >= 50 ? '✅ ХОРОШО' : stats.winRate >= 40 ? '⚠️  СРЕДНЕ' : '❌ ПЛОХО';
    console.log(`   ${pattern.padEnd(16)} | ${stats.tp.toString().padStart(3)} | ${stats.sl.toString().padStart(3)} | ${stats.winRate.toFixed(1).padStart(6)}% | ${verdict}`);
  }
  
  // 5. Direction analysis (detailed)
  console.log('\n\n5️⃣  АНАЛИЗ ПО НАПРАВЛЕНИЯМ (детально)\n');
  
  const longTP = tpData.filter(d => d.direction === 'LONG').length;
  const longSL = slData.filter(d => d.direction === 'LONG').length;
  const shortTP = tpData.filter(d => d.direction === 'SHORT').length;
  const shortSL = slData.filter(d => d.direction === 'SHORT').length;
  
  const longWinRate = (longTP / (longTP + longSL) * 100);
  const shortWinRate = (shortTP / (shortTP + shortSL) * 100);
  
  console.log(`   LONG:  ${longTP} TP / ${longSL} SL = ${longWinRate.toFixed(1)}% win rate`);
  console.log(`   SHORT: ${shortTP} TP / ${shortSL} SL = ${shortWinRate.toFixed(1)}% win rate\n`);
  
  const longProfit = (longTP * 2) - longSL;
  const shortProfit = (shortTP * 2) - shortSL;
  
  console.log(`   LONG прибыль:  ${longProfit > 0 ? '+' : ''}${longProfit}R`);
  console.log(`   SHORT прибыль: ${shortProfit > 0 ? '+' : ''}${shortProfit}R\n`);
  
  // RECOMMENDATIONS
  console.log('\n💡 ============================================');
  console.log('   КОНКРЕТНЫЕ РЕКОМЕНДАЦИИ');
  console.log('   ============================================\n');
  
  let totalPotentialSaved = 0;
  
  if (badSymbols.length > 0) {
    const badSymbolsSL = slData.filter(d => badSymbols.includes(d.symbol)).length;
    const badSymbolsTP = tpData.filter(d => badSymbols.includes(d.symbol)).length;
    const netEffect = badSymbolsSL - (badSymbolsTP * 2);
    
    console.log(`1️⃣  ИСКЛЮЧИТЬ ПЛОХИЕ СИМВОЛЫ (win rate < 30%):`);
    console.log(`   Символы: ${badSymbols.join(', ')}`);
    console.log(`   Убрать: ${badSymbolsSL} SL (+${badSymbolsSL}R)`);
    console.log(`   Потеря: ${badSymbolsTP} TP (-${badSymbolsTP * 2}R)`);
    console.log(`   📈 ИТОГО: ${netEffect > 0 ? '+' : ''}${netEffect}R\n`);
    
    if (netEffect > 0) {
      totalPotentialSaved += netEffect;
    }
  }
  
  if (fastStopsWithReversal.length > 0) {
    console.log(`2️⃣  TRAILING STOP-LOSS:`);
    console.log(`   Проблема: ${fastStopsWithReversal.length} быстрых стопов развернулись`);
    console.log(`   Решение: После +0.5R переместить SL в breakeven`);
    console.log(`   📈 Потенциал: +${fastStopsWithReversal.length}R (${(fastStopsWithReversal.length/slData.length*100).toFixed(1)}% улучшение)\n`);
    totalPotentialSaved += fastStopsWithReversal.length;
  }
  
  if (almostTP.length > 0) {
    console.log(`3️⃣  PARTIAL CLOSE STRATEGY:`);
    console.log(`   Проблема: ${almostTP.length} сигналов дошли до 1.5R но не взяли TP`);
    console.log(`   Решение: Закрыть 50% позиции на 1.5R, остальное держать`);
    console.log(`   📈 Потенциал: +${(almostTP.length * 0.75).toFixed(0)}R (частичная прибыль)\n`);
    totalPotentialSaved += almostTP.length * 0.75;
  }
  
  if (longWinRate < 40) {
    console.log(`4️⃣  ПЕРЕСМОТРЕТЬ LONG СИГНАЛЫ:`);
    console.log(`   Проблема: LONG win rate ${longWinRate.toFixed(1)}% (ниже 40%)`);
    console.log(`   Текущий результат: ${longProfit > 0 ? '+' : ''}${longProfit}R`);
    if (longProfit < 0) {
      console.log(`   ⚠️  LONG сигналы УБЫТОЧНЫ! Рекомендация: отключить LONG`);
      console.log(`   📈 Экономия: +${Math.abs(longProfit)}R\n`);
      totalPotentialSaved += Math.abs(longProfit);
    } else {
      console.log(`   💡 Рассмотреть более строгие фильтры для LONG\n`);
    }
  }
  
  console.log(`\n🎯 ИТОГО ПОТЕНЦИАЛ УЛУЧШЕНИЯ: +${totalPotentialSaved.toFixed(0)}R`);
  console.log(`   (из текущих +${(tpData.length * 2 - slData.length)}R)\n`);
}

// Main
const tpFile = process.argv[2];
const slFile = process.argv[3];

if (!tpFile || !slFile) {
  console.error('Usage: npx tsx deepAnalysis.ts <tp_file.csv> <sl_file.csv>');
  process.exit(1);
}

const tpData = parseCSV(tpFile);
const slData = parseCSV(slFile);

deepAnalysis(tpData, slData);

console.log('✅ Глубокий анализ завершен!\n');
