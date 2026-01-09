-- ═══════════════════════════════════════════════════════════════════════════════
-- NEXUS EDGE - Configuration Database Schema
-- PostgreSQL initialization script (Phase 3 compatible)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════════════════════════
-- ENUMS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TYPE protocol AS ENUM ('modbus', 'opcua', 's7');
CREATE TYPE device_status AS ENUM ('online', 'offline', 'error', 'unknown');
CREATE TYPE tag_data_type AS ENUM (
    'bool', 'int16', 'int32', 'int64',
    'uint16', 'uint32', 'uint64',
    'float32', 'float64', 'string'
);
CREATE TYPE user_role AS ENUM ('admin', 'engineer', 'operator', 'viewer');

-- ═══════════════════════════════════════════════════════════════════════════════
-- USERS & AUTHENTICATION
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username        VARCHAR(255) UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            user_role NOT NULL DEFAULT 'viewer',
    enabled         BOOLEAN DEFAULT TRUE,
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    key_hash        VARCHAR(255) NOT NULL,
    permissions     JSONB DEFAULT '[]'::jsonb,
    expires_at      TIMESTAMPTZ,
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL,
    ip_address      INET,
    user_agent      TEXT,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Default admin user (password: nexus-admin-2024!)
INSERT INTO users (username, email, password_hash, role)
VALUES (
    'admin',
    'admin@nexus.local',
    crypt('nexus-admin-2024!', gen_salt('bf')),
    'admin'
) ON CONFLICT (username) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- DEVICES (Phase 3 Schema - Gateway Core compatible)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS devices (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(255) NOT NULL UNIQUE,
    description         TEXT,
    protocol            protocol NOT NULL,
    enabled             BOOLEAN NOT NULL DEFAULT TRUE,

    -- Connection settings (explicit columns for type safety)
    host                VARCHAR(255) NOT NULL,
    port                INTEGER NOT NULL,
    protocol_config     JSONB DEFAULT '{}'::jsonb,

    -- Polling configuration
    poll_interval_ms    INTEGER NOT NULL DEFAULT 1000,

    -- Status (updated by protocol gateway)
    status              device_status NOT NULL DEFAULT 'unknown',
    last_seen           TIMESTAMPTZ,
    last_error          TEXT,

    -- Metadata
    location            VARCHAR(255),
    metadata            JSONB DEFAULT '{}'::jsonb,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS devices_name_idx ON devices(name);
CREATE INDEX IF NOT EXISTS devices_protocol_idx ON devices(protocol);
CREATE INDEX IF NOT EXISTS devices_status_idx ON devices(status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TAGS (Phase 3 Schema - Gateway Core compatible)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tags (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id           UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    name                VARCHAR(255) NOT NULL,
    description         TEXT,
    enabled             BOOLEAN NOT NULL DEFAULT TRUE,

    -- Address (protocol-specific)
    address             VARCHAR(512) NOT NULL,
    data_type           tag_data_type NOT NULL,

    -- Transformations
    scale_factor        INTEGER,
    scale_offset        INTEGER,
    clamp_min           INTEGER,
    clamp_max           INTEGER,
    engineering_units   VARCHAR(50),

    -- Deadband (Phase 4)
    deadband_absolute   INTEGER,
    deadband_percent    INTEGER,

    -- Custom MQTT topic
    custom_topic        VARCHAR(512),

    -- Metadata
    metadata            JSONB DEFAULT '{}'::jsonb,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(device_id, name)
);

CREATE INDEX IF NOT EXISTS tags_device_idx ON tags(device_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- DASHBOARDS & WIDGETS (Phase 4+)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dashboards (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    layout          JSONB NOT NULL DEFAULT '{"columns": 12, "rowHeight": 50}'::jsonb,
    theme           JSONB DEFAULT '{}'::jsonb,
    is_default      BOOLEAN DEFAULT FALSE,
    is_public       BOOLEAN DEFAULT FALSE,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE widget_type AS ENUM (
    'gauge', 'timeseries', 'table', 'heatmap', 'status',
    'alertlist', 'svg', 'text', 'button', 'input'
);

CREATE TABLE IF NOT EXISTS widgets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dashboard_id    UUID REFERENCES dashboards(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    type            widget_type NOT NULL,
    position        JSONB NOT NULL,
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,
    data_source     JSONB NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS widgets_dashboard_idx ON widgets(dashboard_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ALERTS (Phase 4+)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'critical');
CREATE TYPE alert_state AS ENUM ('normal', 'active', 'acknowledged');

CREATE TABLE IF NOT EXISTS alert_rules (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    enabled         BOOLEAN DEFAULT TRUE,
    severity        alert_severity NOT NULL DEFAULT 'warning',
    condition       JSONB NOT NULL,
    trigger_delay   INTEGER DEFAULT 0,
    clear_delay     INTEGER DEFAULT 0,
    notifications   JSONB DEFAULT '{}'::jsonb,
    escalation      JSONB,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_instances (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id         UUID REFERENCES alert_rules(id) ON DELETE CASCADE,
    state           alert_state NOT NULL DEFAULT 'active',
    triggered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES users(id),
    cleared_at      TIMESTAMPTZ,
    trigger_value   DOUBLE PRECISION,
    trigger_topic   VARCHAR(512),
    context         JSONB DEFAULT '{}'::jsonb,
    notes           TEXT
);

CREATE INDEX IF NOT EXISTS alert_instances_rule_idx ON alert_instances(rule_id);
CREATE INDEX IF NOT EXISTS alert_instances_state_idx ON alert_instances(state) WHERE state != 'normal';

-- ═══════════════════════════════════════════════════════════════════════════════
-- SYSTEM CONFIGURATION
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS system_config (
    key             VARCHAR(255) PRIMARY KEY,
    value           JSONB NOT NULL,
    description     TEXT,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO system_config (key, value, description) VALUES
    ('mqtt.broker', '{"host": "emqx", "port": 1883}'::jsonb, 'MQTT broker connection'),
    ('historian.retention', '{"raw": "30d", "1min": "90d", "1hour": "1y", "1day": "5y"}'::jsonb, 'Data retention policies'),
    ('ui.theme', '"industrial-dark"'::jsonb, 'Default UI theme'),
    ('security.session_timeout', '86400'::jsonb, 'Session timeout in seconds')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- AUDIT LOG
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TYPE audit_action AS ENUM (
    'login', 'logout', 'login_failed',
    'create', 'update', 'delete',
    'deploy', 'start', 'stop',
    'acknowledge', 'config_change'
);

CREATE TABLE IF NOT EXISTS audit_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id),
    action          audit_action NOT NULL,
    resource_type   VARCHAR(100),
    resource_id     UUID,
    details         JSONB DEFAULT '{}'::jsonb,
    ip_address      INET,
    timestamp       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_user_idx ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS audit_log_timestamp_idx ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS audit_log_resource_idx ON audit_log(resource_type, resource_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TRIGGERS FOR UPDATED_AT
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON tags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_dashboards_updated_at BEFORE UPDATE ON dashboards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_widgets_updated_at BEFORE UPDATE ON widgets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_alert_rules_updated_at BEFORE UPDATE ON alert_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- SAMPLE DATA (Development)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO devices (name, description, protocol, host, port, protocol_config, poll_interval_ms, location)
VALUES
    ('PLC-001', 'Main production line PLC', 'modbus', '192.168.1.10', 502,
     '{"unitId": 1, "timeout": 5000}'::jsonb, 1000, 'Building A - Line 1'),
    ('OPC-001', 'SCADA server OPC UA', 'opcua', '192.168.1.20', 4840,
     '{"securityPolicy": "Basic256Sha256", "securityMode": "SignAndEncrypt"}'::jsonb, 500, 'Control Room'),
    ('S7-001', 'Siemens S7-1500', 's7', '192.168.1.30', 102,
     '{"rack": 0, "slot": 1, "pduSize": 480}'::jsonb, 250, 'Building B - Packaging')
ON CONFLICT (name) DO NOTHING;

-- Insert sample tags for PLC-001
INSERT INTO tags (device_id, name, description, address, data_type, engineering_units)
SELECT
    d.id, t.name, t.description, t.address, t.data_type::tag_data_type, t.units
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

-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    RAISE NOTICE 'NEXUS Edge Configuration database initialized successfully';
    RAISE NOTICE 'Default admin user: admin / nexus-admin-2024!';
    RAISE NOTICE 'Sample devices created: PLC-001, OPC-001, S7-001';
END $$;
