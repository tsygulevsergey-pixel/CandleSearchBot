# 📊 Context Tracking & Post-SL Analysis

## 🎯 Что это дает?

Теперь бот собирает ДВА типа важных данных для ML анализа:

### 1️⃣ **Контекст ДО сигнала** (что было перед входом?)
### 2️⃣ **Что случилось ПОСЛЕ стопа** (достиг ли бы график TP?)

---

## 📋 Новые поля в БД

### **Context Before Signal (что было ДО сигнала)**

```typescript
context_trend_before: 'uptrend' | 'downtrend' | 'sideways'
// Тренд перед сигналом (по EMA20 vs EMA50)

context_was_reversal: boolean
// Был ли разворот тренда?
// TRUE = последние 10 свечей противоположны предыдущим 10

context_swing_count_20: number
// Количество swing highs/lows за последние 20 свечей
// Высокое значение (>10) = choppy рынок

context_recent_direction: 'bullish' | 'bearish' | 'choppy'
// Направление последних 10 свечей
// bullish: >=6 зеленых свечей
// bearish: >=6 красных свечей
// choppy: все остальные

context_distance_from_ema: number (%)
// Расстояние от EMA20 при входе (в процентах)
// Положительное = выше EMA, отрицательное = ниже EMA
```

---

### **Post-SL Monitoring (что случилось ПОСЛЕ стопа)**

```typescript
post_sl_outcome: 'reached_tp1' | 'reached_tp2' | 'reached_tp3' | 
                 'went_further_against' | 'sideways'
// Что произошло после SL_HIT:
// - reached_tp1/2/3: График ДОСТИГ TP (значит SL был слишком tight!)
// - went_further_against: График продолжил идти в сторону стопа (MAE >1.5R)
// - sideways: График остался в диапазоне (max favorable <0.5R)

post_sl_max_favorable_r: number
// Максимальная прибыль после SL (в R единицах)
// Если >1.0 = график после стопа пошел к TP

post_sl_time_to_tp_min: number | null
// Время до TP после SL (минуты)
// NULL = не достиг TP за 4 часа

post_sl_monitored_until: timestamp
// До какого времени мониторили (обычно SL_time + 4 hours)
```

---

## 🔧 Как это работает?

### **1. При создании сигнала:**

```typescript
// scanner.ts автоматически анализирует контекст
const contextAnalysis = analyzeContextBeforeSignal(
  candles, // Последние 50 свечей
  entryPrice
);

// Сохраняет в БД:
contextTrendBefore: contextAnalysis.trendBefore,
contextWasReversal: contextAnalysis.wasReversal,
contextSwingCount20: contextAnalysis.swingCount20,
contextRecentDirection: contextAnalysis.recentDirection,
contextDistanceFromEma: contextAnalysis.distanceFromEma
```

**Пример лога:**
```
🔍 [Context] Before signal:
  trend: uptrend
  reversal: true
  swings: 12
  recent: bearish
  distEma: -0.45%
  isGood: false
  reason: 'LONG signal after bearish reversal (график развернулся DOWN)'
```

---

### **2. При SL_HIT:**

```typescript
// signalTracker.ts автоматически запускает мониторинг
if (newStatus === 'SL_HIT') {
  // Запуск в background (не блокирует основной процесс)
  monitorAfterStopLoss(signal.id, 4); // Мониторить 4 часа
}
```

**Процесс мониторинга:**
1. Дожидается 4 часа после SL
2. Проверяет каждую 15m свечу
3. Отслеживает: достиг ли график TP1/TP2/TP3?
4. Сохраняет результат в БД

**Пример лога:**
```
📊 [PostSL] Signal #142 stopped, starting post-SL monitoring (4h)...
✅ [PostSL] Reached TP1 after 85 min! (0.1234 >= 0.1230)
✅ [PostSL] Monitoring complete:
  outcome: reached_tp1
  maxFavorableR: 2.15R
  timeToTpMin: 85 min
```

---

## 📊 SQL Queries для анализа

### **Какие контексты приводят к стопам?**

```sql
SELECT 
  context_trend_before,
  context_was_reversal,
  context_recent_direction,
  COUNT(*) as total,
  COUNT(CASE WHEN status = 'SL_HIT' THEN 1 END) as stops,
  ROUND(100.0 * COUNT(CASE WHEN status = 'SL_HIT' THEN 1 END) / COUNT(*), 1) as stop_rate
FROM signals 
WHERE timeframe = '15m'
  AND context_trend_before IS NOT NULL
GROUP BY context_trend_before, context_was_reversal, context_recent_direction
ORDER BY stop_rate DESC;
```

**Пример вывода:**
```
 trend_before | was_reversal | recent_direction | total | stops | stop_rate
--------------|--------------|------------------|-------|-------|----------
 downtrend    | true         | bullish          | 12    | 11    | 91.7%
 uptrend      | true         | bearish          | 15    | 13    | 86.7%
 sideways     | false        | choppy           | 8     | 6     | 75.0%
 uptrend      | false        | bullish          | 45    | 18    | 40.0%
```

**Вывод:** НЕ ТОРГОВАТЬ на развороте тренда! (stop_rate >85%)

---

### **Сколько стопов достигли TP?**

```sql
SELECT 
  post_sl_outcome,
  COUNT(*) as count,
  ROUND(AVG(post_sl_max_favorable_r), 2) as avg_max_favorable_r,
  ROUND(AVG(post_sl_time_to_tp_min), 0) as avg_time_to_tp_min
FROM signals 
WHERE status = 'SL_HIT' 
  AND post_sl_outcome IS NOT NULL
GROUP BY post_sl_outcome
ORDER BY count DESC;
```

**Пример вывода:**
```
 post_sl_outcome    | count | avg_max_favorable_r | avg_time_to_tp_min
--------------------|-------|---------------------|-----------------
 sideways           | 48    | 0.32                | NULL
 reached_tp1        | 35    | 1.85                | 120
 went_further_against| 28   | -0.45               | NULL
 reached_tp2        | 15    | 2.40                | 180
 reached_tp3        | 6     | 3.10                | 250
```

**Вывод:** 
- 35+15+6 = 56 стопов (42.4%) ДОСТИГЛИ TP!
- Средний max favorable = 1.85R → SL слишком tight!

---

### **Анализ choppy рынков:**

```sql
SELECT 
  CASE 
    WHEN context_swing_count_20 < 5 THEN 'Clean trend (0-4 swings)'
    WHEN context_swing_count_20 < 10 THEN 'Medium choppy (5-9 swings)'
    ELSE 'Very choppy (10+ swings)'
  END as market_type,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(CASE WHEN status = 'SL_HIT' THEN 1 END) / COUNT(*), 1) as stop_rate,
  ROUND(AVG(post_sl_max_favorable_r), 2) as avg_recovery
FROM signals 
WHERE timeframe = '15m'
  AND context_swing_count_20 IS NOT NULL
GROUP BY market_type
ORDER BY stop_rate DESC;
```

---

## 🎯 Практические рекомендации

### **❌ НЕ ТОРГОВАТЬ когда:**

```sql
-- Запрос для поиска "плохих" контекстов
SELECT * FROM signals 
WHERE 
  -- Разворот тренда
  context_was_reversal = true
  -- ИЛИ очень choppy рынок
  OR context_swing_count_20 > 10
  -- ИЛИ сигнал против recent direction
  OR (direction = 'LONG' AND context_recent_direction = 'bearish')
  OR (direction = 'SHORT' AND context_recent_direction = 'bullish');
```

---

### **✅ УВЕЛИЧИТЬ SL когда:**

```sql
-- Стопы, которые достигли TP после SL_HIT
SELECT 
  id, symbol, 
  post_sl_outcome,
  post_sl_max_favorable_r,
  post_sl_time_to_tp_min,
  -- Рекомендуемый новый SL size
  ROUND(1.0 + (post_sl_max_favorable_r * 0.5), 2) as recommended_sl_multiplier
FROM signals 
WHERE post_sl_outcome LIKE 'reached_tp%'
ORDER BY post_sl_max_favorable_r DESC;
```

**Пример:**
```
signal #142: достиг TP1 через 85 мин (max favorable 2.15R)
→ Рекомендация: SL = 1.0R + (2.15 * 0.5) = 2.08R вместо 1.0R
```

---

## 📈 Будущий ML анализ

Эти данные позволят обучить модель:

```python
# Features для ML модели
X = [
  'context_trend_before',      # Категория
  'context_was_reversal',      # Boolean
  'context_swing_count_20',    # Numeric
  'context_recent_direction',  # Категория
  'context_distance_from_ema', # Numeric
  'pattern_score',             # Numeric
  'trend_alignment',           # Категория
]

# Target (что предсказываем)
y_stop = 'status' == 'SL_HIT'  # Будет ли стоп?
y_recovery = 'post_sl_outcome' LIKE 'reached_tp%'  # Достигнет ли TP после стопа?

# Модель может предсказать:
# 1. Вероятность стопа (0-100%)
# 2. Нужен ли wider SL (да/нет)
# 3. Оптимальный size SL (1.0R - 2.5R)
```

---

## 🔍 Тестирование

Чтобы протестировать на новом сигнале:

```bash
# 1. Дождаться SL_HIT
# 2. Посмотреть логи:
pm2 logs trading-bot --lines 100 | grep "PostSL"

# 3. Через 4 часа проверить результат:
psql $DATABASE_URL -c "
  SELECT 
    id, symbol, 
    context_was_reversal,
    post_sl_outcome,
    post_sl_max_favorable_r
  FROM signals 
  WHERE id = <SIGNAL_ID>;
"
```

---

## 📝 Заключение

**Теперь бот собирает ВСЮ информацию для ML:**

✅ **Контекст перед сигналом** (тренд, разворот, choppy)  
✅ **MFE/MAE** (максимальная прибыль/убыток)  
✅ **Post-SL мониторинг** (достиг ли график TP после стопа)  
✅ **Pattern score, trend alignment** (качество паттерна)  

**Используй эти данные для:**
- Фильтрации плохих контекстов (развороты, choppy)
- Оптимизации SL размера (увеличить для сигналов, которые достигли TP)
- Обучения ML модели для предсказания успешности сигнала

---

**🎯 Главный инсайт:** Если `post_sl_outcome = 'reached_tp1'` → SL был слишком tight!
