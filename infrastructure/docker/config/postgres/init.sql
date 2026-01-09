-- =============================================================================
-- NEXUS Edge - PostgreSQL Configuration Database Initialization
-- This creates the schema for device/tag configuration (Gateway Core)
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- Enums
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE protocol AS ENUM ('modbus', 'opcua', 's7');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE device_status AS ENUM ('online', 'offline', 'error', 'unknown');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE tag_data_type AS ENUM (
        'bool', 'int16', 'int32', 'int64',
        'uint16', 'uint32', 'uint64',
        'float32', 'float64', 'string'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- Tables
-- =============================================================================

-- Devices table
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    protocol protocol NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,

    -- Connection settings
    host VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL,
    protocol_config JSONB DEFAULT '{}'::jsonb,

    -- Polling configuration
    poll_interval_ms INTEGER NOT NULL DEFAULT 1000,

    -- Status
    status device_status NOT NULL DEFAULT 'unknown',
    last_seen TIMESTAMPTZ,
    last_error TEXT,

    -- Metadata
    location VARCHAR(255),
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    enabled BOOLEAN NOT NULL DEFAULT true,

    -- Address
    address VARCHAR(512) NOT NULL,
    data_type tag_data_type NOT NULL,

    -- Transformations
    scale_factor INTEGER,
    scale_offset INTEGER,
    clamp_min INTEGER,
    clamp_max INTEGER,
    engineering_units VARCHAR(50),

    -- Deadband (Phase 4)
    deadband_absolute INTEGER,
    deadband_percent INTEGER,

    -- Custom topic
    custom_topic VARCHAR(512),

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS devices_name_idx ON devices(name);
CREATE INDEX IF NOT EXISTS devices_protocol_idx ON devices(protocol);
CREATE INDEX IF NOT EXISTS devices_status_idx ON devices(status);

CREATE UNIQUE INDEX IF NOT EXISTS tags_device_tag_idx ON tags(device_id, name);
CREATE INDEX IF NOT EXISTS tags_device_idx ON tags(device_id);

-- =============================================================================
-- Triggers for updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_devices_updated_at ON devices;
CREATE TRIGGER update_devices_updated_at
    BEFORE UPDATE ON devices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tags_updated_at ON tags;
CREATE TRIGGER update_tags_updated_at
    BEFORE UPDATE ON tags
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Sample Data (for development)
-- =============================================================================

INSERT INTO devices (name, description, protocol, host, port, protocol_config, poll_interval_ms, location)
VALUES
    ('PLC-001', 'Main production line PLC', 'modbus', '192.168.1.10', 502,
     '{"unitId": 1, "timeout": 5000}'::jsonb, 1000, 'Building A - Line 1'),
    ('OPC-001', 'SCADA server OPC UA', 'opcua', '192.168.1.20', 4840,
     '{"securityPolicy": "Basic256Sha256", "securityMode": "SignAndEncrypt"}'::jsonb, 500, 'Control Room'),
    ('S7-001', 'Siemens S7-1500', 's7', '192.168.1.30', 102,
     '{"rack": 0, "slot": 1, "pduSize": 480}'::jsonb, 250, 'Building B - Packaging')
ON CONFLICT (name) DO NOTHING;

-- Insert sample tags for the Modbus device
INSERT INTO tags (device_id, name, description, address, data_type, engineering_units)
SELECT
    d.id,
    t.name,
    t.description,
    t.address,
    t.data_type::tag_data_type,
    t.units
FROM devices d
CROSS JOIN (VALUES
    ('Temperature', 'Motor temperature', '40001', 'float32', '°C'),
    ('Pressure', 'Line pressure', '40003', 'float32', 'bar'),
    ('Speed', 'Motor speed', '40005', 'uint16', 'rpm'),
    ('Running', 'Motor running status', '00001', 'bool', NULL),
    ('Alarm', 'Alarm status', '00002', 'bool', NULL)
) AS t(name, description, address, data_type, units)
WHERE d.name = 'PLC-001'
ON CONFLICT (device_id, name) DO NOTHING;

-- =============================================================================
-- Done
-- =============================================================================

\echo 'NEXUS Edge - PostgreSQL config database initialized successfully!'

