import * as fs from 'fs';

const stoplossesFile = 'attached_assets/stoplosses_export_1762511594643_1762529786699.csv';

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

console.log('📊 АНАЛИЗ ФИЛЬТРА "RECENT_DIRECTION"\n');
console.log('=' .repeat(80));

const stoplosses = parseCsv(stoplossesFile);
const slNov6 = stoplosses.filter(row => row.signal_time && row.signal_time.startsWith('2025-11-06'));

console.log(`\nВсего стоплоссов за 06.11: ${slNov6.length}\n`);

// Категоризация
const conflicts: any[] = [];
const choppy: any[] = [];
const aligned: any[] = [];

slNov6.forEach(row => {
  const direction = row.direction;
  const trend = row.context_trend_before;
  const recent = row.context_recent_direction;
  
  // CONFLICT: Направление сигнала против локального движения
  if (
    (direction === 'SHORT' && trend === 'downtrend' && recent === 'bullish') ||
    (direction === 'LONG' && trend === 'uptrend' && recent === 'bearish')
  ) {
    conflicts.push(row);
  }
  // CHOPPY: Локальная консолидация
  else if (
    (direction === 'SHORT' && trend === 'downtrend' && recent === 'choppy') ||
    (direction === 'LONG' && trend === 'uptrend' && recent === 'choppy')
  ) {
    choppy.push(row);
  }
  // ALIGNED: Все выровнено
  else {
    aligned.push(row);
  }
});

console.log('🔍 РЕЗУЛЬТАТЫ АНАЛИЗА:');
console.log('-'.repeat(80));
console.log(`❌ КОНФЛИКТ (trend vs recent): ${conflicts.length} сделок (${(conflicts.length/slNov6.length*100).toFixed(1)}%)`);
console.log(`⚠️  CHOPPY (консолидация):      ${choppy.length} сделок (${(choppy.length/slNov6.length*100).toFixed(1)}%)`);
console.log(`✅ ALIGNED (все ОК):            ${aligned.length} сделок (${(aligned.length/slNov6.length*100).toFixed(1)}%)`);

console.log(`\n\n${'='.repeat(80)}`);
console.log('❌ КОНФЛИКТНЫЕ СДЕЛКИ (отфильтровать)');
console.log('='.repeat(80));

if (conflicts.length > 0) {
  console.log(`\nЭти ${conflicts.length} сделок были бы ОТКЛОНЕНЫ фильтром:\n`);
  
  conflicts.forEach((row, idx) => {
    const mfe = parseFloat(row.mfe_r);
    console.log(`${idx + 1}. ${row.symbol} ${row.direction}`);
    console.log(`   ├─ Trend: ${row.context_trend_before} ✅`);
    console.log(`   ├─ Recent: ${row.context_recent_direction} ❌ (против сигнала!)`);
    console.log(`   ├─ MFE: ${mfe.toFixed(2)}R`);
    console.log(`   ├─ Time to SL: ${row.time_to_sl_min} min`);
    console.log(`   └─ 💡 Цена не пошла в нашу сторону - локальное движение было против\n`);
  });
  
  // Средний MFE конфликтных сделок
  const avgMFE = conflicts.reduce((sum, r) => sum + parseFloat(r.mfe_r), 0) / conflicts.length;
  console.log(`📊 Средний MFE конфликтных: ${avgMFE.toFixed(2)}R (подтверждает проблему!)`);
} else {
  console.log('\n✅ Нет конфликтных сделок');
}

console.log(`\n\n${'='.repeat(80)}`);
console.log('⚠️  CHOPPY СДЕЛКИ (консолидация)');
console.log('='.repeat(80));

if (choppy.length > 0) {
  console.log(`\nЭти ${choppy.length} сделок были в локальной консолидации:\n`);
  
  choppy.forEach((row, idx) => {
    const mfe = parseFloat(row.mfe_r);
    console.log(`${idx + 1}. ${row.symbol} ${row.direction}`);
    console.log(`   ├─ Trend: ${row.context_trend_before} ✅`);
    console.log(`   ├─ Recent: ${row.context_recent_direction} ⚠️ (choppy)`);
    console.log(`   ├─ MFE: ${mfe.toFixed(2)}R`);
    console.log(`   └─ Time to SL: ${row.time_to_sl_min} min\n`);
  });
  
  const avgMFE = choppy.reduce((sum, r) => sum + parseFloat(r.mfe_r), 0) / choppy.length;
  console.log(`📊 Средний MFE choppy: ${avgMFE.toFixed(2)}R`);
} else {
  console.log('\n✅ Нет choppy сделок');
}

console.log(`\n\n${'='.repeat(80)}`);
console.log('✅ ALIGNED СДЕЛКИ (пропустить)');
console.log('='.repeat(80));

if (aligned.length > 0) {
  console.log(`\nЭти ${aligned.length} сделок прошли бы фильтр:\n`);
  
  aligned.slice(0, 5).forEach((row, idx) => {
    const mfe = parseFloat(row.mfe_r);
    console.log(`${idx + 1}. ${row.symbol} ${row.direction}`);
    console.log(`   ├─ Trend: ${row.context_trend_before} ✅`);
    console.log(`   ├─ Recent: ${row.context_recent_direction} ✅`);
    console.log(`   ├─ MFE: ${mfe.toFixed(2)}R`);
    console.log(`   └─ Time to SL: ${row.time_to_sl_min} min\n`);
  });
  
  const avgMFE = aligned.reduce((sum, r) => sum + parseFloat(r.mfe_r), 0) / aligned.length;
  console.log(`📊 Средний MFE aligned: ${avgMFE.toFixed(2)}R`);
  console.log(`   (показано первые 5 из ${aligned.length})`);
}

console.log(`\n\n${'='.repeat(80)}`);
console.log('💡 ВЫВОДЫ И РЕКОМЕНДАЦИИ');
console.log('='.repeat(80));

console.log(`\n📊 ЭФФЕКТ ФИЛЬТРА:`);
console.log(`   Отфильтровано (КОНФЛИКТ): ${conflicts.length}/${slNov6.length} (${(conflicts.length/slNov6.length*100).toFixed(1)}%)`);
console.log(`   Предупреждение (CHOPPY):  ${choppy.length}/${slNov6.length} (${(choppy.length/slNov6.length*100).toFixed(1)}%)`);
console.log(`   Прошли (ALIGNED):         ${aligned.length}/${slNov6.length} (${(aligned.length/slNov6.length*100).toFixed(1)}%)`);

if (conflicts.length > 0) {
  const conflictMFE = conflicts.reduce((sum, r) => sum + parseFloat(r.mfe_r), 0) / conflicts.length;
  const alignedMFE = aligned.length > 0 
    ? aligned.reduce((sum, r) => sum + parseFloat(r.mfe_r), 0) / aligned.length 
    : 0;
  
  console.log(`\n📈 КАЧЕСТВО СДЕЛОК:`);
  console.log(`   Средний MFE конфликтных: ${conflictMFE.toFixed(2)}R`);
  console.log(`   Средний MFE aligned:     ${alignedMFE.toFixed(2)}R`);
  
  if (conflictMFE < alignedMFE) {
    console.log(`\n✅ ВЫВОД: Конфликтные сделки хуже на ${(alignedMFE - conflictMFE).toFixed(2)}R!`);
    console.log(`   Фильтр ПОЛЕЗЕН - отсеивает плохие сигналы`);
  } else {
    console.log(`\n⚠️ ВЫВОД: Фильтр может быть слишком строгим`);
  }
  
  console.log(`\n💡 РЕКОМЕНДАЦИЯ:`);
  console.log(`   1. Отклонять КОНФЛИКТНЫЕ (${conflicts.length} сделок)`);
  console.log(`   2. CHOPPY можно пропускать или требовать доп. подтверждения`);
}

console.log(`\n${'='.repeat(80)}\n`);
