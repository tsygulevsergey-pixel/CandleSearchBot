import * as fs from 'fs';

interface SignalData {
  entry_price: string;
  sl_price: string;
  tp1_price: string;
  atr_15m: string;
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

function analyzeSlSizes(data: SignalData[], label: string) {
  console.log('\n' + '='.repeat(60));
  console.log(`📊 АНАЛИЗ РАЗМЕРА STOP-LOSS (${label})`);
  console.log('='.repeat(60) + '\n');
  
  const slPercents: number[] = [];
  const slAtrMultiples: number[] = [];
  const tpPercents: number[] = [];
  
  for (const row of data) {
    try {
      const entry = parseFloat(row.entry_price);
      const sl = parseFloat(row.sl_price);
      const tp1 = parseFloat(row.tp1_price);
      const atr = parseFloat(row.atr_15m);
      
      if (isNaN(entry) || isNaN(sl)) continue;
      
      // SL distance in %
      const slDistPercent = Math.abs((sl - entry) / entry * 100);
      slPercents.push(slDistPercent);
      
      // TP distance in %
      if (!isNaN(tp1)) {
        const tpDistPercent = Math.abs((tp1 - entry) / entry * 100);
        tpPercents.push(tpDistPercent);
      }
      
      // SL distance in ATR multiples
      if (!isNaN(atr) && atr > 0) {
        const slDistAbs = Math.abs(sl - entry);
        const atrMultiple = slDistAbs / atr;
        slAtrMultiples.push(atrMultiple);
      }
    } catch (e) {
      continue;
    }
  }
  
  if (slPercents.length === 0) {
    console.log('⚠️  Нет данных для анализа\n');
    return;
  }
  
  // Stats for SL %
  const avgSlPercent = slPercents.reduce((a, b) => a + b, 0) / slPercents.length;
  const medianSlPercent = [...slPercents].sort((a, b) => a - b)[Math.floor(slPercents.length / 2)];
  const minSlPercent = Math.min(...slPercents);
  const maxSlPercent = Math.max(...slPercents);
  
  console.log(`📍 РАЗМЕР СТОП-ЛОССА В %:`);
  console.log(`   Среднее:  ${avgSlPercent.toFixed(3)}%`);
  console.log(`   Медиана:  ${medianSlPercent.toFixed(3)}%`);
  console.log(`   Min/Max:  ${minSlPercent.toFixed(3)}% / ${maxSlPercent.toFixed(3)}%`);
  console.log(`   Всего:    ${slPercents.length} сигналов\n`);
  
  // Distribution
  console.log(`📊 РАСПРЕДЕЛЕНИЕ SL ПО %:`);
  const ranges = [[0, 1], [1, 2], [2, 3], [3, 5], [5, 10]] as const;
  for (const [low, high] of ranges) {
    const count = slPercents.filter(x => x >= low && x < high).length;
    const pct = (count / slPercents.length * 100);
    console.log(`   ${low}-${high}%: ${count.toString().padStart(3)} (${pct.toFixed(1)}%)`);
  }
  
  // Stats for SL ATR multiples
  if (slAtrMultiples.length > 0) {
    const avgAtrMult = slAtrMultiples.reduce((a, b) => a + b, 0) / slAtrMultiples.length;
    const medianAtrMult = [...slAtrMultiples].sort((a, b) => a - b)[Math.floor(slAtrMultiples.length / 2)];
    const minAtrMult = Math.min(...slAtrMultiples);
    const maxAtrMult = Math.max(...slAtrMultiples);
    
    console.log(`\n💨 РАЗМЕР SL В ATR МУЛЬТИПЛИКАТОРАХ:`);
    console.log(`   Среднее:  ${avgAtrMult.toFixed(2)} ATR`);
    console.log(`   Медиана:  ${medianAtrMult.toFixed(2)} ATR`);
    console.log(`   Min/Max:  ${minAtrMult.toFixed(2)} ATR / ${maxAtrMult.toFixed(2)} ATR\n`);
    
    // ATR distribution
    console.log(`📊 РАСПРЕДЕЛЕНИЕ SL ПО ATR:`);
    const atrRanges = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 10]] as const;
    for (const [low, high] of atrRanges) {
      const count = slAtrMultiples.filter(x => x >= low && x < high).length;
      const pct = (count / slAtrMultiples.length * 100);
      console.log(`   ${low}-${high} ATR: ${count.toString().padStart(3)} (${pct.toFixed(1)}%)`);
    }
  }
  
  // TP distance stats
  if (tpPercents.length > 0) {
    const avgTpPercent = tpPercents.reduce((a, b) => a + b, 0) / tpPercents.length;
    const medianTpPercent = [...tpPercents].sort((a, b) => a - b)[Math.floor(tpPercents.length / 2)];
    
    console.log(`\n🎯 РАЗМЕР TP1 В %:`);
    console.log(`   Среднее:  ${avgTpPercent.toFixed(3)}%`);
    console.log(`   Медиана:  ${medianTpPercent.toFixed(3)}%`);
    
    // Calculate RR ratio
    const avgRR = avgTpPercent / avgSlPercent;
    console.log(`\n📊 СООТНОШЕНИЕ TP1/SL:`);
    console.log(`   Avg TP1: ${avgTpPercent.toFixed(3)}% / Avg SL: ${avgSlPercent.toFixed(3)}%`);
    console.log(`   R:R = ${avgRR.toFixed(2)}:1`);
  }
}

// Main
const tpFile = process.argv[2];
const slFile = process.argv[3];

if (!tpFile || !slFile) {
  console.error('Usage: npx tsx analyzeSlSizes.ts <tp_file.csv> <sl_file.csv>');
  process.exit(1);
}

const tpData = parseCSV(tpFile);
const slData = parseCSV(slFile);

analyzeSlSizes(tpData, 'TAKE-PROFIT SIGNALS');
analyzeSlSizes(slData, 'STOP-LOSS SIGNALS');

console.log('\n' + '='.repeat(60));
console.log('💡 ВЫВОДЫ:');
console.log('='.repeat(60) + '\n');

console.log('1. Сравните средний размер SL в % между TP и SL сигналами');
console.log('2. Сравните средний ATR мультипликатор');
console.log('3. Если SL использует 2.0-3.0 ATR, увеличение до 1.3-1.5 ATR');
console.log('   НЕ ИМЕЕТ СМЫСЛА (уже больше!)');
console.log('');
console.log('✅ Анализ завершен!\n');
