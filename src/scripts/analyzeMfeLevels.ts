import * as fs from 'fs';

interface SignalData {
  id: string;
  symbol: string;
  status: string;
  mfe_r: string;
  time_to_sl_min: string;
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

function analyzeMfeLevels(tpData: SignalData[], slData: SignalData[]) {
  console.log('\n📊 ============================================');
  console.log('   АНАЛИЗ MFE УРОВНЕЙ: 0.5R, 1R, 1.5R, 2R');
  console.log('   ============================================\n');
  
  const levels = [
    { name: '0.5R', threshold: 0.5 },
    { name: '1.0R', threshold: 1.0 },
    { name: '1.5R', threshold: 1.5 },
    { name: '2.0R (TP1)', threshold: 2.0 },
  ];
  
  console.log('📊 SL СИГНАЛЫ - Сколько дошло до каждого уровня:\n');
  
  console.log('   Уровень  | Достигли | %      | Потенциал с partial close');
  console.log('   ---------|----------|--------|----------------------------------');
  
  for (const level of levels) {
    const reached = slData.filter(d => {
      const mfe = parseFloat(d.mfe_r);
      return !isNaN(mfe) && mfe >= level.threshold;
    });
    
    const percentage = (reached.length / slData.length * 100).toFixed(1);
    
    // Calculate potential with partial close at this level
    // If we close 50% at this level:
    // - Gain: 50% × level.threshold
    // - Loss: 50% × -1R
    // - Net: 50% × (level.threshold - 1R)
    const gainPerSignal = (level.threshold * 0.5) - 0.5;
    const totalGain = reached.length * gainPerSignal;
    
    console.log(`   ${level.name.padEnd(8)} | ${reached.length.toString().padStart(8)} | ${percentage.padStart(5)}% | +${totalGain.toFixed(1)}R (50% partial close)`);
  }
  
  console.log('\n\n📊 TP СИГНАЛЫ - Сколько дошло до каждого уровня:\n');
  
  console.log('   Уровень  | Достигли | %      | Потеря с partial close');
  console.log('   ---------|----------|--------|----------------------------------');
  
  for (const level of levels) {
    const reached = tpData.filter(d => {
      const mfe = parseFloat(d.mfe_r);
      return !isNaN(mfe) && mfe >= level.threshold;
    });
    
    const percentage = (reached.length / tpData.length * 100).toFixed(1);
    
    // Calculate loss with partial close at this level
    // Current: full 2R
    // With partial: 50% at level.threshold + 50% at 2R = (level.threshold + 2) / 2
    // Loss: 2 - ((level.threshold + 2) / 2) = (2 - level.threshold) / 2
    const lossPerSignal = (2 - level.threshold) / 2;
    const totalLoss = reached.length * lossPerSignal;
    
    console.log(`   ${level.name.padEnd(8)} | ${reached.length.toString().padStart(8)} | ${percentage.padStart(5)}% | -${totalLoss.toFixed(1)}R (50% partial close)`);
  }
  
  // Calculate net effect for each level
  console.log('\n\n💰 ============================================');
  console.log('   ЧИСТЫЙ ЭФФЕКТ PARTIAL CLOSE НА РАЗНЫХ УРОВНЯХ');
  console.log('   ============================================\n');
  
  console.log('   Уровень  | Выигрыш (SL) | Потеря (TP) | ИТОГО   | Вердикт');
  console.log('   ---------|--------------|-------------|---------|------------------');
  
  const results: Array<{level: string; netEffect: number}> = [];
  
  for (const level of levels) {
    const slReached = slData.filter(d => {
      const mfe = parseFloat(d.mfe_r);
      return !isNaN(mfe) && mfe >= level.threshold;
    });
    
    const tpReached = tpData.filter(d => {
      const mfe = parseFloat(d.mfe_r);
      return !isNaN(mfe) && mfe >= level.threshold;
    });
    
    // SL gain
    const slGainPerSignal = (level.threshold * 0.5) - 0.5;
    const slTotalGain = slReached.length * slGainPerSignal;
    
    // TP loss
    const tpLossPerSignal = (2 - level.threshold) / 2;
    const tpTotalLoss = tpReached.length * tpLossPerSignal;
    
    const netEffect = slTotalGain - tpTotalLoss;
    
    const verdict = netEffect > 40 ? '🔥 ОТЛИЧНО' : 
                   netEffect > 20 ? '✅ ХОРОШО' :
                   netEffect > 0 ? '⚠️  СЛАБО' : '❌ ПЛОХО';
    
    console.log(`   ${level.name.padEnd(8)} | ${slTotalGain.toFixed(1).padStart(12)}R | ${tpTotalLoss.toFixed(1).padStart(11)}R | ${netEffect > 0 ? '+' : ''}${netEffect.toFixed(1).padStart(7)}R | ${verdict}`);
    
    results.push({ level: level.name, netEffect });
  }
  
  // Find best level
  const best = results.reduce((a, b) => a.netEffect > b.netEffect ? a : b);
  
  console.log('\n\n🎯 ============================================');
  console.log('   РЕКОМЕНДАЦИЯ');
  console.log('   ============================================\n');
  
  console.log(`   ⭐ ЛУЧШИЙ УРОВЕНЬ: ${best.level}`);
  console.log(`   📈 Улучшение: +${best.netEffect.toFixed(1)}R\n`);
  
  if (best.netEffect > 40) {
    console.log(`   ✅ ПРИМЕНЯТЬ! Значительное улучшение результата.\n`);
  } else if (best.netEffect > 20) {
    console.log(`   ✅ СТОИТ ПРИМЕНИТЬ. Хорошее улучшение.\n`);
  } else if (best.netEffect > 0) {
    console.log(`   ⚠️  Слабый эффект, но положительный.\n`);
  }
  
  // Detailed breakdown for best level
  console.log('\n📋 ============================================');
  console.log(`   ДЕТАЛИ ДЛЯ ${best.level}`);
  console.log('   ============================================\n');
  
  const bestLevelData = levels.find(l => l.name === best.level)!;
  
  const slReachedBest = slData.filter(d => {
    const mfe = parseFloat(d.mfe_r);
    return !isNaN(mfe) && mfe >= bestLevelData.threshold;
  });
  
  const tpReachedBest = tpData.filter(d => {
    const mfe = parseFloat(d.mfe_r);
    return !isNaN(mfe) && mfe >= bestLevelData.threshold;
  });
  
  console.log(`   SL сигналы дошедшие до ${best.level}:`);
  console.log(`     Количество: ${slReachedBest.length}/${slData.length} (${(slReachedBest.length/slData.length*100).toFixed(1)}%)`);
  console.log(`     Сейчас:     ${slReachedBest.length} × -1R = -${slReachedBest.length}R`);
  
  const slNewProfit = slReachedBest.length * ((bestLevelData.threshold * 0.5) - 0.5);
  console.log(`     С partial:  ${slReachedBest.length} × +${((bestLevelData.threshold * 0.5) - 0.5).toFixed(2)}R = +${slNewProfit.toFixed(1)}R`);
  console.log(`     Выигрыш:    +${(slNewProfit + slReachedBest.length).toFixed(1)}R\n`);
  
  console.log(`   TP сигналы дошедшие до ${best.level}:`);
  console.log(`     Количество: ${tpReachedBest.length}/${tpData.length} (${(tpReachedBest.length/tpData.length*100).toFixed(1)}%)`);
  console.log(`     Сейчас:     ${tpReachedBest.length} × 2R = +${tpReachedBest.length * 2}R`);
  
  const tpNewProfit = tpReachedBest.length * ((bestLevelData.threshold + 2) / 2);
  console.log(`     С partial:  ${tpReachedBest.length} × ${((bestLevelData.threshold + 2) / 2).toFixed(2)}R = +${tpNewProfit.toFixed(1)}R`);
  console.log(`     Потеря:     -${(tpReachedBest.length * 2 - tpNewProfit).toFixed(1)}R\n`);
}

// Main
const tpFile = process.argv[2];
const slFile = process.argv[3];

if (!tpFile || !slFile) {
  console.error('Usage: npx tsx analyzeMfeLevels.ts <tp_file.csv> <sl_file.csv>');
  process.exit(1);
}

const tpData = parseCSV(tpFile);
const slData = parseCSV(slFile);

analyzeMfeLevels(tpData, slData);

console.log('✅ Анализ уровней завершен!\n');
