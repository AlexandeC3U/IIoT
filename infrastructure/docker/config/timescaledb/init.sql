-- =============================================================================
-- NEXUS Edge - TimescaleDB Historian Initialization (V2)
-- Docker entrypoint script — mirrors config/timescaledb/init.sql
-- =============================================================================

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- =============================================================================
-- Core Metrics Table (Hypertable)
-- =============================================================================

CREATE TABLE IF NOT EXISTS metrics (
    time        TIMESTAMPTZ NOT NULL,
    topic       TEXT NOT NULL,
    value       DOUBLE PRECISION,
    value_str   TEXT,
    quality     SMALLINT DEFAULT 192,  -- OPC UA Good quality
    metadata    JSONB DEFAULT '{}'::jsonb,

    CONSTRAINT metrics_value_check CHECK (
        value IS NOT NULL OR value_str IS NOT NULL
    )
);

SELECT create_hypertable('metrics', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_metrics_topic_time
    ON metrics (topic, time DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_metadata
    ON metrics USING GIN (metadata);

-- =============================================================================
-- Continuous Aggregates
-- =============================================================================

-- 1-minute aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_1min
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', time) AS bucket,
    topic,
    AVG(value) AS avg_value,
    MIN(value) AS min_value,
    MAX(value) AS max_value,
    COUNT(*) AS sample_count,
    FIRST(value, time) AS first_value,
    LAST(value, time) AS last_value
FROM metrics
WHERE value IS NOT NULL
GROUP BY bucket, topic
WITH NO DATA;

-- 1-hour aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_1hour
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    topic,
    AVG(value) AS avg_value,
    MIN(value) AS min_value,
    MAX(value) AS max_value,
    COUNT(*) AS sample_count,
    FIRST(value, time) AS first_value,
    LAST(value, time) AS last_value
FROM metrics
WHERE value IS NOT NULL
GROUP BY bucket, topic
WITH NO DATA;

-- 1-day aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_1day
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    topic,
    AVG(value) AS avg_value,
    MIN(value) AS min_value,
    MAX(value) AS max_value,
    COUNT(*) AS sample_count,
    FIRST(value, time) AS first_value,
    LAST(value, time) AS last_value
FROM metrics
WHERE value IS NOT NULL
GROUP BY bucket, topic
WITH NO DATA;

-- =============================================================================
-- Refresh Policies
-- =============================================================================

SELECT add_continuous_aggregate_policy('metrics_1min',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists => TRUE
);

SELECT add_continuous_aggregate_policy('metrics_1hour',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

SELECT add_continuous_aggregate_policy('metrics_1day',
    start_offset => INTERVAL '3 months',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- =============================================================================
-- Retention Policies
-- =============================================================================

SELECT add_retention_policy('metrics', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy('metrics_1min', INTERVAL '90 days', if_not_exists => TRUE);
SELECT add_retention_policy('metrics_1hour', INTERVAL '1 year', if_not_exists => TRUE);
SELECT add_retention_policy('metrics_1day', INTERVAL '5 years', if_not_exists => TRUE);

-- =============================================================================
-- Compression Policy
-- =============================================================================

ALTER TABLE metrics SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'topic',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('metrics', INTERVAL '7 days', if_not_exists => TRUE);

-- =============================================================================
-- Helper Functions
-- =============================================================================

CREATE OR REPLACE FUNCTION get_optimal_aggregate(
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
) RETURNS TEXT AS $$
DECLARE
    time_range INTERVAL;
BEGIN
    time_range := p_end_time - p_start_time;

    IF time_range <= INTERVAL '2 hours' THEN
        RETURN 'metrics';
    ELSIF time_range <= INTERVAL '7 days' THEN
        RETURN 'metrics_1min';
    ELSIF time_range <= INTERVAL '90 days' THEN
        RETURN 'metrics_1hour';
    ELSE
        RETURN 'metrics_1day';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION query_metrics(
    p_topics TEXT[],
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_max_points INTEGER DEFAULT 1000
) RETURNS TABLE (
    bucket TIMESTAMPTZ,
    topic TEXT,
    avg_value DOUBLE PRECISION,
    min_value DOUBLE PRECISION,
    max_value DOUBLE PRECISION
) AS $$
DECLARE
    time_range INTERVAL;
    bucket_size INTERVAL;
BEGIN
    time_range := p_end_time - p_start_time;
    bucket_size := time_range / p_max_points;

    IF bucket_size < INTERVAL '1 minute' THEN
        RETURN QUERY
        SELECT
            time_bucket(bucket_size, m.time) AS bucket,
            m.topic,
            AVG(m.value) AS avg_value,
            MIN(m.value) AS min_value,
            MAX(m.value) AS max_value
        FROM metrics m
        WHERE m.topic = ANY(p_topics)
          AND m.time >= p_start_time
          AND m.time <= p_end_time
          AND m.value IS NOT NULL
        GROUP BY 1, 2
        ORDER BY bucket;
    ELSIF bucket_size < INTERVAL '1 hour' THEN
        RETURN QUERY
        SELECT
            time_bucket(bucket_size, m.bucket) AS bucket,
            m.topic,
            AVG(m.avg_value) AS avg_value,
            MIN(m.min_value) AS min_value,
            MAX(m.max_value) AS max_value
        FROM metrics_1min m
        WHERE m.topic = ANY(p_topics)
          AND m.bucket >= p_start_time
          AND m.bucket <= p_end_time
        GROUP BY 1, 2
        ORDER BY bucket;
    ELSIF bucket_size < INTERVAL '1 day' THEN
        RETURN QUERY
        SELECT
            time_bucket(bucket_size, m.bucket) AS bucket,
            m.topic,
            AVG(m.avg_value) AS avg_value,
            MIN(m.min_value) AS min_value,
            MAX(m.max_value) AS max_value
        FROM metrics_1hour m
        WHERE m.topic = ANY(p_topics)
          AND m.bucket >= p_start_time
          AND m.bucket <= p_end_time
        GROUP BY 1, 2
        ORDER BY bucket;
    ELSE
        RETURN QUERY
        SELECT
            time_bucket(bucket_size, m.bucket) AS bucket,
            m.topic,
            AVG(m.avg_value) AS avg_value,
            MIN(m.min_value) AS min_value,
            MAX(m.max_value) AS max_value
        FROM metrics_1day m
        WHERE m.topic = ANY(p_topics)
          AND m.bucket >= p_start_time
          AND m.bucket <= p_end_time
        GROUP BY 1, 2
        ORDER BY bucket;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Grants
-- =============================================================================

GRANT SELECT, INSERT ON metrics TO nexus_historian;
GRANT SELECT ON metrics_1min, metrics_1hour, metrics_1day TO nexus_historian;
GRANT EXECUTE ON FUNCTION query_metrics TO nexus_historian;
GRANT EXECUTE ON FUNCTION get_optimal_aggregate TO nexus_historian;

GRANT INSERT, SELECT ON metrics TO nexus_ingestion;
GRANT SELECT ON metrics_1min, metrics_1hour, metrics_1day TO nexus_ingestion;
GRANT EXECUTE ON FUNCTION query_metrics TO nexus_ingestion;
GRANT EXECUTE ON FUNCTION get_optimal_aggregate TO nexus_ingestion;

\echo 'NEXUS Edge - TimescaleDB historian initialized (V2)!'
