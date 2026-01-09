-- =============================================================================
-- NEXUS Edge - TimescaleDB Historian Initialization
-- Time-series storage for industrial data
-- =============================================================================

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- =============================================================================
-- Data Points Table (Hypertable)
-- =============================================================================

CREATE TABLE IF NOT EXISTS data_points (
    time        TIMESTAMPTZ NOT NULL,
    device_id   TEXT NOT NULL,
    tag_name    TEXT NOT NULL,
    value       DOUBLE PRECISION,
    quality     SMALLINT DEFAULT 0,
    metadata    JSONB DEFAULT '{}'::jsonb
);

-- Convert to hypertable (time-series optimized)
SELECT create_hypertable('data_points', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_data_points_device_tag_time
    ON data_points (device_id, tag_name, time DESC);

-- Index for device lookups
CREATE INDEX IF NOT EXISTS idx_data_points_device
    ON data_points (device_id, time DESC);

-- =============================================================================
-- Compression Policy (compress data older than 7 days)
-- =============================================================================

ALTER TABLE data_points SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'device_id, tag_name'
);

SELECT add_compression_policy('data_points', INTERVAL '7 days', if_not_exists => TRUE);

-- =============================================================================
-- Retention Policy (delete data older than 90 days - adjust as needed)
-- =============================================================================

SELECT add_retention_policy('data_points', INTERVAL '90 days', if_not_exists => TRUE);

-- =============================================================================
-- Continuous Aggregates (pre-computed rollups)
-- =============================================================================

-- 1-minute aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS data_points_1min
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', time) AS bucket,
    device_id,
    tag_name,
    avg(value) AS avg_value,
    min(value) AS min_value,
    max(value) AS max_value,
    count(*) AS sample_count
FROM data_points
GROUP BY bucket, device_id, tag_name
WITH NO DATA;

-- Refresh policy for 1-minute aggregates
SELECT add_continuous_aggregate_policy('data_points_1min',
    start_offset => INTERVAL '1 hour',
    end_offset => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists => TRUE
);

-- 1-hour aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS data_points_1hour
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    device_id,
    tag_name,
    avg(value) AS avg_value,
    min(value) AS min_value,
    max(value) AS max_value,
    count(*) AS sample_count
FROM data_points
GROUP BY bucket, device_id, tag_name
WITH NO DATA;

-- Refresh policy for 1-hour aggregates
SELECT add_continuous_aggregate_policy('data_points_1hour',
    start_offset => INTERVAL '1 day',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- =============================================================================
-- Create user for data ingestion service
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'nexus_ingestion') THEN
        CREATE USER nexus_ingestion WITH PASSWORD 'nexus_historian_secret';
    END IF;
END
$$;

GRANT ALL PRIVILEGES ON TABLE data_points TO nexus_ingestion;
GRANT ALL PRIVILEGES ON TABLE data_points_1min TO nexus_ingestion;
GRANT ALL PRIVILEGES ON TABLE data_points_1hour TO nexus_ingestion;

-- =============================================================================
-- Done
-- =============================================================================

\echo 'NEXUS Edge - TimescaleDB historian initialized successfully!'

