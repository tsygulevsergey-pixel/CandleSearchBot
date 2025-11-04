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

function showTP2Reversals(slData: SignalData[]) {
  console.log('\n🔍 ============================================');
  console.log('   СИГНАЛЫ ДОШЕДШИЕ ДО 2R НО ЗАКРЫТЫЕ ПО SL');
  console.log('   ============================================\n');
  
  // Filter signals that reached 2R (TP2)
  const tp2Reversals = slData.filter(d => {
    const mfe = parseFloat(d.mfe_r);
    return !isNaN(mfe) && mfe >= 2.0;
  }).sort((a, b) => parseFloat(b.mfe_r) - parseFloat(a.mfe_r)); // Sort by MFE descending
  
  console.log(`Всего найдено: ${tp2Reversals.length} сигналов\n`);
  console.log(`Показываем первые 20 примеров:\n`);
  console.log('='.repeat(100));
  
  for (let i = 0; i < Math.min(20, tp2Reversals.length); i++) {
    const sig = tp2Reversals[i];
    const mfe = parseFloat(sig.mfe_r);
    const mae = parseFloat(sig.mae_r);
    const timeToSL = parseFloat(sig.time_to_sl_min);
    const entry = parseFloat(sig.entry_price);
    const sl = parseFloat(sig.sl_price);
    const tp1 = parseFloat(sig.tp1_price);
    
    console.log(`\n${i + 1}. ID: ${sig.id} | ${sig.symbol} ${sig.direction} ${sig.pattern_type}`);
    console.log(`   📅 Время сигнала: ${sig.signal_time}`);
    console.log(`   💰 Entry: ${entry.toFixed(8)} | SL: ${sl.toFixed(8)} | TP2: ${tp1.toFixed(8)}`);
    console.log(`   📊 MFE: ${mfe.toFixed(2)}R (дошёл до ${mfe >= 2 ? 'TP2!' : mfe.toFixed(2) + 'R'}) | MAE: ${mae.toFixed(2)}R`);
    console.log(`   ⏱️  Время до SL: ${!isNaN(timeToSL) ? timeToSL.toFixed(0) + ' минут' : 'нет данных'}`);
    
    if (sig.post_sl_outcome) {
      console.log(`   🔄 После SL: ${sig.post_sl_outcome}`);
      if (sig.post_sl_max_favorable_r) {
        console.log(`      Макс. движение после SL: ${sig.post_sl_max_favorable_r}R`);
      }
    }
    
    // Calculate how close to TP2
    const R = Math.abs(entry - sl);
    const tp2Price = sig.direction === 'LONG' ? entry + (2 * R) : entry - (2 * R);
    const maxPrice = sig.direction === 'LONG' ? entry + (mfe * R) : entry - (mfe * R);
    const distanceFromTP2 = Math.abs(maxPrice - tp2Price);
    const distanceFromTP2Percent = (distanceFromTP2 / tp2Price * 100);
    
    console.log(`   🎯 Макс. цена: ${maxPrice.toFixed(8)} (TP2: ${tp2Price.toFixed(8)})`);
    console.log(`   📏 Расстояние от TP2: ${distanceFromTP2.toFixed(8)} (${distanceFromTP2Percent.toFixed(3)}%)`);
  }
  
  console.log('\n' + '='.repeat(100));
  console.log('\n📊 СТАТИСТИКА ПО ВСЕМ 51 СИГНАЛУ:\n');
  
  // Stats
  const avgMFE = tp2Reversals.reduce((sum, d) => sum + parseFloat(d.mfe_r), 0) / tp2Reversals.length;
  const maxMFE = Math.max(...tp2Reversals.map(d => parseFloat(d.mfe_r)));
  const minMFE = Math.min(...tp2Reversals.map(d => parseFloat(d.mfe_r)));
  
  console.log(`   Средний MFE: ${avgMFE.toFixed(2)}R`);
  console.log(`   Макс MFE:    ${maxMFE.toFixed(2)}R`);
  console.log(`   Мин MFE:     ${minMFE.toFixed(2)}R`);
  
  // Time to SL stats
  const withTime = tp2Reversals.filter(d => !isNaN(parseFloat(d.time_to_sl_min)));
  if (withTime.length > 0) {
    const avgTime = withTime.reduce((sum, d) => sum + parseFloat(d.time_to_sl_min), 0) / withTime.length;
    const maxTime = Math.max(...withTime.map(d => parseFloat(d.time_to_sl_min)));
    const minTime = Math.min(...withTime.map(d => parseFloat(d.time_to_sl_min)));
    
    console.log(`\n   Среднее время до SL: ${avgTime.toFixed(0)} минут`);
    console.log(`   Макс время до SL:    ${maxTime.toFixed(0)} минут`);
    console.log(`   Мин время до SL:     ${minTime.toFixed(0)} минут`);
  }
  
  // Distribution by MFE range
  console.log(`\n   Распределение по MFE:`);
  const ranges = [
    { label: '2.0-2.5R', min: 2.0, max: 2.5 },
    { label: '2.5-3.0R', min: 2.5, max: 3.0 },
    { label: '3.0-4.0R', min: 3.0, max: 4.0 },
    { label: '4.0-5.0R', min: 4.0, max: 5.0 },
    { label: '>5.0R', min: 5.0, max: 999 },
  ];
  
  for (const range of ranges) {
    const count = tp2Reversals.filter(d => {
      const mfe = parseFloat(d.mfe_r);
      return mfe >= range.min && mfe < range.max;
    }).length;
    
    if (count > 0) {
      console.log(`     ${range.label}: ${count} (${(count/tp2Reversals.length*100).toFixed(1)}%)`);
    }
  }
  
  console.log('\n');
}

// Main
const slFile = process.argv[2];

if (!slFile) {
  console.error('Usage: npx tsx showTP2Reversals.ts <sl_file.csv>');
  process.exit(1);
}

const slData = parseCSV(slFile);
showTP2Reversals(slData);

console.log('✅ Готово!\n');
