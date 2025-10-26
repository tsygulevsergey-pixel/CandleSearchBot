# TradingView-style S/R Channels - Usage Guide

## 📊 Overview

Реализация алгоритма **Support/Resistance Channels** из TradingView (автор: LonesomeTheBlue).

**Статус:** ⚠️ **НЕ АКТИВЕН** - Реализация готова, но **не включена** в бота

**Когда включать:** После сбора 50-100 сделок на текущей версии и анализа статистики

---

## 🔧 Как работает

### 1. **Поиск Pivot Points**
```typescript
// Локальные максимумы (Pivot High)
// Требует: 10 свечей слева + 10 справа с МЕНЬШИМИ high

// Локальные минимумы (Pivot Low)  
// Требует: 10 свечей слева + 10 справа с БОЛЬШИМИ low
```

### 2. **Группировка в каналы**
```typescript
// Пивоты группируются если ширина канала ≤ 5% от range (300 свечей)
// Пример: Range = 40000-50000 → MaxWidth = 500
// Пивоты 49000, 49200, 49400 → Канал 49000-49400 ✅
```

### 3. **Расчет силы**
```typescript
// Сила = (количество_пивотов × 20) + количество_касаний
// Пример: 5 пивотов, 15 касаний → Сила = 100 + 15 = 115
```

### 4. **Топ-N каналов**
```typescript
// Сортировка по силе (убывание)
// Удаление дубликатов (перекрывающихся каналов)
// Возврат топ-6 сильнейших
```

---

## 💻 Использование

### **Базовое использование:**

```typescript
import { findSRChannels } from './utils/srChannels';

const channels = findSRChannels(candles);

// Результат:
// [
//   { upper: 50500, lower: 49500, strength: 180, type: 'support' },
//   { upper: 51200, lower: 50800, strength: 160, type: 'resistance' },
//   ...
// ]
```

### **С параметрами:**

```typescript
const channels = findSRChannels(candles, {
  pivotPeriod: 10,              // Период для Pivot Points
  maxChannelWidthPercent: 5,    // Макс ширина канала в %
  minStrength: 1,               // Минимальная сила
  maxChannels: 6,               // Топ-N каналов
  loopbackPeriod: 290,          // Период поиска пивотов
  source: 'high_low'            // Источник: 'high_low' или 'close_open'
});
```

### **Вспомогательные функции:**

```typescript
import { 
  getNearestSupportChannel,
  getNearestResistanceChannel,
  isPriceInChannel,
  getDistanceToChannel
} from './utils/srChannels';

const currentPrice = 50000;

// Ближайший Support
const support = getNearestSupportChannel(channels, currentPrice);
// { upper: 49800, lower: 49200, strength: 180, type: 'support' }

// Ближайший Resistance
const resistance = getNearestResistanceChannel(channels, currentPrice);
// { upper: 51200, lower: 50800, strength: 160, type: 'resistance' }

// Проверка: внутри ли канала?
const inChannel = isPriceInChannel(currentPrice, support);
// false

// Расстояние до канала
const distance = getDistanceToChannel(currentPrice, support);
// 200 (цена выше support на 200)
```

---

## 🚀 Как включить в бота

### **Шаг 1: Обновить `candleAnalyzer.ts`**

```typescript
// В detectAllPatterns()
import { findSRChannels, getNearestSupportChannel, getNearestResistanceChannel } from './srChannels';

// Вместо старой логики:
const srAnalysis = this.analyzeSupportResistance(candles);

// Использовать новую:
const channels = findSRChannels(candles, {
  pivotPeriod: 10,
  maxChannelWidthPercent: 5,
  maxChannels: 6
});

const currentPrice = parseFloat(candles[candles.length - 1].close);
const srAnalysis = {
  nearestSupport: getNearestSupportChannel(channels, currentPrice),
  nearestResistance: getNearestResistanceChannel(channels, currentPrice),
  allZones: channels.map(ch => ({
    type: ch.type as 'support' | 'resistance',
    price: (ch.upper + ch.lower) / 2,
    upper: ch.upper,
    lower: ch.lower,
    touches: ch.pivotCount + ch.touchCount,
    strength: ch.strength > 150 ? 'strong' : ch.strength > 100 ? 'medium' : 'weak'
  }))
};
```

### **Шаг 2: Включить S/R фильтрацию**

```typescript
// В detectAllPatterns(), раскомментировать:

// LONG только у Support
if (pattern.direction === 'LONG') {
  const distanceToSupport = getDistanceToChannel(currentPrice, srAnalysis.nearestSupport);
  if (distanceToSupport > currentPrice * 0.005) { // >0.5%
    console.log(`❌ LONG слишком далеко от Support (${distanceToSupport})`);
    continue;
  }
}

// SHORT только у Resistance  
if (pattern.direction === 'SHORT') {
  const distanceToResistance = getDistanceToChannel(currentPrice, srAnalysis.nearestResistance);
  if (distanceToResistance > currentPrice * 0.005) { // >0.5%
    console.log(`❌ SHORT слишком далеко от Resistance (${distanceToResistance})`);
    continue;
  }
}
```

### **Шаг 3: (Опционально) Использовать для стопов**

```typescript
// В riskCalculator.ts

if (direction === 'LONG' && srAnalysis.nearestSupport) {
  // Стоп ЗА Support каналом
  slPrice = srAnalysis.nearestSupport.lower - (srAnalysis.nearestSupport.lower * 0.0035);
} else if (direction === 'SHORT' && srAnalysis.nearestResistance) {
  // Стоп ЗА Resistance каналом
  slPrice = srAnalysis.nearestResistance.upper + (srAnalysis.nearestResistance.upper * 0.0035);
} else {
  // Fallback: стопы по свечам
  slPrice = this.calculateStopLoss(...);
}
```

---

## 📊 Пример вывода

```
📊 [SRChannels] Range: 48500-52000, MaxWidth: 175 (5%)
🔍 [SRChannels] Found 42 pivot points
✅ [SRChannels] Returning 6 channels (sorted by strength)
   1. SUPPORT: 49200-49800 | Strength: 180 (5 pivots, 80 touches)
   2. RESISTANCE: 50800-51200 | Strength: 160 (4 pivots, 80 touches)
   3. SUPPORT: 48500-49000 | Strength: 140 (3 pivots, 80 touches)
   4. NEUTRAL: 50000-50400 | Strength: 120 (2 pivots, 80 touches)
   5. RESISTANCE: 51500-51900 | Strength: 100 (2 pivots, 60 touches)
   6. SUPPORT: 48000-48400 | Strength: 80 (1 pivots, 60 touches)
```

---

## ⚠️ Важные замечания

1. **Требует минимум 300 свечей** для корректной работы
2. **Вычислительно дороже** старого алгоритма (~2-3x медленнее)
3. **Каналы vs точки:** возвращает диапазоны (upper-lower), а не одну цену
4. **Динамические параметры:** можно настраивать под разные таймфреймы

---

## 🎯 Когда включать?

**Сначала соберите статистику на простой версии:**
- ✅ 50-100 закрытых сделок
- ✅ Средний PnL < +1.5%
- ✅ Win Rate < 55%

**Если показатели неудовлетворительные:**
1. Включите TradingView алгоритм
2. Протестируйте A/B: старая vs новая версия
3. Сравните метрики

---

## 📁 Файлы

- `src/utils/srChannels.ts` - Реализация алгоритма
- `SR_CHANNELS_USAGE.md` - Эта документация
- `attached_assets/Pasted--This-source-code-is-subject...txt` - Оригинальный Pine Script код

---

**Создано:** 2025-10-26  
**Статус:** Готово к использованию, но НЕ активно  
**Автор алгоритма:** LonesomeTheBlue (TradingView)
