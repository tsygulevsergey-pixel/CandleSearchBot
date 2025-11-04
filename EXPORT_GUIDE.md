# 📊 Инструкция: Экспорт данных для ML анализа

## 🎯 **ЦЕЛЬ:**

Выгрузить все SL_HIT сигналы с ПОЛНЫМ набором данных:
- ✅ Context перед сигналом (тренд, развороты, свинги)
- ✅ **pattern_score** (качество паттерна 0-10)
- ✅ **trend_alignment** (выравнивание с трендом)
- ✅ **clearance_15m** (расстояние до S/R зоны)
- ✅ **post_sl_outcome** (достиг ли TP после стопа)
- ✅ MFE/MAE (максимальная прибыль/убыток)

---

## 📝 **ПОШАГОВАЯ ИНСТРУКЦИЯ:**

### **Шаг 1: Восстановить исторические данные (backfill)**

```bash
# На продакшн сервере:
cd ~/CandleSearchBot
git pull
pm2 restart crypto-bot

# Тестовый запуск (5 сигналов)
npx tsx src/scripts/backfillContext.ts --dry-run --limit=5

# Полный backfill (все сигналы)
npx tsx src/scripts/backfillContext.ts
```

**Время выполнения:** ~3-4 минуты для 200 сигналов

**Что произойдет:**
- Запросит исторические свечи из Binance
- Восстановит `pattern_score`, `trend_alignment`, `clearance_15m`
- Восстановит `post_sl_outcome`, `post_sl_max_favorable_r`
- Покажет прогресс каждые 10 сигналов

---

### **Шаг 2: Экспортировать данные**

```bash
# Простой экспорт
./export_sl.sh

# Или в свой файл
./export_sl.sh my_stoplosses.csv
```

**Вывод скрипта:**
```
📊 Экспортирую SL_HIT сигналы в файл: stoplosses_export.csv

✅ Экспорт завершен!

📊 Статистика:
   Всего SL_HIT: 39

📍 Заполненность НОВЫХ полей:
   pattern_score:       36 / 39 (92.3%)
   trend_alignment:     39 / 39 (100.0%)
   clearance_15m:       31 / 39 (79.5%)
   post_sl_outcome:     39 / 39 (100.0%)

📁 Файл: stoplosses_export.csv
```

---

### **Шаг 3: Скачать файл**

```bash
# Если работаешь по SSH:
scp user@server:~/CandleSearchBot/stoplosses_export.csv ./

# Или просто скопируй содержимое:
cat stoplosses_export.csv
```

---

## 📊 **СТРУКТУРА CSV ФАЙЛА:**

### **Основные поля:**
1. `id` - ID сигнала
2. `symbol` - Тикер (BTCUSDT, ETHUSDT, ...)
3. `timeframe` - Таймфрейм (15m)
4. `direction` - LONG/SHORT
5. `pattern_type` - pinbar_buy, pinbar_sell, fakey, ppr
6. `entry_price` - Цена входа
7. `sl_price` - Стоп-лосс
8. `tp1_price`, `tp2_price`, `tp3_price` - Тейк-профиты
9. `status` - SL_HIT
10. `pnl_r` - Профит/убыток в R (всегда отрицательный для SL)
11. `pnl_percent` - Профит/убыток в %

### **Context (ДО сигнала):**
12. `context_trend_before` - uptrend/downtrend/sideways
13. `context_was_reversal` - был ли разворот (true/false)
14. `context_swing_count_20` - количество swing highs/lows за 20 свечей
15. `context_recent_direction` - bullish/bearish/neutral
16. `context_distance_from_ema` - расстояние от EMA20 (%)

### **НОВЫЕ метрики:**
17. **`pattern_score`** - качество паттерна (0-10)
18. **`trend_alignment`** - with/against/neutral
19. **`clearance_15m`** - расстояние до ближайшей S/R зоны

### **Post-SL (ПОСЛЕ стопа):**
20. **`post_sl_outcome`** - hit_tp/missed_tp/null
21. **`post_sl_max_favorable_r`** - макс прибыль после SL (в R)
22. **`post_sl_time_to_tp_min`** - время до TP после SL (минуты)

### **MFE/MAE:**
23. `mfe_r` - Maximum Favorable Excursion (макс прибыль до SL)
24. `mae_r` - Maximum Adverse Excursion (макс убыток до SL)

### **Время:**
25. `signal_time` - Время сигнала
26. `time_to_sl_min` - Время до стопа (минуты)

### **Дополнительные метрики:**
27. `atr_15m` - ATR на 15m
28. `free_path_r` - Свободный путь до зоны (в R)
29. `clearance_1h` - Clearance на 1h
30. `r_available` - Доступный R
31. `actual_rr_tp1`, `actual_rr_tp2`, `actual_rr_tp3` - Фактический RR
32. `multi_tf_alignment` - Выравнивание multi-TF
33. `confluence_score` - Общий score конфлюенса

---

## 🔍 **АНАЛИЗ ДАННЫХ:**

### **Важные вопросы для ML:**

1. **Pattern Quality:**
   - Какой `pattern_score` имеют успешные vs неуспешные сигналы?
   - Есть ли корреляция pattern_score с `post_sl_outcome`?

2. **Trend Alignment:**
   - Сколько % SL_HIT были `trend_alignment = against`?
   - Достигают ли TP после SL сигналы `against` тренда?

3. **Clearance:**
   - Какой средний `clearance_15m` у SL_HIT сигналов?
   - Есть ли связь между малым clearance и SL_HIT?

4. **Post-SL Analysis:**
   - Сколько % SL_HIT достигают TP потом (`post_sl_outcome = hit_tp`)?
   - Какой средний `post_sl_max_favorable_r`?
   - За сколько времени достигается TP после SL?

5. **Context Analysis:**
   - Какой `context_trend_before` чаще у SL_HIT?
   - Был ли `context_was_reversal` перед стопом?
   - Как `context_distance_from_ema` влияет на результат?

6. **MFE/MAE:**
   - Какой `mfe_r` был до стопа (мог ли закрыться в плюс)?
   - Насколько глубоко уходит `mae_r` перед стопом?

---

## 💡 **ПРИМЕРЫ SQL АНАЛИЗА:**

### **1. Сколько SL достигают TP потом?**

```sql
SELECT 
  post_sl_outcome,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as percent
FROM signals
WHERE status = 'SL_HIT' AND timeframe = '15m'
GROUP BY post_sl_outcome;
```

### **2. Средний pattern_score для разных outcomes:**

```sql
SELECT 
  post_sl_outcome,
  ROUND(AVG(pattern_score), 2) as avg_pattern_score,
  COUNT(*) as count
FROM signals
WHERE status = 'SL_HIT' 
  AND timeframe = '15m'
  AND pattern_score IS NOT NULL
GROUP BY post_sl_outcome;
```

### **3. Trend alignment vs Post-SL outcome:**

```sql
SELECT 
  trend_alignment,
  post_sl_outcome,
  COUNT(*) as count
FROM signals
WHERE status = 'SL_HIT' AND timeframe = '15m'
GROUP BY trend_alignment, post_sl_outcome
ORDER BY trend_alignment, post_sl_outcome;
```

### **4. Средний clearance для SL vs TP:**

```sql
SELECT 
  'SL_HIT' as result,
  ROUND(AVG(clearance_15m), 8) as avg_clearance
FROM signals
WHERE status = 'SL_HIT' AND timeframe = '15m'
UNION ALL
SELECT 
  'TP_HIT' as result,
  ROUND(AVG(clearance_15m), 8) as avg_clearance
FROM signals
WHERE status IN ('TP1_HIT', 'TP2_HIT', 'TP3_HIT') AND timeframe = '15m';
```

---

## 🚀 **БЫСТРАЯ КОМАНДА (всё в одном):**

```bash
# 1. Backfill + Export + Stats
npx tsx src/scripts/backfillContext.ts && \
./export_sl.sh && \
echo "" && \
echo "✅ Готово! Скачай: stoplosses_export.csv"
```

---

## ✅ **ЧЕКЛИСТ:**

- [ ] Код задеплоен (`git pull && pm2 restart`)
- [ ] Backfill выполнен (`npx tsx src/scripts/backfillContext.ts`)
- [ ] Данные экспортированы (`./export_sl.sh`)
- [ ] Проверена заполненность полей (должно быть >80%)
- [ ] Файл скачан для анализа
- [ ] ML анализ запущен

---

**Готово к анализу!** 🎯

