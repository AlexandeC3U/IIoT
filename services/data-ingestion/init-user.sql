-- Create database users
-- This script must run BEFORE the schema init script (mounted as 00-init-user.sql)
-- Only creates roles here - table grants are done in 01-init.sql after tables exist

-- Create nexus_historian role (used by init.sql GRANTS)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'nexus_historian') THEN
        CREATE ROLE nexus_historian WITH LOGIN PASSWORD 'nexus_dev';
    END IF;
END
$$;

-- Create ingestion service user
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'nexus_ingestion') THEN
        CREATE ROLE nexus_ingestion WITH LOGIN PASSWORD 'ingestion_password';
    END IF;
END
$$;

-- Basic permissions (database and schema level only - no table grants yet)
GRANT CONNECT ON DATABASE nexus_historian TO nexus_ingestion;
GRANT CONNECT ON DATABASE nexus_historian TO nexus_historian;
GRANT USAGE ON SCHEMA public TO nexus_ingestion;
GRANT USAGE ON SCHEMA public TO nexus_historian;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Database users created: nexus_historian, nexus_ingestion';
END
$$;
