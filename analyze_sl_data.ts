import * as fs from 'fs';

/**
 * Анализ данных стоплоссов для ответов на вопросы:
 * 1. Куда цена шла ПОСЛЕ срабатывания SL?
 * 2. Если увеличим SL до 1.0 ATR - цена достигла бы новых TP?
 * 3. Сколько времени уходит от сигнала до отработки?
 */

interface SLRow {
  symbol: string;
  direction: string;
  post_sl_outcome: string;
  post_sl_max_favorable_r: string;
  post_sl_time_to_tp_min: string;
  mfe_r: string;
  mae_r: string;
  time_to_sl_min: string;
}

// Читаем CSV
const csvData = fs.readFileSync('attached_assets/stoplosses_export_1762447823236.csv', 'utf-8');
const lines = csvData.split('\n');
const headers = lines[0].split(',');

const slData: SLRow[] = [];
for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const values = lines[i].split(',');
  const row: any = {};
  headers.forEach((header, index) => {
    row[header] = values[index] || '';
  });
  slData.push(row as SLRow);
}

console.log('='.repeat(80));
console.log('📊 АНАЛИЗ СТОПЛОССОВ 15M СТРАТЕГИИ (04-06 НОЯБРЯ 2025)');
console.log('='.repeat(80));
console.log(`\nВсего стоплоссов: ${slData.length}\n`);

// ============================================================================
// ВОПРОС 1: Куда цена шла ПОСЛЕ срабатывания SL?
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('1️⃣  ПОВЕДЕНИЕ ЦЕНЫ ПОСЛЕ СРАБАТЫВАНИЯ SL');
console.log('='.repeat(80));

const postSlOutcomes: Record<string, number> = {};
const postSlFavorable: any[] = [];

for (const row of slData) {
  const outcome = row.post_sl_outcome;
  postSlOutcomes[outcome] = (postSlOutcomes[outcome] || 0) + 1;
  
  // Если после SL цена достигла TP
  if (outcome.includes('reached')) {
    const maxFav = parseFloat(row.post_sl_max_favorable_r) || 0;
    const timeToTp = parseInt(row.post_sl_time_to_tp_min) || 0;
    postSlFavorable.push({
      symbol: row.symbol,
      outcome: outcome,
      max_favorable_r: maxFav,
      time_to_tp_min: timeToTp,
      direction: row.direction,
    });
  }
}

console.log('\n📈 РАСПРЕДЕЛЕНИЕ ИСХОДОВ ПОСЛЕ SL:');
const sortedOutcomes = Object.entries(postSlOutcomes).sort((a, b) => b[1] - a[1]);
for (const [outcome, count] of sortedOutcomes) {
  const percent = (count / slData.length) * 100;
  console.log(`  • ${outcome.padEnd(25)}: ${String(count).padStart(3)} (${percent.toFixed(1)}%)`);
}

console.log(`\n🎯 ЦЕНА ДОСТИГЛА TP ПОСЛЕ SL: ${postSlFavorable.length} случаев`);
if (postSlFavorable.length > 0) {
  console.log('\nПримеры (цена пошла в нашу сторону ПОСЛЕ того, как выбила SL!):');
  for (let i = 0; i < Math.min(10, postSlFavorable.length); i++) {
    const c = postSlFavorable[i];
    console.log(`  ${String(i + 1).padStart(2)}. ${c.symbol.padEnd(15)} ${c.direction.padEnd(5)} → ${c.outcome.padEnd(15)} (+${c.max_favorable_r.toFixed(2)}R за ${c.time_to_tp_min} мин)`);
  }
}

// ============================================================================
// ВОПРОС 2: Если увеличим SL до 1.0 ATR - достигнет ли цена новых TP?
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('2️⃣  СИМУЛЯЦИЯ: SL 0.6 ATR → 1.0 ATR (УВЕЛИЧЕНИЕ НА 67%)');
console.log('='.repeat(80));

// Логика:
// - Текущий SL: 0.6 ATR
// - Новый SL: 1.0 ATR (на 67% дальше)
// - Новый TP: 2R от 1.0 ATR

let savedByWiderSl = 0;
let newTpReached = 0;

const slMultiplier = 1.0 / 0.6; // = 1.67
const savedTrades: any[] = [];

for (const row of slData) {
  const mfe = parseFloat(row.mfe_r) || 0;
  const mae = parseFloat(row.mae_r) || 0;
  
  // Если MAE < 1.67R, то новый SL НЕ выбило бы
  if (Math.abs(mae) < slMultiplier) {
    savedByWiderSl++;
    
    // Новый TP = 2R * 1.67 = 3.34R
    const newTpInOldR = 2.0 * slMultiplier;
    
    if (mfe >= newTpInOldR) {
      newTpReached++;
      savedTrades.push({
        symbol: row.symbol,
        direction: row.direction,
        mfe: mfe,
        mae: mae,
        new_tp_reached: 'YES',
      });
    } else {
      savedTrades.push({
        symbol: row.symbol,
        direction: row.direction,
        mfe: mfe,
        mae: mae,
        new_tp_reached: `NO (MFE ${mfe.toFixed(2)}R < ${newTpInOldR.toFixed(2)}R)`,
      });
    }
  }
}

console.log(`\n✅ СПАСЕНО ОТ SL (новый SL шире): ${savedByWiderSl} из ${slData.length} (${(savedByWiderSl / slData.length * 100).toFixed(1)}%)`);
console.log(`📊 Из них достигли БЫ нового TP: ${newTpReached} (${(newTpReached / savedByWiderSl * 100).toFixed(1)}% от спасенных)`);
console.log(`\n💡 ИТОГО РЕЗУЛЬТАТ:`);
console.log(`   Старые настройки (0.6 ATR): 0 TP / ${slData.length} SL`);
console.log(`   Новые настройки (1.0 ATR): ${newTpReached} TP / ${slData.length - savedByWiderSl} SL`);
console.log(`   Win Rate: ${(newTpReached / slData.length * 100).toFixed(1)}% (только из SL, без учета старых TP)`);

console.log('\n🔍 Примеры СПАСЕННЫХ сделок:');
for (let i = 0; i < Math.min(15, savedTrades.length); i++) {
  const t = savedTrades[i];
  console.log(`  ${String(i + 1).padStart(2)}. ${t.symbol.padEnd(15)} ${t.direction.padEnd(5)} | MFE: ${t.mfe.toFixed(2).padStart(6)}R, MAE: ${t.mae.toFixed(2).padStart(6)}R | Новый TP: ${t.new_tp_reached}`);
}

// ============================================================================
// ВОПРОС 3: Сколько времени от сигнала до отработки?
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('3️⃣  ВРЕМЯ ЖИЗНИ СДЕЛОК (ОТ СИГНАЛА ДО ОТРАБОТКИ)');
console.log('='.repeat(80));

const timeToSlList: number[] = [];
for (const row of slData) {
  const timeSl = parseInt(row.time_to_sl_min) || 0;
  if (timeSl > 0) {
    timeToSlList.push(timeSl);
  }
}

if (timeToSlList.length > 0) {
  const avgTimeOld = timeToSlList.reduce((a, b) => a + b, 0) / timeToSlList.length;
  const medianTimeOld = timeToSlList.sort((a, b) => a - b)[Math.floor(timeToSlList.length / 2)];
  
  console.log(`\n⏱️  ТЕКУЩИЕ НАСТРОЙКИ (SL 0.6 ATR):`);
  console.log(`   Среднее время до SL: ${avgTimeOld.toFixed(0)} минут (${(avgTimeOld / 60).toFixed(1)} часа)`);
  console.log(`   Медианное время до SL: ${medianTimeOld} минут (${(medianTimeOld / 60).toFixed(1)} часа)`);
  console.log(`   Минимум: ${Math.min(...timeToSlList)} мин`);
  console.log(`   Максимум: ${Math.max(...timeToSlList)} мин (${(Math.max(...timeToSlList) / 60).toFixed(1)} часов)`);

  const estimatedAvgTimeNew = avgTimeOld * slMultiplier;
  const estimatedMedianTimeNew = medianTimeOld * slMultiplier;

  console.log(`\n🔮 ПРОГНОЗ ДЛЯ НОВЫХ НАСТРОЕК (SL 1.0 ATR):`);
  console.log(`   Среднее время до отработки: ~${estimatedAvgTimeNew.toFixed(0)} минут (${(estimatedAvgTimeNew / 60).toFixed(1)} часа)`);
  console.log(`   Медианное время: ~${estimatedMedianTimeNew.toFixed(0)} минут (${(estimatedMedianTimeNew / 60).toFixed(1)} часа)`);
  console.log(`\n   📌 Увеличение времени жизни сделки: +${((slMultiplier - 1) * 100).toFixed(0)}%`);

  console.log('\n📊 РАСПРЕДЕЛЕНИЕ ВРЕМЕНИ ДО SL:');
  const timeRanges: Record<string, number> = {
    '0-30 мин': 0,
    '31-60 мин': 0,
    '61-120 мин (1-2ч)': 0,
    '121-240 мин (2-4ч)': 0,
    '> 240 мин (>4ч)': 0,
  };

  for (const t of timeToSlList) {
    if (t <= 30) timeRanges['0-30 мин']++;
    else if (t <= 60) timeRanges['31-60 мин']++;
    else if (t <= 120) timeRanges['61-120 мин (1-2ч)']++;
    else if (t <= 240) timeRanges['121-240 мин (2-4ч)']++;
    else timeRanges['> 240 мин (>4ч)']++;
  }

  for (const [rangeName, count] of Object.entries(timeRanges)) {
    const percent = (count / timeToSlList.length) * 100;
    console.log(`  • ${rangeName.padEnd(25)}: ${String(count).padStart(3)} (${percent.toFixed(1)}%)`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('✅ АНАЛИЗ ЗАВЕРШЕН');
console.log('='.repeat(80));
