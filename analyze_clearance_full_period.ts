import * as fs from 'fs';

/**
 * ПРОВЕРКА ТЕОРИИ: Clearance анализ за весь период (CSV данные)
 * Проверяем действительно ли TP имеют больший clearance чем SL
 */

interface TradeRow {
  symbol: string;
  direction: string;
  pattern_type: string;
  clearance_15m: string;
  atr_15m: string;
  pnl_r: string;
  signal_time: string;
  status: string;
}

// Читаем SL
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

// Читаем TP
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

console.log('='.repeat(90));
console.log('🔍 ПРОВЕРКА ТЕОРИИ: Clearance влияет на результат?');
console.log('='.repeat(90));
console.log(`TP сделок: ${tpData.length}, SL сделок: ${slData.length}`);

// ========== АНАЛИЗ CLEARANCE ==========
console.log('\n' + '='.repeat(90));
console.log('📊 АНАЛИЗ CLEARANCE (свободное пространство до swing extreme)');
console.log('='.repeat(90));

// Считаем clearance в R (относительно ATR)
const tpClearances = tpData.map(r => {
  const clearance = parseFloat(r.clearance_15m);
  const atr = parseFloat(r.atr_15m);
  if (isNaN(clearance) || isNaN(atr) || atr === 0) return null;
  return clearance / atr;
}).filter(c => c !== null) as number[];

const slClearances = slData.map(r => {
  const clearance = parseFloat(r.clearance_15m);
  const atr = parseFloat(r.atr_15m);
  if (isNaN(clearance) || isNaN(atr) || atr === 0) return null;
  return clearance / atr;
}).filter(c => c !== null) as number[];

// Абсолютные значения
const tpClearancesAbs = tpData.map(r => parseFloat(r.clearance_15m)).filter(c => !isNaN(c));
const slClearancesAbs = slData.map(r => parseFloat(r.clearance_15m)).filter(c => !isNaN(c));

// Средние значения
const avgTpClearanceR = tpClearances.reduce((a, b) => a + b, 0) / tpClearances.length;
const avgSlClearanceR = slClearances.reduce((a, b) => a + b, 0) / slClearances.length;

const avgTpClearanceAbs = tpClearancesAbs.reduce((a, b) => a + b, 0) / tpClearancesAbs.length;
const avgSlClearanceAbs = slClearancesAbs.reduce((a, b) => a + b, 0) / slClearancesAbs.length;

console.log(`\n📊 СРЕДНИЙ CLEARANCE:`);
console.log(`  TP: ${avgTpClearanceR.toFixed(4)}R (${avgTpClearanceAbs.toFixed(8)} абс.)`);
console.log(`  SL: ${avgSlClearanceR.toFixed(4)}R (${avgSlClearanceAbs.toFixed(8)} абс.)`);
console.log(`  Разница: ${(avgTpClearanceR - avgSlClearanceR).toFixed(4)}R (${((avgTpClearanceR / avgSlClearanceR - 1) * 100).toFixed(1)}%)`);

if (avgTpClearanceR > avgSlClearanceR) {
  console.log(`\n✅ ТЕОРИЯ ПОДТВЕРЖДАЕТСЯ: TP имеют больший clearance чем SL!`);
  console.log(`   TP в среднем имеют на ${((avgTpClearanceR / avgSlClearanceR - 1) * 100).toFixed(1)}% больше свободного пространства`);
} else {
  console.log(`\n❌ ТЕОРИЯ НЕ ПОДТВЕРЖДАЕТСЯ: SL имеют больший clearance чем TP!`);
  console.log(`   SL в среднем имеют на ${((avgSlClearanceR / avgTpClearanceR - 1) * 100).toFixed(1)}% больше свободного пространства`);
}

// ========== РАСПРЕДЕЛЕНИЕ ПО ГРУППАМ ==========
console.log('\n' + '='.repeat(90));
console.log('📊 РАСПРЕДЕЛЕНИЕ ПО CLEARANCE (в R)');
console.log('='.repeat(90));

const ranges = [
  { name: '0-0.1R (очень мало)', min: 0, max: 0.1 },
  { name: '0.1-0.2R (мало)', min: 0.1, max: 0.2 },
  { name: '0.2-0.5R (средне)', min: 0.2, max: 0.5 },
  { name: '0.5-1.0R (хорошо)', min: 0.5, max: 1.0 },
  { name: '1.0+ R (отлично)', min: 1.0, max: 999 },
];

console.log('\n| Clearance Range | TP | SL | Total | Win Rate |');
console.log('|-----------------|----|----|-------|----------|');

for (const range of ranges) {
  const tpCount = tpClearances.filter(c => c >= range.min && c < range.max).length;
  const slCount = slClearances.filter(c => c >= range.min && c < range.max).length;
  const total = tpCount + slCount;
  const winRate = total > 0 ? (tpCount / total * 100) : 0;
  
  console.log(`| ${range.name.padEnd(19)} | ${tpCount.toString().padStart(3)} | ${slCount.toString().padStart(3)} | ${total.toString().padStart(5)} | ${winRate.toFixed(1).padStart(6)}% |`);
}

// ========== КОРРЕЛЯЦИЯ ==========
console.log('\n' + '='.repeat(90));
console.log('📊 КОРРЕЛЯЦИЯ: Clearance vs Win Rate');
console.log('='.repeat(90));

// Считаем win rate для разных порогов clearance
const thresholds = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.5, 1.0];

console.log('\n| Минимальный Clearance | TP | SL | Total | Win Rate | Изменение |');
console.log('|----------------------|----|----|-------|----------|-----------|');

const baseWinRate = (tpData.length / (tpData.length + slData.length)) * 100;

for (const threshold of thresholds) {
  const tpAbove = tpClearances.filter(c => c >= threshold).length;
  const slAbove = slClearances.filter(c => c >= threshold).length;
  const total = tpAbove + slAbove;
  const winRate = total > 0 ? (tpAbove / total * 100) : 0;
  const change = winRate - baseWinRate;
  
  console.log(`| ≥ ${threshold.toFixed(2)}R ${' '.repeat(17 - threshold.toString().length)} | ${tpAbove.toString().padStart(3)} | ${slAbove.toString().padStart(3)} | ${total.toString().padStart(5)} | ${winRate.toFixed(1).padStart(6)}% | ${change > 0 ? '+' : ''}${change.toFixed(1).padStart(5)}% |`);
}

// ========== РЕКОМЕНДАЦИИ ==========
console.log('\n' + '='.repeat(90));
console.log('💡 РЕКОМЕНДАЦИИ НА ОСНОВЕ АНАЛИЗА');
console.log('='.repeat(90));

// Ищем оптимальный порог
let bestThreshold = 0;
let bestWinRate = baseWinRate;
let bestTotal = tpData.length + slData.length;

for (const threshold of thresholds) {
  const tpAbove = tpClearances.filter(c => c >= threshold).length;
  const slAbove = slClearances.filter(c => c >= threshold).length;
  const total = tpAbove + slAbove;
  const winRate = total > 0 ? (tpAbove / total * 100) : 0;
  
  // Находим лучший порог (win rate выше и достаточно сделок)
  if (winRate > bestWinRate && total > 50) {
    bestThreshold = threshold;
    bestWinRate = winRate;
    bestTotal = total;
  }
}

console.log(`\n✅ БАЗОВЫЙ Win Rate (без фильтра): ${baseWinRate.toFixed(1)}%`);
console.log(`   Сделок: ${tpData.length + slData.length} (TP: ${tpData.length}, SL: ${slData.length})`);

if (bestThreshold > 0) {
  const tpRemaining = tpClearances.filter(c => c >= bestThreshold).length;
  const slRemaining = slClearances.filter(c => c >= bestThreshold).length;
  const tpLost = tpData.length - tpRemaining;
  const slFiltered = slData.length - slRemaining;
  
  console.log(`\n✅ ОПТИМАЛЬНЫЙ ФИЛЬТР: clearance ≥ ${bestThreshold.toFixed(2)}R`);
  console.log(`   Win Rate: ${bestWinRate.toFixed(1)}% (было ${baseWinRate.toFixed(1)}%)`);
  console.log(`   Изменение: +${(bestWinRate - baseWinRate).toFixed(1)}%`);
  console.log(`   Сделок останется: ${bestTotal}`);
  console.log(`   Убрано SL: ${slFiltered} (из ${slData.length})`);
  console.log(`   Потеряно TP: ${tpLost} (из ${tpData.length})`);
  console.log(`   Соотношение: ${(slFiltered / tpLost).toFixed(2)}:1 (убираем ${slFiltered} SL на каждый потерянный TP)`);
  
  if (slFiltered > tpLost * 2) {
    console.log(`\n🔥 РЕКОМЕНДАЦИЯ: ВНЕДРЯТЬ! Фильтр убирает ${(slFiltered / tpLost).toFixed(1)}x больше SL чем TP!`);
  } else if (slFiltered > tpLost) {
    console.log(`\n✅ РЕКОМЕНДАЦИЯ: Можно внедрять, но эффект умеренный`);
  } else {
    console.log(`\n⚠️ РЕКОМЕНДАЦИЯ: Фильтр убирает слишком много хороших TP`);
  }
} else {
  console.log(`\n⚠️ Не найден порог, который улучшает win rate при достаточном количестве сделок`);
}

// ========== ПРИМЕРЫ ==========
console.log('\n' + '='.repeat(90));
console.log('📝 ПРИМЕРЫ СДЕЛОК С НИЗКИМ CLEARANCE (которые будут отфильтрованы)');
console.log('='.repeat(90));

// Показываем примеры SL с низким clearance
const lowClearanceSL = slData
  .map(r => ({
    ...r,
    clearanceR: parseFloat(r.clearance_15m) / parseFloat(r.atr_15m),
  }))
  .filter(r => !isNaN(r.clearanceR) && r.clearanceR < 0.15)
  .sort((a, b) => a.clearanceR - b.clearanceR)
  .slice(0, 5);

console.log('\n🔴 SL с низким clearance (<0.15R):');
for (let i = 0; i < lowClearanceSL.length; i++) {
  const t = lowClearanceSL[i];
  console.log(`${i + 1}. ${t.symbol} ${t.direction} (${t.pattern_type})`);
  console.log(`   Clearance: ${t.clearanceR.toFixed(4)}R`);
  console.log(`   Время: ${t.signal_time}`);
}

// Показываем примеры TP с высоким clearance
const highClearanceTP = tpData
  .map(r => ({
    ...r,
    clearanceR: parseFloat(r.clearance_15m) / parseFloat(r.atr_15m),
  }))
  .filter(r => !isNaN(r.clearanceR))
  .sort((a, b) => b.clearanceR - a.clearanceR)
  .slice(0, 5);

console.log('\n✅ TP с высоким clearance:');
for (let i = 0; i < highClearanceTP.length; i++) {
  const t = highClearanceTP[i];
  console.log(`${i + 1}. ${t.symbol} ${t.direction} (${t.pattern_type})`);
  console.log(`   Clearance: ${t.clearanceR.toFixed(4)}R, PNL: ${parseFloat(t.pnl_r).toFixed(2)}R`);
  console.log(`   Время: ${t.signal_time}`);
}

console.log('\n✅ АНАЛИЗ ЗАВЕРШЕН');
console.log('='.repeat(90));
