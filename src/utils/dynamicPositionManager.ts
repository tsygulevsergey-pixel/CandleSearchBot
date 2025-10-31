/**
 * Dynamic Position Management Module
 * 
 * Рассчитывает динамические TP уровни и % частичного закрытия на основе:
 * - Confluence score (качество сигнала)
 * - Trend strength (сила тренда)
 * - Available R (свободный путь до зон)
 * - ATR volatility (волатильность)
 * - Zone proximity (близость к зонам S/R)
 */

export type StrategyProfile = 
  | 'CONSERVATIVE'     // Низкое качество, близкие зоны → быстрая фиксация
  | 'BALANCED'         // Средние условия → стандартная стратегия
  | 'AGGRESSIVE'       // Высокое качество, свободный путь → максимизация
  | 'TREND_FOLLOWING'  // Сильный тренд, много места → держим до конца
  | 'SCALP';           // Очень сжатые условия → быстрый вход-выход

export interface DynamicStrategy {
  // TP levels in R units
  tp1R: number;
  tp2R: number;
  tp3R: number;
  
  // Partial close percentages (must sum to 100)
  p1: number;  // % to close at TP1
  p2: number;  // % to close at TP2
  p3: number;  // % to close at TP3
  
  // Metadata
  profile: StrategyProfile;
  reasoning: string;
  expectedPnlR: number; // Expected PnL if all TPs hit
  beThreshold: number;  // Breakeven activation threshold in R
}

export interface StrategyInputs {
  confluenceScore: number;      // 5-10
  trendStrength: 'weak' | 'medium' | 'strong';
  rAvailable: number;           // Free path in R units
  atrVolatility: 'low' | 'normal' | 'high';
  zoneProximity?: 'close' | 'medium' | 'far'; // Optional
  patternType?: string;         // Optional: pattern name
}

/**
 * Основная функция расчёта динамической стратегии
 */
export function calculateDynamicStrategy(inputs: StrategyInputs): DynamicStrategy {
  console.log('🎯 [DynamicPosManager] Calculating dynamic strategy:', inputs);
  
  // Выбираем профиль на основе условий
  const profile = selectProfile(inputs);
  console.log(`📊 [DynamicPosManager] Selected profile: ${profile}`);
  
  // Рассчитываем стратегию для выбранного профиля
  const strategy = calculateStrategyForProfile(profile, inputs);
  
  console.log('✅ [DynamicPosManager] Strategy calculated:', {
    profile: strategy.profile,
    tpLevels: `${strategy.tp1R}R / ${strategy.tp2R}R / ${strategy.tp3R}R`,
    closePercents: `${strategy.p1}% / ${strategy.p2}% / ${strategy.p3}%`,
    expectedPnl: `${strategy.expectedPnlR.toFixed(2)}R`,
  });
  
  return strategy;
}

/**
 * Выбор профиля на основе входных параметров
 */
function selectProfile(inputs: StrategyInputs): StrategyProfile {
  const { confluenceScore, trendStrength, rAvailable, atrVolatility } = inputs;
  
  // SCALP: Очень ограниченное пространство
  if (rAvailable < 2.0) {
    return 'SCALP';
  }
  
  // TREND_FOLLOWING: Идеальные условия для тренда
  if (
    rAvailable > 5.0 && 
    trendStrength === 'strong' && 
    confluenceScore >= 8
  ) {
    return 'TREND_FOLLOWING';
  }
  
  // AGGRESSIVE: Хорошие условия
  if (
    confluenceScore >= 8 && 
    rAvailable > 3.0 && 
    atrVolatility !== 'high'
  ) {
    return 'AGGRESSIVE';
  }
  
  // CONSERVATIVE: Слабые условия
  if (
    confluenceScore < 6 || 
    atrVolatility === 'high' ||
    rAvailable < 2.5
  ) {
    return 'CONSERVATIVE';
  }
  
  // BALANCED: Средние условия (default)
  return 'BALANCED';
}

/**
 * Рассчитывает стратегию для конкретного профиля с адаптацией
 */
function calculateStrategyForProfile(
  profile: StrategyProfile,
  inputs: StrategyInputs
): DynamicStrategy {
  const { confluenceScore, trendStrength, rAvailable, atrVolatility } = inputs;
  
  let strategy: DynamicStrategy;
  
  switch (profile) {
    case 'SCALP':
      strategy = {
        tp1R: 0.6,
        tp2R: 1.2,
        tp3R: 1.8,
        p1: 70,
        p2: 25,
        p3: 5,
        profile: 'SCALP',
        reasoning: 'Сжатые условия (rAvailable < 2R) → быстрая фиксация прибыли',
        expectedPnlR: 0.7 * 0.6 + 0.25 * 1.2 + 0.05 * 1.8,
        beThreshold: 0.25,
      };
      break;
      
    case 'CONSERVATIVE':
      strategy = {
        tp1R: 0.8,
        tp2R: 1.8,
        tp3R: 2.5,
        p1: 60,
        p2: 30,
        p3: 10,
        profile: 'CONSERVATIVE',
        reasoning: 'Низкий confluence или высокая волатильность → ранняя фиксация',
        expectedPnlR: 0.6 * 0.8 + 0.3 * 1.8 + 0.1 * 2.5,
        beThreshold: 0.35,
      };
      break;
      
    case 'BALANCED':
      strategy = {
        tp1R: 1.0,
        tp2R: 2.0,
        tp3R: 3.0,
        p1: 50,
        p2: 30,
        p3: 20,
        profile: 'BALANCED',
        reasoning: 'Средние условия → стандартная стратегия 1R/2R/3R с 50/30/20',
        expectedPnlR: 0.5 * 1.0 + 0.3 * 2.0 + 0.2 * 3.0,
        beThreshold: 0.40,
      };
      break;
      
    case 'AGGRESSIVE':
      strategy = {
        tp1R: 1.2,
        tp2R: 2.5,
        tp3R: 4.0,
        p1: 30,
        p2: 30,
        p3: 40,
        profile: 'AGGRESSIVE',
        reasoning: 'Высокий confluence и свободный путь → максимизация прибыли',
        expectedPnlR: 0.3 * 1.2 + 0.3 * 2.5 + 0.4 * 4.0,
        beThreshold: 0.50,
      };
      break;
      
    case 'TREND_FOLLOWING':
      strategy = {
        tp1R: 1.0,
        tp2R: 3.0,
        tp3R: 5.0,
        p1: 25,
        p2: 25,
        p3: 50,
        profile: 'TREND_FOLLOWING',
        reasoning: 'Сильный тренд и rAvailable > 5R → держим до больших целей',
        expectedPnlR: 0.25 * 1.0 + 0.25 * 3.0 + 0.5 * 5.0,
        beThreshold: 0.60,
      };
      break;
  }
  
  // Микро-адаптации на основе дополнительных факторов
  strategy = applyMicroAdjustments(strategy, inputs);
  
  return strategy;
}

/**
 * Применяет микро-адаптации к базовой стратегии
 */
function applyMicroAdjustments(
  baseStrategy: DynamicStrategy,
  inputs: StrategyInputs
): DynamicStrategy {
  const { confluenceScore, atrVolatility, rAvailable } = inputs;
  let { tp1R, tp2R, tp3R } = baseStrategy;
  
  // Сжатие TP если доступное пространство меньше ожидаемого
  if (rAvailable < tp3R) {
    const compressionFactor = Math.min(0.9, rAvailable / tp3R);
    tp1R *= compressionFactor;
    tp2R *= compressionFactor;
    tp3R = Math.min(tp3R, rAvailable * 0.95); // Оставляем 5% буфер
    console.log(`⚠️ [DynamicPosManager] Compressing TPs (rAvailable=${rAvailable.toFixed(2)}R)`);
  }
  
  // Расширение TP1 при очень высоком confluence
  if (confluenceScore >= 9 && baseStrategy.profile !== 'SCALP') {
    tp1R *= 1.1;
    console.log(`🚀 [DynamicPosManager] Expanding TP1 (confluence=${confluenceScore})`);
  }
  
  // Сжатие TP при высокой волатильности
  if (atrVolatility === 'high' && baseStrategy.profile !== 'CONSERVATIVE') {
    tp2R *= 0.9;
    tp3R *= 0.9;
    console.log(`⚠️ [DynamicPosManager] Reducing TP2/3 (high volatility)`);
  }
  
  // Пересчитываем expectedPnlR с новыми TP
  const { p1, p2, p3 } = baseStrategy;
  const expectedPnlR = (p1/100) * tp1R + (p2/100) * tp2R + (p3/100) * tp3R;
  
  return {
    ...baseStrategy,
    tp1R: parseFloat(tp1R.toFixed(2)),
    tp2R: parseFloat(tp2R.toFixed(2)),
    tp3R: parseFloat(tp3R.toFixed(2)),
    expectedPnlR: parseFloat(expectedPnlR.toFixed(2)),
  };
}

/**
 * Утилита: рассчитывает utility score для определения оптимальных %
 * (альтернативный подход - не используется в текущей реализации профилей)
 */
export function calculateUtilityBasedPartialClose(
  tp1R: number,
  tp2R: number,
  tp3R: number,
  confluenceScore: number,
  trendStrength: 'weak' | 'medium' | 'strong',
  atrVolatility: 'low' | 'normal' | 'high'
): { p1: number; p2: number; p3: number } {
  // Рассчитываем utility для каждого TP
  const u1 = calculateUtility(tp1R, confluenceScore, trendStrength, atrVolatility);
  const u2 = calculateUtility(tp2R, confluenceScore, trendStrength, atrVolatility);
  const u3 = calculateUtility(tp3R, confluenceScore, trendStrength, atrVolatility);
  
  // Нормализуем в проценты
  const totalUtility = u1 + u2 + u3;
  let p1 = (u1 / totalUtility) * 100;
  let p2 = (u2 / totalUtility) * 100;
  let p3 = (u3 / totalUtility) * 100;
  
  // Применяем ограничения (min 15%, max 70%)
  p1 = Math.max(15, Math.min(70, p1));
  p2 = Math.max(15, Math.min(70, p2));
  p3 = Math.max(15, Math.min(70, p3));
  
  // Пересчитываем чтобы сумма = 100%
  const sum = p1 + p2 + p3;
  return {
    p1: parseFloat(((p1 / sum) * 100).toFixed(0)),
    p2: parseFloat(((p2 / sum) * 100).toFixed(0)),
    p3: parseFloat(((p3 / sum) * 100).toFixed(0)),
  };
}

function calculateUtility(
  tpR: number,
  confluence: number,
  trend: 'weak' | 'medium' | 'strong',
  volatility: 'low' | 'normal' | 'high'
): number {
  let utility = tpR; // Базовая utility = расстояние
  
  // Бонус за высокое качество сигнала
  if (confluence >= 8) utility *= 1.3;
  else if (confluence >= 6) utility *= 1.1;
  else utility *= 0.9;
  
  // Бонус за сильный тренд (держим дольше)
  if (trend === 'strong') utility *= 1.25;
  else if (trend === 'weak') utility *= 0.85;
  
  // Штраф за высокую волатильность (закрываем раньше)
  if (volatility === 'high') utility *= 0.8;
  else if (volatility === 'low') utility *= 1.1;
  
  return utility;
}
