#!/usr/bin/env python3
"""
Анализ данных стоплоссов для ответов на вопросы:
1. Куда цена шла ПОСЛЕ срабатывания SL?
2. Если увеличим SL до 1.0 ATR - цена достигла бы новых TP?
3. Сколько времени уходит от сигнала до отработки?
"""

import csv
from collections import defaultdict
from datetime import datetime

# Читаем CSV
sl_data = []
with open('attached_assets/stoplosses_export_1762447823236.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        sl_data.append(row)

print("=" * 80)
print("📊 АНАЛИЗ СТОПЛОССОВ 15M СТРАТЕГИИ (04-06 НОЯБРЯ 2025)")
print("=" * 80)
print(f"\nВсего стоплоссов: {len(sl_data)}\n")

# ============================================================================
# ВОПРОС 1: Куда цена шла ПОСЛЕ срабатывания SL?
# ============================================================================
print("\n" + "=" * 80)
print("1️⃣  ПОВЕДЕНИЕ ЦЕНЫ ПОСЛЕ СРАБАТЫВАНИЯ SL")
print("=" * 80)

post_sl_outcomes = defaultdict(int)
post_sl_favorable = []  # Случаи, когда цена пошла в нашу сторону ПОСЛЕ SL

for row in sl_data:
    outcome = row['post_sl_outcome']
    post_sl_outcomes[outcome] += 1
    
    # Если после SL цена достигла TP
    if 'reached' in outcome:
        max_fav = float(row['post_sl_max_favorable_r']) if row['post_sl_max_favorable_r'] else 0
        time_to_tp = int(row['post_sl_time_to_tp_min']) if row['post_sl_time_to_tp_min'] else 0
        post_sl_favorable.append({
            'symbol': row['symbol'],
            'outcome': outcome,
            'max_favorable_r': max_fav,
            'time_to_tp_min': time_to_tp,
            'direction': row['direction']
        })

print("\n📈 РАСПРЕДЕЛЕНИЕ ИСХОДОВ ПОСЛЕ SL:")
for outcome, count in sorted(post_sl_outcomes.items(), key=lambda x: -x[1]):
    percent = (count / len(sl_data)) * 100
    print(f"  • {outcome:25s}: {count:3d} ({percent:5.1f}%)")

print(f"\n🎯 ЦЕНА ДОСТИГЛА TP ПОСЛЕ SL: {len(post_sl_favorable)} случаев")
if post_sl_favorable:
    print("\nПримеры (цена пошла в нашу сторону ПОСЛЕ того, как выбила SL!):")
    for i, case in enumerate(post_sl_favorable[:10], 1):
        print(f"  {i:2d}. {case['symbol']:15s} {case['direction']:5s} → {case['outcome']:15s} "
              f"(+{case['max_favorable_r']:.2f}R за {case['time_to_tp_min']} мин)")

# ============================================================================
# ВОПРОС 2: Если увеличим SL до 1.0 ATR - достигнет ли цена новых TP?
# ============================================================================
print("\n" + "=" * 80)
print("2️⃣  СИМУЛЯЦИЯ: SL 0.6 ATR → 1.0 ATR (УВЕЛИЧЕНИЕ НА 67%)")
print("=" * 80)

# Логика:
# - Текущий SL: 0.6 ATR от entry
# - Текущий TP: 2R от 0.6 ATR SL
# - Новый SL: 1.0 ATR от entry (на 67% дальше)
# - Новый TP: 2R от 1.0 ATR SL = 2.0 ATR от entry
# 
# Чтобы новый TP был достигнут, нужно:
# MFE (до SL) >= 2.0 * (новый SL в %) = 2.0 * (1.0 / 0.6) = 3.33R от старого SL

saved_by_wider_sl = 0  # Сделки, которые НЕ выбило бы новым SL
new_tp_reached = 0      # Из спасенных - сколько достигли бы нового TP

# Новый SL в 1.67 раз больше (1.0 / 0.6 = 1.67)
sl_multiplier = 1.0 / 0.6  # = 1.67

saved_trades = []

for row in sl_data:
    mfe = float(row['mfe_r']) if row['mfe_r'] else 0
    mae = float(row['mae_r']) if row['mae_r'] else 0
    
    # Старый SL был на 1.0R (100%)
    # Новый SL будет на 1.67R (167%)
    # Проверяем: если MAE < 1.67R, то новый SL НЕ выбило бы
    if abs(mae) < sl_multiplier:
        saved_by_wider_sl += 1
        
        # Новый TP = 2R от нового SL = 2 * 1.67 = 3.34R от entry
        # Но в терминах старого SL: новый TP = 2R * 1.67 = 3.34R
        new_tp_in_old_r = 2.0 * sl_multiplier  # = 3.34R
        
        if mfe >= new_tp_in_old_r:
            new_tp_reached += 1
            saved_trades.append({
                'symbol': row['symbol'],
                'direction': row['direction'],
                'mfe': mfe,
                'mae': mae,
                'old_sl_hit': 'YES',
                'new_sl_hit': 'NO',
                'new_tp_reached': 'YES'
            })
        else:
            saved_trades.append({
                'symbol': row['symbol'],
                'direction': row['direction'],
                'mfe': mfe,
                'mae': mae,
                'old_sl_hit': 'YES',
                'new_sl_hit': 'NO',
                'new_tp_reached': 'NO (MFE недостаточно)'
            })

print(f"\n✅ СПАСЕНО ОТ SL (новый SL шире): {saved_by_wider_sl} из {len(sl_data)} ({saved_by_wider_sl/len(sl_data)*100:.1f}%)")
print(f"📊 Из них достигли БЫ нового TP: {new_tp_reached} ({new_tp_reached/saved_by_wider_sl*100:.1f}% от спасенных)")
print(f"\n💡 ИТОГО РЕЗУЛЬТАТ:")
print(f"   Старые настройки (0.6 ATR): 0 TP / {len(sl_data)} SL")
print(f"   Новые настройки (1.0 ATR): {new_tp_reached} TP / {len(sl_data) - saved_by_wider_sl} SL")
print(f"   Win Rate: {new_tp_reached / len(sl_data) * 100:.1f}% (только из SL, без учета старых TP)")

print("\n🔍 Примеры СПАСЕННЫХ сделок:")
for i, trade in enumerate(saved_trades[:15], 1):
    print(f"  {i:2d}. {trade['symbol']:15s} {trade['direction']:5s} | "
          f"MFE: {trade['mfe']:+6.2f}R, MAE: {trade['mae']:+6.2f}R | "
          f"Новый TP: {trade['new_tp_reached']}")

# ============================================================================
# ВОПРОС 3: Сколько времени от сигнала до отработки?
# ============================================================================
print("\n" + "=" * 80)
print("3️⃣  ВРЕМЯ ЖИЗНИ СДЕЛОК (ОТ СИГНАЛА ДО ОТРАБОТКИ)")
print("=" * 80)

time_to_sl_list = []
for row in sl_data:
    time_sl = int(row['time_to_sl_min']) if row['time_to_sl_min'] else 0
    if time_sl > 0:
        time_to_sl_list.append(time_sl)

if time_to_sl_list:
    avg_time_old = sum(time_to_sl_list) / len(time_to_sl_list)
    median_time_old = sorted(time_to_sl_list)[len(time_to_sl_list) // 2]
    
    print(f"\n⏱️  ТЕКУЩИЕ НАСТРОЙКИ (SL 0.6 ATR):")
    print(f"   Среднее время до SL: {avg_time_old:.0f} минут ({avg_time_old/60:.1f} часа)")
    print(f"   Медианное время до SL: {median_time_old} минут ({median_time_old/60:.1f} часа)")
    print(f"   Минимум: {min(time_to_sl_list)} мин")
    print(f"   Максимум: {max(time_to_sl_list)} мин ({max(time_to_sl_list)/60:.1f} часов)")

# Прогнозируем для новых настроек
# Если SL дальше на 67%, то в среднем сделка живет дольше
# Предположим линейную зависимость: время * 1.67
estimated_avg_time_new = avg_time_old * sl_multiplier
estimated_median_time_new = median_time_old * sl_multiplier

print(f"\n🔮 ПРОГНОЗ ДЛЯ НОВЫХ НАСТРОЕК (SL 1.0 ATR):")
print(f"   Среднее время до отработки: ~{estimated_avg_time_new:.0f} минут ({estimated_avg_time_new/60:.1f} часа)")
print(f"   Медианное время: ~{estimated_median_time_new:.0f} минут ({estimated_median_time_new/60:.1f} часа)")
print(f"\n   📌 Увеличение времени жизни сделки: +{(sl_multiplier - 1)*100:.0f}%")

# Распределение по диапазонам
print("\n📊 РАСПРЕДЕЛЕНИЕ ВРЕМЕНИ ДО SL:")
time_ranges = {
    '0-30 мин': 0,
    '31-60 мин': 0,
    '61-120 мин (1-2ч)': 0,
    '121-240 мин (2-4ч)': 0,
    '> 240 мин (>4ч)': 0
}

for t in time_to_sl_list:
    if t <= 30:
        time_ranges['0-30 мин'] += 1
    elif t <= 60:
        time_ranges['31-60 мин'] += 1
    elif t <= 120:
        time_ranges['61-120 мин (1-2ч)'] += 1
    elif t <= 240:
        time_ranges['121-240 мин (2-4ч)'] += 1
    else:
        time_ranges['> 240 мин (>4ч)'] += 1

for range_name, count in time_ranges.items():
    percent = (count / len(time_to_sl_list)) * 100
    print(f"  • {range_name:25s}: {count:3d} ({percent:5.1f}%)")

print("\n" + "=" * 80)
print("✅ АНАЛИЗ ЗАВЕРШЕН")
print("=" * 80)
