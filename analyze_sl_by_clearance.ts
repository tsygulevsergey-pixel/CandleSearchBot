import * as fs from 'fs';

/**
 * АНАЛИЗ: Что если SL ставить на swing extreme вместо 0.6 ATR?
 * Проверяем: улучшится ли результат если использовать clearance для SL
 */

interface TradeRow {
  symbol: string;
  direction: string;
  pattern_type: string;
  entry_price: string;
  sl_price: string;
  tp2_price: string;
  clearance_15m: string;
  atr_15m: string;
  pnl_r: string;
  signal_time: string;
  status: string;
  mae_r: string; // Maximum Adverse Excursion
  mfe_r: string; // Maximum Favorable Excursion
  swing_extreme_price: string;
}

// Читаем все сделки (TP и SL вместе)
const slCsv = fs.readFileSync('attached_assets/stoplosses_export_1762447823236.csv', 'utf-8');
const tpCsv = fs.readFileSync('attached_assets/takeprofits_export_1762447743545_1762447823237.csv', 'utf-8');

function parseCsv(csv: string): TradeRow[] {
  const lines = csv.split('\n');
  const headers = lines[0].split(',');
  const data: TradeRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = lines[i].split(',');
    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    data.push(row as TradeRow);
  }
  
  return data;
}

const slData = parseCsv(slCsv);
const tpData = parseCsv(tpCsv);
const allTrades = [...slData, ...tpData];

console.log('='.repeat(90));
console.log('🔍 АНАЛИЗ: SL на основе Clearance (swing extreme) вместо 0.6 ATR');
console.log('='.repeat(90));
console.log(`Всего сделок: ${allTrades.length} (TP: ${tpData.length}, SL: ${slData.length})`);

// ========== ТЕКУЩАЯ СИТУАЦИЯ: SL = 0.6 ATR ==========
console.log('\n' + '='.repeat(90));
console.log('📊 ТЕКУЩАЯ СИСТЕМА: SL = entry ± 0.6 ATR');
console.log('='.repeat(90));

const currentWinRate = (tpData.length / allTrades.length) * 100;
console.log(`Win Rate: ${currentWinRate.toFixed(1)}%`);
console.log(`TP: ${tpData.length}, SL: ${slData.length}`);

// ========== АНАЛИЗ: ГДЕ SWING EXTREME ОТНОСИТЕЛЬНО ENTRY? ==========
console.log('\n' + '='.repeat(90));
console.log('📊 ГДЕ НАХОДИТСЯ SWING EXTREME ОТНОСИТЕЛЬНО ENTRY?');
console.log('='.repeat(90));

// Для каждой сделки считаем:
// 1. Текущий SL distance (в ATR)
// 2. Swing extreme distance (clearance в ATR)
// 3. Разница между ними

const tradesWithDistances = allTrades.map(t => {
  const entry = parseFloat(t.entry_price);
  const currentSL = parseFloat(t.sl_price);
  const swingExtreme = parseFloat(t.swing_extreme_price);
  const atr = parseFloat(t.atr_15m);
  const clearance = parseFloat(t.clearance_15m);
  
  if (isNaN(entry) || isNaN(currentSL) || isNaN(atr) || atr === 0) {
    return null;
  }
  
  // Текущий SL distance (в ATR)
  const currentSlDistanceAtr = Math.abs(entry - currentSL) / atr;
  
  // Swing extreme distance (clearance в ATR)
  const swingExtremeDistanceAtr = clearance / atr;
  
  // Если бы SL был на swing extreme, сколько бы это было ATR?
  const swingExtremeSLDistanceAtr = !isNaN(swingExtreme) && swingExtreme > 0
    ? Math.abs(entry - swingExtreme) / atr
    : swingExtremeDistanceAtr;
  
  return {
    ...t,
    entry,
    currentSL,
    swingExtreme,
    atr,
    clearance,
    currentSlDistanceAtr,
    swingExtremeDistanceAtr,
    swingExtremeSLDistanceAtr,
    isTP: t.status.includes('TP'),
  };
}).filter(t => t !== null) as any[];

console.log(`\n📊 СРЕДНИЕ ЗНАЧЕНИЯ:`);
const avgCurrentSL = tradesWithDistances.reduce((a, b) => a + b.currentSlDistanceAtr, 0) / tradesWithDistances.length;
const avgSwingExtremeDist = tradesWithDistances.reduce((a, b) => a + b.swingExtremeDistanceAtr, 0) / tradesWithDistances.length;

console.log(`  Текущий SL: ${avgCurrentSL.toFixed(2)} ATR (должно быть ~0.6)`);
console.log(`  Swing Extreme: ${avgSwingExtremeDist.toFixed(2)} ATR (clearance)`);
console.log(`  Разница: ${(avgSwingExtremeDist - avgCurrentSL).toFixed(2)} ATR`);

// ========== СИМУЛЯЦИЯ: SL НА SWING EXTREME + БУФЕР ==========
console.log('\n' + '='.repeat(90));
console.log('🎯 СИМУЛЯЦИЯ: SL на swing extreme + буфер');
console.log('='.repeat(90));

// Пробуем разные буферы
const buffers = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3];

console.log(`\n| Буфер | Новый SL (avg) | TP | SL | Win Rate | Изменение | Спасено SL |`);
console.log(`|-------|----------------|----|----|----------|-----------|------------|`);

for (const buffer of buffers) {
  // Для каждой сделки определяем новый SL
  let newTP = 0;
  let newSL = 0;
  let savedSL = 0; // Сколько SL стали бы TP
  
  for (const trade of tradesWithDistances) {
    const entry = trade.entry;
    const atr = trade.atr;
    const mae = parseFloat(trade.mae_r);
    
    // LONG: SL = swing low - buffer
    // SHORT: SL = swing high + buffer
    // В ATR: новый SL distance = clearance + buffer
    const newSLDistanceAtr = trade.swingExtremeDistanceAtr + buffer;
    
    // Проверяем: достигла ли цена нового SL?
    // MAE (Maximum Adverse Excursion) показывает максимальное движение против нас
    const hitNewSL = !isNaN(mae) && Math.abs(mae) >= newSLDistanceAtr;
    
    if (trade.isTP) {
      // Была TP - проверяем, сработал бы новый SL?
      if (hitNewSL) {
        newSL++; // Превратился в SL
      } else {
        newTP++; // Остался TP
      }
    } else {
      // Был SL - проверяем, спасся бы с новым SL?
      if (hitNewSL) {
        newSL++; // Остался SL
      } else {
        newTP++; // Превратился в TP!
        savedSL++;
      }
    }
  }
  
  const newWinRate = (newTP / (newTP + newSL)) * 100;
  const change = newWinRate - currentWinRate;
  const avgNewSL = tradesWithDistances.reduce((a, b) => a + b.swingExtremeDistanceAtr + buffer, 0) / tradesWithDistances.length;
  
  console.log(`| ${buffer.toFixed(2)}  | ${avgNewSL.toFixed(2)} ATR ${' '.repeat(6)} | ${newTP.toString().padStart(3)} | ${newSL.toString().padStart(3)} | ${newWinRate.toFixed(1).padStart(6)}% | ${change > 0 ? '+' : ''}${change.toFixed(1).padStart(5)}% | ${savedSL.toString().padStart(10)} |`);
}

// ========== ДЕТАЛЬНЫЙ АНАЛИЗ ЛУЧШЕГО БУФЕРА ==========
console.log('\n' + '='.repeat(90));
console.log('📊 ДЕТАЛЬНЫЙ АНАЛИЗ: Оптимальный буфер');
console.log('='.repeat(90));

// Находим лучший буфер
let bestBuffer = 0;
let bestWinRate = currentWinRate;
let bestTP = tpData.length;
let bestSL = slData.length;

for (const buffer of buffers) {
  let newTP = 0;
  let newSL = 0;
  
  for (const trade of tradesWithDistances) {
    const mae = parseFloat(trade.mae_r);
    const newSLDistanceAtr = trade.swingExtremeDistanceAtr + buffer;
    const hitNewSL = !isNaN(mae) && Math.abs(mae) >= newSLDistanceAtr;
    
    if (trade.isTP) {
      hitNewSL ? newSL++ : newTP++;
    } else {
      hitNewSL ? newSL++ : newTP++;
    }
  }
  
  const winRate = (newTP / (newTP + newSL)) * 100;
  
  if (winRate > bestWinRate) {
    bestBuffer = buffer;
    bestWinRate = winRate;
    bestTP = newTP;
    bestSL = newSL;
  }
}

console.log(`\n✅ ЛУЧШИЙ РЕЗУЛЬТАТ: Буфер = ${bestBuffer} ATR`);
console.log(`   Win Rate: ${bestWinRate.toFixed(1)}% (было ${currentWinRate.toFixed(1)}%)`);
console.log(`   Изменение: ${bestWinRate > currentWinRate ? '+' : ''}${(bestWinRate - currentWinRate).toFixed(1)}%`);
console.log(`   TP: ${bestTP} (было ${tpData.length})`);
console.log(`   SL: ${bestSL} (было ${slData.length})`);
console.log(`   Спасено SL: ${tpData.length - bestTP + (bestTP - tpData.length)} → превратились в TP`);

// ========== СРАВНЕНИЕ ПО НАПРАВЛЕНИЮ ==========
console.log('\n' + '='.repeat(90));
console.log('📊 СРАВНЕНИЕ: LONG vs SHORT');
console.log('='.repeat(90));

const longTrades = tradesWithDistances.filter(t => t.direction === 'LONG');
const shortTrades = tradesWithDistances.filter(t => t.direction === 'SHORT');

console.log(`\n📊 LONG сделки (${longTrades.length}):`);
const avgLongSwingDist = longTrades.reduce((a, b) => a + b.swingExtremeDistanceAtr, 0) / longTrades.length;
console.log(`   Средний swing extreme: ${avgLongSwingDist.toFixed(2)} ATR`);
console.log(`   Текущий SL: 0.60 ATR`);
console.log(`   Разница: ${(avgLongSwingDist - 0.6).toFixed(2)} ATR`);

console.log(`\n📊 SHORT сделки (${shortTrades.length}):`);
const avgShortSwingDist = shortTrades.reduce((a, b) => a + b.swingExtremeDistanceAtr, 0) / shortTrades.length;
console.log(`   Средний swing extreme: ${avgShortSwingDist.toFixed(2)} ATR`);
console.log(`   Текущий SL: 0.60 ATR`);
console.log(`   Разница: ${(avgShortSwingDist - 0.6).toFixed(2)} ATR`);

// ========== ПРИМЕРЫ ==========
console.log('\n' + '='.repeat(90));
console.log('📝 ПРИМЕРЫ: Как изменился бы SL');
console.log('='.repeat(90));

// SL которые стали бы TP с новым буфером
const wouldBecomeTP = tradesWithDistances
  .filter(t => !t.isTP)
  .map(t => ({
    ...t,
    newSLDistanceAtr: t.swingExtremeDistanceAtr + bestBuffer,
    wouldSurvive: !(!isNaN(parseFloat(t.mae_r)) && Math.abs(parseFloat(t.mae_r)) >= (t.swingExtremeDistanceAtr + bestBuffer)),
  }))
  .filter(t => t.wouldSurvive)
  .slice(0, 5);

console.log(`\n✅ SL которые стали бы TP (буфер ${bestBuffer}):`);
for (let i = 0; i < wouldBecomeTP.length; i++) {
  const t = wouldBecomeTP[i];
  console.log(`${i + 1}. ${t.symbol} ${t.direction} (${t.pattern_type})`);
  console.log(`   Текущий SL: ${t.currentSlDistanceAtr.toFixed(2)} ATR, MAE: ${parseFloat(t.mae_r).toFixed(2)}R`);
  console.log(`   Новый SL: ${t.newSLDistanceAtr.toFixed(2)} ATR (swing + ${bestBuffer})`);
  console.log(`   Результат: Спасён! ${parseFloat(t.mae_r).toFixed(2)}R < ${t.newSLDistanceAtr.toFixed(2)} ATR`);
}

// TP которые стали бы SL
const wouldBecomeSL = tradesWithDistances
  .filter(t => t.isTP)
  .map(t => ({
    ...t,
    newSLDistanceAtr: t.swingExtremeDistanceAtr + bestBuffer,
    wouldHit: !isNaN(parseFloat(t.mae_r)) && Math.abs(parseFloat(t.mae_r)) >= (t.swingExtremeDistanceAtr + bestBuffer),
  }))
  .filter(t => t.wouldHit)
  .slice(0, 5);

console.log(`\n❌ TP которые стали бы SL (буфер ${bestBuffer}):`);
for (let i = 0; i < wouldBecomeSL.length; i++) {
  const t = wouldBecomeSL[i];
  console.log(`${i + 1}. ${t.symbol} ${t.direction} (${t.pattern_type})`);
  console.log(`   Текущий SL: ${t.currentSlDistanceAtr.toFixed(2)} ATR, MAE: ${parseFloat(t.mae_r).toFixed(2)}R`);
  console.log(`   Новый SL: ${t.newSLDistanceAtr.toFixed(2)} ATR (swing + ${bestBuffer})`);
  console.log(`   Результат: Сработал! ${Math.abs(parseFloat(t.mae_r)).toFixed(2)}R >= ${t.newSLDistanceAtr.toFixed(2)} ATR`);
}

// ========== РЕКОМЕНДАЦИИ ==========
console.log('\n' + '='.repeat(90));
console.log('💡 РЕКОМЕНДАЦИИ');
console.log('='.repeat(90));

if (bestWinRate > currentWinRate + 1) {
  console.log(`\n✅ РЕКОМЕНДАЦИЯ: Внедрять SL на swing extreme + ${bestBuffer} ATR!`);
  console.log(`   Улучшение: ${(bestWinRate - currentWinRate).toFixed(1)}%`);
  console.log(`   Формула для кода:`);
  console.log(`     LONG: SL = swing_low - (${bestBuffer} * ATR)`);
  console.log(`     SHORT: SL = swing_high + (${bestBuffer} * ATR)`);
} else {
  console.log(`\n⚠️ РЕЗУЛЬТАТ: SL на swing extreme НЕ улучшает результат`);
  console.log(`   Лучший буфер (${bestBuffer}) даёт только ${(bestWinRate - currentWinRate).toFixed(1)}% улучшения`);
  console.log(`   Текущая система (0.6 ATR) работает лучше или сопоставимо`);
}

console.log('\n✅ АНАЛИЗ ЗАВЕРШЕН');
console.log('='.repeat(90));
