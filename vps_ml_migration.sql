-- Complete ML Infrastructure Migration for VPS
-- Run this on VPS to create all ML tables and enums

-- ========================================
-- STEP 1: Create ENUMs
-- ========================================

DO $$ BEGIN
    CREATE TYPE decision AS ENUM ('enter', 'skip');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE ema200_position AS ENUM ('above', 'below', 'crossing');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE vwap_position AS ENUM ('above', 'below');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE trend_bias AS ENUM ('long', 'short', 'neutral');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE btc_trend_state AS ENUM ('up', 'down', 'neutral');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE arrival_pattern AS ENUM ('impulse_up', 'impulse_down', 'compression', 'chop');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE confirm_type AS ENUM ('bos_1m', 'bos_5m', 'rejection_15m', 'fakey_reentry', 'none');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE zone_touch_bucket AS ENUM ('0', '1', '2', '>=3');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE signal_bar_size_bucket AS ENUM ('<0.15', '0.15-0.6', '0.6-1.2', '>1.2');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE shadow_outcome AS ENUM ('tp1', 'tp2', 'sl', 'timeout');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ========================================
-- STEP 2: Create Tables
-- ========================================

-- Near-miss SKIP signals (for ML analysis)
CREATE TABLE IF NOT EXISTS near_miss_skips (
    id SERIAL PRIMARY KEY,
    signal_id VARCHAR(36) NOT NULL UNIQUE,
    symbol TEXT NOT NULL,
    entry_tf TEXT NOT NULL,
    side signal_direction NOT NULL,
    pattern_type TEXT NOT NULL,
    ts TIMESTAMP NOT NULL,
    
    -- ATR/volatility
    atr_15m DECIMAL(18, 8) NOT NULL,
    atr_1h DECIMAL(18, 8) NOT NULL,
    atr_4h DECIMAL(18, 8) NOT NULL,
    
    -- Trend context
    ema200_1h_pos ema200_position NOT NULL,
    vwap_1h_pos vwap_position NOT NULL,
    trend_bias trend_bias NOT NULL,
    btc_trend_state btc_trend_state NOT NULL,
    
    -- Zones snapshot (JSON: array of 6 zones)
    zones JSONB NOT NULL,
    in_h4_zone BOOLEAN NOT NULL,
    near_h4_support BOOLEAN NOT NULL,
    near_h4_resistance BOOLEAN NOT NULL,
    
    -- Distances
    dist_to_dir_h1_zone_atr DECIMAL(10, 4) NOT NULL,
    dist_to_dir_h4_zone_atr DECIMAL(10, 4) NOT NULL,
    free_path_pts DECIMAL(18, 8) NOT NULL,
    free_path_atr15 DECIMAL(10, 4) NOT NULL,
    free_path_r DECIMAL(10, 4) NOT NULL,
    
    -- Arrival & zone quality
    arrival_pattern arrival_pattern NOT NULL,
    zone_touch_count_bucket zone_touch_bucket NOT NULL,
    zone_thickness_atr15 DECIMAL(10, 4) NOT NULL,
    
    -- Signal bar
    signal_bar_size_atr15 DECIMAL(10, 4) NOT NULL,
    signal_bar_size_bucket signal_bar_size_bucket NOT NULL,
    
    -- Confirmation
    confirm_type confirm_type,
    confirm_wait_bars_15m INTEGER,
    
    -- Decision
    decision decision NOT NULL DEFAULT 'skip',
    skip_reasons TEXT[] NOT NULL,
    ruleset_version TEXT NOT NULL,
    
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Shadow evaluations (for sampled SKIPs)
CREATE TABLE IF NOT EXISTS shadow_evaluations (
    id SERIAL PRIMARY KEY,
    signal_id VARCHAR(36) NOT NULL,
    reason_code TEXT NOT NULL,
    
    hypothetical_entry_price DECIMAL(18, 8) NOT NULL,
    hypothetical_entry_time TIMESTAMP NOT NULL,
    
    shadow_outcome shadow_outcome,
    shadow_mfe_r DECIMAL(10, 4),
    shadow_mae_r DECIMAL(10, 4),
    shadow_time_to_first_touch_min INTEGER,
    
    -- Status tracking
    is_active BOOLEAN DEFAULT true,
    completed_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- 1m tracking for shadow evaluations (temporary, deleted after completion)
CREATE TABLE IF NOT EXISTS tracking_1m_shadow (
    id SERIAL PRIMARY KEY,
    shadow_eval_id INTEGER NOT NULL,
    bar_1m_ts TIMESTAMP NOT NULL,
    high DECIMAL(18, 8) NOT NULL,
    low DECIMAL(18, 8) NOT NULL
);

-- Parquet export tracking
CREATE TABLE IF NOT EXISTS parquet_exports (
    id SERIAL PRIMARY KEY,
    export_date DATE NOT NULL,
    export_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    record_count INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ========================================
-- STEP 3: Verification
-- ========================================
SELECT 'ML infrastructure created successfully!' as status;
SELECT 'Tables created:' as info, count(*) as table_count 
FROM information_schema.tables 
WHERE table_name IN ('near_miss_skips', 'shadow_evaluations', 'tracking_1m_shadow', 'parquet_exports');
