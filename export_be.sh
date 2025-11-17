#!/bin/bash
# Скрипт для экспорта BREAKEVEN сделок (BE_HIT + be_activated=true)

OUTPUT_FILE="${1:-breakeven_export.csv}"

echo "📊 Экспортирую BREAKEVEN сделки в файл: $OUTPUT_FILE"
echo ""

psql $DATABASE_URL << 'SQL' > "$OUTPUT_FILE"
\pset format csv
\pset tuples_only off

SELECT 
  id,
  symbol,
  timeframe,
  direction,
  pattern_type,
  entry_price,
  sl_price,
  tp1_price,
  tp2_price,
  tp3_price,
  exit_type,
  status,
  pnl_r,
  pnl_percent,
  context_trend_before,
  context_was_reversal,
  context_swing_count_20,
  context_recent_direction,
  context_distance_from_ema,
  pattern_score,
  trend_alignment,
  clearance_15m,
  post_sl_outcome,
  post_sl_max_favorable_r,
  post_sl_time_to_tp_min,
  mfe_r,
  mae_r,
  created_at as signal_time,
  time_to_sl_min,
  time_to_tp1_min,
  time_to_tp2_min,
  time_to_tp3_min,
  time_to_be_min,
  atr_15m,
  free_path_r,
  clearance_1h,
  r_available,
  actual_rr_tp1,
  actual_rr_tp2,
  actual_rr_tp3,
  multi_tf_alignment,
  confluence_score,
  be_activated,
  trailing_activated,
  partial_closed,
  partial_close_p1,
  partial_close_p2,
  partial_close_p3,
  initial_sl,
  current_sl,
  position_size,
  spread_percent,
  depth_1pct_bid,
  depth_1pct_ask,
  order_book_imbalance,
  volume_24h_usdt,
  dist_to_dir_h1_zone_atr,
  dist_to_dir_h4_zone_atr,
  arrival_pattern
FROM signals
WHERE timeframe = '15m'
  AND (
    status = 'BE_HIT'                    -- Прямое закрытие в BE
    OR be_activated = true               -- BE активирован (потом могло пойти в TP или SL)
  )
ORDER BY created_at DESC;
SQL

# Убираем первую строку "Output format is csv"
tail -n +2 "$OUTPUT_FILE" > "${OUTPUT_FILE}.tmp"
mv "${OUTPUT_FILE}.tmp" "$OUTPUT_FILE"

# Статистика
total=$(tail -n +2 "$OUTPUT_FILE" | wc -l)
be_hit_count=$(tail -n +2 "$OUTPUT_FILE" | awk -F',' '$12 == "BE_HIT" {count++} END {print count+0}')
be_activated_count=$(tail -n +2 "$OUTPUT_FILE" | awk -F',' '$41 == "t" || $41 == "true" {count++} END {print count+0}')

echo "✅ Экспорт завершен!"
echo ""
echo "📊 Статистика BREAKEVEN сделок:"
echo "   Всего записей: $total"
echo "   BE_HIT (прямое закрытие): $be_hit_count"
echo "   be_activated=true (BE был активирован): $be_activated_count"
echo ""
echo "💡 Пояснение:"
echo "   - BE_HIT: сделка закрылась ТОЧНО в breakeven (0R)"
echo "   - be_activated=true: BE был активирован, но потом сделка могла:"
echo "     • Пойти в TP (статус TP2_HIT, но с частичной прибылью)"
echo "     • Пробить BE вниз (статус SL_HIT, но с уменьшенным убытком)"
echo ""
echo "📁 Файл: $OUTPUT_FILE"

# Разбивка по финальному статусу
echo ""
echo "📊 Разбивка по финальному статусу (среди be_activated=true):"
psql $DATABASE_URL -c "
  SELECT 
    status,
    COUNT(*) as count,
    ROUND(AVG(pnl_r::numeric), 2) as avg_r,
    ROUND(AVG(pnl_percent::numeric), 2) as avg_pct
  FROM signals
  WHERE timeframe = '15m' 
    AND be_activated = true
  GROUP BY status
  ORDER BY count DESC;
"
