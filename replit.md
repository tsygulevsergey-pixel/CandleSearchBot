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
Pin Bar:      Score 200 (auto-pass) → Bypasses trend filter
Fakey/PPR:    Min score 50 → MUST respect trend direction
Engulfing:    Min score 50 → MUST respect trend direction
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
