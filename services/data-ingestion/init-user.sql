-- Create ingestion service user
-- This user has INSERT permissions only (no DELETE/UPDATE for safety)

-- Create user if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'nexus_ingestion') THEN
        CREATE ROLE nexus_ingestion WITH LOGIN PASSWORD 'ingestion_password';
    END IF;
END
$$;

-- Grant permissions
GRANT CONNECT ON DATABASE nexus_historian TO nexus_ingestion;
GRANT USAGE ON SCHEMA public TO nexus_ingestion;

-- Grant INSERT on metrics table (no UPDATE/DELETE for safety)
GRANT INSERT ON metrics TO nexus_ingestion;

-- Grant SELECT for health checks
GRANT SELECT ON metrics TO nexus_ingestion;

-- Grant EXECUTE on functions
GRANT EXECUTE ON FUNCTION query_metrics TO nexus_ingestion;
GRANT EXECUTE ON FUNCTION get_optimal_aggregate TO nexus_ingestion;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Data Ingestion user created and permissions granted';
END
$$;

