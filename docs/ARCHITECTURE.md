# 🏗️ NEXUS Edge Architecture

> **Technology Stack:** The backend services are primarily written in **Go** for high performance and low memory footprint. The frontend and API gateway use TypeScript. See [QUESTIONS.md](QUESTIONS.md) for detailed rationale.

## Table of Contents

- [Design Principles](#design-principles)
- [System Layers](#system-layers)
- [Service Architecture](#service-architecture)
- [Data Models](#data-models)
- [Communication Patterns](#communication-patterns)
- [Protocol Integration](#protocol-integration)
- [Scalability Considerations](#scalability-considerations)
- [Failure Modes & Recovery](#failure-modes--recovery)

---

## Design Principles

### 1. Edge-First Architecture

NEXUS is designed to operate **autonomously at the edge**, with cloud connectivity being optional. All critical functions work offline:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           OPERATIONAL HIERARCHY                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Level 4: Cloud (Optional)                                                 │
│   ├── Fleet management, analytics aggregation, model training               │
│   └── Can be disconnected indefinitely                                      │
│                                                                             │
│   Level 3: NEXUS Edge Platform ← PRIMARY INTELLIGENCE                       │
│   ├── All processing, storage, visualization                                │
│   ├── Must always be operational                                            │
│   └── Survives network partitions                                           │
│                                                                             │
│   Level 2: Protocol Gateways                                                │
│   ├── Direct connection to OT devices                                       │
│   └── Hardware-level reliability                                            │
│                                                                             │
│   Level 1: Field Devices (PLCs, Sensors)                                    │
│   └── Physical process control                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2. Unified Namespace (UNS)

All data flows through a **single, hierarchical MQTT topic namespace**:

```
                    UNIFIED NAMESPACE STRUCTURE
                    ═══════════════════════════

{enterprise}/{site}/{area}/{line}/{device}/{datapoint}

Examples:
├── acme/plant-chicago/building-a/line-1/plc-001/temperature
├── acme/plant-chicago/building-a/line-1/plc-001/pressure
├── acme/plant-chicago/building-a/line-1/sensor-temp-01/value
├── acme/plant-chicago/building-a/line-2/robot-arm/position/x
└── acme/plant-chicago/building-a/line-2/robot-arm/position/y

Benefits:
├── ✓ Any consumer can discover all available data
├── ✓ Wildcard subscriptions for flexible filtering
├── ✓ Self-documenting through topic hierarchy
├── ✓ Easy integration with external systems
└── ✓ Natural mapping to historian storage schema
```

### 3. Microservices with Message-Driven Communication

Services are **loosely coupled** through MQTT messaging:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      SERVICE COMMUNICATION PATTERNS                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   PRIMARY: MQTT Pub/Sub (Event-Driven)                                       │
│   ┌────────────────────────────────────────────────────────────────────┐     │
│   │  Protocol    ───publish───▶  EMQX  ◀───subscribe───  Historian    │     │
│   │  Gateway                      Broker                 Service       │     │
│   │                                 │                                  │     │
│   │              Flow Engine ◀───── ┴──────▶ Alert Service            │     │
│   └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│   SECONDARY: REST API (Request/Response)                                     │
│   ┌────────────────────────────────────────────────────────────────────┐     │
│   │  Frontend  ───HTTP───▶  Gateway  ───HTTP───▶  Services            │     │
│   │     UI                   Core                                      │     │
│   │                            │                                       │     │
│   │                      ┌─────┴─────┐                                 │     │
│   │                      ▼           ▼                                 │     │
│   │               PostgreSQL   TimescaleDB                             │     │
│   └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│   TERTIARY: WebSocket (Real-Time Push)                                       │
│   ┌────────────────────────────────────────────────────────────────────┐     │
│   │  Browser  ◀───WebSocket───  Gateway  ◀───MQTT───  Broker          │     │
│   │                              Core                                  │     │
│   └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 4. Native UI Integration (Not Iframes)

Instead of embedding third-party UIs, NEXUS implements **native React components** that call service APIs directly:

```typescript
// ❌ Traditional Approach (Iframe)
<iframe src="http://localhost:1880" />  // Node-RED
<iframe src="http://localhost:3000" />  // Grafana
<iframe src="http://localhost:9000" />  // Portainer

// ✅ NEXUS Approach (Native Components)
<FlowDesigner 
  flows={flows}
  onDeploy={handleDeploy}
  nodes={customNodeTypes}
/>
<DashboardBuilder
  datasource={historianAPI}
  widgets={widgetLibrary}
/>
<ContainerManager
  runtime={dockerAPI}
  containers={containers}
/>
```

---

## System Layers

### Layer 1: Connectivity Layer

**Purpose**: Interface with physical devices and convert protocols to MQTT

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CONNECTIVITY LAYER                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │  S7 DRIVER      │  │  OPC UA DRIVER  │  │  MODBUS DRIVER  │              │
│  │                 │  │                 │  │                 │              │
│  │  • gos7 lib     │  │  • gopcua       │  │  • go-modbus    │              │
│  │  • TCP/102      │  │  • Browse/Sub   │  │  • TCP/RTU      │              │
│  │  • DB/FB/FC     │  │  • Monitored    │  │  • Holding regs │              │
│  │    addressing   │  │    items        │  │  • Coils        │              │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘              │
│           │                    │                    │                       │
│           └────────────────────┼────────────────────┘                       │
│                                │                                            │
│                     ┌──────────▼──────────┐                                 │
│                     │  TAG REGISTRY       │                                 │
│                     │                     │                                 │
│                     │  • Tag ↔ Topic map  │                                 │
│                     │  • Scaling/Units    │                                 │
│                     │  • Quality flags    │                                 │
│                     └──────────┬──────────┘                                 │
│                                │                                            │
│                     ┌──────────▼──────────┐                                 │
│                     │  MQTT PUBLISHER     │                                 │
│                     │                     │                                 │
│                     │  • QoS selection    │                                 │
│                     │  • Batch/throttle   │                                 │
│                     │  • Reconnection     │                                 │
│                     └──────────┬──────────┘                                 │
│                                │                                            │
└────────────────────────────────┼────────────────────────────────────────────┘
                                 │
                                 ▼
                          TO EMQX BROKER
```

### Layer 2: Messaging Layer (EMQX)

**Purpose**: Central message bus for all real-time data

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EMQX BROKER                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  LISTENERS                                                          │    │
│  │  ├── TCP:1883      (internal services)                              │    │
│  │  ├── SSL:8883      (external devices with TLS)                      │    │
│  │  ├── WS:8083       (WebSocket for browser)                          │    │
│  │  └── WSS:8084      (Secure WebSocket)                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  AUTHENTICATION                                                     │    │
│  │  ├── Built-in database (username/password per service)              │    │
│  │  ├── JWT tokens (for browser WebSocket)                             │    │
│  │  └── X.509 certificates (for device authentication)                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  ACL (Access Control)                                               │    │
│  │                                                                     │    │
│  │  protocol-gateway: pub +/+/+/+/+/#    (publish device data)         │    │
│  │  historian:        sub +/+/+/+/+/#    (subscribe to all data)       │    │
│  │  flow-engine:      pub/sub +/#        (full access for flows)       │    │
│  │  alert-service:    sub +/+/+/+/+/#    (read for alerting)           │    │
│  │  frontend:         sub user/{uid}/#   (user-specific subscriptions) │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  RULE ENGINE (Optional Direct DB Write)                             │    │
│  │                                                                     │    │
│  │  Rule: "Forward to TimescaleDB"                                     │    │
│  │  ├── SELECT * FROM "acme/#"                                         │    │
│  │  └── INSERT INTO historian.metrics (topic, payload, ts)             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Layer 3: Processing Layer

**Purpose**: Transform, analyze, and react to data streams

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PROCESSING LAYER                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  FLOW ENGINE (Node-RED Runtime)                                     │    │
│  │                                                                     │    │
│  │  ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐   │    │
│  │  │ MQTT In   │──▶│ Transform │───▶│ Function  │──▶│ MQTT Out  │   │    │
│  │  │ Subscribe │    │ Parse/Map │    │ Custom JS │    │ Publish   │   │    │
│  │  └───────────┘    └───────────┘    └───────────┘    └───────────┘   │    │
│  │                                                                     │    │
│  │  ┌───────────┐    ┌───────────┐    ┌───────────┐                    │    │
│  │  │ Device    │──▶│ Aggregate │───▶│ Historian │                    │    │
│  │  │ Read      │    │ Window    │    │ Write     │                    │    │
│  │  └───────────┘    └───────────┘    └───────────┘                    │    │
│  │                                                                     │    │
│  │  Custom NEXUS Nodes:                                                │    │
│  │  • nexus-device-read    - Direct device query                       │    │
│  │  • nexus-device-write   - Write to PLC/device                       │    │
│  │  • nexus-historian      - Query time-series                         │    │
│  │  • nexus-alert          - Trigger/clear alerts                      │    │
│  │  • nexus-ai-inference   - Run ML model                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  ALERT SERVICE                                                      │    │
│  │                                                                     │    │
│  │  Rule Types:                                                        │    │
│  │  ├── Threshold      (value > limit for duration)                    │    │
│  │  ├── Rate of Change (delta > limit in window)                       │    │
│  │  ├── Pattern        (regex on string values)                        │    │
│  │  ├── Absence        (no data for duration)                          │    │
│  │  └── Compound       (AND/OR of other rules)                         │    │
│  │                                                                     │    │
│  │  Alert Lifecycle:                                                   │    │
│  │  [Normal] ──trigger──▶ [Active] ──ack──▶ [Acknowledged]            │    │
│  │                           │                    │                    │    │
│  │                        clear                 clear                  │    │
│  │                           ▼                    ▼                    │    │
│  │                       [Normal]            [Normal]                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Layer 4: Persistence Layer

**Purpose**: Store time-series data and configuration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PERSISTENCE LAYER                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  TIMESCALEDB (Historian)                                            │    │
│  │                                                                     │    │
│  │  Tables:                                                            │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │  metrics (hypertable)                                       │    │    │
│  │  │  ├── time        TIMESTAMPTZ NOT NULL                       │    │    │
│  │  │  ├── topic       TEXT NOT NULL                              │    │    │
│  │  │  ├── value       DOUBLE PRECISION                           │    │    │
│  │  │  ├── value_str   TEXT                                       │    │    │
│  │  │  ├── quality     SMALLINT DEFAULT 192                       │    │    │
│  │  │  └── metadata    JSONB                                      │    │    │
│  │  │                                                             │    │    │
│  │  │  Compression: After 7 days (segment by topic)               │    │    │
│  │  │  Retention: Raw=30d, Hourly=1y, Daily=5y                    │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  │                                                                     │    │
│  │  Continuous Aggregates:                                             │    │
│  │  ├── metrics_1min  (1-minute rollups)                               │    │
│  │  ├── metrics_1hour (1-hour rollups)                                 │    │
│  │  └── metrics_1day  (1-day rollups)                                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  POSTGRESQL (Configuration)                                         │    │
│  │                                                                     │    │
│  │  Tables:                                                            │    │
│  │  ├── users           (authentication, roles)                        │    │
│  │  ├── devices         (device configurations)                        │    │
│  │  ├── device_tags     (tag mappings per device)                      │    │
│  │  ├── flows           (Node-RED flow definitions)                    │    │
│  │  ├── dashboards      (dashboard layouts)                            │    │
│  │  ├── widgets         (widget configurations)                        │    │
│  │  ├── alert_rules     (alerting rules)                               │    │
│  │  ├── alert_history   (triggered alerts log)                         │    │
│  │  ├── audit_log       (security audit trail)                         │    │
│  │  └── system_config   (key-value settings)                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Layer 5: Presentation Layer

**Purpose**: User interface and API gateway

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  GATEWAY CORE (API Gateway)                                         │    │
│  │                                                                     │    │
│  │  ├── Authentication (JWT, API Keys)                                 │    │
│  │  ├── Authorization (RBAC middleware)                                │    │
│  │  ├── Rate Limiting                                                  │    │
│  │  ├── Request Logging                                                │    │
│  │  ├── WebSocket Manager                                              │    │
│  │  │   └── MQTT → WebSocket bridge                                    │    │
│  │  └── Route Handlers                                                 │    │
│  │      ├── /api/auth/*        → Auth service                          │    │
│  │      ├── /api/devices/*     → Protocol Gateway                      │    │
│  │      ├── /api/flows/*       → Flow Engine                           │    │
│  │      ├── /api/historian/*   → Historian Service                     │    │
│  │      ├── /api/containers/*  → Orchestrator                          │    │
│  │      └── /api/alerts/*      → Alert Service                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  NEXUS CONTROL CENTER (React SPA)                                   │    │
│  │                                                                     │    │
│  │  ┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐      │    │
│  │  │Dashboard│ Devices │  Flows  │Historian│Container│  Alerts │      │    │
│  │  │         │ Manager │ Designer│ Explorer│ Manager │  Center │      │    │
│  │  └─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘      │    │
│  │                                                                     │    │
│  │  State Management: Zustand                                          │    │
│  │  Data Fetching: TanStack Query                                      │    │
│  │  Real-time: Custom WebSocket hooks                                  │    │
│  │  Visualization: Recharts, React Flow                                │    │
│  │  Styling: TailwindCSS + Radix UI                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Models

### Device Configuration

```typescript
interface Device {
  id: string;                    // UUID
  name: string;                  // Human-readable name
  description?: string;
  protocol: 'S7' | 'OPCUA' | 'MODBUS' | 'MQTT';
  enabled: boolean;
  
  connection: S7Connection | OPCUAConnection | ModbusConnection | MQTTConnection;
  
  tags: Tag[];
  
  status: {
    connected: boolean;
    lastSeen: Date;
    errorCount: number;
    lastError?: string;
  };
  
  metadata: {
    location?: string;
    manufacturer?: string;
    model?: string;
    firmware?: string;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

interface S7Connection {
  host: string;
  port: number;               // Default: 102
  rack: number;
  slot: number;
  timeout: number;            // ms
  pollInterval: number;       // ms
}

interface OPCUAConnection {
  endpointUrl: string;        // opc.tcp://host:port
  securityMode: 'None' | 'Sign' | 'SignAndEncrypt';
  securityPolicy: string;
  authentication: {
    type: 'Anonymous' | 'Username' | 'Certificate';
    username?: string;
    password?: string;
    certificate?: string;
    privateKey?: string;
  };
  subscriptionInterval: number;
}

interface Tag {
  id: string;
  name: string;
  address: string;            // Protocol-specific address
  dataType: DataType;
  
  mqttTopic: string;          // Target topic in UNS
  
  scaling?: {
    rawMin: number;
    rawMax: number;
    engMin: number;
    engMax: number;
  };
  
  engineeringUnit?: string;   // e.g., "°C", "bar", "m/s"
  
  enabled: boolean;
  pollInterval?: number;      // Override device default
}
```

### Historian Data Model

```sql
-- Core metrics table (TimescaleDB hypertable)
CREATE TABLE metrics (
    time        TIMESTAMPTZ NOT NULL,
    topic       TEXT NOT NULL,
    value       DOUBLE PRECISION,
    value_str   TEXT,                    -- For string/boolean values
    quality     SMALLINT DEFAULT 192,    -- OPC UA quality codes
    metadata    JSONB                    -- Extensible metadata
);

SELECT create_hypertable('metrics', 'time');
CREATE INDEX idx_metrics_topic ON metrics (topic, time DESC);

-- Continuous aggregates for efficient historical queries
CREATE MATERIALIZED VIEW metrics_1hour
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    topic,
    AVG(value) AS avg_value,
    MIN(value) AS min_value,
    MAX(value) AS max_value,
    COUNT(*) AS sample_count
FROM metrics
WHERE value IS NOT NULL
GROUP BY bucket, topic;

-- Retention policy: keep raw data for 30 days
SELECT add_retention_policy('metrics', INTERVAL '30 days');

-- Compression policy: compress data older than 7 days
SELECT add_compression_policy('metrics', INTERVAL '7 days');
```

### Alert Rule Model

```typescript
interface AlertRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  severity: 'info' | 'warning' | 'critical';
  
  condition: AlertCondition;
  
  // Debouncing
  triggerDelay: number;       // ms - must be true for this long to trigger
  clearDelay: number;         // ms - must be false for this long to clear
  
  // Notification channels
  notifications: {
    email?: string[];
    webhook?: string;
    mqtt?: string;            // MQTT topic to publish alert
  };
  
  // Escalation
  escalation?: {
    afterMinutes: number;
    notifyAdditional: string[];
  };
  
  metadata: {
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
  };
}

type AlertCondition = 
  | ThresholdCondition
  | RateOfChangeCondition
  | AbsenceCondition
  | CompoundCondition;

interface ThresholdCondition {
  type: 'threshold';
  topic: string;              // MQTT topic pattern
  operator: '>' | '>=' | '<' | '<=' | '==' | '!=';
  value: number;
}

interface RateOfChangeCondition {
  type: 'rateOfChange';
  topic: string;
  operator: '>' | '<';
  deltaValue: number;
  windowSeconds: number;
}

interface AbsenceCondition {
  type: 'absence';
  topic: string;
  timeoutSeconds: number;
}

interface CompoundCondition {
  type: 'compound';
  operator: 'AND' | 'OR';
  conditions: AlertCondition[];
}
```

---

## Protocol Integration

### Siemens S7 Protocol

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          S7 PROTOCOL INTEGRATION                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Go Library: github.com/robinson/gos7 (MIT License)                         │
│                                                                             │
│  Supported PLCs:                                                            │
│  ├── S7-300 / S7-400 (Classic)                                              │
│  ├── S7-1200 (Optimized blocks need "allow PUT/GET")                        │
│  └── S7-1500 (Optimized blocks need "allow PUT/GET")                        │
│                                                                             │
│  Addressing:                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Format: DB{n}.DB{type}{offset}[.{bit}]                             │    │
│  │                                                                     │    │
│  │  Examples:                                                          │    │
│  │  ├── DB1.DBD0      → REAL at byte 0 of DB1                          │    │
│  │  ├── DB1.DBW4      → INT at byte 4 of DB1                           │    │
│  │  ├── DB1.DBB8      → BYTE at byte 8 of DB1                          │    │
│  │  ├── DB1.DBX9.0    → BOOL at byte 9, bit 0 of DB1                   │    │
│  │  ├── I0.0          → Input bit 0.0                                  │    │
│  │  ├── Q0.1          → Output bit 0.1                                 │    │
│  │  ├── M10.0         → Marker bit 10.0                                │    │
│  │  └── MW20          → Marker word at byte 20                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Data Type Mapping:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  S7 Type    │  NEXUS Type  │  Description                           │    │
│  │  ────────────────────────────────────────────────────────────────   │    │
│  │  BOOL       │  boolean     │  Single bit                            │    │
│  │  BYTE       │  number      │  Unsigned 8-bit                        │    │
│  │  WORD       │  number      │  Unsigned 16-bit                       │    │
│  │  DWORD      │  number      │  Unsigned 32-bit                       │    │
│  │  INT        │  number      │  Signed 16-bit                         │    │
│  │  DINT       │  number      │  Signed 32-bit                         │    │
│  │  REAL       │  number      │  32-bit float                          │    │
│  │  S7STRING   │  string      │  Variable-length string                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### OPC UA Protocol

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OPC UA PROTOCOL INTEGRATION                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Go Library: github.com/gopcua/opcua (MIT License)                          │
│                                                                             │
│  Features:                                                                  │
│  ├── Automatic server discovery (LDS)                                       │
│  ├── Address space browsing                                                 │
│  ├── Subscription-based monitoring                                          │
│  ├── Security: None, Sign, SignAndEncrypt                                   │
│  └── Authentication: Anonymous, Username, Certificate                       │
│                                                                             │
│  Node Addressing:                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Format: ns={namespace};{identifier_type}={identifier}              │    │
│  │                                                                     │    │
│  │  Identifier Types:                                                  │    │
│  │  ├── i  - Numeric identifier                                        │    │
│  │  ├── s  - String identifier                                         │    │
│  │  ├── g  - GUID identifier                                           │    │
│  │  └── b  - Opaque (base64) identifier                                │    │
│  │                                                                     │    │
│  │  Examples:                                                          │    │
│  │  ├── ns=2;s=Channel1.Device1.Tag1                                   │    │
│  │  ├── ns=3;i=1001                                                    │    │
│  │  └── ns=2;s=Objects.PLC1.DataBlock1.Temperature                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Tag Discovery Flow:                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  1. Connect to OPC UA server endpoint                               │    │ 
│  │  2. Browse root node (Objects folder)                               │    │
│  │  3. Recursively browse child nodes                                  │    │
│  │  4. Filter for Variable nodes (readable tags)                       │    │
│  │  5. Return tree structure to UI for selection                       │    │
│  │  6. Create subscriptions for selected nodes                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Modbus Protocol

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MODBUS PROTOCOL INTEGRATION                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Go Library: github.com/simonvetter/modbus (MIT License)                    │
│                                                                             │
│  Supported Variants:                                                        │
│  ├── Modbus TCP (port 502)                                                  │
│  ├── Modbus RTU over TCP                                                    │
│  └── Modbus RTU over Serial (via USB adapter)                               │
│                                                                             │
│  Register Types:                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Type            │ Address Range  │ Access │ Function Codes         │    │
│  │  ────────────────────────────────────────────────────────────────── │    │
│  │  Coils           │ 00001-09999   │ R/W    │ FC01, FC05, FC15        │    │
│  │  Discrete Inputs │ 10001-19999   │ R      │ FC02                    │    │
│  │  Input Registers │ 30001-39999   │ R      │ FC04                    │    │
│  │  Holding Regs    │ 40001-49999   │ R/W    │ FC03, FC06, FC16        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Addressing in NEXUS:                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Format: {register_type}:{address}[:{data_type}]                    │    │
│  │                                                                     │    │
│  │  Register Types: coil, discrete, input, holding                     │    │
│  │  Data Types (for registers): uint16, int16, uint32, int32, float32  │    │
│  │                                                                     │    │
│  │  Examples:                                                          │    │
│  │  ├── holding:40001:uint16    → Single holding register              │    │
│  │  ├── holding:40001:float32   → Two registers as 32-bit float        │    │
│  │  ├── coil:00001              → Single coil (boolean)                │    │
│  │  └── input:30001:int32       → Two input registers as signed 32-bit │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Scalability Considerations

### Horizontal Scaling (Kubernetes)

```yaml
# Example: Scaling the Protocol Gateway
apiVersion: apps/v1
kind: Deployment
metadata:
  name: protocol-gateway
spec:
  replicas: 3  # Multiple instances
  selector:
    matchLabels:
      app: protocol-gateway
  template:
    spec:
      containers:
        - name: protocol-gateway
          resources:
            requests:
              cpu: "500m"
              memory: "512Mi"
            limits:
              cpu: "2000m"
              memory: "2Gi"

---
# HorizontalPodAutoscaler
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: protocol-gateway-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: protocol-gateway
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

### Data Partitioning

For very large deployments, data can be partitioned by:

1. **Topic-based sharding**: Different historian instances for different areas
2. **Time-based partitioning**: TimescaleDB handles this automatically
3. **Multi-site federation**: Each site has its own NEXUS instance, with optional central aggregation

---

## Failure Modes & Recovery

### Service Failure Matrix

| Service | Impact | Recovery | Data Loss? |
|---------|--------|----------|------------|
| Protocol Gateway | No data collection | Auto-restart, queued data | Minimal (buffer) |
| EMQX Broker | All data flow stops | Immediate restart, persistent sessions | None (QoS 1/2) |
| Historian Service | No data storage | Auto-restart, broker buffers | None |
| TimescaleDB | No queries, no new data | Restore from backup | Depends on backup |
| Flow Engine | No processing/automation | Auto-restart | Flows persist |
| Alert Service | No alerting | Auto-restart | Alert history persists |
| Frontend | No UI access | Auto-restart | None |
| Gateway Core | No API access | Auto-restart | None |

### Backup Strategy

```bash
# Daily automated backup script
#!/bin/bash

BACKUP_DIR=/backups/$(date +%Y-%m-%d)
mkdir -p $BACKUP_DIR

# 1. TimescaleDB (Historian)
pg_dump -h localhost -U nexus_historian -d nexus_historian \
  | gzip > $BACKUP_DIR/historian.sql.gz

# 2. PostgreSQL (Config)
pg_dump -h localhost -U nexus -d nexus_config \
  | gzip > $BACKUP_DIR/config.sql.gz

# 3. EMQX Data
docker cp nexus-emqx:/opt/emqx/data $BACKUP_DIR/emqx-data

# 4. Node-RED Flows
docker cp nexus-flow-engine:/data $BACKUP_DIR/nodered-data

# 5. Encrypt and upload to remote storage
tar -czf - $BACKUP_DIR | \
  gpg --symmetric --cipher-algo AES256 | \
  aws s3 cp - s3://nexus-backups/$(date +%Y-%m-%d).tar.gz.gpg
```

---

*This architecture document is a living document and will be updated as the system evolves.*

