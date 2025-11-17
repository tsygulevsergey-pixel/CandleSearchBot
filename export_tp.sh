#!/bin/bash

# Export Take-Profit signals to CSV
# Exports all signals that reached TP1/TP2/TP3 for comparison with stop-losses

TIMESTAMP=$(date +%s%3N)
OUTPUT_FILE="attached_assets/takeprofits_export_${TIMESTAMP}.csv"

echo "📊 Exporting Take-Profit signals..."
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
    arrival_pattern
  FROM signals
  WHERE 
    timeframe = '15m'
    AND status IN ('TP1_HIT', 'TP2_HIT', 'TP3_HIT')
  ORDER BY created_at DESC
) TO STDOUT WITH CSV HEADER;
EOF

# Count results
LINES=$(wc -l < "$OUTPUT_FILE")
COUNT=$((LINES - 1))

echo ""
echo "✅ Export complete!"
echo "   Total TP signals: $COUNT"
echo "   File: $OUTPUT_FILE"
echo ""
echo "📊 Breakdown by TP level:"
psql $DATABASE_URL -c "
  SELECT 
    status,
    COUNT(*) as count,
    ROUND(AVG(pnl_r::numeric), 2) as avg_r,
    ROUND(AVG(pnl_percent::numeric), 2) as avg_pct
  FROM signals
  WHERE timeframe = '15m' 
    AND status IN ('TP1_HIT', 'TP2_HIT', 'TP3_HIT')
  GROUP BY status
  ORDER BY status;
"

echo ""
echo "📈 Pattern distribution:"
psql $DATABASE_URL -c "
  SELECT 
    pattern_type,
    COUNT(*) as count,
    ROUND(AVG(pnl_r::numeric), 2) as avg_r
  FROM signals
  WHERE timeframe = '15m' 
    AND status IN ('TP1_HIT', 'TP2_HIT', 'TP3_HIT')
  GROUP BY pattern_type
  ORDER BY count DESC;
"

echo ""
echo "🎯 Trend alignment:"
psql $DATABASE_URL -c "
  SELECT 
    trend_alignment,
    COUNT(*) as count,
    ROUND(AVG(pnl_r::numeric), 2) as avg_r
  FROM signals
  WHERE timeframe = '15m' 
    AND status IN ('TP1_HIT', 'TP2_HIT', 'TP3_HIT')
  GROUP BY trend_alignment
  ORDER BY count DESC;
"

echo ""
echo "💡 Use this file to compare successful signals with stop-losses!"
echo "   Compare: pattern_score, trend_alignment, recent_direction, clearance_15m"
