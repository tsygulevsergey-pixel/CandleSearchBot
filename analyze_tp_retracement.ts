import * as fs from 'fs';

/**
 * Анализ TP сделок: сколько дошли до 1R, вернулись к entry, потом дошли до 2R?
 * Это критично для trailing stop в breakeven!
 */

interface TPRow {
  symbol: string;
  direction: string;
  pattern_type: string;
  mfe_r: string;  // Maximum Favorable Excursion (максимальная прибыль)
  mae_r: string;  // Maximum Adverse Excursion (максимальный убыток)
  pnl_r: string;  // Финальный результат
  exit_type: string;
  signal_time: string;
}

// Читаем TP данные
const tpCsv = fs.readFileSync('attached_assets/takeprofits_export_1762447743545_1762447823237.csv', 'utf-8');
const tpLines = tpCsv.split('\n');
const tpHeaders = tpLines[0].split(',');

const tpData: TPRow[] = [];
for (let i = 1; i < tpLines.length; i++) {
  if (!tpLines[i].trim()) continue;
  const values = tpLines[i].split(',');
  const row: any = {};
  tpHeaders.forEach((header, index) => {
    row[header] = values[index] || '';
  });
  tpData.push(row as TPRow);
}

console.log('='.repeat(80));
console.log('🔍 АНАЛИЗ: Trailing Stop Breakeven - Сколько TP убьём?');
console.log('='.repeat(80));

console.log(`\nВсего TP сделок: ${tpData.length}`);

// Фильтруем только успешные TP (pnl_r > 0)
const successfulTPs = tpData.filter(t => {
  const pnl = parseFloat(t.pnl_r);
  return !isNaN(pnl) && pnl > 0;
});

console.log(`Успешных TP (pnl > 0): ${successfulTPs.length}`);

console.log('\n' + '='.repeat(80));
console.log('📊 КАТЕГОРИИ TP СДЕЛОК:');
console.log('='.repeat(80));

// Категория 1: Прямой путь к TP (MFE ≈ PNL, MAE близко к 0)
// Эти сделки НЕ пострадают от trailing stop
const directToTP = successfulTPs.filter(t => {
  const mfe = parseFloat(t.mfe_r);
  const mae = parseFloat(t.mae_r);
  const pnl = parseFloat(t.pnl_r);
  
  if (isNaN(mfe) || isNaN(mae) || isNaN(pnl)) return false;
  
  // MFE ≈ PNL (не было большого отката после максимума)
  const mfeToPnlDiff = Math.abs(mfe - pnl);
  
  // MAE небольшой (не уходили сильно в минус)
  return mfeToPnlDiff < 0.3 && mae > -0.5;
});

// Категория 2: Дошли до 1R+, вернулись к entry/ниже, потом TP
// ЭТИ СДЕЛКИ УБЬЁТ TRAILING STOP!
const retracedToEntry = successfulTPs.filter(t => {
  const mfe = parseFloat(t.mfe_r);
  const mae = parseFloat(t.mae_r);
  const pnl = parseFloat(t.pnl_r);
  
  if (isNaN(mfe) || isNaN(mae) || isNaN(pnl)) return false;
  
  // MFE ≥ 1.0R (дошли до 1R или больше)
  // MAE ≤ 0 (вернулись к entry или ниже ПОСЛЕ достижения MFE)
  // PNL > 0 (в итоге всё равно TP)
  return mfe >= 1.0 && mae <= 0.0 && pnl > 0;
});

// Категория 3: Дошли до 1R+, небольшой откат (<0.5R), потом TP
// Эти сделки МОГУТ быть убиты, зависит от глубины отката
const smallRetracement = successfulTPs.filter(t => {
  const mfe = parseFloat(t.mfe_r);
  const mae = parseFloat(t.mae_r);
  const pnl = parseFloat(t.pnl_r);
  
  if (isNaN(mfe) || isNaN(mae) || isNaN(pnl)) return false;
  
  // MFE ≥ 1.0R
  // MAE от -0.5R до 0R (небольшой откат)
  // PNL > 0
  return mfe >= 1.0 && mae > -0.5 && mae <= 0.0 && pnl > 0;
});

// Категория 4: Не дошли до 1R, но дошли до TP
// Эти НЕ пострадают от trailing stop (не активируется)
const noReach1R = successfulTPs.filter(t => {
  const mfe = parseFloat(t.mfe_r);
  const pnl = parseFloat(t.pnl_r);
  
  if (isNaN(mfe) || isNaN(pnl)) return false;
  
  return mfe < 1.0 && pnl > 0;
});

console.log('\n1️⃣ ПРЯМОЙ ПУТЬ К TP (безопасны для trailing stop):');
console.log(`   Количество: ${directToTP.length} (${(directToTP.length / successfulTPs.length * 100).toFixed(1)}%)`);
console.log(`   Описание: MFE ≈ PNL, MAE > -0.5R (не было сильных откатов)`);

console.log('\n2️⃣ ОТКАТ К ENTRY ПОСЛЕ 1R (УБЬЁТ trailing stop): 🔴');
console.log(`   Количество: ${retracedToEntry.length} (${(retracedToEntry.length / successfulTPs.length * 100).toFixed(1)}%)`);
console.log(`   Описание: MFE ≥ 1.0R, MAE ≤ 0R (вернулись к entry/ниже), PNL > 0`);
console.log(`   ⚠️ ЭТИ TP ПОТЕРЯЕМ с trailing stop в breakeven!`);

console.log('\n3️⃣ НЕБОЛЬШОЙ ОТКАТ ПОСЛЕ 1R (может убить): ⚠️');
console.log(`   Количество: ${smallRetracement.length} (${(smallRetracement.length / successfulTPs.length * 100).toFixed(1)}%)`);
console.log(`   Описание: MFE ≥ 1.0R, MAE от -0.5R до 0R, PNL > 0`);
console.log(`   ⚠️ Часть этих TP может быть потеряна (зависит от точного отката)`);

console.log('\n4️⃣ НЕ ДОШЛИ ДО 1R (trailing stop не активируется):');
console.log(`   Количество: ${noReach1R.length} (${(noReach1R.length / successfulTPs.length * 100).toFixed(1)}%)`);
console.log(`   Описание: MFE < 1.0R, PNL > 0`);
console.log(`   ✅ Безопасны (trailing stop не сработает)`);

console.log('\n' + '='.repeat(80));
console.log('🎯 ИТОГО: ВЛИЯНИЕ TRAILING STOP НА TP');
console.log('='.repeat(80));

const totalKilled = retracedToEntry.length;
const maybeKilled = smallRetracement.length;
const totalSafe = directToTP.length + noReach1R.length;

console.log(`\n📊 Из ${successfulTPs.length} успешных TP:`);
console.log(`  🔴 ТОЧНО УБЬЁМ: ${totalKilled} (${(totalKilled / successfulTPs.length * 100).toFixed(1)}%)`);
console.log(`  ⚠️ МОЖЕТ УБИТЬ: ${maybeKilled} (${(maybeKilled / successfulTPs.length * 100).toFixed(1)}%)`);
console.log(`  ✅ БЕЗОПАСНЫ: ${totalSafe} (${(totalSafe / successfulTPs.length * 100).toFixed(1)}%)`);

console.log(`\n💡 ПРОГНОЗ С TRAILING STOP В BREAKEVEN ПРИ 1.0R:`);
const worstCase = successfulTPs.length - totalKilled - maybeKilled;
const bestCase = successfulTPs.length - totalKilled;

console.log(`  • Лучший случай (только категория 2): потеряем ${totalKilled} TP`);
console.log(`  • Худший случай (категории 2+3): потеряем ${totalKilled + maybeKilled} TP`);
console.log(`  • Останется TP: ${bestCase} - ${worstCase}`);

console.log('\n' + '='.repeat(80));
console.log('📋 ПРИМЕРЫ СДЕЛОК С ОТКАТОМ К ENTRY (категория 2):');
console.log('='.repeat(80));

if (retracedToEntry.length > 0) {
  console.log('\nПервые 10 примеров:');
  for (let i = 0; i < Math.min(10, retracedToEntry.length); i++) {
    const t = retracedToEntry[i];
    const mfe = parseFloat(t.mfe_r);
    const mae = parseFloat(t.mae_r);
    const pnl = parseFloat(t.pnl_r);
    
    console.log(`\n${i + 1}. ${t.symbol} ${t.direction} (${t.pattern_type})`);
    console.log(`   MFE: ${mfe.toFixed(2)}R, MAE: ${mae.toFixed(2)}R, PNL: ${pnl.toFixed(2)}R`);
    console.log(`   Время: ${t.signal_time}`);
    console.log(`   ❌ Был бы закрыт в breakeven вместо +${pnl.toFixed(2)}R`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('🔍 АЛЬТЕРНАТИВНЫЕ ВАРИАНТЫ TRAILING STOP:');
console.log('='.repeat(80));

console.log('\n1️⃣ Trailing Stop при 1.5R (вместо 1.0R):');
const retraced1_5R = successfulTPs.filter(t => {
  const mfe = parseFloat(t.mfe_r);
  const mae = parseFloat(t.mae_r);
  const pnl = parseFloat(t.pnl_r);
  
  if (isNaN(mfe) || isNaN(mae) || isNaN(pnl)) return false;
  
  return mfe >= 1.5 && mae <= 0.0 && pnl > 0;
});
console.log(`   Потеряем TP: ${retraced1_5R.length} (вместо ${totalKilled} при 1.0R)`);

console.log('\n2️⃣ Trailing Stop при 1.0R → 0.5R (не в breakeven, а 0.5R profit):');
const retraced0_5R = successfulTPs.filter(t => {
  const mfe = parseFloat(t.mfe_r);
  const mae = parseFloat(t.mae_r);
  const pnl = parseFloat(t.pnl_r);
  
  if (isNaN(mfe) || isNaN(mae) || isNaN(pnl)) return false;
  
  return mfe >= 1.0 && mae <= -0.5 && pnl > 0;
});
console.log(`   Потеряем TP: ${retraced0_5R.length} (вместо ${totalKilled} при breakeven)`);

console.log('\n3️⃣ Частичная фиксация при 1.0R (50% позиции):');
console.log(`   Потеряем TP: 0 (частичная фиксация не убивает сделку)`);
console.log(`   Но прибыль будет меньше: 1.0R + 0.5*(PNL-1.0R) вместо полного PNL`);

console.log('\n✅ АНАЛИЗ ЗАВЕРШЕН');
console.log('='.repeat(80));
