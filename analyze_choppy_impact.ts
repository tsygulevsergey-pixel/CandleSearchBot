import * as fs from 'fs';

/**
 * Анализ влияния choppy фильтра на TP и SL
 */

interface TradeRow {
  symbol: string;
  direction: string;
  context_recent_direction: string;
  exit_type: string;
  pnl_r: string;
}

// Читаем SL данные
const slCsv = fs.readFileSync('attached_assets/stoplosses_export_1762447823236.csv', 'utf-8');
const slLines = slCsv.split('\n');
const slHeaders = slLines[0].split(',');

const slData: TradeRow[] = [];
for (let i = 1; i < slLines.length; i++) {
  if (!slLines[i].trim()) continue;
  const values = slLines[i].split(',');
  const row: any = {};
  slHeaders.forEach((header, index) => {
    row[header] = values[index] || '';
  });
  slData.push(row as TradeRow);
}

// Читаем TP данные
const tpCsv = fs.readFileSync('attached_assets/takeprofits_export_1762447743545_1762447823237.csv', 'utf-8');
const tpLines = tpCsv.split('\n');
const tpHeaders = tpLines[0].split(',');

const tpData: TradeRow[] = [];
for (let i = 1; i < tpLines.length; i++) {
  if (!tpLines[i].trim()) continue;
  const values = tpLines[i].split(',');
  const row: any = {};
  tpHeaders.forEach((header, index) => {
    row[header] = values[index] || '';
  });
  tpData.push(row as TradeRow);
}

console.log('='.repeat(80));
console.log('📊 АНАЛИЗ ВЛИЯНИЯ CHOPPY ФИЛЬТРА НА TP И SL');
console.log('='.repeat(80));

// Подсчет SL
const slTotal = slData.length;
const slChoppy = slData.filter(r => r.context_recent_direction === 'choppy').length;
const slBullish = slData.filter(r => r.context_recent_direction === 'bullish').length;
const slBearish = slData.filter(r => r.context_recent_direction === 'bearish').length;

// Подсчет TP
const tpTotal = tpData.length;
const tpChoppy = tpData.filter(r => r.context_recent_direction === 'choppy').length;
const tpBullish = tpData.filter(r => r.context_recent_direction === 'bullish').length;
const tpBearish = tpData.filter(r => r.context_recent_direction === 'bearish').length;

console.log('\n📉 СТОПЛОССЫ (SL):');
console.log(`  Всего SL: ${slTotal}`);
console.log(`  • choppy:  ${slChoppy} (${(slChoppy / slTotal * 100).toFixed(1)}%)`);
console.log(`  • bullish: ${slBullish} (${(slBullish / slTotal * 100).toFixed(1)}%)`);
console.log(`  • bearish: ${slBearish} (${(slBearish / slTotal * 100).toFixed(1)}%)`);

console.log('\n📈 ТЕЙК-ПРОФИТЫ (TP):');
console.log(`  Всего TP: ${tpTotal}`);
console.log(`  • choppy:  ${tpChoppy} (${(tpChoppy / tpTotal * 100).toFixed(1)}%)`);
console.log(`  • bullish: ${tpBullish} (${(tpBullish / tpTotal * 100).toFixed(1)}%)`);
console.log(`  • bearish: ${tpBearish} (${(tpBearish / tpTotal * 100).toFixed(1)}%)`);

console.log('\n' + '='.repeat(80));
console.log('🎯 СРАВНЕНИЕ: CHOPPY vs НЕ-CHOPPY');
console.log('='.repeat(80));

const totalTrades = tpTotal + slTotal;
const choppyTrades = tpChoppy + slChoppy;
const nonChoppyTrades = totalTrades - choppyTrades;

console.log('\n📊 ТЕКУЩАЯ СТАТИСТИКА (БЕЗ ФИЛЬТРА):');
console.log(`  Всего сделок: ${totalTrades} (TP: ${tpTotal}, SL: ${slTotal})`);
console.log(`  Win Rate: ${(tpTotal / totalTrades * 100).toFixed(1)}%`);

console.log('\n🔴 CHOPPY СДЕЛКИ:');
console.log(`  Всего choppy: ${choppyTrades} (${(choppyTrades / totalTrades * 100).toFixed(1)}%)`);
console.log(`  • TP: ${tpChoppy} (${(tpChoppy / choppyTrades * 100).toFixed(1)}%)`);
console.log(`  • SL: ${slChoppy} (${(slChoppy / choppyTrades * 100).toFixed(1)}%)`);
console.log(`  Win Rate в choppy: ${(tpChoppy / choppyTrades * 100).toFixed(1)}%`);

console.log('\n🟢 НЕ-CHOPPY СДЕЛКИ (bullish + bearish):');
console.log(`  Всего не-choppy: ${nonChoppyTrades} (${(nonChoppyTrades / totalTrades * 100).toFixed(1)}%)`);
console.log(`  • TP: ${tpTotal - tpChoppy} (${((tpTotal - tpChoppy) / nonChoppyTrades * 100).toFixed(1)}%)`);
console.log(`  • SL: ${slTotal - slChoppy} (${((slTotal - slChoppy) / nonChoppyTrades * 100).toFixed(1)}%)`);
console.log(`  Win Rate в не-choppy: ${((tpTotal - tpChoppy) / nonChoppyTrades * 100).toFixed(1)}%`);

console.log('\n' + '='.repeat(80));
console.log('💡 ПРОГНОЗ ПОСЛЕ CHOPPY ФИЛЬТРА:');
console.log('='.repeat(80));

const newTpTotal = tpTotal - tpChoppy;
const newSlTotal = slTotal - slChoppy;
const newTotal = newTpTotal + newSlTotal;
const newWinRate = (newTpTotal / newTotal) * 100;

console.log(`\n📊 Будет торговаться:`);
console.log(`  Всего сделок: ${newTotal} (было ${totalTrades}, убрано ${choppyTrades})`);
console.log(`  • TP: ${newTpTotal} (было ${tpTotal}, потеряно ${tpChoppy})`);
console.log(`  • SL: ${newSlTotal} (было ${slTotal}, убрано ${slChoppy})`);
console.log(`  Win Rate: ${newWinRate.toFixed(1)}% (было ${(tpTotal / totalTrades * 100).toFixed(1)}%)`);

console.log('\n🎯 ИЗМЕНЕНИЯ:');
const winRateDiff = newWinRate - (tpTotal / totalTrades * 100);
console.log(`  • Win Rate: ${winRateDiff > 0 ? '+' : ''}${winRateDiff.toFixed(1)}% пунктов`);
console.log(`  • Потеряли хороших TP: ${tpChoppy} из ${tpTotal} (${(tpChoppy / tpTotal * 100).toFixed(1)}%)`);
console.log(`  • Убрали плохих SL: ${slChoppy} из ${slTotal} (${(slChoppy / slTotal * 100).toFixed(1)}%)`);

console.log('\n🔍 ВЫВОД:');
if (slChoppy > tpChoppy) {
  console.log(`  ✅ ФИЛЬТР ПОЛЕЗЕН: Убирает больше SL (${slChoppy}) чем TP (${tpChoppy})`);
  console.log(`  ✅ Соотношение: убрано ${slChoppy} SL vs потеряно ${tpChoppy} TP (${(slChoppy / tpChoppy).toFixed(1)}:1)`);
} else {
  console.log(`  ⚠️ ФИЛЬТР СПОРНЫЙ: Убирает меньше SL (${slChoppy}) чем TP (${tpChoppy})`);
}

console.log('\n' + '='.repeat(80));

// Примеры TP с choppy
console.log('\n📝 ПРИМЕРЫ TP С CHOPPY (которые потеряем):');
const tpChoppyExamples = tpData.filter(r => r.context_recent_direction === 'choppy').slice(0, 10);
for (let i = 0; i < tpChoppyExamples.length; i++) {
  const t = tpChoppyExamples[i];
  console.log(`  ${i + 1}. ${t.symbol.padEnd(15)} ${t.direction.padEnd(5)} | PNL: ${t.pnl_r}R`);
}

console.log('\n✅ АНАЛИЗ ЗАВЕРШЕН');
console.log('='.repeat(80));
