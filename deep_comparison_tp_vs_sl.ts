import * as fs from 'fs';

/**
 * ГЛУБОКИЙ АНАЛИЗ: Сравнение ВСЕХ условий между TP и SL
 * Ищем закономерности - что отличает успешные сделки от неудачных
 */

interface TradeRow {
  symbol: string;
  timeframe: string;
  direction: string;
  pattern_type: string;
  entry_price: string;
  sl_price: string;
  tp1_price: string;
  exit_type: string;
  status: string;
  pnl_r: string;
  pnl_percent: string;
  context_trend_before: string;
  context_was_reversal: string;
  context_swing_count_20: string;
  context_recent_direction: string;
  context_distance_from_ema: string;
  pattern_score: string;
  trend_alignment: string;
  clearance_15m: string;
  mfe_r: string;
  mae_r: string;
  signal_time: string;
  time_to_sl_min: string;
  atr_15m: string;
  free_path_r: string;
  clearance_1h: string;
  r_available: string;
  actual_rr_tp1: string;
  multi_tf_alignment: string;
  confluence_score: string;
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
console.log('🔍 ГЛУБОКИЙ АНАЛИЗ: TP vs SL - Поиск закономерностей');
console.log('='.repeat(90));
console.log(`Период: 04-06 ноября 2025, Стратегия: 15m scalping`);
console.log(`TP сделок: ${tpData.length}, SL сделок: ${slData.length}`);

// ========== 1. PATTERN TYPE ==========
console.log('\n' + '='.repeat(90));
console.log('1️⃣ PATTERN TYPE - Какие паттерны работают лучше?');
console.log('='.repeat(90));

const patterns = ['pinbar_buy', 'pinbar_sell', 'fakey_buy', 'fakey_sell', 'ppr_buy', 'ppr_sell', 'engulfing_buy', 'engulfing_sell'];

console.log('\n| Pattern | TP | SL | Total | Win Rate | Прибыльность |');
console.log('|---------|----|----|-------|----------|--------------|');

for (const pattern of patterns) {
  const tpCount = tpData.filter(r => r.pattern_type === pattern).length;
  const slCount = slData.filter(r => r.pattern_type === pattern).length;
  const total = tpCount + slCount;
  const winRate = total > 0 ? (tpCount / total * 100) : 0;
  const profitability = total > 0 ? (tpCount * 2.0 - slCount * 1.0) / total : 0;
  
  if (total > 0) {
    console.log(`| ${pattern.padEnd(15)} | ${tpCount.toString().padStart(3)} | ${slCount.toString().padStart(3)} | ${total.toString().padStart(5)} | ${winRate.toFixed(1).padStart(6)}% | ${profitability > 0 ? '+' : ''}${profitability.toFixed(2).padStart(5)}R |`);
  }
}

// ========== 2. DIRECTION ==========
console.log('\n' + '='.repeat(90));
console.log('2️⃣ DIRECTION - LONG vs SHORT');
console.log('='.repeat(90));

const tpLong = tpData.filter(r => r.direction === 'LONG').length;
const tpShort = tpData.filter(r => r.direction === 'SHORT').length;
const slLong = slData.filter(r => r.direction === 'LONG').length;
const slShort = slData.filter(r => r.direction === 'SHORT').length;

const totalLong = tpLong + slLong;
const totalShort = tpShort + slShort;
const winRateLong = (tpLong / totalLong * 100);
const winRateShort = (tpShort / totalShort * 100);

console.log(`\nLONG:  TP=${tpLong}, SL=${slLong}, Total=${totalLong}, Win Rate=${winRateLong.toFixed(1)}%`);
console.log(`SHORT: TP=${tpShort}, SL=${slShort}, Total=${totalShort}, Win Rate=${winRateShort.toFixed(1)}%`);
console.log(`\nВывод: ${winRateLong > winRateShort ? 'LONG лучше' : 'SHORT лучше'} на ${Math.abs(winRateLong - winRateShort).toFixed(1)}%`);

// ========== 3. CONTEXT TREND ==========
console.log('\n' + '='.repeat(90));
console.log('3️⃣ CONTEXT TREND - В каком тренде лучше работает?');
console.log('='.repeat(90));

const trends = ['uptrend', 'downtrend', 'sideways'];

console.log('\n| Trend | TP | SL | Total | Win Rate |');
console.log('|-------|----|----|-------|----------|');

for (const trend of trends) {
  const tpCount = tpData.filter(r => r.context_trend_before === trend).length;
  const slCount = slData.filter(r => r.context_trend_before === trend).length;
  const total = tpCount + slCount;
  const winRate = total > 0 ? (tpCount / total * 100) : 0;
  
  console.log(`| ${trend.padEnd(9)} | ${tpCount.toString().padStart(3)} | ${slCount.toString().padStart(3)} | ${total.toString().padStart(5)} | ${winRate.toFixed(1).padStart(6)}% |`);
}

// ========== 4. TREND ALIGNMENT ==========
console.log('\n' + '='.repeat(90));
console.log('4️⃣ TREND ALIGNMENT - С трендом vs против тренда');
console.log('='.repeat(90));

const tpWith = tpData.filter(r => r.trend_alignment === 'with').length;
const tpAgainst = tpData.filter(r => r.trend_alignment === 'against').length;
const slWith = slData.filter(r => r.trend_alignment === 'with').length;
const slAgainst = slData.filter(r => r.trend_alignment === 'against').length;

const totalWith = tpWith + slWith;
const totalAgainst = tpAgainst + slAgainst;

console.log(`\nС трендом (with):     TP=${tpWith}, SL=${slWith}, Total=${totalWith}, Win Rate=${(tpWith / totalWith * 100).toFixed(1)}%`);
console.log(`Против тренда (against): TP=${tpAgainst}, SL=${slAgainst}, Total=${totalAgainst}, Win Rate=${(tpAgainst / totalAgainst * 100).toFixed(1)}%`);

// ========== 5. WAS REVERSAL ==========
console.log('\n' + '='.repeat(90));
console.log('5️⃣ REVERSAL - После разворота vs продолжение');
console.log('='.repeat(90));

const tpReversal = tpData.filter(r => r.context_was_reversal === 't').length;
const tpNoReversal = tpData.filter(r => r.context_was_reversal === 'f').length;
const slReversal = slData.filter(r => r.context_was_reversal === 't').length;
const slNoReversal = slData.filter(r => r.context_was_reversal === 'f').length;

const totalReversal = tpReversal + slReversal;
const totalNoReversal = tpNoReversal + slNoReversal;

console.log(`\nПосле разворота (t): TP=${tpReversal}, SL=${slReversal}, Total=${totalReversal}, Win Rate=${(tpReversal / totalReversal * 100).toFixed(1)}%`);
console.log(`Продолжение (f):     TP=${tpNoReversal}, SL=${slNoReversal}, Total=${totalNoReversal}, Win Rate=${(tpNoReversal / totalNoReversal * 100).toFixed(1)}%`);

// ========== 6. SWING COUNT ==========
console.log('\n' + '='.repeat(90));
console.log('6️⃣ SWING COUNT - Количество свингов (choppy фильтр)');
console.log('='.repeat(90));

const tpSwings = tpData.map(r => parseInt(r.context_swing_count_20)).filter(s => !isNaN(s));
const slSwings = slData.map(r => parseInt(r.context_swing_count_20)).filter(s => !isNaN(s));

const avgTpSwings = tpSwings.reduce((a, b) => a + b, 0) / tpSwings.length;
const avgSlSwings = slSwings.reduce((a, b) => a + b, 0) / slSwings.length;

console.log(`\nСреднее количество свингов:`);
console.log(`  TP: ${avgTpSwings.toFixed(1)} свингов`);
console.log(`  SL: ${avgSlSwings.toFixed(1)} свингов`);

// Распределение по группам
const swingRanges = [
  { name: '0-5 (smooth)', min: 0, max: 5 },
  { name: '6-8 (normal)', min: 6, max: 8 },
  { name: '9-10 (choppy)', min: 9, max: 10 },
  { name: '11+ (very choppy)', min: 11, max: 999 },
];

console.log(`\n| Swing Range | TP | SL | Total | Win Rate |`);
console.log('|-------------|----|----|-------|----------|');

for (const range of swingRanges) {
  const tpCount = tpData.filter(r => {
    const swings = parseInt(r.context_swing_count_20);
    return !isNaN(swings) && swings >= range.min && swings <= range.max;
  }).length;
  
  const slCount = slData.filter(r => {
    const swings = parseInt(r.context_swing_count_20);
    return !isNaN(swings) && swings >= range.min && swings <= range.max;
  }).length;
  
  const total = tpCount + slCount;
  const winRate = total > 0 ? (tpCount / total * 100) : 0;
  
  console.log(`| ${range.name.padEnd(19)} | ${tpCount.toString().padStart(3)} | ${slCount.toString().padStart(3)} | ${total.toString().padStart(5)} | ${winRate.toFixed(1).padStart(6)}% |`);
}

// ========== 7. RECENT DIRECTION ==========
console.log('\n' + '='.repeat(90));
console.log('7️⃣ RECENT DIRECTION - Направление последних 10 свечей');
console.log('='.repeat(90));

const directions = ['bullish', 'bearish', 'choppy'];

console.log('\n| Direction | TP | SL | Total | Win Rate |');
console.log('|-----------|----|----|-------|----------|');

for (const dir of directions) {
  const tpCount = tpData.filter(r => r.context_recent_direction === dir).length;
  const slCount = slData.filter(r => r.context_recent_direction === dir).length;
  const total = tpCount + slCount;
  const winRate = total > 0 ? (tpCount / total * 100) : 0;
  
  console.log(`| ${dir.padEnd(9)} | ${tpCount.toString().padStart(3)} | ${slCount.toString().padStart(3)} | ${total.toString().padStart(5)} | ${winRate.toFixed(1).padStart(6)}% |`);
}

// ========== 8. PATTERN SCORE ==========
console.log('\n' + '='.repeat(90));
console.log('8️⃣ PATTERN SCORE - Качество паттерна (scoring)');
console.log('='.repeat(90));

const tpScores = tpData.map(r => parseFloat(r.pattern_score)).filter(s => !isNaN(s));
const slScores = slData.map(r => parseFloat(r.pattern_score)).filter(s => !isNaN(s));

const avgTpScore = tpScores.reduce((a, b) => a + b, 0) / tpScores.length;
const avgSlScore = slScores.reduce((a, b) => a + b, 0) / slScores.length;

console.log(`\nСредний score паттерна:`);
console.log(`  TP: ${avgTpScore.toFixed(2)}/10`);
console.log(`  SL: ${avgSlScore.toFixed(2)}/10`);
console.log(`  Разница: ${(avgTpScore - avgSlScore).toFixed(2)} баллов`);

// Распределение по score
const scoreRanges = [
  { name: '5-6 (low)', min: 5, max: 6.5 },
  { name: '7-8 (medium)', min: 6.5, max: 8.5 },
  { name: '9-10 (high)', min: 8.5, max: 10 },
];

console.log(`\n| Score Range | TP | SL | Total | Win Rate |`);
console.log('|-------------|----|----|-------|----------|');

for (const range of scoreRanges) {
  const tpCount = tpData.filter(r => {
    const score = parseFloat(r.pattern_score);
    return !isNaN(score) && score >= range.min && score < range.max;
  }).length;
  
  const slCount = slData.filter(r => {
    const score = parseFloat(r.pattern_score);
    return !isNaN(score) && score >= range.min && score < range.max;
  }).length;
  
  const total = tpCount + slCount;
  const winRate = total > 0 ? (tpCount / total * 100) : 0;
  
  console.log(`| ${range.name.padEnd(15)} | ${tpCount.toString().padStart(3)} | ${slCount.toString().padStart(3)} | ${total.toString().padStart(5)} | ${winRate.toFixed(1).padStart(6)}% |`);
}

// ========== 9. DISTANCE FROM EMA ==========
console.log('\n' + '='.repeat(90));
console.log('9️⃣ DISTANCE FROM EMA - Расстояние от EMA20');
console.log('='.repeat(90));

const tpDistances = tpData.map(r => parseFloat(r.context_distance_from_ema)).filter(d => !isNaN(d));
const slDistances = slData.map(r => parseFloat(r.context_distance_from_ema)).filter(d => !isNaN(d));

const avgTpDistance = tpDistances.reduce((a, b) => a + b, 0) / tpDistances.length;
const avgSlDistance = slDistances.reduce((a, b) => a + b, 0) / slDistances.length;

console.log(`\nСреднее расстояние от EMA20:`);
console.log(`  TP: ${avgTpDistance.toFixed(2)}%`);
console.log(`  SL: ${avgSlDistance.toFixed(2)}%`);

// ========== 10. CLEARANCE (Free Path) ==========
console.log('\n' + '='.repeat(90));
console.log('🔟 CLEARANCE - Свободный путь до TP (R)');
console.log('='.repeat(90));

const tpClearances = tpData.map(r => parseFloat(r.clearance_15m)).filter(c => !isNaN(c));
const slClearances = slData.map(r => parseFloat(r.clearance_15m)).filter(c => !isNaN(c));

const avgTpClearance = tpClearances.reduce((a, b) => a + b, 0) / tpClearances.length;
const avgSlClearance = slClearances.reduce((a, b) => a + b, 0) / slClearances.length;

console.log(`\nСредний clearance (свободный путь до ближайшего S/R):`);
console.log(`  TP: ${avgTpClearance.toFixed(2)}R`);
console.log(`  SL: ${avgSlClearance.toFixed(2)}R`);

// Распределение по clearance
const clearanceRanges = [
  { name: '0-1R (blocked)', min: 0, max: 1.0 },
  { name: '1-2R (tight)', min: 1.0, max: 2.0 },
  { name: '2-5R (clear)', min: 2.0, max: 5.0 },
  { name: '5+R (very clear)', min: 5.0, max: 999 },
];

console.log(`\n| Clearance | TP | SL | Total | Win Rate |`);
console.log('|-----------|----|----|-------|----------|');

for (const range of clearanceRanges) {
  const tpCount = tpData.filter(r => {
    const clearance = parseFloat(r.clearance_15m);
    return !isNaN(clearance) && clearance >= range.min && clearance < range.max;
  }).length;
  
  const slCount = slData.filter(r => {
    const clearance = parseFloat(r.clearance_15m);
    return !isNaN(clearance) && clearance >= range.min && clearance < range.max;
  }).length;
  
  const total = tpCount + slCount;
  const winRate = total > 0 ? (tpCount / total * 100) : 0;
  
  console.log(`| ${range.name.padEnd(17)} | ${tpCount.toString().padStart(3)} | ${slCount.toString().padStart(3)} | ${total.toString().padStart(5)} | ${winRate.toFixed(1).padStart(6)}% |`);
}

// ========== 11. ATR SIZE ==========
console.log('\n' + '='.repeat(90));
console.log('1️⃣1️⃣ ATR SIZE - Волатильность на момент сигнала');
console.log('='.repeat(90));

const tpAtrs = tpData.map(r => parseFloat(r.atr_15m)).filter(a => !isNaN(a) && a > 0);
const slAtrs = slData.map(r => parseFloat(r.atr_15m)).filter(a => !isNaN(a) && a > 0);

const avgTpAtr = tpAtrs.reduce((a, b) => a + b, 0) / tpAtrs.length;
const avgSlAtr = slAtrs.reduce((a, b) => a + b, 0) / slAtrs.length;

console.log(`\nСредний ATR 15m:`);
console.log(`  TP: ${avgTpAtr.toFixed(8)}`);
console.log(`  SL: ${avgSlAtr.toFixed(8)}`);
console.log(`  Разница: ${((avgTpAtr - avgSlAtr) / avgSlAtr * 100).toFixed(1)}%`);

// ========== ИТОГОВЫЕ ВЫВОДЫ ==========
console.log('\n' + '='.repeat(90));
console.log('💡 ИТОГОВЫЕ ЗАКОНОМЕРНОСТИ:');
console.log('='.repeat(90));

const findings: string[] = [];

// Pattern type
const bestPattern = patterns.map(p => {
  const tpC = tpData.filter(r => r.pattern_type === p).length;
  const slC = slData.filter(r => r.pattern_type === p).length;
  const total = tpC + slC;
  const wr = total > 0 ? tpC / total * 100 : 0;
  return { pattern: p, winRate: wr, total };
}).sort((a, b) => b.winRate - a.winRate)[0];

if (bestPattern && bestPattern.total > 10) {
  findings.push(`✅ Лучший паттерн: ${bestPattern.pattern} (${bestPattern.winRate.toFixed(1)}% win rate)`);
}

// Direction
if (Math.abs(winRateLong - winRateShort) > 5) {
  const better = winRateLong > winRateShort ? 'LONG' : 'SHORT';
  const diff = Math.abs(winRateLong - winRateShort).toFixed(1);
  findings.push(`✅ ${better} работает лучше на ${diff}%`);
}

// Trend alignment
const wrWith = tpWith / totalWith * 100;
const wrAgainst = tpAgainst / totalAgainst * 100;
if (Math.abs(wrWith - wrAgainst) > 5) {
  const better = wrWith > wrAgainst ? 'С трендом' : 'Против тренда';
  const diff = Math.abs(wrWith - wrAgainst).toFixed(1);
  findings.push(`✅ ${better} работает лучше на ${diff}%`);
}

// Swings
if (Math.abs(avgTpSwings - avgSlSwings) > 0.5) {
  const better = avgTpSwings < avgSlSwings ? 'Меньше' : 'Больше';
  findings.push(`✅ ${better} свингов у TP (${avgTpSwings.toFixed(1)} vs ${avgSlSwings.toFixed(1)})`);
}

// Pattern score
if (Math.abs(avgTpScore - avgSlScore) > 0.3) {
  findings.push(`✅ TP имеют выше pattern score (${avgTpScore.toFixed(2)} vs ${avgSlScore.toFixed(2)})`);
}

// Clearance
if (Math.abs(avgTpClearance - avgSlClearance) > 0.5) {
  const better = avgTpClearance > avgSlClearance ? 'больше' : 'меньше';
  findings.push(`✅ TP имеют ${better} clearance (${avgTpClearance.toFixed(2)}R vs ${avgSlClearance.toFixed(2)}R)`);
}

console.log('');
findings.forEach(f => console.log(f));

console.log('\n✅ АНАЛИЗ ЗАВЕРШЕН');
console.log('='.repeat(90));
