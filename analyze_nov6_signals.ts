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

console.log('📊 АНАЛИЗ СИГНАЛОВ ЗА 06.11.2025 (15M SCALPING)\n');
console.log('=' .repeat(80));

const stoplosses = parseCsv(stoplossesFile);
const takeprofits = parseCsv(takeprofitsFile);

const slNov6 = stoplosses.filter(row => row.signal_time && row.signal_time.startsWith('2025-11-06'));
const tpNov6 = takeprofits.filter(row => row.signal_time && row.signal_time.startsWith('2025-11-06'));

console.log(`\n📅 СИГНАЛЫ ЗА 06.11.2025:`);
console.log(`   ❌ Стоплоссы: ${slNov6.length}`);
console.log(`   ✅ Тейк-профиты: ${tpNov6.length}`);
console.log(`   📊 Win Rate: ${((tpNov6.length / (slNov6.length + tpNov6.length)) * 100).toFixed(1)}%`);

console.log(`\n\n${'='.repeat(80)}`);
console.log('❌ ПОЧЕМУ БЫЛИ СТОПЛОССЫ?');
console.log('='.repeat(80));

if (slNov6.length > 0) {
  // Группировка по post_sl_outcome
  const slByOutcome: Record<string, any[]> = {};
  slNov6.forEach(row => {
    const outcome = row.post_sl_outcome || 'unknown';
    if (!slByOutcome[outcome]) slByOutcome[outcome] = [];
    slByOutcome[outcome].push(row);
  });
  
  console.log(`\n🔍 ЧТО ПРОИЗОШЛО ПОСЛЕ СТОПЛОССА:`);
  console.log('-'.repeat(80));
  Object.keys(slByOutcome).forEach(outcome => {
    const count = slByOutcome[outcome].length;
    const percent = ((count / slNov6.length) * 100).toFixed(1);
    console.log(`   ${outcome}: ${count} (${percent}%)`);
  });
  
  // Анализ MFE
  const slLowMFE = slNov6.filter(row => parseFloat(row.mfe_r) < 0.5);
  const slGoodMFE = slNov6.filter(row => parseFloat(row.mfe_r) >= 1.0);
  
  console.log(`\n🔍 ДВИЖЕНИЕ К TP (MFE):`);
  console.log('-'.repeat(80));
  console.log(`   MFE < 0.5R ("застряли"): ${slLowMFE.length} (${(slLowMFE.length/slNov6.length*100).toFixed(1)}%)`);
  console.log(`   MFE >= 1.0R ("развернулись"): ${slGoodMFE.length} (${(slGoodMFE.length/slNov6.length*100).toFixed(1)}%)`);
  
  console.log(`\n\n${'='.repeat(80)}`);
  console.log('📋 ДЕТАЛЬНЫЙ АНАЛИЗ КАЖДОГО СТОПЛОССА');
  console.log('='.repeat(80));
  
  slNov6.forEach((row, idx) => {
    const mfe = parseFloat(row.mfe_r);
    const mae = parseFloat(row.mae_r);
    
    console.log(`\n${idx + 1}. ${row.symbol} ${row.direction} @ ${row.signal_time}`);
    console.log(`   ├─ Pattern: ${row.pattern_type} (score: ${row.pattern_score})`);
    console.log(`   ├─ Entry: $${row.entry_price}, SL: $${row.sl_price}`);
    console.log(`   ├─ Тренд до: ${row.context_trend_before}, Recent: ${row.context_recent_direction}`);
    console.log(`   ├─ Swings: ${row.context_swing_count_20}, Dist от EMA: ${row.context_distance_from_ema}%`);
    console.log(`   ├─ MFE: ${mfe.toFixed(2)}R, MAE: ${mae.toFixed(2)}R`);
    console.log(`   ├─ Время до SL: ${row.time_to_sl_min} минут`);
    console.log(`   └─ После SL: ${row.post_sl_outcome}`);
    
    // Диагноз
    let diagnosis = '';
    let reason = '';
    
    if (mfe < 0.5) {
      diagnosis = '💀 ЗАСТРЯЛ';
      reason = 'Цена почти не двигалась к TP - возможно вошли в боковик/консолидацию';
    } else if (mfe >= 1.0) {
      diagnosis = '🔄 РАЗВЕРНУЛСЯ';
      reason = 'Цена была в профите +1R, но развернулась обратно - trailing stop должен был защитить';
    } else {
      diagnosis = '⚠️ НЕДОШЕЛ';
      reason = 'Цена двигалась в нашу сторону, но не достигла 1.0R';
    }
    
    console.log(`   💡 ДИАГНОЗ: ${diagnosis}`);
    console.log(`      ПРИЧИНА: ${reason}`);
  });
}

console.log(`\n\n${'='.repeat(80)}`);
console.log('✅ УСПЕШНЫЕ ТЕЙК-ПРОФИТЫ (для сравнения)');
console.log('='.repeat(80));

if (tpNov6.length > 0) {
  console.log(`\nПримеры первых 5 успешных TP:\n`);
  
  tpNov6.slice(0, 5).forEach((row, idx) => {
    const mfe = parseFloat(row.mfe_r);
    const mae = parseFloat(row.mae_r);
    
    console.log(`${idx + 1}. ${row.symbol} ${row.direction} @ ${row.signal_time}`);
    console.log(`   ├─ Pattern: ${row.pattern_type} (score: ${row.pattern_score})`);
    console.log(`   ├─ Entry: $${row.entry_price}, TP2: $${row.tp2_price} (+${parseFloat(row.pnl_r).toFixed(1)}R)`);
    console.log(`   ├─ Тренд до: ${row.context_trend_before}, Recent: ${row.context_recent_direction}`);
    console.log(`   ├─ Swings: ${row.context_swing_count_20}`);
    console.log(`   └─ MFE: ${mfe.toFixed(2)}R, MAE: ${mae.toFixed(2)}R\n`);
  });
}

console.log(`\n${'='.repeat(80)}`);
console.log('💡 ВЫВОДЫ');
console.log('='.repeat(80));

const totalSignals = slNov6.length + tpNov6.length;
const winRate = (tpNov6.length / totalSignals) * 100;

const slLowMFE = slNov6.filter(row => parseFloat(row.mfe_r) < 0.5);
const slGoodMFE = slNov6.filter(row => parseFloat(row.mfe_r) >= 1.0);
const sidewaysAfter = slNov6.filter(row => row.post_sl_outcome === 'sideways');

console.log(`\n📊 Статистика за 06.11.2025:`);
console.log(`   Всего сигналов: ${totalSignals}`);
console.log(`   Win Rate: ${winRate.toFixed(1)}%`);

console.log(`\n🔴 Проблемы:`);
console.log(`   1. "Застрявшие" (MFE < 0.5R): ${slLowMFE.length}/${slNov6.length} (${(slLowMFE.length/slNov6.length*100).toFixed(1)}%)`);
console.log(`   2. "Развернувшиеся" (MFE >= 1.0R): ${slGoodMFE.length}/${slNov6.length} (${(slGoodMFE.length/slNov6.length*100).toFixed(1)}%)`);
console.log(`   3. После SL → sideways: ${sidewaysAfter.length}/${slNov6.length} (${(sidewaysAfter.length/slNov6.length*100).toFixed(1)}%)`);

console.log(`\n✅ Рекомендации:`);
if (slLowMFE.length / slNov6.length > 0.4) {
  console.log(`   • Time-Based Exit: Закрывать "застрявшие" сделки через 2 часа если MFE < 0.5R`);
}
if (slGoodMFE.length / slNov6.length > 0.3) {
  console.log(`   • Trailing Stop уже есть (1.0R → 0.5R), проверить работает ли он!`);
}

console.log(`\n${'='.repeat(80)}\n`);
