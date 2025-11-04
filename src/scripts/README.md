# 🛠️ Backfill Scripts

## MFE/MAE Backfill Script

Этот скрипт восстанавливает данные MFE/MAE для уже закрытых сигналов.

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
