import * as fs from 'fs';

interface SignalData {
  id: string;
  symbol: string;
  direction: string;
  pattern_type: string;
  entry_price: string;
  sl_price: string;
  tp1_price: string;
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

function properAnalysis(slData: SignalData[]) {
  console.log('\n🔍 ============================================');
  console.log('   ПРАВИЛЬНЫЙ АНАЛИЗ СТОП-ЛОССОВ');
  console.log('   ============================================\n');
  
  console.log(`Всего SL сигналов: ${slData.length}\n`);
  
  // 1. Analyze MAE - насколько глубоко заходит в минус ПЕРЕД стопом
  console.log('1️⃣  АНАЛИЗ MAE (насколько глубоко в минус ПЕРЕД стопом)\n');
  
  const withMAE = slData.filter(d => !isNaN(parseFloat(d.mae_r)));
  const avgMAE = withMAE.reduce((sum, d) => sum + parseFloat(d.mae_r), 0) / withMAE.length;
  
  console.log(`   Средний MAE: ${avgMAE.toFixed(2)}R`);
  
  // Distribution
  const maeRanges = [
    { label: '0 до -0.5R (мелкий минус)', min: 0, max: -0.5 },
    { label: '-0.5 до -1R (близко к SL)', min: -0.5, max: -1.0 },
    { label: '-1R до -1.5R (за стопом)', min: -1.0, max: -1.5 },
    { label: '< -1.5R (глубокий минус)', min: -1.5, max: -999 },
  ];
  
  console.log('\n   Распределение MAE:');
  for (const range of maeRanges) {
    const count = withMAE.filter(d => {
      const mae = parseFloat(d.mae_r);
      return mae <= range.min && mae > range.max;
    }).length;
    
    if (count > 0) {
      console.log(`     ${range.label}: ${count} (${(count/withMAE.length*100).toFixed(1)}%)`);
    }
  }
  
  // 2. Fast stops analysis
  console.log('\n\n2️⃣  АНАЛИЗ ВРЕМЕНИ ДО СТОП-ЛОССА\n');
  
  const withTime = slData.filter(d => !isNaN(parseFloat(d.time_to_sl_min)));
  const avgTime = withTime.reduce((sum, d) => sum + parseFloat(d.time_to_sl_min), 0) / withTime.length;
  
  console.log(`   Среднее время до SL: ${avgTime.toFixed(0)} минут`);
  
  const timeRanges = [
    { label: '< 15 мин (очень быстро)', max: 15 },
    { label: '15-30 мин', max: 30 },
    { label: '30-60 мин', max: 60 },
    { label: '60-120 мин', max: 120 },
    { label: '> 120 мин', max: 9999 },
  ];
  
  console.log('\n   Распределение по времени:');
  let prevMax = 0;
  for (const range of timeRanges) {
    const count = withTime.filter(d => {
      const time = parseFloat(d.time_to_sl_min);
      return time >= prevMax && time < range.max;
    }).length;
    
    if (count > 0) {
      console.log(`     ${range.label}: ${count} (${(count/withTime.length*100).toFixed(1)}%)`);
    }
    prevMax = range.max;
  }
  
  // 3. Post-SL reversal analysis
  console.log('\n\n3️⃣  ЧТО ПРОИСХОДИТ ПОСЛЕ СТОП-ЛОССА\n');
  
  const withPostSL = slData.filter(d => d.post_sl_outcome && d.post_sl_outcome !== '');
  
  const outcomes: Record<string, number> = {};
  for (const d of withPostSL) {
    outcomes[d.post_sl_outcome] = (outcomes[d.post_sl_outcome] || 0) + 1;
  }
  
  console.log('   Распределение исходов:');
  for (const [outcome, count] of Object.entries(outcomes).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${outcome}: ${count} (${(count/withPostSL.length*100).toFixed(1)}%)`);
  }
  
  // Reversals that would hit TP
  const wouldHitTP = slData.filter(d => 
    d.post_sl_outcome === 'would_hit_tp1' || 
    d.post_sl_outcome === 'would_hit_tp2' ||
    d.post_sl_outcome === 'would_hit_tp3' ||
    d.post_sl_outcome === 'reached_tp1' ||
    d.post_sl_outcome === 'reached_tp2' ||
    d.post_sl_outcome === 'reached_tp3'
  );
  
  console.log(`\n   🔥 Развернулись в TP после SL: ${wouldHitTP.length}/${slData.length} (${(wouldHitTP.length/slData.length*100).toFixed(1)}%)`);
  
  if (wouldHitTP.length > 0) {
    const avgPostSLMove = wouldHitTP
      .filter(d => d.post_sl_max_favorable_r && d.post_sl_max_favorable_r !== '')
      .reduce((sum, d) => sum + parseFloat(d.post_sl_max_favorable_r), 0) / wouldHitTP.length;
    
    console.log(`   📊 Среднее движение после SL: ${avgPostSLMove.toFixed(2)}R\n`);
  }
  
  // 4. Combined analysis - Fast stops that reversed
  console.log('\n4️⃣  БЫСТРЫЕ СТОПЫ КОТОРЫЕ РАЗВЕРНУЛИСЬ\n');
  
  const fastReversals = slData.filter(d => {
    const time = parseFloat(d.time_to_sl_min);
    const reversed = d.post_sl_outcome === 'would_hit_tp1' || 
                    d.post_sl_outcome === 'would_hit_tp2' ||
                    d.post_sl_outcome === 'would_hit_tp3' ||
                    d.post_sl_outcome === 'reached_tp1' ||
                    d.post_sl_outcome === 'reached_tp2' ||
                    d.post_sl_outcome === 'reached_tp3';
    return !isNaN(time) && time < 30 && reversed;
  });
  
  console.log(`   Быстрые (<30 мин) стопы с разворотом: ${fastReversals.length}`);
  console.log(`   💰 Потенциал: спасти ${fastReversals.length} × 3R = ${fastReversals.length * 3}R\n`);
  
  // 5. Show problematic examples
  console.log('\n5️⃣  ПРИМЕРЫ ПРОБЛЕМНЫХ СИГНАЛОВ (быстрый SL + разворот)\n');
  
  console.log('   ID  | Symbol         | MAE    | Time | После SL');
  console.log('   ----|----------------|--------|------|------------------');
  
  for (let i = 0; i < Math.min(15, fastReversals.length); i++) {
    const sig = fastReversals[i];
    const mae = parseFloat(sig.mae_r);
    const time = parseFloat(sig.time_to_sl_min);
    
    console.log(`   ${sig.id.padStart(3)} | ${sig.symbol.padEnd(14)} | ${mae.toFixed(2).padStart(6)}R | ${time.toFixed(0).padStart(4)}m | ${sig.post_sl_outcome}`);
  }
  
  // RECOMMENDATIONS
  console.log('\n\n💡 ============================================');
  console.log('   РЕКОМЕНДАЦИИ');
  console.log('   ============================================\n');
  
  const fastStopsPercent = (withTime.filter(d => parseFloat(d.time_to_sl_min) < 30).length / withTime.length * 100);
  const reversalPercent = (wouldHitTP.length / slData.length * 100);
  
  if (fastStopsPercent > 20) {
    console.log(`1️⃣  ПРОБЛЕМА: ${fastStopsPercent.toFixed(1)}% стопов выбивает за <30 минут`);
    console.log(`   Решение: TRAILING STOP-LOSS`);
    console.log(`   - После +0.5R → переместить SL в breakeven`);
    console.log(`   - Защитит от быстрых разворотов\n`);
  }
  
  if (reversalPercent > 20) {
    console.log(`2️⃣  ПРОБЛЕМА: ${reversalPercent.toFixed(1)}% стопов разворачиваются в TP`);
    console.log(`   Решение: WIDER STOP-LOSS или TRAILING STOP`);
    console.log(`   - Потенциал: +${wouldHitTP.length * 3}R (${wouldHitTP.length} сигналов × 3R)\n`);
  }
  
  if (avgMAE < -0.8) {
    console.log(`3️⃣  ПРОБЛЕМА: Средний MAE ${avgMAE.toFixed(2)}R (близко к -1R)`);
    console.log(`   Решение: Стоп слишком тугой, рассмотреть 1.2-1.3× ATR\n`);
  }
  
  console.log(`\n🎯 ИТОГО ПОТЕНЦИАЛ УЛУЧШЕНИЯ:`);
  console.log(`   Быстрые развороты: ${fastReversals.length} сигналов`);
  console.log(`   Все развороты: ${wouldHitTP.length} сигналов`);
  console.log(`   📈 Если спасти trailing stop: +${Math.floor(fastReversals.length * 2.5)}R минимум\n`);
}

// Main
const slFile = process.argv[2];

if (!slFile) {
  console.error('Usage: npx tsx properStopLossAnalysis.ts <sl_file.csv>');
  process.exit(1);
}

const slData = parseCSV(slFile);
properAnalysis(slData);

console.log('✅ Анализ завершен!\n');
