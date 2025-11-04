# 🛠️ Backfill Scripts

## 📊 Два способа восстановления данных

### 1️⃣ MFE/MAE Backfill (из истории свечей Binance)
### 2️⃣ Pattern Score Backfill (из лог-файлов бота)

---

## 1️⃣ MFE/MAE Backfill Script (из Binance API)

Этот скрипт восстанавливает данные MFE/MAE для уже закрытых сигналов, запрашивая историю свечей.

### Что восстанавливается:

✅ **mfe_r** - Maximum Favorable Excursion (макс. прибыль в R)  
✅ **mae_r** - Maximum Adverse Excursion (макс. убыток в R)  
✅ **first_touch** - Что коснулось первым (tp1/tp2/tp3/sl)  
✅ **time_to_tp1/tp2/tp3/sl_min** - Время до закрытия в минутах  

### Что НЕ восстанавливается:

❌ **pattern_score** - нужны данные в момент создания  
❌ **trend_alignment** - нужны EMA20/50 в момент создания  
❌ **clearance_15m** - нужны swing highs/lows в момент создания  

### Использование:

#### 1. Тестовый запуск (DRY RUN):
```bash
npx tsx src/scripts/backfillMFEMAE.ts --dry-run
```
Покажет что будет обновлено БЕЗ изменений в БД.

#### 2. Обработать только N сигналов (тест):
```bash
npx tsx src/scripts/backfillMFEMAE.ts --dry-run --limit 5
```

#### 3. Реальный запуск (записывает в БД):
```bash
npx tsx src/scripts/backfillMFEMAE.ts
```

#### 4. Реальный запуск с кастомным batch size:
```bash
# Безопасно: 30 сигналов/минуту (рекомендуется)
npx tsx src/scripts/backfillMFEMAE.ts --batch-size 30

# Быстро: 100 сигналов/минуту (следите за лимитами!)
npx tsx src/scripts/backfillMFEMAE.ts --batch-size 100
```

#### 5. Обработать первые N сигналов:
```bash
npx tsx src/scripts/backfillMFEMAE.ts --limit 50
```

### Опции:

- `--dry-run` - Тестовый режим, не пишет в БД
- `--limit N` - Обработать только N сигналов (по умолчанию: все)
- `--batch-size N` - Размер батча для обработки (по умолчанию: 50)
  - Меньше = безопаснее, но медленнее
  - Больше = быстрее, но выше риск достичь rate limit

### Как работает:

1. Находит все закрытые сигналы (TP_HIT, SL_HIT) с `mfe_r = NULL`
2. Для каждого сигнала:
   - Запрашивает 1m свечи между `created_at` и `updated_at`
   - Анализирует каждую свечу:
     - Для LONG: high = favorable, low = adverse
     - Для SHORT: low = favorable, high = adverse
   - Находит максимальную прибыль (MFE) и убыток (MAE)
   - Определяет что коснулось первым (TP или SL)
   - Рассчитывает время до закрытия
3. Обновляет БД

### Пример вывода:

```
🔄 [Backfill] Starting MFE/MAE backfill...

📊 Found 132 signals to backfill
🔍 DRY RUN MODE - no changes will be written to DB

[1/132] Processing signal #142...
📊 [Backfill] Processing signal #142 SOLVUSDT SHORT
   📅 Duration: 340 minutes (2024-11-01T12:00:00Z → 2024-11-01T17:40:00Z)
   📊 Fetched 340 candles
   ✅ MFE: 1.20R, MAE: -1.00R, First touch: sl
   ⏱️ Time to SL_HIT: 340 minutes
   🔍 [DRY RUN] Would update signal #142

[2/132] Processing signal #143...
...

✅ Backfill complete!
📊 Summary:
   Total processed: 132
   Successfully updated: 130
   Failed: 2

🔍 This was a DRY RUN - no changes were written to DB
💡 Run without --dry-run to apply changes
```

### Rate Limiting (Защита от бана):

✅ **Автоматическая защита от бана:**
- Использует встроенный `binanceRateLimiter`
- Binance Futures лимит: **2400 weight/minute**
- getKlines запрос: **1 weight**
- Автоматически ждет если приближается к лимиту (>80%)

✅ **Умная пакетная обработка:**
- По умолчанию: **50 сигналов/батч** (~1 минута)
- Пауза **5 секунд** между батчами
- Пауза **500ms** между отдельными запросами
- Показывает статус rate limiter каждые 10 сигналов

✅ **Безопасность:**
- Для 132 сигналов: 132 weight (5% от лимита) ✅
- Для 1000 сигналов: 1000 weight (42% от лимита) ✅
- При приближении к лимиту: автоматически ждет следующую минуту
- При 429 ошибке: автоматически повторяет запрос

### Ограничения:

- Для сигналов длительностью >1000 минут (~16.6 часов) анализируются последние 1000 минут
- Рекомендуемый batch-size: 30-50 для максимальной безопасности

### Требования:

- .env файл с DATABASE_URL и Binance credentials
- Доступ к Binance API
- Node.js 20+

### Безопасность:

- Скрипт **не удаляет** данные
- Скрипт **не изменяет** существующие MFE/MAE (пропускает если уже заполнено)
- Используйте `--dry-run` для проверки перед реальным запуском

---

## 2️⃣ Pattern Score Backfill Script (из логов)

Этот скрипт восстанавливает данные из лог-файлов бота, которые не были сохранены в БД.

### Что восстанавливается:

✅ **pattern_score** - качество паттерна (0-10)  
✅ **trend_alignment** - выравнивание с трендом (with/against/neutral)  
✅ **clearance_15m** - расстояние до swing extreme  
✅ **sl_buffer_atr15** - буфер SL в единицах ATR  
✅ **swing_extreme_price** - swing low/high  

### Как работает:

1. Читает лог-файлы бота (PM2 logs, stdout, etc)
2. Парсит строки с маркером `📊 [15m ML Context]`
3. Извлекает JSON данные из логов
4. Сопоставляет с сигналами в БД (по символу + timestamp ±5 минут)
5. Обновляет отсутствующие поля

### Использование:

#### 1. Тестовый запуск (DRY RUN):
```bash
# Из текущей директории (ищет *.log файлы)
npx tsx src/scripts/backfillFromLogs.ts --dry-run

# Указать папку с логами
npx tsx src/scripts/backfillFromLogs.ts --dry-run --log-dir /path/to/logs
```

#### 2. Реальный запуск:
```bash
# PM2 logs (обычно в ~/.pm2/logs/)
npx tsx src/scripts/backfillFromLogs.ts --log-dir ~/.pm2/logs

# Кастомная папка
npx tsx src/scripts/backfillFromLogs.ts --log-dir /var/log/trading-bot
```

### Пример вывода:

```
🔄 [Backfill] Starting log-based backfill...

📂 Found 3 log files:
   - trading-bot-out.log
   - trading-bot-error.log
   - bot-2024-11-01.log

📖 [Parser] Reading log file: trading-bot-out.log
✅ [Parser] Found 45 ML context entries in trading-bot-out.log

🔍 [Matcher] Matching 45 log entries to database signals...
📊 [Matcher] Found 132 signals with missing data
   ✅ Matched signal #142 (SOLVUSDT) to log entry
   ✅ Matched signal #143 (UNIUSDT) to log entry
   ...
   ⚠️ No log match for signal #175 (BTCUSDT)

📊 [Matcher] Successfully matched 40/132 signals

💾 Updating database...
✅ Signal #142 (SOLVUSDT) updated
✅ Signal #143 (UNIUSDT) updated
...

✅ Backfill complete!
📊 Summary:
   Logs parsed: 3 files
   ML contexts found: 45
   Signals matched: 40
   Successfully updated: 40
   Failed: 0
```

### Опции:

- `--dry-run` - Тестовый режим, не пишет в БД
- `--log-dir PATH` - Путь к папке с логами (по умолчанию: текущая директория)

### Требования:

- Лог-файлы должны содержать строки с маркером `📊 [15m ML Context]`
- Формат логов: PM2, stdout, или любой текстовый формат
- Node.js 20+

### Где найти логи:

**PM2 (рекомендуется):**
```bash
pm2 logs trading-bot --lines 1000 > bot.log
# Или прямо из папки:
~/.pm2/logs/trading-bot-out-0.log
```

**Systemd:**
```bash
journalctl -u trading-bot --since "2024-11-01" > bot.log
```

**Docker:**
```bash
docker logs trading-bot > bot.log
```

**Прямой stdout:**
```bash
# Если запускали через node, логи в stdout
```

### Ограничения:

- ⚠️ Работает только для сигналов, которые были **залогированы**
- ⚠️ Сопоставление по времени ±5 минут (может быть неточным для одновременных сигналов)
- ⚠️ Если логи удалены/ротированы, данные невозможно восстановить

### Комбинированный подход:

**Рекомендуется запустить ОБА скрипта для полного восстановления:**

```bash
# 1. Восстановить MFE/MAE из Binance API
npx tsx src/scripts/backfillMFEMAE.ts

# 2. Восстановить pattern_score из логов
npx tsx src/scripts/backfillFromLogs.ts --log-dir ~/.pm2/logs

# 3. Проверить результат
psql $DATABASE_URL -c "
  SELECT 
    COUNT(*) as total,
    COUNT(mfe_r) as has_mfe,
    COUNT(pattern_score) as has_pattern_score,
    COUNT(trend_alignment) as has_trend
  FROM signals 
  WHERE timeframe = '15m' AND status = 'SL_HIT';
"
```

---

## 🎯 Сравнение методов:

| Поле | MFE/MAE Script | Log Parser Script |
|------|----------------|-------------------|
| mfe_r | ✅ Из свечей | ❌ |
| mae_r | ✅ Из свечей | ❌ |
| first_touch | ✅ Из свечей | ❌ |
| time_to_sl_min | ✅ Из timestamps | ❌ |
| pattern_score | ❌ | ✅ Из логов |
| trend_alignment | ❌ | ✅ Из логов |
| clearance_15m | ❌ | ✅ Из логов |
| sl_buffer_atr15 | ❌ | ✅ Из логов |

**Вывод:** Используйте **оба скрипта** для полного восстановления данных!
