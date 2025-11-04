# 🚀 Deployment Guide - MFE/MAE Tracking Update

## 📋 Что было добавлено:

### ✅ Автоматический сбор данных для НОВЫХ сигналов:

**Для 15m сигналов (при создании):**
- `pattern_score` - качество паттерна (0-10)
- `trend_alignment` - выравнивание с трендом (with/against/neutral)
- `clearance_15m` - расстояние до swing extreme
- `sl_buffer_atr15` - буфер SL в единицах ATR
- `swing_extreme_price` - swing low/high для расчета

**Для ВСЕХ сигналов (в реальном времени):**
- `mfe_r` - Maximum Favorable Excursion (макс. прибыль в R)
- `mae_r` - Maximum Adverse Excursion (макс. убыток в R)
- `first_touch` - что коснулось первым (tp1/tp2/tp3/sl)
- `time_to_tp1/2/3/sl/be_min` - время до закрытия в минутах

### ✅ Скрипт восстановления для СТАРЫХ сигналов:

Восстанавливает MFE/MAE/first_touch/time_to_X для уже закрытых сигналов.

---

## 🔧 DEPLOYMENT НА СЕРВЕР

### Шаг 1: Обновить код
```bash
cd ~/CandleSearchBot
git pull
```

### Шаг 2: Синхронизировать БД схему
```bash
npx drizzle-kit push
```

**ВАЖНО!** При вопросе про удаление `mastra_traces`:
```
Do you still want to push changes?
❯ Yes, I want to remove 1 table
```

Это безопасно! `mastra_traces` - устаревшая таблица для deprecated функции трейсинга Mastra.

### Шаг 3: Перезапустить бота
```bash
pm2 restart trading-bot
# или
sudo systemctl restart trading-bot
```

### Шаг 4: Проверить что бот работает
```bash
pm2 logs trading-bot --lines 50
```

Должны увидеть:
```
✅ [15m ML Context] Enriching with analysis data: { patternScore: 8.5, ... }
🔍 [SignalTracker] Checking BTCUSDT: { mfe: "0.8R", mae: "-0.2R", ... }
```

---

## 📊 ВОССТАНОВЛЕНИЕ ДАННЫХ ДЛЯ СТАРЫХ СИГНАЛОВ

### Шаг 1: Тестовый запуск (DRY RUN)
```bash
# Протестировать на 5 сигналах БЕЗ записи в БД
npx tsx src/scripts/backfillMFEMAE.ts --dry-run --limit 5
```

**Пример вывода:**
```
🔄 [Backfill] Starting MFE/MAE backfill...

📊 [Backfill] Binance API Rate Limit Info:
   - Limit: 2400 weight/minute (Futures API)
   - getKlines weight: 1 per request
   - Auto-throttling: ENABLED ✅

📊 Found 132 signals to backfill
🔍 DRY RUN MODE - no changes will be written to DB
⏱️ Estimated time: ~3 minutes (batch size: 50)

[1/5] Processing signal #142...
📊 [Backfill] Processing signal #142 SOLVUSDT SHORT
   📅 Duration: 340 minutes
   📊 Fetched 340 candles
   ✅ MFE: 1.20R, MAE: -1.00R, First touch: sl
   ⏱️ Time to SL_HIT: 340 minutes
   🔍 [DRY RUN] Would update signal #142

📊 [Rate Limiter] Current usage: 5/2400 (0.2%)
...

✅ Backfill complete!
📊 Summary:
   Total processed: 5
   Successfully updated: 5
   Failed: 0

🔍 This was a DRY RUN - no changes were written to DB
💡 Run without --dry-run to apply changes
```

### Шаг 2: Реальный запуск (если тест ОК)

**Вариант A: Все сигналы сразу (132 штуки, ~3 минуты)**
```bash
npx tsx src/scripts/backfillMFEMAE.ts
```

**Вариант B: По частям (безопаснее)**
```bash
# Первые 50 сигналов
npx tsx src/scripts/backfillMFEMAE.ts --limit 50

# Проверить результат в БД, затем продолжить:
npx tsx src/scripts/backfillMFEMAE.ts --limit 100
# и т.д.
```

**Вариант C: С кастомным batch size**
```bash
# Консервативно: 30 сигналов/минуту
npx tsx src/scripts/backfillMFEMAE.ts --batch-size 30

# Агрессивно: 100 сигналов/минуту (но безопасно!)
npx tsx src/scripts/backfillMFEMAE.ts --batch-size 100
```

### Шаг 3: Проверить результат
```bash
# Подключиться к БД
psql $DATABASE_URL

# Проверить обновленные данные
SELECT 
  id, symbol, status, 
  mfe_r, mae_r, first_touch, time_to_sl_min
FROM signals 
WHERE status = 'SL_HIT' 
  AND mfe_r IS NOT NULL
ORDER BY id DESC 
LIMIT 10;
```

**Ожидаемый результат:**
```
 id  | symbol   | status | mfe_r | mae_r | first_touch | time_to_sl_min
-----|----------|--------|-------|-------|-------------|---------------
 142 | SOLVUSDT | SL_HIT | 1.20  | -1.00 | sl          | 340
 143 | UNIUSDT  | SL_HIT | 0.10  | -1.00 | sl          | 23
 144 | ETHUSDT  | SL_HIT | 1.50  | -1.00 | sl          | 520
```

---

## 🔒 ЗАЩИТА ОТ БАНА (Rate Limiting)

### ✅ Автоматическая защита:

1. **Встроенный rate limiter:**
   - Binance Futures лимит: **2400 weight/minute**
   - Каждый getKlines запрос: **1 weight**
   - Автоматически ждет если приближается к лимиту (>80%)

2. **Умная пакетная обработка:**
   - По умолчанию: 50 сигналов/батч (~1 минута)
   - Пауза 5 секунд между батчами
   - Пауза 500ms между запросами
   - Статус показывается каждые 10 сигналов

3. **Безопасность для разных объемов:**
   - 132 сигнала: **132 weight** (5.5% от лимита) ✅
   - 500 сигналов: **500 weight** (21% от лимита) ✅
   - 1000 сигналов: **1000 weight** (42% от лимита) ✅
   - 2000+ сигналов: автоматически разбивается на батчи с паузами

4. **Обработка ошибок:**
   - При 429 ошибке (rate limit): автоматически повторяет запрос
   - При network error: пропускает сигнал и продолжает

### 🎛️ Настройка batch size:

```bash
# Очень безопасно (20 сигналов/минуту):
npx tsx src/scripts/backfillMFEMAE.ts --batch-size 20

# Безопасно (50 сигналов/минуту) - ПО УМОЛЧАНИЮ:
npx tsx src/scripts/backfillMFEMAE.ts --batch-size 50

# Быстро (100 сигналов/минуту):
npx tsx src/scripts/backfillMFEMAE.ts --batch-size 100

# Максимально быстро (200 сигналов/минуту):
npx tsx src/scripts/backfillMFEMAE.ts --batch-size 200
```

**Рекомендация:** Используйте **batch-size 50** (по умолчанию) - идеальный баланс скорости и безопасности.

---

## 📈 АНАЛИЗ ПОСЛЕ BACKFILL

### Пример SQL запросов:

#### 1. Топ-10 сигналов с лучшим MFE (которые дошли до прибыли):
```sql
SELECT 
  id, symbol, pattern_type, direction,
  mfe_r, mae_r, first_touch, time_to_sl_min,
  pnl_r
FROM signals 
WHERE status = 'SL_HIT' 
  AND mfe_r > 1.0  -- Дошли до 1R+ прибыли
ORDER BY mfe_r DESC 
LIMIT 10;
```

**Вывод:** Сигналы которые БЫЛИ ПРАВЫ, но стопнулись → нужен trailing SL

#### 2. Быстрые стопы (<60 минут):
```sql
SELECT 
  COUNT(*) as count,
  AVG(time_to_sl_min) as avg_time,
  AVG(mfe_r) as avg_mfe
FROM signals 
WHERE status = 'SL_HIT' 
  AND time_to_sl_min < 60;
```

**Вывод:** Если mfe_r < 0.2R → плохой entry, если mfe_r > 0.5R → SL слишком tight

#### 3. Группировка по first_touch:
```sql
SELECT 
  first_touch,
  COUNT(*) as count,
  AVG(mfe_r) as avg_mfe,
  AVG(mae_r) as avg_mae
FROM signals 
WHERE status IN ('SL_HIT', 'TP1_HIT', 'TP2_HIT', 'TP3_HIT')
  AND first_touch IS NOT NULL
GROUP BY first_touch
ORDER BY count DESC;
```

#### 4. Анализ по паттернам:
```sql
SELECT 
  pattern_type,
  COUNT(*) as stops,
  AVG(mfe_r) as avg_mfe,
  AVG(time_to_sl_min) as avg_time_to_sl,
  COUNT(CASE WHEN mfe_r > 1.0 THEN 1 END) as reached_1R
FROM signals 
WHERE status = 'SL_HIT'
GROUP BY pattern_type
ORDER BY stops DESC;
```

**Вывод:** Паттерны с высоким `reached_1R` но много стопов → нужен trailing SL

---

## ❓ FAQ

### Q: Безопасно ли запускать скрипт на production БД?
**A:** ДА, скрипт только **добавляет** данные, ничего не удаляет. Используйте `--dry-run` для тестирования.

### Q: Может ли получить бан от Binance?
**A:** НЕТ, встроенный rate limiter следит за лимитами и автоматически делает паузы. Даже при 1000+ сигналах.

### Q: Сколько времени займет backfill 132 сигналов?
**A:** ~3-5 минут (зависит от batch-size и длительности сигналов).

### Q: Что если скрипт упадет посередине?
**A:** Просто запустите снова! Скрипт **пропускает** сигналы где mfe_r уже заполнен.

### Q: Можно ли восстановить pattern_score для старых сигналов?
**A:** НЕТ, эти данные зависят от EMA/индикаторов в момент создания, невозможно восстановить из истории.

### Q: Все старые сигналы будут иметь MFE/MAE?
**A:** ДА, если они закрыты (SL_HIT/TP_HIT). OPEN сигналы начнут собирать данные автоматически.

---

## ✅ CHECKLIST DEPLOYMENT

```
□ 1. git pull на сервере
□ 2. npx drizzle-kit push (выбрать "Yes" для mastra_traces)
□ 3. pm2 restart trading-bot
□ 4. Проверить логи (должны быть новые поля)
□ 5. (Опционально) Запустить backfill --dry-run --limit 5
□ 6. (Опционально) Запустить backfill реальный
□ 7. (Опционально) Проверить БД (SELECT ... WHERE mfe_r IS NOT NULL)
□ 8. Готово! Новые сигналы автоматически собирают все данные ✅
```

---

## 📞 ПОДДЕРЖКА

Если что-то пошло не так:

1. **Проверить логи бота:**
   ```bash
   pm2 logs trading-bot --lines 100
   ```

2. **Проверить БД схему:**
   ```bash
   psql $DATABASE_URL -c "\d signals"
   ```

3. **Откатить изменения (если нужно):**
   ```bash
   git reset --hard HEAD~1
   pm2 restart trading-bot
   ```

---

**Успешного деплоя!** 🚀
