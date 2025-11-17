#!/bin/bash

CSV="attached_assets/all_trades_15m_1763410850970_1763411243051.csv"

echo "================================================================================"
echo "📊 УГЛУБЛЕННЫЙ АНАЛИЗ - КРИТИЧЕСКИЕ НАХОДКИ"
echo "================================================================================"
echo ""

# ============================================
# 4. СРАВНЕНИЕ SL vs TP
# ============================================
echo "4️⃣ СРАВНЕНИЕ: ЧТО ОТЛИЧАЕТ SL ОТ TP:"
echo "────────────────────────────────────────────────────────────────────────────────"

# Recent Direction в SL vs TP
echo "📊 Recent Direction - SL vs TP:"
echo ""
echo "  SL сделки (с данными):"
tail -n +2 "$CSV" | awk -F',' '$12 == "SL_HIT" && $18 != "" {
  recent[$18]++
  total++
} END {
  for (dir in recent) {
    pct = (recent[dir] / total * 100)
    printf "    %-10s: %2d (%.1f%%)\n", dir, recent[dir], pct
  }
}'

echo ""
echo "  TP сделки (с данными):"
tail -n +2 "$CSV" | awk -F',' '$12 ~ /TP/ && $18 != "" {
  recent[$18]++
  total++
} END {
  for (dir in recent) {
    pct = (recent[dir] / total * 100)
    printf "    %-10s: %2d (%.1f%%)\n", dir, recent[dir], pct
  }
}'

echo ""
echo "────────────────────────────────────────────────────────────────────────────────"
echo ""

# ============================================
# 5. КРИТИЧЕСКИЕ ПРОБЛЕМЫ
# ============================================
echo "5️⃣ КРИТИЧЕСКИЕ НАХОДКИ - ПОЧЕМУ СТОПЛОССЫ:"
echo "────────────────────────────────────────────────────────────────────────────────"
echo ""

# Проблема 1: Recent Direction Conflict
short_bullish=$(tail -n +2 "$CSV" | awk -F',' '$12 == "SL_HIT" && $4 == "SHORT" && $18 == "bullish" {count++} END {print count+0}')
long_bearish=$(tail -n +2 "$CSV" | awk -F',' '$12 == "SL_HIT" && $4 == "LONG" && $18 == "bearish" {count++} END {print count+0}')
conflict_total=$((short_bullish + long_bearish))
sl_total=$(tail -n +2 "$CSV" | awk -F',' '$12 == "SL_HIT" {count++} END {print count+0}')

if [ $conflict_total -gt 0 ]; then
    conflict_pct=$(awk "BEGIN {printf \"%.1f\", $conflict_total/$sl_total*100}")
    echo "⚠️  ПРОБЛЕМА 1: Recent Direction Conflict (локальное движение ПРОТИВ сигнала)"
    echo "   $conflict_total SL ($conflict_pct%) имели конфликт:"
    echo "   - SHORT + bullish recent: $short_bullish SL"
    echo "   - LONG + bearish recent:  $long_bearish SL"
    echo ""
    echo "   💡 РЕШЕНИЕ: Блокировать сигналы где recent_direction ПРОТИВ направления"
    echo "      Сохранит: $(tail -n +2 "$CSV" | awk -F',' '$12 ~ /TP/ && (($4 == "SHORT" && $18 == "bullish") || ($4 == "LONG" && $18 == "bearish")) {count++} END {print count+0}') TP"
    echo "      Удалит:   $conflict_total SL"
    echo ""
fi

# Проблема 2: Choppy Market
choppy_sl=$(tail -n +2 "$CSV" | awk -F',' '$12 == "SL_HIT" && $18 == "choppy" {count++} END {print count+0}')

if [ $choppy_sl -gt 0 ]; then
    choppy_pct=$(awk "BEGIN {printf \"%.1f\", $choppy_sl/$sl_total*100}")
    choppy_tp=$(tail -n +2 "$CSV" | awk -F',' '$12 ~ /TP/ && $18 == "choppy" {count++} END {print count+0}')
    echo "⚠️  ПРОБЛЕМА 2: Choppy Market (флэт/консолидация)"
    echo "   $choppy_sl SL ($choppy_pct%) были на choppy рынке"
    echo ""
    echo "   💡 РЕШЕНИЕ: Блокировать сигналы с recent_direction='choppy'"
    echo "      Сохранит: $choppy_tp TP"
    echo "      Удалит:   $choppy_sl SL"
    echo ""
fi

# Проблема 3: Counter-Trend
against_sl=$(tail -n +2 "$CSV" | awk -F',' '$12 == "SL_HIT" && $21 == "against" {count++} END {print count+0}')

if [ $against_sl -gt 0 ]; then
    against_pct=$(awk "BEGIN {printf \"%.1f\", $against_sl/$sl_total*100}")
    against_tp=$(tail -n +2 "$CSV" | awk -F',' '$12 ~ /TP/ && $21 == "against" {count++} END {print count+0}')
    echo "⚠️  ПРОБЛЕМА 3: Counter-Trend (сигналы ПРОТИВ тренда)"
    echo "   $against_sl SL ($against_pct%) были против тренда"
    echo ""
    echo "   💡 РЕШЕНИЕ: Блокировать сигналы с trend_alignment='against'"
    echo "      Сохранит: $against_tp TP"
    echo "      Удалит:   $against_sl SL"
    echo ""
fi

# Проблема 4: PinBar Sell
pinbar_sell_sl=$(tail -n +2 "$CSV" | awk -F',' '$12 == "SL_HIT" && $5 == "pinbar_sell" {count++} END {print count+0}')
pinbar_sell_tp=$(tail -n +2 "$CSV" | awk -F',' '$12 ~ /TP/ && $5 == "pinbar_sell" {count++} END {print count+0}')
pinbar_sell_total=$((pinbar_sell_sl + pinbar_sell_tp))

if [ $pinbar_sell_total -gt 0 ]; then
    pinbar_sell_wr=$(awk "BEGIN {printf \"%.1f\", $pinbar_sell_tp/$pinbar_sell_total*100}")
    echo "⚠️  ПРОБЛЕМА 4: PinBar Sell - критически низкий Win Rate"
    echo "   Win Rate: $pinbar_sell_wr% ($pinbar_sell_tp wins / $pinbar_sell_sl losses)"
    echo ""
    echo "   💡 РЕШЕНИЕ: Отключить паттерн pinbar_sell (или добавить жесткие фильтры)"
    echo "      Потеряет: $pinbar_sell_tp TP"
    echo "      Удалит:   $pinbar_sell_sl SL"
    echo ""
fi

echo ""
echo "────────────────────────────────────────────────────────────────────────────────"
echo ""

# ============================================
# 6. МОДЕЛИРОВАНИЕ УЛУЧШЕНИЙ
# ============================================
echo "6️⃣ МОДЕЛИРОВАНИЕ: ЧТО ЕСЛИ ПРИМЕНИТЬ ВСЕ ФИЛЬТРЫ:"
echo "────────────────────────────────────────────────────────────────────────────────"
echo ""

# Подсчет сколько SL и TP будет отфильтровано
filtered_sl=$(tail -n +2 "$CSV" | awk -F',' '
$12 == "SL_HIT" && (
    ($4 == "SHORT" && $18 == "bullish") ||
    ($4 == "LONG" && $18 == "bearish") ||
    $18 == "choppy" ||
    $21 == "against" ||
    $5 == "pinbar_sell"
) {count++} END {print count+0}')

filtered_tp=$(tail -n +2 "$CSV" | awk -F',' '
$12 ~ /TP/ && (
    ($4 == "SHORT" && $18 == "bullish") ||
    ($4 == "LONG" && $18 == "bearish") ||
    $18 == "choppy" ||
    $21 == "against" ||
    $5 == "pinbar_sell"
) {count++} END {print count+0}')

wins_total=$(tail -n +2 "$CSV" | awk -F',' '$12 ~ /TP/ {count++} END {print count+0}')
losses_total=$(tail -n +2 "$CSV" | awk -F',' '$12 == "SL_HIT" {count++} END {print count+0}')

remaining_wins=$((wins_total - filtered_tp))
remaining_losses=$((losses_total - filtered_sl))
remaining_total=$((remaining_wins + remaining_losses))

old_wr=$(awk "BEGIN {printf \"%.1f\", $wins_total/($wins_total+$losses_total)*100}")
new_wr=$(awk "BEGIN {printf \"%.1f\", $remaining_wins/$remaining_total*100}")
improvement=$(awk "BEGIN {printf \"%.1f\", $new_wr - $old_wr}")

echo "📊 СЕЙЧАС:"
echo "   Win Rate: $old_wr% ($wins_total wins / $losses_total losses)"
echo ""
echo "📊 ПОСЛЕ ВСЕХ ФИЛЬТРОВ:"
echo "   Отфильтровано TP: $filtered_tp"
echo "   Отфильтровано SL: $filtered_sl"
echo ""
echo "   Осталось wins:    $remaining_wins"
echo "   Осталось losses:  $remaining_losses"
echo "   НОВЫЙ Win Rate:   $new_wr%"
echo ""
echo "   🎯 УЛУЧШЕНИЕ:     +$improvement%"
echo ""

