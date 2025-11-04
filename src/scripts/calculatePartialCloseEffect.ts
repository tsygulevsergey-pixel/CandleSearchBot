import * as fs from 'fs';

interface SignalData {
  id: string;
  symbol: string;
  status: string;
  mfe_r: string;
}

function parseCSV(filePath: string): SignalData[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');
  
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj: any = {};
    headers.forEach((header, i) => {
      obj[header] = values[i] || '';
    });
    return obj as SignalData;
  });
}

function calculatePartialCloseEffect(tpData: SignalData[], slData: SignalData[]) {
  console.log('\n💰 ============================================');
  console.log('   РЕАЛЬНЫЙ РАСЧЕТ: PARTIAL CLOSE ЭФФЕКТ');
  console.log('   ============================================\n');
  
  // Current P&L
  const currentTPProfit = tpData.length * 2; // Each TP = 2R
  const currentSLLoss = slData.length * 1;   // Each SL = -1R
  const currentTotal = currentTPProfit - currentSLLoss;
  
  console.log(`📊 ТЕКУЩЕЕ СОСТОЯНИЕ (без partial close):\n`);
  console.log(`   TP сигналов: ${tpData.length} × 2R = +${currentTPProfit}R`);
  console.log(`   SL сигналов: ${slData.length} × -1R = -${currentSLLoss}R`);
  console.log(`   ИТОГО: +${currentTotal}R\n`);
  
  // Analyze TP signals - how many reached 1.5R?
  const tpReached15R = tpData.filter(d => {
    const mfe = parseFloat(d.mfe_r);
    return !isNaN(mfe) && mfe >= 1.5;
  });
  
  const tpNotReached15R = tpData.filter(d => {
    const mfe = parseFloat(d.mfe_r);
    return isNaN(mfe) || mfe < 1.5;
  });
  
  console.log(`📊 TP СИГНАЛЫ - Анализ MFE:\n`);
  console.log(`   Дошли до ≥1.5R:     ${tpReached15R.length}/${tpData.length} (${(tpReached15R.length/tpData.length*100).toFixed(1)}%)`);
  console.log(`   НЕ дошли до 1.5R:   ${tpNotReached15R.length}/${tpData.length} (${(tpNotReached15R.length/tpData.length*100).toFixed(1)}%)`);
  
  // Analyze SL signals - how many reached 1.5R?
  const slReached15R = slData.filter(d => {
    const mfe = parseFloat(d.mfe_r);
    return !isNaN(mfe) && mfe >= 1.5;
  });
  
  const slNotReached15R = slData.filter(d => {
    const mfe = parseFloat(d.mfe_r);
    return isNaN(mfe) || mfe < 1.5;
  });
  
  console.log(`\n📊 SL СИГНАЛЫ - Анализ MFE:\n`);
  console.log(`   Дошли до ≥1.5R:     ${slReached15R.length}/${slData.length} (${(slReached15R.length/slData.length*100).toFixed(1)}%)`);
  console.log(`   НЕ дошли до 1.5R:   ${slNotReached15R.length}/${slData.length} (${(slNotReached15R.length/slData.length*100).toFixed(1)}%)`);
  
  // Calculate partial close P&L
  console.log(`\n\n💰 РАСЧЕТ С PARTIAL CLOSE (закрыть 50% на 1.5R):\n`);
  
  // TP signals that reached 1.5R
  // - Close 50% at 1.5R = +0.75R
  // - Close 50% at 2R = +1R
  // - Total = 1.75R per signal
  const tpReached15RProfit = tpReached15R.length * 1.75;
  console.log(`   TP дошедшие до 1.5R:`);
  console.log(`     ${tpReached15R.length} × 1.75R = +${tpReached15RProfit.toFixed(1)}R`);
  console.log(`     (50% на 1.5R + 50% на 2R)`);
  
  // TP signals that did NOT reach 1.5R
  // - No partial close, full TP at 2R
  const tpNotReached15RProfit = tpNotReached15R.length * 2;
  console.log(`\n   TP НЕ дошедшие до 1.5R:`);
  console.log(`     ${tpNotReached15R.length} × 2R = +${tpNotReached15RProfit.toFixed(1)}R`);
  console.log(`     (полный TP)`);
  
  // SL signals that reached 1.5R
  // - Close 50% at 1.5R = +0.75R
  // - Close 50% at SL = -0.5R
  // - Total = +0.25R per signal
  const slReached15RProfit = slReached15R.length * 0.25;
  console.log(`\n   SL дошедшие до 1.5R:`);
  console.log(`     ${slReached15R.length} × 0.25R = +${slReached15RProfit.toFixed(1)}R`);
  console.log(`     (50% на 1.5R, 50% на SL)`);
  
  // SL signals that did NOT reach 1.5R
  // - Full SL = -1R
  const slNotReached15RLoss = slNotReached15R.length * -1;
  console.log(`\n   SL НЕ дошедшие до 1.5R:`);
  console.log(`     ${slNotReached15R.length} × -1R = ${slNotReached15RLoss.toFixed(1)}R`);
  console.log(`     (полный SL)`);
  
  // Total with partial close
  const newTotal = tpReached15RProfit + tpNotReached15RProfit + slReached15RProfit + slNotReached15RLoss;
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 ИТОГО С PARTIAL CLOSE:\n`);
  console.log(`   TP (дошли 1.5R):     +${tpReached15RProfit.toFixed(1)}R`);
  console.log(`   TP (не дошли 1.5R):  +${tpNotReached15RProfit.toFixed(1)}R`);
  console.log(`   SL (дошли 1.5R):     +${slReached15RProfit.toFixed(1)}R`);
  console.log(`   SL (не дошли 1.5R):  ${slNotReached15RLoss.toFixed(1)}R`);
  console.log(`   ────────────────────────────────`);
  console.log(`   ОБЩИЙ ПРОФИТ:        +${newTotal.toFixed(1)}R\n`);
  
  // Comparison
  const difference = newTotal - currentTotal;
  
  console.log(`${'='.repeat(60)}`);
  console.log(`🎯 СРАВНЕНИЕ:\n`);
  console.log(`   БЕЗ partial close:   +${currentTotal}R`);
  console.log(`   С partial close:     +${newTotal.toFixed(1)}R`);
  console.log(`   ────────────────────────────────`);
  
  if (difference > 0) {
    console.log(`   УЛУЧШЕНИЕ:           +${difference.toFixed(1)}R ✅`);
    console.log(`   Процент:             +${(difference/currentTotal*100).toFixed(1)}%\n`);
  } else {
    console.log(`   УХУДШЕНИЕ:           ${difference.toFixed(1)}R ❌`);
    console.log(`   Процент:             ${(difference/currentTotal*100).toFixed(1)}%\n`);
  }
  
  // Detailed breakdown
  console.log(`${'='.repeat(60)}`);
  console.log(`📋 ДЕТАЛЬНАЯ РАЗБИВКА:\n`);
  
  const tpLossFromPartial = (tpReached15R.length * 2) - tpReached15RProfit;
  const slGainFromPartial = slReached15RProfit - (slReached15R.length * -1);
  
  console.log(`   Потеря на TP сигналах (из-за partial close):`);
  console.log(`     ${tpReached15R.length} сигналов × 0.25R = -${tpLossFromPartial.toFixed(1)}R\n`);
  
  console.log(`   Выигрыш на SL сигналах (спасены partial close):`);
  console.log(`     ${slReached15R.length} сигналов × 1.25R = +${slGainFromPartial.toFixed(1)}R\n`);
  
  console.log(`   Чистый эффект: ${slGainFromPartial.toFixed(1)}R - ${tpLossFromPartial.toFixed(1)}R = ${difference > 0 ? '+' : ''}${difference.toFixed(1)}R\n`);
  
  // Verdict
  console.log(`${'='.repeat(60)}`);
  console.log(`💡 ВЕРДИКТ:\n`);
  
  if (difference > 5) {
    console.log(`   ✅ СТОИТ ПРИМЕНЯТЬ!`);
    console.log(`   Partial close улучшает результат на ${difference.toFixed(1)}R.\n`);
  } else if (difference > 0) {
    console.log(`   ⚠️  СЛАБЫЙ ЭФФЕКТ`);
    console.log(`   Улучшение всего ${difference.toFixed(1)}R (${(difference/currentTotal*100).toFixed(1)}%).\n`);
  } else {
    console.log(`   ❌ НЕ СТОИТ ПРИМЕНЯТЬ!`);
    console.log(`   Partial close УХУДШАЕТ результат на ${Math.abs(difference).toFixed(1)}R.\n`);
  }
}

// Main
const tpFile = process.argv[2];
const slFile = process.argv[3];

if (!tpFile || !slFile) {
  console.error('Usage: npx tsx calculatePartialCloseEffect.ts <tp_file.csv> <sl_file.csv>');
  process.exit(1);
}

const tpData = parseCSV(tpFile);
const slData = parseCSV(slFile);

calculatePartialCloseEffect(tpData, slData);

console.log('✅ Расчет завершен!\n');
