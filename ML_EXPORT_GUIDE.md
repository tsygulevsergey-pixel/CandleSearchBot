# 📊 ML Data Export Guide

Этот гайд покажет как экспортировать ML данные из бота в формат Apache Parquet для анализа.

## 🎯 Что экспортируется?

Скрипт экспортирует **3 типа данных**:

### 1. **signals** (вошедшие сделки)
- Все реальные торговые сигналы, по которым бот вошел в позицию
- Содержит: цены входа/SL/TP, исходы (PnL, MFE, MAE), ML контекст (дистанции до зон, arrival pattern)
- Идеально для анализа: "Что делает сигнал прибыльным?"

### 2. **near_miss_skips** (пропущенные сигналы)
- Кандидаты, которые бот НЕ взял (skip reasons)
- Содержит: полный ML контекст, причины отказа, макроконтекст (BTC тренд, зоны)
- Идеально для анализа: "Какие пропуски были ошибочными?"

### 3. **shadow_evaluations** (гипотетические исходы пропусков)
- Что бы случилось, если бы мы вошли в пропущенный сигнал
- Содержит: гипотетические MFE/MAE, исходы (TP/SL)
- Идеально для анализа: "Насколько хороши наши skip rules?"

---

## 🚀 Как запустить экспорт

### На VPS:

```bash
cd /root/CandleSearchBot

# Экспорт последних 30 дней (по умолчанию)
tsx src/scripts/exportParquet.ts

# Экспорт последних 7 дней
tsx src/scripts/exportParquet.ts --days=7

# Экспорт последних 90 дней в кастомную папку
tsx src/scripts/exportParquet.ts --days=90 --output=./exports_90d
```

### Вывод скрипта:

```
🚀 Starting ML data export to Parquet format
📅 Exporting last 30 days of data
📂 Output directory: ./ml_exports

📊 Exporting SIGNALS (entered trades)...
✅ Exported 142 signals to ./ml_exports/signals_2025-10-29.parquet

📊 Exporting NEAR_MISS_SKIPS (skipped signals)...
✅ Exported 1847 near-miss skips to ./ml_exports/near_miss_skips_2025-10-29.parquet

📊 Exporting SHADOW_EVALUATIONS...
✅ Exported 89 shadow evaluations to ./ml_exports/shadow_evaluations_2025-10-29.parquet

============================================================
🎉 Export completed successfully!
============================================================
📂 Files saved to: /root/CandleSearchBot/ml_exports
```

---

## 📥 Скачивание данных на локальный компьютер

### Вариант 1: SCP (рекомендуется)

```bash
# Скачать всю папку с экспортами
scp -r root@YOUR_VPS_IP:/root/CandleSearchBot/ml_exports ./ml_data

# Или отдельный файл
scp root@YOUR_VPS_IP:/root/CandleSearchBot/ml_exports/signals_2025-10-29.parquet ./
```

### Вариант 2: Запаковать в архив (для больших объемов)

На VPS:
```bash
cd /root/CandleSearchBot
tar -czf ml_exports_$(date +%Y%m%d).tar.gz ml_exports/
```

На локальной машине:
```bash
scp root@YOUR_VPS_IP:/root/CandleSearchBot/ml_exports_*.tar.gz ./
tar -xzf ml_exports_*.tar.gz
```

---

## 🐍 Анализ данных в Python

### Установка зависимостей:

```bash
pip install pandas pyarrow scikit-learn matplotlib seaborn
```

### Загрузка данных:

```python
import pandas as pd
import pyarrow.parquet as pq

# Загрузить вошедшие сделки
df_signals = pd.read_parquet('ml_exports/signals_2025-10-29.parquet')

# Загрузить пропущенные сигналы
df_skips = pd.read_parquet('ml_exports/near_miss_skips_2025-10-29.parquet')

# Загрузить теневые оценки
df_shadow = pd.read_parquet('ml_exports/shadow_evaluations_2025-10-29.parquet')

print(f"📊 Loaded {len(df_signals)} signals, {len(df_skips)} skips, {len(df_shadow)} shadow evals")
```

### Примеры анализа:

#### 1. Win Rate по паттернам:

```python
# Только закрытые сделки
closed = df_signals[df_signals['status'].isin(['TP1_HIT', 'TP2_HIT', 'TP3_HIT', 'SL_HIT'])]

# Win = любой TP
closed['is_win'] = closed['status'].str.contains('TP')

# Win rate по паттернам
win_rate = closed.groupby('pattern_type')['is_win'].agg(['mean', 'count'])
print(win_rate)
```

#### 2. Анализ skip reasons:

```python
# Распарсить массив skip_reasons (сохранен как CSV string)
df_skips['reasons_list'] = df_skips['skip_reasons'].str.split(',')

# Считаем частоту каждой причины
from collections import Counter
all_reasons = Counter([r for reasons in df_skips['reasons_list'] for r in reasons])
print(all_reasons.most_common(10))
```

#### 3. Корреляция с исходами:

```python
# Только TP2 и SL сделки
outcome_data = closed[closed['status'].isin(['TP2_HIT', 'SL_HIT'])].copy()
outcome_data['hit_tp'] = outcome_data['status'] == 'TP2_HIT'

# Корреляция ML фич с исходом
features = ['dist_to_dir_h1_zone_atr', 'dist_to_dir_h4_zone_atr', 'free_path_r']
correlations = outcome_data[features + ['hit_tp']].corr()['hit_tp'].drop('hit_tp')
print(correlations.sort_values(ascending=False))
```

#### 4. Shadow vs Real сравнение:

```python
# Соединить skip с shadow evaluation
merged = df_skips.merge(
    df_shadow[df_shadow['is_active'] == False],
    left_on='signal_id',
    right_on='signal_id'
)

# Сколько пропущенных сигналов все равно сработали бы?
shadow_wins = merged[merged['shadow_outcome'].isin(['tp1', 'tp2'])]
print(f"🎯 {len(shadow_wins)} / {len(merged)} пропущенных сигналов все равно сработали бы")
```

---

## 📈 Рекомендуемые ML пайплайны

### 1. Binary Classification (TP vs SL)

```python
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split

# Подготовка данных
X = closed[['dist_to_dir_h1_zone_atr', 'dist_to_dir_h4_zone_atr', 'free_path_r']]
y = closed['is_win']

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Обучение
clf = RandomForestClassifier(n_estimators=100, random_state=42)
clf.fit(X_train, y_train)

# Feature importance
importance = pd.DataFrame({
    'feature': X.columns,
    'importance': clf.feature_importances_
}).sort_values('importance', ascending=False)

print(importance)
```

### 2. Regression (PnL prediction)

```python
from sklearn.ensemble import GradientBoostingRegressor

# Только TP сделки
wins = closed[closed['is_win'] == True]

X = wins[['dist_to_dir_h1_zone_atr', 'free_path_r']]
y = wins['pnl_r']

reg = GradientBoostingRegressor(n_estimators=100, random_state=42)
reg.fit(X_train, y_train)
```

---

## 🔄 Автоматический экспорт (cron)

Добавьте в crontab на VPS:

```bash
# Экспорт каждую неделю в воскресенье в 00:00
0 0 * * 0 cd /root/CandleSearchBot && tsx src/scripts/exportParquet.ts --days=7 >> /root/export_log.txt 2>&1
```

---

## 📋 Структура данных

### signals.parquet

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | int | ID сигнала |
| symbol | string | Тикер (BTCUSDT) |
| pattern_type | string | pinbar_buy, ppr_sell, etc |
| entry_price | float | Цена входа |
| pnl_r | float | PnL в R (TP2=2R, SL=-1R) |
| dist_to_dir_h1_zone_atr | float | Дистанция до H1 зоны в ATR |
| free_path_r | float | Свободный путь в R |
| arrival_pattern | enum | impulse_up, compression, chop |
| first_touch | string | tp1/tp2/sl - что сработало первым |

### near_miss_skips.parquet

| Колонка | Тип | Описание |
|---------|-----|----------|
| signal_id | uuid | Уникальный ID кандидата |
| symbol | string | Тикер |
| skip_reasons | string | CSV список кодов (R01, R03, R07) |
| dist_to_dir_h4_zone_atr | float | Дистанция до H4 зоны |
| btc_trend_state | enum | up/down/neutral |
| zones | json | Полный снапшот зон |

### shadow_evaluations.parquet

| Колонка | Тип | Описание |
|---------|-----|----------|
| signal_id | uuid | FK к near_miss_skips |
| shadow_outcome | enum | tp1, tp2, sl, timeout |
| shadow_mfe_r | float | Максимум прибыли в R |
| shadow_mae_r | float | Максимум убытка в R |

---

## ❓ FAQ

**Q: Как часто нужно экспортировать данные?**  
A: Рекомендуется раз в неделю. Для живого ML - ежедневно.

**Q: Сколько места занимают файлы?**  
A: ~1-5 MB на 1000 сигналов (Parquet очень компактен!).

**Q: Можно ли экспортировать только новые данные?**  
A: Да, используйте `--days=1` для экспорта за последние сутки.

**Q: Как открыть .parquet без Python?**  
A: Используйте DuckDB: `SELECT * FROM 'signals.parquet' LIMIT 10;`

---

🎉 **Готово!** Теперь у вас есть ML данные для тренировки моделей!
