#!/bin/bash
# Скрипт для экспорта ВСЕХ сделок 15m в ОДИН файл для комплексного анализа

TIMESTAMP=$(date +%s%3N)
OUTPUT_FILE="attached_assets/all_trades_15m_${TIMESTAMP}.csv"

echo "📊 Экспортирую ВСЕ 15m сделки (SL + TP + BE) в один файл..."
echo "   Output: $OUTPUT_FILE"

psql $DATABASE_URL << EOF > "$OUTPUT_FILE"
COPY (
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
    arrival_pattern,
    -- Дополнительные вычисляемые поля для анализа
    CASE 
      WHEN status = 'SL_HIT' THEN 'Loss'
      WHEN status IN ('TP1_HIT', 'TP2_HIT', 'TP3_HIT') THEN 'Win'
      WHEN status = 'BE_HIT' THEN 'Breakeven'
      ELSE 'Other'
    END as trade_outcome,
    CASE 
      WHEN time_to_tp2_min < 60 THEN 'Fast (<1h)'
      WHEN time_to_tp2_min < 240 THEN 'Medium (1-4h)'
      WHEN time_to_tp2_min >= 240 THEN 'Slow (>4h)'
      ELSE NULL
    END as speed_category,
    CASE 
      WHEN context_swing_count_20 < 6 THEN 'Low (<6)'
      WHEN context_swing_count_20 < 10 THEN 'Medium (6-9)'
      ELSE 'High (10+)'
    END as swing_category
  FROM signals
  WHERE 
    timeframe = '15m'
    AND status IN ('SL_HIT', 'TP1_HIT', 'TP2_HIT', 'TP3_HIT', 'BE_HIT')
  ORDER BY created_at DESC
) TO STDOUT WITH CSV HEADER;
EOF

# Статистика
echo ""
echo "✅ Экспорт завершен!"
echo ""
LINES=$(wc -l < "$OUTPUT_FILE")
COUNT=$((LINES - 1))
echo "📊 Общая статистика:"
echo "   Всего сделок: $COUNT"
echo "   Файл: $OUTPUT_FILE"
echo ""

# Детальная разбивка
echo "📊 Разбивка по результатам:"
psql $DATABASE_URL -c "
  SELECT 
    CASE 
      WHEN status = 'SL_HIT' THEN 'Loss'
      WHEN status IN ('TP1_HIT', 'TP2_HIT', 'TP3_HIT') THEN 'Win'
      WHEN status = 'BE_HIT' THEN 'Breakeven'
    END as outcome,
    COUNT(*) as count,
    ROUND(AVG(pnl_r::numeric), 2) as avg_r,
    ROUND(AVG(pnl_percent::numeric), 2) as avg_pct,
    ROUND(AVG(time_to_tp2_min::numeric), 0) as avg_time_min
  FROM signals
  WHERE timeframe = '15m' 
    AND status IN ('SL_HIT', 'TP1_HIT', 'TP2_HIT', 'TP3_HIT', 'BE_HIT')
  GROUP BY outcome
  ORDER BY count DESC;
"

echo ""
echo "📊 Win Rate:"
psql $DATABASE_URL -c "
  WITH stats AS (
    SELECT 
      COUNT(*) FILTER (WHERE status IN ('TP1_HIT', 'TP2_HIT', 'TP3_HIT')) as wins,
      COUNT(*) FILTER (WHERE status = 'SL_HIT') as losses,
      COUNT(*) as total
    FROM signals
    WHERE timeframe = '15m' 
      AND status IN ('SL_HIT', 'TP1_HIT', 'TP2_HIT', 'TP3_HIT')
  )
  SELECT 
    wins,
    losses,
    total,
    ROUND((wins::numeric / total * 100), 1) as win_rate_pct
  FROM stats;
"

echo ""
echo "📊 Лучшие паттерны (по Win Rate):"
psql $DATABASE_URL -c "
  WITH pattern_stats AS (
    SELECT 
      pattern_type,
      COUNT(*) FILTER (WHERE status IN ('TP1_HIT', 'TP2_HIT', 'TP3_HIT')) as wins,
      COUNT(*) as total
    FROM signals
    WHERE timeframe = '15m' 
      AND status IN ('SL_HIT', 'TP1_HIT', 'TP2_HIT', 'TP3_HIT')
    GROUP BY pattern_type
  )
  SELECT 
    pattern_type,
    wins,
    total,
    ROUND((wins::numeric / total * 100), 1) as win_rate_pct,
    ROUND(AVG(pnl_r::numeric), 2) as avg_r
  FROM pattern_stats
  JOIN signals USING (pattern_type)
  WHERE timeframe = '15m'
  GROUP BY pattern_type, wins, total
  ORDER BY win_rate_pct DESC;
"

echo ""
echo "💡 Теперь можно анализировать в Python, Excel или любом BI-инструменте!"
