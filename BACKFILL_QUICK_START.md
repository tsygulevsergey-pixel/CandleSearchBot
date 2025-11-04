# 🚀 Быстрый старт: Восстановление данных

## ✅ **ЧТО ТЕПЕРЬ МОЖНО ВОССТАНОВИТЬ:**

### **ДО сигнала (Context + Metrics):**
1. ✅ `context_trend_before` - тренд (uptrend/downtrend/sideways)
2. ✅ `context_was_reversal` - был ли разворот
3. ✅ `context_swing_count_20` - количество swing highs/lows
4. ✅ `context_recent_direction` - направление последних 10 свечей
5. ✅ `context_distance_from_ema` - расстояние от EMA20
6. ✅ **`pattern_score`** - качество паттерна (0-10) ← НОВОЕ!
7. ✅ **`trend_alignment`** - выравнивание с трендом ← НОВОЕ!
8. ✅ **`clearance_15m`** - расстояние до S/R зоны ← НОВОЕ!

### **ПОСЛЕ стопа (Post-SL):**
1. ✅ `post_sl_outcome` - достиг ли TP после стопа
2. ✅ `post_sl_max_favorable_r` - макс прибыль после SL (в R)
3. ✅ `post_sl_time_to_tp_min` - время до TP (минуты)

---

## 🎯 **КАК ВОССТАНАВЛИВАЕТСЯ:**

### **pattern_score:**
- Запрашивает 6+ свечей перед сигналом
- Вызывает PatternDetector (detectPinBar/detectFakey/detectPPR)
- Вычисляет score на основе tail/body ratio, clean wicks, body size

### **trend_alignment:**
- Вычисляет EMA20 и EMA50 из 50 свечей
- Определяет тренд (UPTREND/DOWNTREND/SIDEWAYS)
- Сравнивает с направлением паттерна (LONG/SHORT)

### **clearance_15m:**
- Запрашивает 300 свечей для расчета S/R зон
- Вызывает findSRChannels для обнаружения зон
- Вычисляет расстояние до ближайшей противоположной зоны

---

## 📝 **КОМАНДЫ:**

```bash
# 1. Тестовый запуск (первые 5 сигналов)
npx tsx src/scripts/backfillContext.ts --dry-run --limit=5

# 2. Полный backfill (все сигналы)
npx tsx src/scripts/backfillContext.ts

# 3. Только контекст + метрики
npx tsx src/scripts/backfillContext.ts --context-only

# 4. Только post-SL
npx tsx src/scripts/backfillContext.ts --post-sl-only
```

---

## 📊 **ПРИМЕР ВЫВОДА:**

```
🔄 [Backfill] Starting context & post-SL backfill...

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

   🔧 Calculating additional metrics...
      Pattern Score: 7.5/10                        ← НОВОЕ!
      Trend Alignment: with (EMA20=67890.12, ...)  ← НОВОЕ!
      Clearance 15m: 0.00002100                    ← НОВОЕ!
   ✅ Updated signal #1 with context + metrics data

============================================================
📊 BACKFILL SUMMARY
============================================================

📍 Context Data:
   Processed: 57
   Success: 57
   Failed: 0

📍 Additional Metrics Recovered:                   ← НОВОЕ!
   Pattern Score: 54                               ← НОВОЕ!
   Trend Alignment: 57                             ← НОВОЕ!
   Clearance 15m: 48                               ← НОВОЕ!

✅ Backfill complete!
```

---

## 🎯 **ДЕПЛОЙ НА СЕРВЕРЕ:**

```bash
# 1. Деплой кода
cd ~/CandleSearchBot
git pull
pm2 restart crypto-bot

# 2. Тестовый backfill
npx tsx src/scripts/backfillContext.ts --dry-run --limit=5

# 3. Полный backfill
npx tsx src/scripts/backfillContext.ts

# 4. Проверить результат
psql $DATABASE_URL -c "
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN pattern_score IS NOT NULL THEN 1 END) as has_pattern_score,
  COUNT(CASE WHEN trend_alignment IS NOT NULL THEN 1 END) as has_trend_alignment
FROM signals 
WHERE timeframe = '15m';
"
```

---

## 💡 **ВАЖНО:**

- ⏱️ Время выполнения: ~500ms на сигнал (3-4 минуты для 200 сигналов)
- ⚠️ `pattern_score` может не восстановиться если паттерн изменился
- ⚠️ `clearance_15m` может быть NULL если нет S/R зоны в нужном направлении
- ✅ `trend_alignment` восстанавливается ВСЕГДА (есть EMA → есть тренд)

---

## 🛡️ **ЗАЩИТА ОТ БАНА BINANCE API:**

✅ **BinanceRateLimiter** - автоматически следит за weight (2400/min)  
✅ **Задержки 500ms** между сигналами - дополнительная защита  
✅ **Прогресс каждые 10** сигналов - мониторинг rate limiter  
✅ **Auto-retry при 429** - автоматическое ожидание при превышении  
✅ **Только 30% лимита** - даже полный backfill безопасен  

**Подробнее:** См. `RATE_LIMITS_SAFETY.md`

---

**Готов к деплою!** 🚀
