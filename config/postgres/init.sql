-- ═══════════════════════════════════════════════════════════════════════════════
-- NEXUS EDGE - Configuration Database Schema
-- PostgreSQL initialization script
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════════════════════════
-- USERS & AUTHENTICATION
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TYPE user_role AS ENUM ('admin', 'engineer', 'operator', 'viewer');

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
-- DEVICES & TAGS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TYPE protocol_type AS ENUM ('S7', 'OPCUA', 'MODBUS', 'MQTT');
CREATE TYPE device_status AS ENUM ('connected', 'disconnected', 'error', 'unknown');

CREATE TABLE IF NOT EXISTS devices (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    protocol        protocol_type NOT NULL,
    enabled         BOOLEAN DEFAULT TRUE,
    
    -- Connection configuration (JSON for flexibility across protocols)
    connection      JSONB NOT NULL,
    
    -- Status (updated by protocol gateway)
    status          device_status DEFAULT 'unknown',
    last_seen       TIMESTAMPTZ,
    error_count     INTEGER DEFAULT 0,
    last_error      TEXT,
    
    -- Metadata
    location        VARCHAR(255),
    manufacturer    VARCHAR(255),
    model           VARCHAR(255),
    firmware        VARCHAR(255),
    
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_tags (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id       UUID REFERENCES devices(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    address         VARCHAR(255) NOT NULL,
    data_type       VARCHAR(50) NOT NULL,
    
    -- MQTT topic mapping
    mqtt_topic      VARCHAR(512) NOT NULL,
    
    -- Scaling configuration
    scaling_enabled BOOLEAN DEFAULT FALSE,
    raw_min         DOUBLE PRECISION,
    raw_max         DOUBLE PRECISION,
    eng_min         DOUBLE PRECISION,
    eng_max         DOUBLE PRECISION,
    
    engineering_unit VARCHAR(50),
    
    enabled         BOOLEAN DEFAULT TRUE,
    poll_interval   INTEGER,  -- Override device default (ms)
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(device_id, address)
);

CREATE INDEX idx_device_tags_device ON device_tags(device_id);
CREATE INDEX idx_device_tags_topic ON device_tags(mqtt_topic);

-- ═══════════════════════════════════════════════════════════════════════════════
-- FLOWS (Node-RED compatible)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TYPE flow_status AS ENUM ('stopped', 'running', 'error');

CREATE TABLE IF NOT EXISTS flows (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    
    -- Node-RED flow JSON
    definition      JSONB NOT NULL,
    
    status          flow_status DEFAULT 'stopped',
    enabled         BOOLEAN DEFAULT TRUE,
    
    -- Version control
    version         INTEGER DEFAULT 1,
    
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flow_versions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flow_id         UUID REFERENCES flows(id) ON DELETE CASCADE,
    version         INTEGER NOT NULL,
    definition      JSONB NOT NULL,
    comment         TEXT,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(flow_id, version)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- DASHBOARDS & WIDGETS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dashboards (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    
    -- Grid layout configuration
    layout          JSONB NOT NULL DEFAULT '{"columns": 12, "rowHeight": 50}'::jsonb,
    
    -- Theme/styling
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
    
    -- Position on grid (react-grid-layout compatible)
    position        JSONB NOT NULL,  -- {x, y, w, h}
    
    -- Widget-specific configuration
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Data binding (MQTT topics or historian queries)
    data_source     JSONB NOT NULL,
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_widgets_dashboard ON widgets(dashboard_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ALERTS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'critical');
CREATE TYPE alert_state AS ENUM ('normal', 'active', 'acknowledged');

CREATE TABLE IF NOT EXISTS alert_rules (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    enabled         BOOLEAN DEFAULT TRUE,
    severity        alert_severity NOT NULL DEFAULT 'warning',
    
    -- Rule condition (JSON for flexibility)
    condition       JSONB NOT NULL,
    
    -- Debouncing
    trigger_delay   INTEGER DEFAULT 0,  -- ms
    clear_delay     INTEGER DEFAULT 0,  -- ms
    
    -- Notification channels
    notifications   JSONB DEFAULT '{}'::jsonb,
    
    -- Escalation config
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
    
    -- Context at time of trigger
    trigger_value   DOUBLE PRECISION,
    trigger_topic   VARCHAR(512),
    context         JSONB DEFAULT '{}'::jsonb,
    
    notes           TEXT
);

CREATE INDEX idx_alert_instances_rule ON alert_instances(rule_id);
CREATE INDEX idx_alert_instances_state ON alert_instances(state) WHERE state != 'normal';

-- ═══════════════════════════════════════════════════════════════════════════════
-- SYSTEM CONFIGURATION
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS system_config (
    key             VARCHAR(255) PRIMARY KEY,
    value           JSONB NOT NULL,
    description     TEXT,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Default system configuration
INSERT INTO system_config (key, value, description) VALUES
    ('mqtt.broker', '{"host": "emqx", "port": 1883}'::jsonb, 'MQTT broker connection'),
    ('historian.retention', '{"raw": "30d", "1min": "90d", "1hour": "1y", "1day": "5y"}'::jsonb, 'Data retention policies'),
    ('ui.theme', '"industrial-dark"'::jsonb, 'Default UI theme'),
    ('security.session_timeout', '86400'::jsonb, 'Session timeout in seconds'),
    ('security.password_policy', '{"min_length": 8, "require_special": true}'::jsonb, 'Password requirements')
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

CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_devices_updated_at
    BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_device_tags_updated_at
    BEFORE UPDATE ON device_tags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_flows_updated_at
    BEFORE UPDATE ON flows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_dashboards_updated_at
    BEFORE UPDATE ON dashboards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_widgets_updated_at
    BEFORE UPDATE ON widgets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_alert_rules_updated_at
    BEFORE UPDATE ON alert_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- VALIDATION COMPLETE
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    RAISE NOTICE 'NEXUS Edge Configuration database initialized successfully';
    RAISE NOTICE 'Default admin user created: admin / nexus-admin-2024!';
    RAISE NOTICE 'IMPORTANT: Change the default password immediately!';
END $$;

