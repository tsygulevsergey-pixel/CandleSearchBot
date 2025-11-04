# 🛡️ Защита от бана Binance API - Rate Limits

## ⚠️ **КРИТИЧЕСКИ ВАЖНО!**

Binance API имеет жесткие лимиты. Превышение → **бан на 2-10 минут по IP!**

---

## 📊 **Binance Futures API Limits**

### **Weight Limit (главный лимит):**
```
2400 weight per minute (per IP)
```

### **Weight на запрос:**
```
GET /fapi/v1/klines:
- limit <= 100:   weight = 1
- limit <= 500:   weight = 2
- limit <= 1000:  weight = 5
- limit > 1000:   weight = 10
```

---

## 🔍 **Что делает backfill скрипт:**

### **На КАЖДЫЙ сигнал (Context + Metrics):**

```typescript
1. getKlinesInRange(symbol, '15m', start, end, 50)   // weight 1
2. getKlinesInRange(symbol, '15m', start, end, 300)  // weight 2
3. detectPattern (local, 0 API calls)                // weight 0
4. calculateEMA (local, 0 API calls)                 // weight 0
5. findSRChannels (local, 0 API calls)               // weight 0

Total: ~3 weight на сигнал
```

### **На КАЖДЫЙ SL_HIT сигнал (Post-SL):**

```typescript
1. getKlinesInRange(symbol, '15m', start, end, 20)   // weight 1

Total: ~1 weight на сигнал
```

---

## 📈 **Расчет для ПОЛНОГО backfill:**

### **Сценарий: 200 сигналов (15m) + 132 SL_HIT**

```
Context + Metrics:
- 200 signals × 3 weight = 600 weight

Post-SL:
- 132 signals × 1 weight = 132 weight

TOTAL: 732 weight (из 2400 лимита)
```

**Вывод:** Даже полный backfill использует только **30.5% лимита!** ✅

---

## 🛡️ **Защита в скрипте:**

### **1️⃣ BinanceRateLimiter (автоматический)**

```typescript
// src/utils/rateLimiter.ts
class BinanceRateLimiter {
  private weightUsed: number = 0;
  private weightLimit: number = 2400;
  
  async executeRequest(weight, requestFn) {
    // Проверяет: есть ли место в лимите?
    while (!this.canMakeRequest(weight)) {
      await this.waitForNextMinute(); // Ждет сброса
    }
    
    // Выполняет запрос
    this.weightUsed += weight;
    const result = await requestFn();
    
    // Обрабатывает 429 (rate limit exceeded)
    if (error.status === 429) {
      this.weightUsed = this.weightLimit; // Блокирует
      await this.waitForNextMinute();     // Ждет
      return this.executeRequest(...);    // Retry
    }
  }
}
```

**Гарантии:**
- ✅ Автоматический retry при 429
- ✅ Ожидание до следующей минуты при превышении
- ✅ Отслеживание weight из headers (`x-mbx-used-weight-1m`)

---

### **2️⃣ Задержки между сигналами (дополнительная защита)**

```typescript
// Context backfill (2-3 API calls на сигнал)
await new Promise(resolve => setTimeout(resolve, 500)); // 500ms

// Post-SL backfill (1 API call на сигнал)
await new Promise(resolve => setTimeout(resolve, 300)); // 300ms
```

**Почему нужны?**
- RateLimiter защищает от превышения лимита
- Задержки дают "буфер безопасности"
- Позволяют другим процессам тоже работать

---

### **3️⃣ Прогресс и мониторинг**

```typescript
// Каждые 10 сигналов:
console.log(`📊 Progress: 50/200 (25%)`);
console.log(`   Rate Limiter: 150/2400 (6.3%)`);
```

**Позволяет:**
- Видеть текущий weight usage
- Остановить скрипт при необходимости (Ctrl+C)
- Понимать примерное время выполнения

---

## ⏱️ **Время выполнения:**

### **Context + Metrics (200 signals):**

```
- API calls: 400 (2 × 200)
- Delays: 200 × 500ms = 100 seconds
- API time: ~50 seconds (latency)
- Total: ~150 seconds = 2.5 minutes
```

### **Post-SL (132 signals):**

```
- API calls: 132
- Delays: 132 × 300ms = 40 seconds
- API time: ~30 seconds (latency)
- Total: ~70 seconds = 1.2 minutes
```

### **ПОЛНЫЙ backfill:**

```
Total: 2.5 + 1.2 = ~3.7 minutes для 332 сигналов
```

**Вывод:** Безопасно и быстро! ✅

---

## 📊 **Пример вывода скрипта:**

```bash
$ npx tsx src/scripts/backfillContext.ts

🔄 [Backfill] Starting context & post-SL backfill...

📊 === BACKFILLING CONTEXT DATA ===

Found 200 signals missing context data

🔍 [Context] Processing signal #1 BTCUSDT...
✅ Updated signal #1 with context + metrics data

...

📊 Progress: 10/200 (5%)
   Rate Limiter: 30/2400 (1.3%)     ← МОНИТОРИНГ!

...

📊 Progress: 50/200 (25%)
   Rate Limiter: 150/2400 (6.3%)    ← ВСЁ ХОРОШО!

...

📊 Progress: 100/200 (50%)
   Rate Limiter: 300/2400 (12.5%)   ← БЕЗОПАСНО!

...

============================================================
📊 BACKFILL SUMMARY
============================================================

📍 Context Data:
   Processed: 200
   Success: 200
   Failed: 0

📍 Additional Metrics Recovered:
   Pattern Score: 192
   Trend Alignment: 200
   Clearance 15m: 178

⏱️ Total time: 2m 34s
📊 Average: 1s per signal

✅ Backfill complete!
```

---

## 🚨 **Что делать при 429 (Rate Limit Exceeded)?**

### **Автоматическая обработка:**

```typescript
// BinanceRateLimiter автоматически:
1. Ловит ошибку 429
2. Ждет до следующей минуты
3. Делает retry

console.log('🚨 [RateLimiter] Hit rate limit! Waiting for next minute...');
// Скрипт НЕ упадет, просто подождет!
```

### **Ручное вмешательство (если нужно):**

```bash
# 1. Остановить скрипт
Ctrl+C

# 2. Подождать 2 минуты
sleep 120

# 3. Продолжить с лимитом
npx tsx src/scripts/backfillContext.ts --limit=50
```

---

## ✅ **ГАРАНТИИ БЕЗОПАСНОСТИ:**

1. ✅ **RateLimiter автоматически** следит за weight
2. ✅ **Задержки 300-500ms** между сигналами
3. ✅ **Retry механизм** при 429
4. ✅ **Прогресс мониторинг** каждые 10 сигналов
5. ✅ **Максимум 30% лимита** для полного backfill
6. ✅ **Proxy поддержка** (если настроен PROXY_URL)

---

## 🎯 **РЕКОМЕНДАЦИИ:**

### **Для первого запуска:**

```bash
# 1. Тест на 5 сигналах (убедиться что работает)
npx tsx src/scripts/backfillContext.ts --dry-run --limit=5

# 2. Небольшая партия (20 сигналов)
npx tsx src/scripts/backfillContext.ts --limit=20

# 3. Полный backfill (если всё ОК)
npx tsx src/scripts/backfillContext.ts
```

### **Для больших объемов (>500 сигналов):**

```bash
# Разбить на батчи по 100
npx tsx src/scripts/backfillContext.ts --limit=100
# Подождать 1-2 минуты
npx tsx src/scripts/backfillContext.ts --limit=100
# И так далее...
```

---

## 🔍 **Мониторинг в реальном времени:**

```bash
# В отдельном терминале смотреть логи RateLimiter
pm2 logs trading-bot --lines 100 | grep RateLimiter

# Вывод:
✅ [RateLimiter] Request allowed: 345/2400 (14.4%)
🚀 [RateLimiter] Executing request (weight: 2, total: 347/2400)
```

---

## 📝 **ИТОГ:**

✅ **Полная защита от бана**  
✅ **Автоматический retry при 429**  
✅ **Прогресс мониторинг**  
✅ **Безопасные задержки**  
✅ **Только 30% лимита для полного backfill**  

**Можешь смело запускать backfill на продакшне!** 🚀

