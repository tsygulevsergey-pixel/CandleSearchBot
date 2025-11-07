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

console.log('📊 АНАЛИЗ БОКОВИКА В ДАННЫХ\n');
console.log('=' .repeat(80));

// Анализ Stoplosses
const stoplosses = parseCsv(stoplossesFile);
console.log(`\n📉 СТОП-ЛОССЫ (всего ${stoplosses.length} записей)`);
console.log('-'.repeat(80));

const slSideways = stoplosses.filter(row => row.post_sl_outcome === 'sideways');
const slReachedTp = stoplosses.filter(row => row.post_sl_outcome === 'reached_tp3');
const slWentFurtherAgainst = stoplosses.filter(row => row.post_sl_outcome === 'went_further_against');
const slEmpty = stoplosses.filter(row => !row.post_sl_outcome || row.post_sl_outcome.trim() === '');

console.log(`\n1️⃣  Цена ушла в боковик → потом SL: ${slSideways.length} раз (${(slSideways.length/stoplosses.length*100).toFixed(1)}%)`);
console.log(`2️⃣  Цена достигла бы TP3 (но был SL): ${slReachedTp.length} раз (${(slReachedTp.length/stoplosses.length*100).toFixed(1)}%)`);
console.log(`3️⃣  Цена ушла дальше против: ${slWentFurtherAgainst.length} раз (${(slWentFurtherAgainst.length/stoplosses.length*100).toFixed(1)}%)`);
console.log(`4️⃣  Пустое поле (сразу в SL): ${slEmpty.length} раз (${(slEmpty.length/stoplosses.length*100).toFixed(1)}%)`);

// Анализ Takeprofits
const takeprofits = parseCsv(takeprofitsFile);
console.log(`\n\n📈 ТЕЙК-ПРОФИТЫ (всего ${takeprofits.length} записей)`);
console.log('-'.repeat(80));

const tpSideways = takeprofits.filter(row => row.context_trend_before === 'sideways');
const tpUptrend = takeprofits.filter(row => row.context_trend_before === 'uptrend');
const tpDowntrend = takeprofits.filter(row => row.context_trend_before === 'downtrend');

console.log(`\n1️⃣  Сигнал был в БОКОВИКЕ → потом TP: ${tpSideways.length} раз (${(tpSideways.length/takeprofits.length*100).toFixed(1)}%)`);
console.log(`2️⃣  Сигнал был в UPTREND → потом TP: ${tpUptrend.length} раз (${(tpUptrend.length/takeprofits.length*100).toFixed(1)}%)`);
console.log(`3️⃣  Сигнал был в DOWNTREND → потом TP: ${tpDowntrend.length} раз (${(tpDowntrend.length/takeprofits.length*100).toFixed(1)}%)`);

// Детальный анализ боковика
console.log('\n\n' + '='.repeat(80));
console.log('🔍 ДЕТАЛЬНЫЙ АНАЛИЗ: БОКОВИК → СТОПЛОСС');
console.log('='.repeat(80));

console.log(`\nВсего случаев "боковик → SL": ${slSideways.length}`);

if (slSideways.length > 0) {
  console.log('\nПримеры (первые 10):');
  slSideways.slice(0, 10).forEach((row, idx) => {
    console.log(`\n${idx + 1}. ${row.symbol} ${row.direction}:`);
    console.log(`   Entry: $${row.entry_price}`);
    console.log(`   SL: $${row.sl_price} (время до SL: ${row.time_to_sl_min} мин)`);
    console.log(`   Тренд до сигнала: ${row.context_trend_before}`);
    console.log(`   MFE: ${parseFloat(row.mfe_r).toFixed(2)}R, MAE: ${parseFloat(row.mae_r).toFixed(2)}R`);
  });
}

console.log('\n\n' + '='.repeat(80));
console.log('🔍 ДЕТАЛЬНЫЙ АНАЛИЗ: БОКОВИК → ТЕЙК-ПРОФИТ');
console.log('='.repeat(80));

console.log(`\nВсего случаев "сигнал в боковике → TP": ${tpSideways.length}`);

if (tpSideways.length > 0) {
  console.log('\nПримеры (первые 10):');
  tpSideways.slice(0, 10).forEach((row, idx) => {
    console.log(`\n${idx + 1}. ${row.symbol} ${row.direction}:`);
    console.log(`   Entry: $${row.entry_price}`);
    console.log(`   TP: $${row.tp2_price} (+${parseFloat(row.pnl_r).toFixed(1)}R)`);
    console.log(`   Тренд до сигнала: ${row.context_trend_before}`);
    console.log(`   MFE: ${parseFloat(row.mfe_r).toFixed(2)}R, MAE: ${parseFloat(row.mae_r).toFixed(2)}R`);
  });
}

// Сводка
console.log('\n\n' + '='.repeat(80));
console.log('📊 ИТОГОВАЯ СВОДКА');
console.log('='.repeat(80));
console.log(`\n1. Боковик → Стоплосс: ${slSideways.length} раз из ${stoplosses.length} SL (${(slSideways.length/stoplosses.length*100).toFixed(1)}%)`);
console.log(`2. Сигнал в боковике → Тейк-профит: ${tpSideways.length} раз из ${takeprofits.length} TP (${(tpSideways.length/takeprofits.length*100).toFixed(1)}%)`);
console.log(`\n💡 Вывод: После боковика чаще случается ${slSideways.length > tpSideways.length ? 'СТОПЛОСС' : 'ТЕЙК-ПРОФИТ'}`);
console.log(`   Соотношение SL/TP в боковике: ${slSideways.length}/${tpSideways.length} = ${(slSideways.length/(tpSideways.length||1)).toFixed(2)}`);
