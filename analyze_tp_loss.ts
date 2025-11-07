import * as fs from 'fs';

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

console.log('📊 АНАЛИЗ: СКОЛЬКО ТЕЙКОВ ПОТЕРЯЕМ С TIME-BASED EXIT?\n');
console.log('=' .repeat(80));

const takeprofits = parseCsv(takeprofitsFile);
console.log(`\n📈 Всего тейк-профитов: ${takeprofits.length}`);

// ========================================
// АНАЛИЗ MAE (Maximum Adverse Excursion)
// ========================================
// MAE показывает насколько цена уходила ПРОТИВ нас
// Если MAE значительный, значит сделка "застревала" или шла против нас какое-то время

console.log(`\n${'='.repeat(80)}`);
console.log('🔍 АНАЛИЗ MAE: НАСКОЛЬКО ТЕЙКИ УХОДИЛИ В МИНУС ПЕРЕД TP?');
console.log('='.repeat(80));

const tpWithLowMAE = takeprofits.filter(row => {
  const mae = parseFloat(row.mae_r);
  return !isNaN(mae) && mae >= -0.3; // Почти не уходили в минус (< 0.3R)
});

const tpWithModerateMAE = takeprofits.filter(row => {
  const mae = parseFloat(row.mae_r);
  return !isNaN(mae) && mae < -0.3 && mae >= -0.7; // Средний минус (0.3-0.7R)
});

const tpWithHighMAE = takeprofits.filter(row => {
  const mae = parseFloat(row.mae_r);
  return !isNaN(mae) && mae < -0.7; // Сильно уходили в минус (> 0.7R)
});

console.log(`\n1️⃣  MAE >= -0.3R (почти не уходили в минус): ${tpWithLowMAE.length} раз (${(tpWithLowMAE.length/takeprofits.length*100).toFixed(1)}%)`);
console.log(`2️⃣  MAE -0.3R до -0.7R (средний минус): ${tpWithModerateMAE.length} раз (${(tpWithModerateMAE.length/takeprofits.length*100).toFixed(1)}%)`);
console.log(`3️⃣  MAE < -0.7R (сильно уходили в минус): ${tpWithHighMAE.length} раз (${(tpWithHighMAE.length/takeprofits.length*100).toFixed(1)}%)`);

// ========================================
// СИМУЛЯЦИЯ TIME-BASED EXIT
// ========================================
console.log(`\n\n${'='.repeat(80)}`);
console.log('⏰ СИМУЛЯЦИЯ: TIME-BASED EXIT (2 часа, MFE < 0.5R)');
console.log('='.repeat(80));

console.log(`\n⚠️  ВАЖНО: В CSV нет данных о том, какой был MFE через 2 часа после входа!`);
console.log(`Поэтому делаю приблизительную оценку на основе MAE (Maximum Adverse Excursion):`);
console.log(`\nЛОГИКА ОЦЕНКИ:`);
console.log(`- Если MAE < -0.5R → вероятно цена застревала/шла против → закрыли бы в BE`);
console.log(`- Если MAE >= -0.5R → вероятно цена быстро пошла к TP → НЕ закрыли бы`);

const tpLikelyClosedByTimeExit = takeprofits.filter(row => {
  const mae = parseFloat(row.mae_r);
  // Если MAE < -0.5R, значит цена сильно уходила против нас
  // Это индикатор того, что в первые 2 часа MFE мог быть < 0.5R
  return !isNaN(mae) && mae < -0.5;
});

const tpLikelyKept = takeprofits.filter(row => {
  const mae = parseFloat(row.mae_r);
  return !isNaN(mae) && mae >= -0.5;
});

console.log(`\n📊 ПРИБЛИЗИТЕЛЬНАЯ ОЦЕНКА:`);
console.log(`   ❌ Потеряли бы (MAE < -0.5R): ${tpLikelyClosedByTimeExit.length} TP (${(tpLikelyClosedByTimeExit.length/takeprofits.length*100).toFixed(1)}%)`);
console.log(`   ✅ Сохранили бы (MAE >= -0.5R): ${tpLikelyKept.length} TP (${(tpLikelyKept.length/takeprofits.length*100).toFixed(1)}%)`);

// ========================================
// ДЕТАЛЬНЫЙ АНАЛИЗ "ПОТЕРЯННЫХ" TP
// ========================================
console.log(`\n\n${'='.repeat(80)}`);
console.log('🔍 ДЕТАЛЬНЫЙ АНАЛИЗ: КАКИЕ TP МЫ БЫ ПОТЕРЯЛИ?');
console.log('='.repeat(80));

console.log(`\nВсего "потерянных" TP: ${tpLikelyClosedByTimeExit.length}`);

if (tpLikelyClosedByTimeExit.length > 0) {
  // Сортируем по MAE (от худшего к лучшему)
  const sorted = tpLikelyClosedByTimeExit.sort((a, b) => {
    return parseFloat(a.mae_r) - parseFloat(b.mae_r);
  });

  console.log('\nПримеры (топ-10 с самым плохим MAE):');
  sorted.slice(0, 10).forEach((row, idx) => {
    const mae = parseFloat(row.mae_r);
    const mfe = parseFloat(row.mfe_r);
    const pnl = parseFloat(row.pnl_r);
    
    console.log(`\n${idx + 1}. ${row.symbol} ${row.direction}:`);
    console.log(`   Entry: $${row.entry_price}`);
    console.log(`   TP2: $${row.tp2_price} (+${pnl.toFixed(1)}R)`);
    console.log(`   Тренд до сигнала: ${row.context_trend_before}`);
    console.log(`   MAE: ${mae.toFixed(2)}R (цена уходила в минус!)`);
    console.log(`   MFE: ${mfe.toFixed(2)}R (конечный профит)`);
    console.log(`   💡 Вероятно закрыли бы в BE, потеряв +${pnl.toFixed(1)}R`);
  });
}

// ========================================
// РАСЧЕТ ПОТЕРЬ
// ========================================
console.log(`\n\n${'='.repeat(80)}`);
console.log('💰 РАСЧЕТ ПОТЕРЬ ОТ TIME-BASED EXIT');
console.log('='.repeat(80));

const totalPnlLost = tpLikelyClosedByTimeExit.reduce((sum, row) => {
  const pnl = parseFloat(row.pnl_r);
  return sum + (isNaN(pnl) ? 0 : pnl);
}, 0);

const totalPnlKept = tpLikelyKept.reduce((sum, row) => {
  const pnl = parseFloat(row.pnl_r);
  return sum + (isNaN(pnl) ? 0 : pnl);
}, 0);

console.log(`\n📊 Потенциальные потери:`);
console.log(`   ❌ Потеряли бы R: ${totalPnlLost.toFixed(1)}R (${tpLikelyClosedByTimeExit.length} сделок)`);
console.log(`   ✅ Сохранили бы R: ${totalPnlKept.toFixed(1)}R (${tpLikelyKept.length} сделок)`);
console.log(`   📉 Средний потерянный TP: ${(totalPnlLost / tpLikelyClosedByTimeExit.length).toFixed(2)}R`);

// ========================================
// СРАВНЕНИЕ С ВЫГОДОЙ ОТ ИЗБЕЖАНИЯ SL
// ========================================
console.log(`\n\n${'='.repeat(80)}`);
console.log('⚖️  БАЛАНС: ВЫГОДА vs ПОТЕРИ');
console.log('='.repeat(80));

// Из предыдущего анализа: 95 "застрявших" стоплоссов (50.3%)
// Каждый стоплосс = -1.0R
const slAvoided = 95; // Из analyze_sideways_correct.ts
const slAvoidedR = slAvoided * 1.0; // Каждый SL = -1.0R

console.log(`\n💡 ИЗ ПРЕДЫДУЩЕГО АНАЛИЗА:`);
console.log(`   "Застрявшие" стоплоссы (MFE < 0.5R): 95 сделок`);
console.log(`   Каждый стоплосс: -1.0R`);
console.log(`   Потенциально избежали: ${slAvoidedR.toFixed(1)}R потерь`);

console.log(`\n📊 БАЛАНС TIME-BASED EXIT:`);
console.log(`   ✅ Избежали потерь: +${slAvoidedR.toFixed(1)}R (95 SL по -1.0R каждый)`);
console.log(`   ❌ Потеряли профит: -${totalPnlLost.toFixed(1)}R (${tpLikelyClosedByTimeExit.length} TP)`);
console.log(`   📊 ЧИСТАЯ ВЫГОДА: ${(slAvoidedR - totalPnlLost).toFixed(1)}R`);

const netBenefit = slAvoidedR - totalPnlLost;
if (netBenefit > 0) {
  console.log(`\n✅ ВЫВОД: Time-Based Exit ВЫГОДЕН (+${netBenefit.toFixed(1)}R)`);
} else {
  console.log(`\n❌ ВЫВОД: Time-Based Exit НЕВЫГОДЕН (${netBenefit.toFixed(1)}R)`);
}

// ========================================
// РЕКОМЕНДАЦИИ
// ========================================
console.log(`\n\n${'='.repeat(80)}`);
console.log('💡 РЕКОМЕНДАЦИИ');
console.log('='.repeat(80));

console.log(`\n⚠️  ВАЖНОЕ ЗАМЕЧАНИЕ:`);
console.log(`Этот анализ основан на MAE (максимальный минус), а не на реальном MFE через 2 часа.`);
console.log(`Для точного анализа нужны данные о движении цены в первые 2 часа после входа.`);

console.log(`\n📊 ТЕКУЩИЕ НАХОДКИ:`);
console.log(`1. Приблизительно ${(tpLikelyClosedByTimeExit.length/takeprofits.length*100).toFixed(1)}% успешных TP имели MAE < -0.5R`);
console.log(`2. Это ${tpLikelyClosedByTimeExit.length} сделок с общим профитом ${totalPnlLost.toFixed(1)}R`);
console.log(`3. Но избежание 95 SL даст +${slAvoidedR.toFixed(1)}R`);
console.log(`4. Чистая выгода: ${netBenefit > 0 ? '+' : ''}${netBenefit.toFixed(1)}R`);

if (netBenefit > 0) {
  console.log(`\n✅ РЕКОМЕНДАЦИЯ: Внедрить Time-Based Exit`);
  console.log(`   Даже с потерей ${tpLikelyClosedByTimeExit.length} TP, общая выгода составит +${netBenefit.toFixed(1)}R`);
} else {
  console.log(`\n⚠️  РЕКОМЕНДАЦИЯ: Нужны дополнительные данные для принятия решения`);
  console.log(`   Текущий анализ показывает потенциальный убыток ${netBenefit.toFixed(1)}R`);
}
