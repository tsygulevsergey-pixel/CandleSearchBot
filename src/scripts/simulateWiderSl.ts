import * as fs from 'fs';

interface SignalData {
  id: string;
  entry_price: string;
  sl_price: string;
  tp1_price: string;
  tp2_price: string;
  clearance_15m: string;
  clearance_1h: string;
  atr_15m: string;
  r_available: string;
  status: string;
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

function simulateWiderSL(tpData: SignalData[], slData: SignalData[]) {
  console.log('🔬 ============================================');
  console.log('   СИМУЛЯЦИЯ: УВЕЛИЧЕНИЕ SL → ВЛИЯНИЕ НА TP');
  console.log('   ============================================\n');
  
  const allData = [...tpData, ...slData];
  console.log(`📊 Всего сигналов: ${allData.length} (${tpData.length} TP + ${slData.length} SL)\n`);
  
  // Test different SL multipliers
  const multipliers = [1.0, 1.2, 1.3, 1.5, 2.0];
  
  for (const mult of multipliers) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔧 ТЕСТ: SL × ${mult.toFixed(1)} (TP тоже × ${mult.toFixed(1)})`);
    console.log(`${'='.repeat(60)}\n`);
    
    let willFitCount = 0;
    let tooWide = 0;
    let h1Veto = 0;
    let h4Veto = 0;
    let noDataCount = 0;
    
    for (const row of allData) {
      try {
        const entry = parseFloat(row.entry_price);
        const currentSL = parseFloat(row.sl_price);
        const currentTP1 = parseFloat(row.tp1_price);
        const clearance15m = parseFloat(row.clearance_15m);
        const clearance1h = parseFloat(row.clearance_1h);
        const atr15m = parseFloat(row.atr_15m);
        
        if (isNaN(entry) || isNaN(currentSL) || isNaN(currentTP1) || isNaN(atr15m)) {
          noDataCount++;
          continue;
        }
        
        // Calculate current R
        const currentR = Math.abs(currentSL - entry);
        
        // New R with multiplier
        const newR = currentR * mult;
        
        // New TP1 (2R from new SL)
        const newTP1Distance = newR * 2;
        
        // Check if new TP1 fits in clearance
        const clearance15mAbs = !isNaN(clearance15m) ? clearance15m : 999;
        const clearance1hAbs = !isNaN(clearance1h) ? clearance1h : 999;
        
        // Veto filters
        // H4 veto: clearance < 0.7 ATR1h (мы не знаем ATR1h, но предположим ~3× ATR15m)
        const atr1hEstimate = atr15m * 3;
        const h4Threshold = 0.7 * atr1hEstimate;
        
        // H1 veto: clearance < 1.0 ATR15m
        const h1Threshold = 1.0 * atr15m;
        
        // Check if TP1 fits
        if (clearance15mAbs !== 999 && newTP1Distance > clearance15mAbs) {
          tooWide++;
        } else if (clearance1hAbs !== 999 && clearance1hAbs < h4Threshold) {
          h4Veto++;
        } else if (clearance15mAbs !== 999 && clearance15mAbs < h1Threshold) {
          h1Veto++;
        } else {
          willFitCount++;
        }
      } catch (e) {
        noDataCount++;
        continue;
      }
    }
    
    const totalProcessed = allData.length - noDataCount;
    const rejectedCount = tooWide + h1Veto + h4Veto;
    
    console.log(`✅ Пройдет:         ${willFitCount}/${totalProcessed} (${(willFitCount/totalProcessed*100).toFixed(1)}%)`);
    console.log(`❌ Не поместится:  ${tooWide}/${totalProcessed} (${(tooWide/totalProcessed*100).toFixed(1)}%) - TP1 шире clearance`);
    console.log(`🚫 H1 veto:        ${h1Veto}/${totalProcessed} (${(h1Veto/totalProcessed*100).toFixed(1)}%)`);
    console.log(`🚫 H4 veto:        ${h4Veto}/${totalProcessed} (${(h4Veto/totalProcessed*100).toFixed(1)}%)`);
    console.log(`📊 ИТОГО отклонено: ${rejectedCount}/${totalProcessed} (${(rejectedCount/totalProcessed*100).toFixed(1)}%)`);
    
    if (mult === 1.0) {
      console.log(`\n💡 Базовая линия (текущее состояние)`);
    } else {
      const baselineRejected = 0; // We'll calculate this in first iteration
      const additionalRejected = rejectedCount;
      console.log(`\n⚠️  Дополнительно отклонено: ${additionalRejected} сигналов`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('💡 ВЫВОДЫ:');
  console.log('='.repeat(60) + '\n');
  
  console.log('1. При увеличении SL × 1.5, TP тоже × 1.5');
  console.log('2. Более широкий TP может не поместиться в clearance');
  console.log('3. Часть сигналов будет отклонена veto-фильтрами');
  console.log('4. Сравните количество отклоненных для разных множителей');
  console.log('');
}

// Main
const tpFile = process.argv[2];
const slFile = process.argv[3];

if (!tpFile || !slFile) {
  console.error('Usage: npx tsx simulateWiderSl.ts <tp_file.csv> <sl_file.csv>');
  process.exit(1);
}

const tpData = parseCSV(tpFile);
const slData = parseCSV(slFile);

simulateWiderSL(tpData, slData);

console.log('✅ Симуляция завершена!\n');
