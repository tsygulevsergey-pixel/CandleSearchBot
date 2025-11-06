# Binance Futures Telegram Bot

## Overview
Automated trading signal bot for Binance Futures that detects candlestick patterns across multiple timeframes and sends signals with entry/SL/TP levels.

## Project Status (Oct 26, 2025)

### ✅ Completed Features

#### 1. **Pattern Detection System**
- ✅ **Pin Bar** - Automatic score 200, bypasses all filters (except volume)
- ✅ **Fakey Pattern** - Inside-Mother-Bar reversal with strict trend filtering
- ✅ **Piercing Pattern Reversal (PPR)** - Fixed to require correct candle colors
  - Bullish: RED→GREEN with gap down and 50%+ body penetration
  - Bearish: GREEN→RED with gap up and 50%+ body penetration
- ✅ **Engulfing Pattern** - With body ratio 1.3x minimum

#### 2. **Trend Filtering (Oct 26 Fix)**
- ✅ **Strict counter-trend blocking** for Fakey, PPR, Engulfing
- ✅ **Pin Bar bypass** - Can trade against trend with auto-score 200
- ✅ Trend detection: EMA50 vs EMA200 cross with Price confirmation

#### 3. **Market Clustering System (Oct 26 New)**
- ✅ **Leader-based clustering**: BTC, ETH, SOL, BNB, TON, XRP, DOGE
- ✅ **Sector classification**: L1, L2, DeFi, CEX, Meme, AI, Gaming, Other
- ✅ **Family signal limiting**: Maximum 3 signals per Leader:Sector combination
- ✅ **TP1_HIT inclusion**: Partially closed trades count toward family limit

#### 4. **Risk Management**
- ✅ ATR-based SL/TP calculation
- ✅ Automatic SL-to-breakeven after TP1 hit
- ✅ Volume filtering (above 20-period average)
- ✅ Support/Resistance zone detection

#### 5. **Testing Results (Oct 26)**
- ✅ Live scan at 02:30 UTC successful
- ✅ Pin Bar detected on LINEAUSDT (score 250)
- ✅ PPR color validation working correctly
- ✅ Volume and trend filters operational

## Technical Architecture

### Pattern Hierarchy
```
Pin Bar:      Base 100 + scoring → Min 130 → STRICT trend filter
Fakey/PPR:    Min score 50 → STRICT trend filter
Engulfing:    Min score 50 → STRICT trend filter

ALL PATTERNS: NO counter-trend trades allowed!
```

### Market Clustering
```typescript
Structure: Symbol → Leader:Sector
Example:   BTCUSDT → BTC:L1
           DOGEUSDT → DOGE:Meme
           WIFUSDT → SOL:Meme

Max signals per family: 3 (includes OPEN + TP1_HIT)
```

### Critical Files
- `src/utils/candleAnalyzer.ts` - Pattern detection logic
- `src/utils/marketClusters.ts` - Clustering and family management
- `src/services/scanner.ts` - Main scanning loop with filters
- `src/mastra/storage/db.ts` - Database operations
- `src/services/signalTracker.ts` - Trade lifecycle management

## Recent Fixes (Oct 26, 2025)

### 🔧 PPR Pattern Fix
**Problem**: PPR accepted wrong candle color combinations
**Solution**: 
- Added explicit color checks BEFORE size validation
- Bullish PPR requires Bar₂ to be GREEN
- Bearish PPR requires Bar₂ to be RED

### 🔧 Family Counting Fix
**Problem**: `countOpenSignalsByFamily` crashed on single-symbol families
**Solution**:
- Special handling for 1-symbol families (use `eq` instead of `or`)
- Include TP1_HIT signals in count (partially active positions)

### 🔧 Trend Filter Enhancement
**Problem**: Unclear if counter-trend trades were blocked
**Solution**:
- Strict REJECT for Fakey/PPR/Engulfing counter-trend trades
- Pin Bar continues to bypass with auto-score 200

## Deployment

### Development (Replit)
- Runs with PROXY_URL for Binance API access
- Test signals sent to TELEGRAM_CHAT_ID
- Cron schedules: 15m/1h/4h scans + 5min tracker

### Production (VPS: 209.38.229.144)
```bash
git pull
pm2 restart all
```

## Environment Variables
- `BINANCE_API_KEY` - Binance API key
- `BINANCE_API_SECRET` - Binance API secret
- `TELEGRAM_BOT_TOKEN` - Telegram bot token
- `TELEGRAM_CHAT_ID` - Signal destination (-1001932931293)
- `PROXY_URL` - Proxy for Binance API
- `DATABASE_URL` - PostgreSQL connection

## Performance Targets
- **Win Rate**: 55-65%
- **Max Signals per Family**: 3
- **Pattern Accuracy**: 100% geometric validation
- **Trend Respect**: Mandatory for all patterns except Pin Bar

## Next Steps
1. Monitor real trading results
2. Collect Win Rate statistics
3. Fine-tune pattern scoring weights
4. Expand market clustering to more symbols

## 🔴 КРИТИЧЕСКИЙ БАГ-ФИКС (06.11.2025):

### 🐛 БАГ #1: TP срабатывал, но позиция оставалась открытой

**Причина**: В TP и SL ордерах **отсутствовал параметр `reduceOnly: 'true'`**

**Что происходило без `reduceOnly`:**
```
1. Открывается LONG: BUY 0.5 BTC @ 100,000
2. TP срабатывает @ 105,000: SELL 0.5 BTC
3. ❌ БЕЗ reduceOnly: SELL открывает SHORT позицию на 0.5 BTC!
4. Итог: Вместо закрытия LONG, открылась новая SHORT позиция
```

**Исправление:**
- ✅ Добавлен `reduceOnly: 'true'` к SL ордеру
- ✅ Добавлен `reduceOnly: 'true'` к TP ордеру
- ✅ Теперь TP/SL ордера **только закрывают** позицию, **не открывают новую**

---

### 🐛 БАГ #2: Ошибка -4061 "Order's position side does not match user's setting"

**Причина**: Бот пытался установить One-way Mode силой, но Binance **не позволяет переключать режим** при открытых позициях!

**Что происходило:**
```
1. На аккаунте Binance есть открытые позиции
2. Бот пытается: setPositionMode({ dualSidePosition: 'false' })
3. Binance отказывает: "Cannot change while positions open"
4. Аккаунт остается в текущем режиме
5. Бот посылает positionSide: 'SHORT' (для Hedge Mode)
6. ❌ ОШИБКА -4061: "не соответствует настройкам"
```

**В чем разница режимов:**

**One-way Mode** (dualSidePosition: false):
- Только одна позиция на символ (LONG ИЛИ SHORT)
- `positionSide` НЕ нужен (или use 'BOTH')
- BUY открывает LONG, SELL открывает SHORT
- Рекомендуется для большинства трейдеров

**Hedge Mode** (dualSidePosition: true):
- Можно держать LONG + SHORT одновременно
- `positionSide` ОБЯЗАТЕЛЕН: 'LONG' или 'SHORT'
- Нужно явно указывать какую сторону открываете/закрываете

**Исправление:**
- ✅ Автоматическое определение текущего Position Mode
- ✅ Умная адаптация:
  - **Hedge Mode**: Используем `positionSide: 'LONG'/'SHORT'`
  - **One-way Mode**: НЕ указываем `positionSide` вообще
- ✅ Попытка переключения на One-way только если нет открытых позиций
- ✅ Логи показывают в каком режиме работает бот

**Логи при следующей сделке:**
```
🔧 [BinanceTradeExecutor] Detecting Position Mode...
✅ [BinanceTradeExecutor] Already in One-way Mode (optimal)
📊 [BinanceTradeExecutor] Operating in: One-way Mode

📤 [BinanceTradeExecutor] Placing SELL market order (One-way Mode, no positionSide) for 604 ZEREBROUSDT...
📤 [BinanceTradeExecutor] Placing SL order at 0.04638910 (One-way Mode)...
📤 [BinanceTradeExecutor] Placing TP order at 0.04414180 (One-way Mode)...
✅ [BinanceTradeExecutor] Trade opened successfully!
```

**Дополнительные исправления:**
- ✅ `positionSide: 'LONG'/'SHORT'` в Hedge Mode (если есть открытые позиции)
- ✅ Динамическая проверка max leverage для каждой пары
- ✅ Автоувеличение риска 1%→10% если позиция меньше минимума Binance

**Развёртывание на продакшн:**
```bash
cd /root/CandleSearchBot
# Скопируй файл src/services/binanceTradeExecutor.ts с Replit
pm2 restart crypto-bot
pm2 logs crypto-bot --lines 100
```

---

## 🆕 Новые функции (04.11.2025):

### 📊 Context Tracking & Post-SL Analysis

Теперь бот собирает детальный контекст **ДО** сигнала и мониторит **ПОСЛЕ** стопа:

**Новые файлы:**
- `src/utils/contextAnalyzer.ts` - анализ контекста перед сигналом
- `src/services/postSlMonitor.ts` - мониторинг после SL_HIT
- `CONTEXT_TRACKING_GUIDE.md` - полная документация

**Что отслеживается:**
- ✅ Тренд перед сигналом (uptrend/downtrend/sideways)
- ✅ Был ли разворот тренда?
- ✅ Количество swing highs/lows (choppy рынок)
- ✅ Направление последних 10 свечей
- ✅ Расстояние от EMA20 при входе

**Post-SL мониторинг (4 часа после стопа):**
- ✅ Достиг ли график TP? (reached_tp1/2/3)
- ✅ Максимальная прибыль после SL (в R)
- ✅ Время до TP (если достиг)

**Используй для:**
- Фильтрации плохих контекстов (развороты = 85%+ stop rate)
- Оптимизации SL размера (если график достиг TP после стопа)
- ML анализа успешности сигналов

**Восстановление данных для старых сигналов:**
```bash
# Скрипт восстанавливает context & post-SL для старых сигналов из Binance API
npx tsx src/scripts/backfillContext.ts --dry-run --limit=5  # Тест
npx tsx src/scripts/backfillContext.ts                      # Полный backfill
```

См. `CONTEXT_TRACKING_GUIDE.md` и `README_BACKFILL.md` для подробностей.
