#!/usr/bin/env tsx

/**
 * Скрипт для проверки пересчета PnL после исправления breakeven бага
 * 
 * Показывает:
 * 1. Все SL_HIT сигналы
 * 2. Какие из них breakeven
 * 3. Разница между старой и новой логикой расчета PnL
 * 4. Итоговое влияние на статистику
 * 
 * Использование:
 *   tsx scripts/check-pnl-recalculation.ts
 */

import { signalDB } from '../src/mastra/storage/db';
import { calculateTradeOutcome } from '../src/utils/tradeOutcomes';

interface PnLComparison {
  signalId: number;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  status: string;
  entryPrice: number;
  currentSl: number;
  originalSl: number;
  isBreakeven: boolean;
  oldPnL: number;  // По старой логике (использовал slPrice)
  newPnL: number;  // По новой логике (использует currentSl)
  difference: number;
}

/**
 * Старая логика расчета PnL (с багом)
 */
function calculateOldPnL(
  status: string,
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  tp1Price: number,
  tp2Price: number,
  slPrice: number  // ❌ Использовался оригинальный SL
): number {
  if (status === 'TP1_HIT') {
    if (direction === 'LONG') {
      return ((tp1Price - entryPrice) / entryPrice) * 100 * 0.5;
    } else {
      return ((entryPrice - tp1Price) / entryPrice) * 100 * 0.5;
    }
  } else if (status === 'TP2_HIT') {
    if (direction === 'LONG') {
      const pnlTp1 = ((tp1Price - entryPrice) / entryPrice) * 100 * 0.5;
      const pnlTp2 = ((tp2Price - entryPrice) / entryPrice) * 100 * 0.5;
      return pnlTp1 + pnlTp2;
    } else {
      const pnlTp1 = ((entryPrice - tp1Price) / entryPrice) * 100 * 0.5;
      const pnlTp2 = ((entryPrice - tp2Price) / entryPrice) * 100 * 0.5;
      return pnlTp1 + pnlTp2;
    }
  } else if (status === 'SL_HIT') {
    // ❌ БАГ: Всегда использовался slPrice, даже для breakeven
    if (direction === 'LONG') {
      return ((slPrice - entryPrice) / entryPrice) * 100;
    } else {
      return ((entryPrice - slPrice) / entryPrice) * 100;
    }
  }
  return 0;
}

async function analyzePnLRecalculation() {
  console.log('🔍 Анализ пересчета PnL для существующих сигналов...\n');

  const db = signalDB as any;
  const allSignals = await db.db.select().from(db.db.query.signals);

  const comparisons: PnLComparison[] = [];
  let totalOldPnL = 0;
  let totalNewPnL = 0;
  let breakevenCount = 0;
  let affectedCount = 0;

  for (const signal of allSignals) {
    const entryPrice = parseFloat(signal.entryPrice);
    const tp1Price = parseFloat(signal.tp1Price);
    const tp2Price = parseFloat(signal.tp2Price);
    const slPrice = parseFloat(signal.slPrice);
    const currentSl = parseFloat(signal.currentSl);

    // Старая логика (с багом)
    const oldPnL = calculateOldPnL(
      signal.status,
      signal.direction,
      entryPrice,
      tp1Price,
      tp2Price,
      slPrice  // ❌ Всегда использовался оригинальный SL
    );

    // Новая логика (исправленная)
    const outcome = calculateTradeOutcome({
      status: signal.status,
      direction: signal.direction,
      entryPrice: signal.entryPrice,
      tp1Price: signal.tp1Price,
      tp2Price: signal.tp2Price,
      slPrice: signal.slPrice,
      currentSl: signal.currentSl,  // ✅ Теперь используется currentSl
    });

    const newPnL = outcome.pnl;
    const difference = newPnL - oldPnL;

    // Считаем только закрытые сигналы
    if (signal.status !== 'OPEN') {
      totalOldPnL += oldPnL;
      totalNewPnL += newPnL;
    }

    if (outcome.isBreakeven) {
      breakevenCount++;
    }

    if (Math.abs(difference) > 0.001) {
      affectedCount++;
      comparisons.push({
        signalId: signal.id,
        symbol: signal.symbol,
        direction: signal.direction,
        status: signal.status,
        entryPrice,
        currentSl,
        originalSl: slPrice,
        isBreakeven: outcome.isBreakeven,
        oldPnL,
        newPnL,
        difference,
      });
    }
  }

  // Вывод результатов
  console.log('📊 ОБЩАЯ СТАТИСТИКА:\n');
  console.log(`Всего сигналов: ${allSignals.length}`);
  console.log(`Сигналов в breakeven: ${breakevenCount}`);
  console.log(`Сигналов с изменением PnL: ${affectedCount}\n`);

  console.log('💰 ВЛИЯНИЕ НА ОБЩИЙ PnL:\n');
  console.log(`Старый общий PnL: ${totalOldPnL.toFixed(2)}%`);
  console.log(`Новый общий PnL: ${totalNewPnL.toFixed(2)}%`);
  console.log(`Разница: ${(totalNewPnL - totalOldPnL).toFixed(2)}%\n`);

  if (comparisons.length > 0) {
    console.log('🔄 СИГНАЛЫ С ИЗМЕНЕНИЕМ PnL:\n');
    console.log('ID\tСимвол\t\tСтатус\t\tBreakeven?\tСтарый PnL\tНовый PnL\tРазница');
    console.log('─'.repeat(100));

    comparisons.forEach((c) => {
      const be = c.isBreakeven ? '✅ ДА' : '❌ НЕТ';
      const oldSign = c.oldPnL >= 0 ? '+' : '';
      const newSign = c.newPnL >= 0 ? '+' : '';
      const diffSign = c.difference >= 0 ? '+' : '';

      console.log(
        `${c.signalId}\t${c.symbol.padEnd(12)}\t${c.status.padEnd(8)}\t${be}\t\t${oldSign}${c.oldPnL.toFixed(2)}%\t\t${newSign}${c.newPnL.toFixed(2)}%\t\t${diffSign}${c.difference.toFixed(2)}%`
      );
    });

    console.log('\n📝 ДЕТАЛЬНЫЙ АНАЛИЗ BREAKEVEN СДЕЛОК:\n');
    const breakevenSignals = comparisons.filter((c) => c.isBreakeven);
    
    if (breakevenSignals.length > 0) {
      breakevenSignals.forEach((c) => {
        console.log(`\nSignal ID ${c.signalId} (${c.symbol} ${c.direction}):`);
        console.log(`  Entry Price:    ${c.entryPrice.toFixed(8)}`);
        console.log(`  Original SL:    ${c.originalSl.toFixed(8)}`);
        console.log(`  Current SL:     ${c.currentSl.toFixed(8)} (moved to breakeven)`);
        console.log(`  Старый расчет:  ${c.oldPnL.toFixed(2)}% (использовал original SL ❌)`);
        console.log(`  Новый расчет:   ${c.newPnL.toFixed(2)}% (использует current SL ✅)`);
        console.log(`  Исправление:    ${c.difference > 0 ? '+' : ''}${c.difference.toFixed(2)}%`);
      });
    } else {
      console.log('  Нет breakeven сделок в базе данных.');
    }
  } else {
    console.log('✅ Изменений в PnL не найдено. Все сигналы рассчитаны одинаково.\n');
  }

  console.log('\n✅ Анализ завершен!');
  console.log('\n💡 ВАЖНО: Эти изменения уже применены автоматически!');
  console.log('   PnL рассчитывается динамически, поэтому статистика');
  console.log('   уже отображает правильные значения без миграции БД.\n');
}

analyzePnLRecalculation()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  });
