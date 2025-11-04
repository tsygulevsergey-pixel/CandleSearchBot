# 📊 Восстановление данных для старых сигналов

## 🎯 Зачем это нужно?

После добавления новых полей в БД (context tracking, post-SL analysis), старые сигналы имеют NULL значения. Этот скрипт **восстанавливает** данные из исторических свечей Binance.

---

## 🔄 Что восстанавливает?

### **1. Context Before Signal** (контекст ДО сигнала)

Для каждого 15m сигнала где `context_trend_before IS NULL`:

**Запрашивает:**
- 50 свечей по 15m ДО создания сигнала (12.5 часов истории)

**Анализирует:**
- ✅ Тренд перед сигналом (uptrend/downtrend/sideways)
- ✅ Был ли разворот тренда
- ✅ Количество swing highs/lows (choppy market)
- ✅ Направление последних 10 свечей
- ✅ Расстояние от EMA20

**Обновляет поля:**
```sql
context_trend_before
context_was_reversal
context_swing_count_20
context_recent_direction
context_distance_from_ema
```

---

### **2. Post-SL Monitoring** (что случилось ПОСЛЕ стопа)

Для каждого сигнала где `status = 'SL_HIT'` AND `post_sl_outcome IS NULL`:

**Запрашивает:**
- 15m свечи в течение 4 часов ПОСЛЕ SL_HIT

**Анализирует:**
- ✅ Достиг ли график TP1/TP2/TP3?
- ✅ Максимальная прибыль после SL (в R)
- ✅ Время до TP (если достиг)

**Обновляет поля:**
```sql
post_sl_outcome          -- reached_tp1/tp2/tp3/went_further_against/sideways
post_sl_max_favorable_r  -- Макс. прибыль после SL (R)
post_sl_time_to_tp_min   -- Время до TP (минуты)
post_sl_monitored_until  -- Время окончания мониторинга
```

---

## 🚀 Использование

### **Базовые команды:**

```bash
# 1. Тестовый запуск (БЕЗ изменений в БД)
npx tsx src/scripts/backfillContext.ts --dry-run

# 2. Восстановить только контекст (для 15m сигналов)
npx tsx src/scripts/backfillContext.ts --context-only

# 3. Восстановить только post-SL данные (для SL_HIT)
npx tsx src/scripts/backfillContext.ts --post-sl-only

# 4. Восстановить первые 5 сигналов (тест)
npx tsx src/scripts/backfillContext.ts --limit=5

# 5. ПОЛНЫЙ backfill (все сигналы)
npx tsx src/scripts/backfillContext.ts
```

---

## 📋 Пример использования

### **Шаг 1: Тестовый запуск**

```bash
cd ~/CandleSearchBot
npx tsx src/scripts/backfillContext.ts --dry-run --limit=5
```

**Ожидаемый вывод:**
```
🔄 [Backfill] Starting context & post-SL backfill...
🔸 DRY RUN MODE - No database changes will be made

📊 === BACKFILLING CONTEXT DATA ===

Found 57 signals missing context data

🔍 [Context] Processing signal #1 BTCUSDT
   📅 Fetching 50x15m candles before signal...
   ✅ Fetched 50 candles
   📊 Context analysis:
      Trend: uptrend
      Reversal: false
      Swings: 6
      Recent: bullish
      Distance from EMA: +0.32%
      Is good context: ✅
   🔸 [DRY RUN] Would update signal #1

...

============================================================
📊 BACKFILL SUMMARY
============================================================

📍 Context Data:
   Processed: 5
   Success: 5
   Failed: 0

✅ Backfill complete!
```

---

### **Шаг 2: Запустить полный backfill**

```bash
# После теста запустить БЕЗ --dry-run
npx tsx src/scripts/backfillContext.ts
```

**Время выполнения:**
- ~100ms на запрос (rate limit)
- 200 сигналов ≈ 20-30 секунд

---

### **Шаг 3: Проверить результат**

```bash
psql $DATABASE_URL -c "
SELECT 
  COUNT(*) as total_15m,
  COUNT(CASE WHEN context_trend_before IS NOT NULL THEN 1 END) as has_context,
  COUNT(CASE WHEN status = 'SL_HIT' AND post_sl_outcome IS NOT NULL THEN 1 END) as has_post_sl
FROM signals 
WHERE timeframe = '15m';
"
```

**Ожидаемый результат:**
```
 total_15m | has_context | has_post_sl
-----------|-------------|------------
       57  |      57     |     128
```

---

## ⚠️ Ограничения

### **1. Binance API Rate Limits**

- Скрипт использует `binanceRateLimiter` для соблюдения лимитов
- Задержка 100ms между запросами
- Для большого количества сигналов может занять время

### **2. Исторические данные**

- Binance хранит свечи ~1000 дней
- Старые сигналы (>2 года) могут не иметь данных
- Скрипт пропускает такие сигналы с предупреждением

### **3. Точность времени SL_HIT**

- Для post-SL используется `updated_at` как время стопа
- Если сигнал обновлялся после SL_HIT, время может быть неточным
- Для новых сигналов (после деплоя) время точное

---

## 🔍 Проверка качества backfill

После запуска проверь качество данных:

```sql
-- Проверить распределение контекстов
SELECT 
  context_trend_before,
  COUNT(*) as count
FROM signals 
WHERE context_trend_before IS NOT NULL
GROUP BY context_trend_before;

-- Проверить post-SL outcomes
SELECT 
  post_sl_outcome,
  COUNT(*) as count,
  ROUND(AVG(post_sl_max_favorable_r), 2) as avg_max_favorable_r
FROM signals 
WHERE post_sl_outcome IS NOT NULL
GROUP BY post_sl_outcome;

-- Найти сигналы которые достигли TP после стопа
SELECT 
  id, symbol, 
  post_sl_outcome,
  post_sl_max_favorable_r,
  post_sl_time_to_tp_min
FROM signals 
WHERE post_sl_outcome LIKE 'reached_tp%'
ORDER BY post_sl_max_favorable_r DESC
LIMIT 10;
```

---

## 📊 Следующие шаги

После успешного backfill:

1. ✅ Анализируй контексты с высоким stop rate
2. ✅ Оптимизируй SL размер (если много достигли TP после стопа)
3. ✅ Используй данные для ML модели

См. `CONTEXT_TRACKING_GUIDE.md` для примеров SQL queries и рекомендаций.

---

**Готов запустить backfill?** 🚀
