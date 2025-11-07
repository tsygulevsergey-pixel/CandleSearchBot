import * as fs from 'fs';

const stoplossesFile = 'attached_assets/stoplosses_export_1762511594643_1762529786699.csv';
const takeprofitsFile = 'attached_assets/takeprofits_export_1762447743545_1762511594644_1762529786700.csv';

function parseCsv(filePath: string): any[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const headers = lines[0].split(',');
  
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = lines[i].split(',');
    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index];
    });
    data.push(row);
  }
  
  return data;
}

console.log('📊 АНАЛИЗ СИГНАЛОВ ЗА 07.11.2025 (15M SCALPING)\n');
console.log('=' .repeat(80));

// ========================================
// ФИЛЬТРАЦИЯ ПО ДАТЕ 07.11.2025
// ========================================

const stoplosses = parseCsv(stoplossesFile);
const takeprofits = parseCsv(takeprofitsFile);

// Фильтруем только сигналы за 07.11.2025
const slNov7 = stoplosses.filter(row => {
  const signalTime = row.signal_time;
  return signalTime && signalTime.startsWith('2025-11-07');
});

const tpNov7 = takeprofits.filter(row => {
  const signalTime = row.signal_time;
  return signalTime && signalTime.startsWith('2025-11-07');
});

console.log(`\n📅 СИГНАЛЫ ЗА 07.11.2025:`);
console.log(`   ❌ Стоплоссы: ${slNov7.length}`);
console.log(`   ✅ Тейк-профиты: ${tpNov7.length}`);
console.log(`   📊 Win Rate: ${((tpNov7.length / (slNov7.length + tpNov7.length)) * 100).toFixed(1)}%`);

// ========================================
// АНАЛИЗ СТОПЛОССОВ
// ========================================

console.log(`\n\n${'='.repeat(80)}`);
console.log('❌ ДЕТАЛЬНЫЙ АНАЛИЗ СТОПЛОССОВ (07.11.2025)');
console.log('='.repeat(80));

console.log(`\nВсего стоплоссов: ${slNov7.length}\n`);

if (slNov7.length > 0) {
  // Группировка по причинам
  
  // 1. По тренду до сигнала
  const slByTrend: Record<string, any[]> = {};
  slNov7.forEach(row => {
    const trend = row.context_trend_before || 'unknown';
    if (!slByTrend[trend]) slByTrend[trend] = [];
    slByTrend[trend].push(row);
  });
  
  console.log('🔍 АНАЛИЗ 1: ТРЕНД ДО СИГНАЛА');
  console.log('-'.repeat(80));
  Object.keys(slByTrend).forEach(trend => {
    console.log(`   ${trend}: ${slByTrend[trend].length} стоплоссов`);
  });
  
  // 2. По направлению сигнала
  const slByDirection: Record<string, any[]> = {};
  slNov7.forEach(row => {
    const dir = row.direction || 'unknown';
    if (!slByDirection[dir]) slByDirection[dir] = [];
    slByDirection[dir].push(row);
  });
  
  console.log(`\n🔍 АНАЛИЗ 2: НАПРАВЛЕНИЕ СИГНАЛА`);
  console.log('-'.repeat(80));
  Object.keys(slByDirection).forEach(dir => {
    console.log(`   ${dir}: ${slByDirection[dir].length} стоплоссов`);
  });
  
  // 3. По что произошло ПОСЛЕ стоплосса
  const slByOutcome: Record<string, any[]> = {};
  slNov7.forEach(row => {
    const outcome = row.post_sl_outcome || 'unknown';
    if (!slByOutcome[outcome]) slByOutcome[outcome] = [];
    slByOutcome[outcome].push(row);
  });
  
  console.log(`\n🔍 АНАЛИЗ 3: ЧТО ПРОИЗОШЛО ПОСЛЕ СТОПЛОССА`);
  console.log('-'.repeat(80));
  Object.keys(slByOutcome).forEach(outcome => {
    const count = slByOutcome[outcome].length;
    const percent = ((count / slNov7.length) * 100).toFixed(1);
    console.log(`   ${outcome}: ${count} (${percent}%)`);
  });
  
  // 4. Анализ MFE (было ли движение к TP?)
  const slLowMFE = slNov7.filter(row => {
    const mfe = parseFloat(row.mfe_r);
    return !isNaN(mfe) && mfe < 0.5;
  });
  
  const slGoodMFE = slNov7.filter(row => {
    const mfe = parseFloat(row.mfe_r);
    return !isNaN(mfe) && mfe >= 1.0;
  });
  
  console.log(`\n🔍 АНАЛИЗ 4: ДВИЖЕНИЕ К TP (MFE)`);
  console.log('-'.repeat(80));
  console.log(`   MFE < 0.5R (почти не двигалась): ${slLowMFE.length} (${(slLowMFE.length/slNov7.length*100).toFixed(1)}%)`);
  console.log(`   MFE >= 1.0R (была в профите): ${slGoodMFE.length} (${(slGoodMFE.length/slNov7.length*100).toFixed(1)}%)`);
  
  // 5. Время до стоплосса
  const avgTimeToSL = slNov7.reduce((sum, row) => {
    const time = parseFloat(row.time_to_sl_min);
    return sum + (isNaN(time) ? 0 : time);
  }, 0) / slNov7.length;
  
  console.log(`\n🔍 АНАЛИЗ 5: ВРЕМЯ ДО СТОПЛОССА`);
  console.log('-'.repeat(80));
  console.log(`   Среднее время до SL: ${avgTimeToSL.toFixed(0)} минут (${(avgTimeToSL/60).toFixed(1)} часов)`);
  
  // ========================================
  // ДЕТАЛЬНЫЕ ПРИМЕРЫ СТОПЛОССОВ
  // ========================================
  
  console.log(`\n\n${'='.repeat(80)}`);
  console.log('📋 ДЕТАЛЬНЫЕ ПРИМЕРЫ СТОПЛОССОВ (первые 10)');
  console.log('='.repeat(80));
  
  slNov7.slice(0, 10).forEach((row, idx) => {
    const mfe = parseFloat(row.mfe_r);
    const mae = parseFloat(row.mae_r);
    
    console.log(`\n${idx + 1}. ${row.symbol} ${row.direction} @ ${row.signal_time}`);
    console.log(`   Pattern: ${row.pattern_type} (score: ${row.pattern_score})`);
    console.log(`   Entry: $${row.entry_price}`);
    console.log(`   SL: $${row.sl_price} (через ${row.time_to_sl_min} мин)`);
    console.log(`   Тренд до: ${row.context_trend_before}, ${row.context_recent_direction}`);
    console.log(`   Swing count: ${row.context_swing_count_20}`);
    console.log(`   MFE: ${mfe.toFixed(2)}R, MAE: ${mae.toFixed(2)}R`);
    console.log(`   После SL: ${row.post_sl_outcome}`);
    
    // Диагноз
    let diagnosis = '';
    if (mfe < 0.5) {
      diagnosis = '💀 ЗАСТРЯЛ - цена почти не двигалась к TP';
    } else if (mfe >= 1.0) {
      diagnosis = '🔄 РАЗВЕРНУЛСЯ - цена была в профите, но вернулась';
    } else {
      diagnosis = '⚠️ НЕДОШЕЛ - цена двигалась, но не достигла 1.0R';
    }
    console.log(`   ДИАГНОЗ: ${diagnosis}`);
  });
}

// ========================================
// АНАЛИЗ ТЕЙКПРОФИТОВ (для сравнения)
// ========================================

console.log(`\n\n${'='.repeat(80)}`);
console.log('✅ АНАЛИЗ ТЕЙК-ПРОФИТОВ (07.11.2025)');
console.log('='.repeat(80));

console.log(`\nВсего тейк-профитов: ${tpNov7.length}\n`);

if (tpNov7.length > 0) {
  // По тренду
  const tpByTrend: Record<string, any[]> = {};
  tpNov7.forEach(row => {
    const trend = row.context_trend_before || 'unknown';
    if (!tpByTrend[trend]) tpByTrend[trend] = [];
    tpByTrend[trend].push(row);
  });
  
  console.log('🔍 ТРЕНД ДО СИГНАЛА (TP):');
  console.log('-'.repeat(80));
  Object.keys(tpByTrend).forEach(trend => {
    console.log(`   ${trend}: ${tpByTrend[trend].length} тейк-профитов`);
  });
  
  // По направлению
  const tpByDirection: Record<string, any[]> = {};
  tpNov7.forEach(row => {
    const dir = row.direction || 'unknown';
    if (!tpByDirection[dir]) tpByDirection[dir] = [];
    tpByDirection[dir].push(row);
  });
  
  console.log(`\n🔍 НАПРАВЛЕНИЕ СИГНАЛА (TP):`);
  console.log('-'.repeat(80));
  Object.keys(tpByDirection).forEach(dir => {
    console.log(`   ${dir}: ${tpByDirection[dir].length} тейк-профитов`);
  });
  
  console.log(`\n\n📋 ПРИМЕРЫ УСПЕШНЫХ TP (первые 5):`);
  tpNov7.slice(0, 5).forEach((row, idx) => {
    const mfe = parseFloat(row.mfe_r);
    const mae = parseFloat(row.mae_r);
    
    console.log(`\n${idx + 1}. ${row.symbol} ${row.direction} @ ${row.signal_time}`);
    console.log(`   Pattern: ${row.pattern_type} (score: ${row.pattern_score})`);
    console.log(`   Entry: $${row.entry_price}`);
    console.log(`   TP2: $${row.tp2_price} (+${parseFloat(row.pnl_r).toFixed(1)}R)`);
    console.log(`   Тренд до: ${row.context_trend_before}, ${row.context_recent_direction}`);
    console.log(`   Swing count: ${row.context_swing_count_20}`);
    console.log(`   MFE: ${mfe.toFixed(2)}R, MAE: ${mae.toFixed(2)}R`);
  });
}

// ========================================
// ВЫВОДЫ И РЕКОМЕНДАЦИИ
// ========================================

console.log(`\n\n${'='.repeat(80)}`);
console.log('💡 ВЫВОДЫ И РЕКОМЕНДАЦИИ');
console.log('='.repeat(80));

const totalSignals = slNov7.length + tpNov7.length;
const winRate = (tpNov7.length / totalSignals) * 100;

console.log(`\n📊 СТАТИСТИКА ЗА 07.11.2025:`);
console.log(`   Всего сигналов: ${totalSignals}`);
console.log(`   ✅ TP: ${tpNov7.length}`);
console.log(`   ❌ SL: ${slNov7.length}`);
console.log(`   📊 Win Rate: ${winRate.toFixed(1)}%`);

if (slNov7.length > 0) {
  // Основные проблемы
  const sidewaysAfterSL = slByOutcome['sideways'] || [];
  const lowMFEpercent = (slLowMFE.length / slNov7.length) * 100;
  const goodMFEpercent = (slGoodMFE.length / slNov7.length) * 100;
  
  console.log(`\n🔴 ОСНОВНЫЕ ПРОБЛЕМЫ:`);
  console.log(`   1. "Застрявшие" сделки (MFE < 0.5R): ${lowMFEpercent.toFixed(1)}%`);
  console.log(`   2. "Развернувшиеся" сделки (MFE >= 1.0R): ${goodMFEpercent.toFixed(1)}%`);
  console.log(`   3. После SL → sideways: ${((sidewaysAfterSL.length / slNov7.length) * 100).toFixed(1)}%`);
  
  console.log(`\n💡 ЧТО МОЖНО УЛУЧШИТЬ:`);
  
  if (lowMFEpercent > 40) {
    console.log(`   ⏰ Time-Based Exit: Закрывать "застрявшие" сделки через 2 часа`);
    console.log(`      → Решит ${lowMFEpercent.toFixed(0)}% стоплоссов`);
  }
  
  if (goodMFEpercent > 30) {
    console.log(`   📈 Trailing Stop: У вас уже есть trailing 1.0R → 0.5R`);
    console.log(`      → Должен защищать ${goodMFEpercent.toFixed(0)}% сделок`);
    console.log(`      → Проверьте: активируется ли он правильно?`);
  }
  
  // Анализ по направлению
  const longSL = slByDirection['LONG'] || [];
  const shortSL = slByDirection['SHORT'] || [];
  const longTP = tpByDirection['LONG'] || [];
  const shortTP = tpByDirection['SHORT'] || [];
  
  const longWR = longTP.length / (longSL.length + longTP.length) * 100;
  const shortWR = shortTP.length / (shortSL.length + shortTP.length) * 100;
  
  console.log(`\n📊 Win Rate по направлению:`);
  console.log(`   LONG: ${longWR.toFixed(1)}% (${longTP.length}/${longSL.length + longTP.length})`);
  console.log(`   SHORT: ${shortWR.toFixed(1)}% (${shortTP.length}/${shortSL.length + shortTP.length})`);
  
  if (Math.abs(longWR - shortWR) > 15) {
    if (longWR < shortWR) {
      console.log(`   ⚠️ LONG сигналы работают хуже на ${(shortWR - longWR).toFixed(1)}%`);
    } else {
      console.log(`   ⚠️ SHORT сигналы работают хуже на ${(longWR - shortWR).toFixed(1)}%`);
    }
  }
}

console.log(`\n${'='.repeat(80)}\n`);
