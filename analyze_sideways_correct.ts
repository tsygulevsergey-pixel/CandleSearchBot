import * as fs from 'fs';

const stoplossesFile = 'attached_assets/stoplosses_export_1762511594643.csv';
const takeprofitsFile = 'attached_assets/takeprofits_export_1762447743545_1762511594644.csv';

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

console.log('📊 ПРАВИЛЬНЫЙ АНАЛИЗ БОКОВИКА\n');
console.log('=' .repeat(80));

// ========================================
// АНАЛИЗ СТОПЛОССОВ
// ========================================
const stoplosses = parseCsv(stoplossesFile);
console.log(`\n📉 СТОП-ЛОССЫ (всего ${stoplosses.length} записей)`);
console.log('-'.repeat(80));

// 1. Какой был тренд ДО входа в сделку?
const slSidewaysBefore = stoplosses.filter(row => row.context_trend_before === 'sideways');
const slUptrendBefore = stoplosses.filter(row => row.context_trend_before === 'uptrend');
const slDowntrendBefore = stoplosses.filter(row => row.context_trend_before === 'downtrend');

console.log(`\n🔍 ТРЕНД ДО ВХОДА (context_trend_before):`);
console.log(`   Sideways → SL: ${slSidewaysBefore.length} раз (${(slSidewaysBefore.length/stoplosses.length*100).toFixed(1)}%)`);
console.log(`   Uptrend → SL: ${slUptrendBefore.length} раз (${(slUptrendBefore.length/stoplosses.length*100).toFixed(1)}%)`);
console.log(`   Downtrend → SL: ${slDowntrendBefore.length} раз (${(slDowntrendBefore.length/stoplosses.length*100).toFixed(1)}%)`);

// 2. Что произошло ПОСЛЕ стоплосса?
const slSidewaysAfter = stoplosses.filter(row => row.post_sl_outcome === 'sideways');
const slReachedTp = stoplosses.filter(row => row.post_sl_outcome === 'reached_tp3');
const slWentFurtherAgainst = stoplosses.filter(row => row.post_sl_outcome === 'went_further_against');

console.log(`\n🔍 ЧТО СЛУЧИЛОСЬ ПОСЛЕ СТОПЛОССА (post_sl_outcome):`);
console.log(`   После SL → sideways: ${slSidewaysAfter.length} раз (${(slSidewaysAfter.length/stoplosses.length*100).toFixed(1)}%)`);
console.log(`   После SL → reached TP3: ${slReachedTp.length} раз (${(slReachedTp.length/stoplosses.length*100).toFixed(1)}%)`);
console.log(`   После SL → went further against: ${slWentFurtherAgainst.length} раз (${(slWentFurtherAgainst.length/stoplosses.length*100).toFixed(1)}%)`);

// 3. Анализ MFE (Maximum Favorable Excursion) - была ли цена хоть раз в профите?
const slLowMFE = stoplosses.filter(row => {
  const mfe = parseFloat(row.mfe_r);
  return !isNaN(mfe) && mfe < 0.5; // Цена почти не двигалась в нашу пользу
});

const slGoodMFE = stoplosses.filter(row => {
  const mfe = parseFloat(row.mfe_r);
  return !isNaN(mfe) && mfe >= 1.0; // Цена была в хорошем профите!
});

console.log(`\n🔍 АНАЛИЗ MFE (Maximum Favorable Excursion):`);
console.log(`   MFE < 0.5R (почти не двигалась): ${slLowMFE.length} раз (${(slLowMFE.length/stoplosses.length*100).toFixed(1)}%)`);
console.log(`   MFE >= 1.0R (была в хорошем профите): ${slGoodMFE.length} раз (${(slGoodMFE.length/stoplosses.length*100).toFixed(1)}%)`);

console.log(`\n💡 ВЫВОД о стоплоссах:`);
console.log(`   🔴 ${slLowMFE.length} сделок (${(slLowMFE.length/stoplosses.length*100).toFixed(1)}%) - цена НЕ ДВИГАЛАСЬ к TP (< 0.5R)`);
console.log(`   🟡 ${slGoodMFE.length} сделок (${(slGoodMFE.length/stoplosses.length*100).toFixed(1)}%) - цена БЫЛА в профите (>= 1.0R), но развернулась!`);

// ========================================
// АНАЛИЗ ТЕЙКПРОФИТОВ
// ========================================
const takeprofits = parseCsv(takeprofitsFile);
console.log(`\n\n📈 ТЕЙК-ПРОФИТЫ (всего ${takeprofits.length} записей)`);
console.log('-'.repeat(80));

const tpSidewaysBefore = takeprofits.filter(row => row.context_trend_before === 'sideways');
const tpUptrendBefore = takeprofits.filter(row => row.context_trend_before === 'uptrend');
const tpDowntrendBefore = takeprofits.filter(row => row.context_trend_before === 'downtrend');

console.log(`\n🔍 ТРЕНД ДО ВХОДА (context_trend_before):`);
console.log(`   Sideways → TP: ${tpSidewaysBefore.length} раз (${(tpSidewaysBefore.length/takeprofits.length*100).toFixed(1)}%)`);
console.log(`   Uptrend → TP: ${tpUptrendBefore.length} раз (${(tpUptrendBefore.length/takeprofits.length*100).toFixed(1)}%)`);
console.log(`   Downtrend → TP: ${tpDowntrendBefore.length} раз (${(tpDowntrendBefore.length/takeprofits.length*100).toFixed(1)}%)`);

// ========================================
// СРАВНЕНИЕ: БОКОВИК ДО ВХОДА
// ========================================
console.log(`\n\n${'='.repeat(80)}`);
console.log('📊 ГЛАВНЫЙ ВОПРОС: ВЛИЯЕТ ЛИ БОКОВИК ДО ВХОДА НА РЕЗУЛЬТАТ?');
console.log('='.repeat(80));

const totalSignalsFromSideways = slSidewaysBefore.length + tpSidewaysBefore.length;
const winRateFromSideways = totalSignalsFromSideways > 0 
  ? (tpSidewaysBefore.length / totalSignalsFromSideways * 100).toFixed(1)
  : '0.0';

const totalSignalsFromTrend = (slUptrendBefore.length + slDowntrendBefore.length) + (tpUptrendBefore.length + tpDowntrendBefore.length);
const winRateFromTrend = totalSignalsFromTrend > 0
  ? ((tpUptrendBefore.length + tpDowntrendBefore.length) / totalSignalsFromTrend * 100).toFixed(1)
  : '0.0';

console.log(`\n1️⃣  Сигналы из БОКОВИКА (context_trend_before = sideways):`);
console.log(`   Total: ${totalSignalsFromSideways} сигналов`);
console.log(`   ✅ TP: ${tpSidewaysBefore.length}`);
console.log(`   ❌ SL: ${slSidewaysBefore.length}`);
console.log(`   📊 Win Rate: ${winRateFromSideways}%`);

console.log(`\n2️⃣  Сигналы из ТРЕНДА (uptrend/downtrend):`);
console.log(`   Total: ${totalSignalsFromTrend} сигналов`);
console.log(`   ✅ TP: ${tpUptrendBefore.length + tpDowntrendBefore.length}`);
console.log(`   ❌ SL: ${slUptrendBefore.length + slDowntrendBefore.length}`);
console.log(`   📊 Win Rate: ${winRateFromTrend}%`);

// ========================================
// АНАЛИЗ "ЗАСТРЯВШИХ" СДЕЛОК
// ========================================
console.log(`\n\n${'='.repeat(80)}`);
console.log('🔍 АНАЛИЗ "ЗАСТРЯВШИХ" СДЕЛОК (MFE < 0.5R)');
console.log('='.repeat(80));

console.log(`\nВсего "застрявших" стоплоссов: ${slLowMFE.length} из ${stoplosses.length} (${(slLowMFE.length/stoplosses.length*100).toFixed(1)}%)`);

if (slLowMFE.length > 0) {
  console.log('\nПримеры первых 10:');
  slLowMFE.slice(0, 10).forEach((row, idx) => {
    console.log(`\n${idx + 1}. ${row.symbol} ${row.direction}:`);
    console.log(`   Entry: $${row.entry_price}`);
    console.log(`   Тренд до сигнала: ${row.context_trend_before}`);
    console.log(`   MFE: ${parseFloat(row.mfe_r).toFixed(2)}R (цена почти не двигалась к TP!)`);
    console.log(`   MAE: ${parseFloat(row.mae_r).toFixed(2)}R`);
    console.log(`   Время до SL: ${row.time_to_sl_min} мин`);
    console.log(`   После SL: ${row.post_sl_outcome}`);
  });
}

// ========================================
// АНАЛИЗ "РАЗВЕРНУВШИХСЯ" СДЕЛОК
// ========================================
console.log(`\n\n${'='.repeat(80)}`);
console.log('🔍 АНАЛИЗ "РАЗВЕРНУВШИХСЯ" СДЕЛОК (MFE >= 1.0R → SL)');
console.log('='.repeat(80));

console.log(`\nВсего "развернувшихся" стоплоссов: ${slGoodMFE.length} из ${stoplosses.length} (${(slGoodMFE.length/stoplosses.length*100).toFixed(1)}%)`);

if (slGoodMFE.length > 0) {
  console.log('\nПримеры первых 10:');
  slGoodMFE.slice(0, 10).forEach((row, idx) => {
    console.log(`\n${idx + 1}. ${row.symbol} ${row.direction}:`);
    console.log(`   Entry: $${row.entry_price}`);
    console.log(`   Тренд до сигнала: ${row.context_trend_before}`);
    console.log(`   MFE: ${parseFloat(row.mfe_r).toFixed(2)}R (цена БЫЛА в профите!)`);
    console.log(`   MAE: ${parseFloat(row.mae_r).toFixed(2)}R`);
    console.log(`   Время до SL: ${row.time_to_sl_min} мин`);
    console.log(`   После SL: ${row.post_sl_outcome}`);
  });
}

console.log(`\n\n${'='.repeat(80)}`);
console.log('📊 ИТОГОВЫЕ ВЫВОДЫ');
console.log('='.repeat(80));
console.log(`\n1. Win Rate из боковика: ${winRateFromSideways}%`);
console.log(`2. Win Rate из тренда: ${winRateFromTrend}%`);
console.log(`3. "Застрявшие" сделки (MFE < 0.5R): ${(slLowMFE.length/stoplosses.length*100).toFixed(1)}% всех SL`);
console.log(`4. "Развернувшиеся" сделки (MFE >= 1.0R): ${(slGoodMFE.length/stoplosses.length*100).toFixed(1)}% всех SL`);
console.log(`5. После SL цена ушла в sideways: ${(slSidewaysAfter.length/stoplosses.length*100).toFixed(1)}%`);
console.log(`6. После SL цена достигла бы TP3: ${(slReachedTp.length/stoplosses.length*100).toFixed(1)}%`);
