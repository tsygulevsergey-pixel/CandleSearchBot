import * as fs from 'fs';
import * as path from 'path';

interface StopLossData {
  id: string;
  symbol: string;
  direction: string;
  pattern_type: string;
  pnl_r: string;
  context_trend_before: string;
  context_was_reversal: string;
  context_recent_direction: string;
  pattern_score: string;
  trend_alignment: string;
  clearance_15m: string;
  post_sl_outcome: string;
  post_sl_max_favorable_r: string;
  post_sl_time_to_tp_min: string;
  mfe_r: string;
  mae_r: string;
  time_to_sl_min: string;
  confluence_score: string;
  multi_tf_alignment: string;
  context_distance_from_ema: string;
}

function parseCSV(filePath: string): StopLossData[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');
  
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj: any = {};
    headers.forEach((header, i) => {
      obj[header] = values[i] || '';
    });
    return obj as StopLossData;
  });
}

function analyzeStopLosses(csvPath: string) {
  console.log('📊 ============================================');
  console.log('   ПОЛНЫЙ АНАЛИЗ СТОП-ЛОССОВ');
  console.log('   ============================================\n');
  
  const data = parseCSV(csvPath);
  const total = data.length;
  
  console.log(`📍 Всего сигналов со стоп-лоссом: ${total}\n`);
  
  // ========================================
  // 1. РАЗВОРОТ ПОСЛЕ СТОП-ЛОССА
  // ========================================
  console.log('🔄 КАТЕГОРИЯ 1: РАЗВОРОТ ПОСЛЕ СТОП-ЛОССА');
  console.log('   (Цена выбила SL, потом пошла в нашу сторону)\n');
  
  const reversalAfterSL = data.filter(d => 
    d.post_sl_outcome === 'reached_tp3' || 
    d.post_sl_outcome === 'went_further_against'
  );
  
  const reachedTP3 = data.filter(d => d.post_sl_outcome === 'reached_tp3');
  const wentAgainst = data.filter(d => d.post_sl_outcome === 'went_further_against');
  
  console.log(`   ❌ ЖЕСТОКИЕ РАЗВОРОТЫ (цена достигла TP3): ${reachedTP3.length} (${(reachedTP3.length/total*100).toFixed(1)}%)`);
  console.log(`   ⚠️  Продолжила против нас: ${wentAgainst.length} (${(wentAgainst.length/total*100).toFixed(1)}%)`);
  console.log(`   📊 Всего с разворотом: ${reversalAfterSL.length} (${(reversalAfterSL.length/total*100).toFixed(1)}%)\n`);
  
  if (reachedTP3.length > 0) {
    const avgFavorableR = reachedTP3
      .map(d => parseFloat(d.post_sl_max_favorable_r) || 0)
      .reduce((a, b) => a + b, 0) / reachedTP3.length;
    
    const avgTimeToTP = reachedTP3
      .map(d => parseFloat(d.post_sl_time_to_tp_min) || 0)
      .filter(t => t > 0)
      .reduce((a, b) => a + b, 0) / reachedTP3.filter(d => parseFloat(d.post_sl_time_to_tp_min) > 0).length;
    
    console.log(`   📈 Средняя прибыль если бы не выбило: ${avgFavorableR.toFixed(2)}R`);
    console.log(`   ⏱️  Среднее время до TP3: ${avgTimeToTP.toFixed(0)} минут\n`);
    
    // Топ-5 самых обидных
    const top5Painful = reachedTP3
      .map(d => ({
        symbol: d.symbol,
        direction: d.direction,
        pattern: d.pattern_type,
        favorableR: parseFloat(d.post_sl_max_favorable_r) || 0,
        timeToTP: parseFloat(d.post_sl_time_to_tp_min) || 0,
        trendAlign: d.trend_alignment,
        wasReversal: d.context_was_reversal,
        recentDir: d.context_recent_direction
      }))
      .sort((a, b) => b.favorableR - a.favorableR)
      .slice(0, 5);
    
    console.log('   🔥 ТОП-5 САМЫХ ОБИДНЫХ:');
    top5Painful.forEach((signal, i) => {
      console.log(`   ${i+1}. ${signal.symbol} ${signal.direction} (${signal.pattern})`);
      console.log(`      💰 Могли получить: ${signal.favorableR.toFixed(2)}R за ${signal.timeToTP}мин`);
      console.log(`      📊 Trend: ${signal.trendAlign}, Reversal: ${signal.wasReversal}, Recent: ${signal.recentDir}`);
    });
    console.log();
  }
  
  // ========================================
  // 2. НЕПРАВИЛЬНОЕ ОПРЕДЕЛЕНИЕ ТРЕНДА
  // ========================================
  console.log('📉 КАТЕГОРИЯ 2: ТОРГОВЛЯ ПРОТИВ ТРЕНДА');
  console.log('   (trend_alignment = "against")\n');
  
  const againstTrend = data.filter(d => d.trend_alignment === 'against');
  console.log(`   ❌ Сигналов против тренда: ${againstTrend.length} (${(againstTrend.length/total*100).toFixed(1)}%)\n`);
  
  if (againstTrend.length > 0) {
    const againstReversed = againstTrend.filter(d => 
      d.post_sl_outcome === 'reached_tp3' || d.post_sl_outcome === 'went_further_against'
    );
    console.log(`   🔄 Из них развернулось после SL: ${againstReversed.length} (${(againstReversed.length/againstTrend.length*100).toFixed(1)}%)`);
    console.log(`   ✅ Рекомендация: ПОЛНОСТЬЮ ОТКЛЮЧИТЬ сигналы против тренда!\n`);
  }
  
  // ========================================
  // 3. СИГНАЛЫ ПОСЛЕ РАЗВОРОТА
  // ========================================
  console.log('🔀 КАТЕГОРИЯ 3: СИГНАЛЫ ПОСЛЕ РАЗВОРОТА');
  console.log('   (context_was_reversal = "t")\n');
  
  const afterReversal = data.filter(d => d.context_was_reversal === 't');
  console.log(`   ⚠️  Сигналов после разворота: ${afterReversal.length} (${(afterReversal.length/total*100).toFixed(1)}%)\n`);
  
  if (afterReversal.length > 0) {
    const reversalReversed = afterReversal.filter(d => 
      d.post_sl_outcome === 'reached_tp3' || d.post_sl_outcome === 'went_further_against'
    );
    console.log(`   🔄 Из них развернулось после SL: ${reversalReversed.length} (${(reversalReversed.length/afterReversal.length*100).toFixed(1)}%)`);
    console.log(`   📊 Возможная причина: Слишком рано после разворота, нужна консолидация\n`);
  }
  
  // ========================================
  // 4. ПРОТИВОРЕЧИВЫЙ RECENT_DIRECTION
  // ========================================
  console.log('⚡ КАТЕГОРИЯ 4: ПРОТИВОРЕЧИВЫЙ ИМПУЛЬС');
  console.log('   (recent_direction противоречит направлению сигнала)\n');
  
  const contradictoryMomentum = data.filter(d => {
    if (d.direction === 'LONG' && d.context_recent_direction === 'bearish') return true;
    if (d.direction === 'SHORT' && d.context_recent_direction === 'bullish') return true;
    return false;
  });
  
  console.log(`   ❌ Противоречивых сигналов: ${contradictoryMomentum.length} (${(contradictoryMomentum.length/total*100).toFixed(1)}%)\n`);
  
  if (contradictoryMomentum.length > 0) {
    const contradReversed = contradictoryMomentum.filter(d => 
      d.post_sl_outcome === 'reached_tp3' || d.post_sl_outcome === 'went_further_against'
    );
    console.log(`   🔄 Из них развернулось после SL: ${contradReversed.length} (${(contradReversed.length/contradictoryMomentum.length*100).toFixed(1)}%)`);
    console.log(`   ✅ Рекомендация: ФИЛЬТРОВАТЬ сигналы с противоречивым импульсом!\n`);
  }
  
  // ========================================
  // 5. СЛАБЫЕ ПАТТЕРНЫ (pattern_score < 50)
  // ========================================
  console.log('💤 КАТЕГОРИЯ 5: СЛАБЫЕ ПАТТЕРНЫ');
  console.log('   (pattern_score < 50)\n');
  
  const weakPatterns = data.filter(d => {
    const score = parseFloat(d.pattern_score);
    return !isNaN(score) && score < 50;
  });
  
  console.log(`   ⚠️  Слабых паттернов: ${weakPatterns.length} (${(weakPatterns.length/total*100).toFixed(1)}%)\n`);
  
  if (weakPatterns.length > 0) {
    const weakReversed = weakPatterns.filter(d => 
      d.post_sl_outcome === 'reached_tp3' || d.post_sl_outcome === 'went_further_against'
    );
    console.log(`   🔄 Из них развернулось после SL: ${weakReversed.length} (${(weakReversed.length/weakPatterns.length*100).toFixed(1)}%)`);
    
    const avgScore = weakPatterns.reduce((sum, d) => sum + parseFloat(d.pattern_score), 0) / weakPatterns.length;
    console.log(`   📊 Средний pattern_score: ${avgScore.toFixed(1)}`);
    console.log(`   ✅ Рекомендация: Поднять минимальный порог pattern_score до 50+\n`);
  }
  
  // ========================================
  // 6. БЫСТРЫЕ СТОП-ЛОССЫ (<30 минут)
  // ========================================
  console.log('⚡ КАТЕГОРИЯ 6: БЫСТРЫЕ СТОП-ЛОССЫ');
  console.log('   (time_to_sl_min < 30)\n');
  
  const fastSLs = data.filter(d => {
    const time = parseFloat(d.time_to_sl_min);
    return !isNaN(time) && time < 30;
  });
  
  console.log(`   ❌ Быстрых стопов: ${fastSLs.length} (${(fastSLs.length/total*100).toFixed(1)}%)\n`);
  
  if (fastSLs.length > 0) {
    const fastReversed = fastSLs.filter(d => 
      d.post_sl_outcome === 'reached_tp3' || d.post_sl_outcome === 'went_further_against'
    );
    console.log(`   🔄 Из них развернулось после SL: ${fastReversed.length} (${(fastReversed.length/fastSLs.length*100).toFixed(1)}%)`);
    
    const avgTime = fastSLs.reduce((sum, d) => sum + parseFloat(d.time_to_sl_min), 0) / fastSLs.length;
    console.log(`   ⏱️  Среднее время до SL: ${avgTime.toFixed(0)} минут`);
    console.log(`   ✅ Рекомендация: Возможно нужен WIDER stop-loss для 15m TF\n`);
  }
  
  // ========================================
  // 7. МАЛЫЙ CLEARANCE (< 0.5R свободного пути)
  // ========================================
  console.log('🚧 КАТЕГОРИЯ 7: МАЛЫЙ СВОБОДНЫЙ ПУТЬ');
  console.log('   (clearance_15m < 0.005)\n');
  
  const lowClearance = data.filter(d => {
    const clearance = parseFloat(d.clearance_15m);
    return !isNaN(clearance) && clearance < 0.005;
  });
  
  console.log(`   ❌ С малым clearance: ${lowClearance.length} (${(lowClearance.length/total*100).toFixed(1)}%)\n`);
  
  if (lowClearance.length > 0) {
    const clearanceReversed = lowClearance.filter(d => 
      d.post_sl_outcome === 'reached_tp3' || d.post_sl_outcome === 'went_further_against'
    );
    console.log(`   🔄 Из них развернулось после SL: ${clearanceReversed.length} (${(clearanceReversed.length/lowClearance.length*100).toFixed(1)}%)`);
    console.log(`   ✅ Рекомендация: Требовать минимум 0.5R свободного пути\n`);
  }
  
  // ========================================
  // СВОДНАЯ СТАТИСТИКА
  // ========================================
  console.log('\n📊 ============================================');
  console.log('   СВОДНАЯ СТАТИСТИКА ПО ПРОБЛЕМАМ');
  console.log('   ============================================\n');
  
  const problems = [
    { name: 'Развороты после SL', count: reachedTP3.length, pct: reachedTP3.length/total*100 },
    { name: 'Против тренда', count: againstTrend.length, pct: againstTrend.length/total*100 },
    { name: 'После разворота', count: afterReversal.length, pct: afterReversal.length/total*100 },
    { name: 'Противоречивый импульс', count: contradictoryMomentum.length, pct: contradictoryMomentum.length/total*100 },
    { name: 'Слабые паттерны (<50)', count: weakPatterns.length, pct: weakPatterns.length/total*100 },
    { name: 'Быстрые стопы (<30мин)', count: fastSLs.length, pct: fastSLs.length/total*100 },
    { name: 'Малый clearance', count: lowClearance.length, pct: lowClearance.length/total*100 },
  ];
  
  problems.sort((a, b) => b.count - a.count);
  
  problems.forEach((p, i) => {
    console.log(`${i+1}. ${p.name}: ${p.count} (${p.pct.toFixed(1)}%)`);
  });
  
  // ========================================
  // РЕКОМЕНДАЦИИ
  // ========================================
  console.log('\n\n✅ ============================================');
  console.log('   РЕКОМЕНДАЦИИ ДЛЯ УМЕНЬШЕНИЯ СТОП-ЛОССОВ');
  console.log('   ============================================\n');
  
  console.log('1️⃣  ПОЛНОСТЬЮ ОТКЛЮЧИТЬ сигналы ПРОТИВ тренда');
  console.log('   → Исключить: trend_alignment = "against"');
  console.log(`   → Экономия: ${againstTrend.length} стопов (${(againstTrend.length/total*100).toFixed(1)}%)\n`);
  
  console.log('2️⃣  ФИЛЬТР ПО ИМПУЛЬСУ: требовать совпадение recent_direction');
  console.log('   → LONG только если recent_direction = "bullish"');
  console.log('   → SHORT только если recent_direction = "bearish"');
  console.log(`   → Экономия: ${contradictoryMomentum.length} стопов (${(contradictoryMomentum.length/total*100).toFixed(1)}%)\n`);
  
  console.log('3️⃣  ПОДНЯТЬ МИНИМАЛЬНЫЙ pattern_score до 50+');
  console.log('   → Только качественные паттерны');
  console.log(`   → Экономия: ${weakPatterns.length} стопов (${(weakPatterns.length/total*100).toFixed(1)}%)\n`);
  
  console.log('4️⃣  ТРЕБОВАТЬ МИНИМУМ 0.5R свободного пути (clearance_15m >= 0.005)');
  console.log('   → Избегать сигналов "в потолок"');
  console.log(`   → Экономия: ${lowClearance.length} стопов (${(lowClearance.length/total*100).toFixed(1)}%)\n`);
  
  console.log('5️⃣  ИЗБЕГАТЬ сигналов СРАЗУ ПОСЛЕ разворота');
  console.log('   → Дать цене консолидироваться');
  console.log('   → Возможно добавить задержку после context_was_reversal = true');
  console.log(`   → Экономия: ${afterReversal.length} стопов (${(afterReversal.length/total*100).toFixed(1)}%)\n`);
  
  console.log('6️⃣  РАСШИРИТЬ СТОП-ЛОСС для 15m таймфрейма');
  console.log('   → Текущий: 1.0 * ATR');
  console.log('   → Рекомендация: 1.2-1.5 * ATR');
  console.log(`   → Может спасти: ${fastSLs.length} стопов (${(fastSLs.length/total*100).toFixed(1)}%)\n`);
  
  // Потенциальное влияние всех фильтров
  const allFiltered = new Set([
    ...againstTrend.map(d => d.id),
    ...contradictoryMomentum.map(d => d.id),
    ...weakPatterns.map(d => d.id),
    ...lowClearance.map(d => d.id),
  ]);
  
  console.log('\n📈 ПОТЕНЦИАЛЬНЫЙ ЭФФЕКТ ВСЕХ ФИЛЬТРОВ:');
  console.log(`   Убрано сигналов: ${allFiltered.size} из ${total}`);
  console.log(`   Сокращение стоп-лоссов: ${(allFiltered.size/total*100).toFixed(1)}%`);
  
  const filteredReversals = [...allFiltered].filter(id => {
    const signal = data.find(d => d.id === id);
    return signal && (signal.post_sl_outcome === 'reached_tp3' || signal.post_sl_outcome === 'went_further_against');
  });
  
  console.log(`   Из них с разворотом после SL: ${filteredReversals.length}`);
  console.log(`   Экономия "обидных" стопов: ${(filteredReversals.length/reachedTP3.length*100).toFixed(1)}% от всех разворотов\n`);
  
  console.log('✅ Анализ завершен!\n');
}

// Run analysis
const csvPath = process.argv[2] || 'attached_assets/stoplosses_export_1762261434908.csv';
analyzeStopLosses(csvPath);
