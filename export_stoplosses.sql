-- Выгрузка всех SL_HIT сигналов со всеми полями для ML анализа
\copy (
  SELECT 
    id,
    symbol,
    timeframe,
    direction,
    pattern_type,
    
    -- Цены
    entry_price,
    sl_price,
    tp1_price,
    tp2_price,
    tp3_price,
    exit_type,
    
    -- Результат
    status,
    pnl_r,
    pnl_percent,
    
    -- Context перед сигналом
    context_trend_before,
    context_was_reversal,
    context_swing_count_20,
    context_recent_direction,
    context_distance_from_ema,
    
    -- НОВЫЕ метрики (то что восстанавливаем!)
    pattern_score,
    trend_alignment,
    clearance_15m,
    
    -- Post-SL данные (достиг ли TP после стопа)
    post_sl_outcome,
    post_sl_max_favorable_r,
    post_sl_time_to_tp_min,
    
    -- MFE/MAE (максимальная прибыль/убыток)
    mfe_r,
    mae_r,
    
    -- Время
    created_at as signal_time,
    time_to_sl_min,
    
    -- Дополнительные метрики
    atr_15m,
    free_path_r,
    clearance_1h,
    r_available,
    actual_rr_tp1,
    actual_rr_tp2,
    actual_rr_tp3,
    multi_tf_alignment,
    confluence_score
    
  FROM signals
  WHERE status = 'SL_HIT'
    AND timeframe = '15m'
  ORDER BY created_at DESC
) TO STDOUT WITH CSV HEADER;
