# 🤔 Architecture Questions & Answers

This document captures key architectural decisions for the NEXUS Edge platform based on critical questions raised during the design phase.

---

## Table of Contents

1. [Device Connectivity & Protocol Conversion](#1️⃣-device-connectivity--protocol-conversion)
2. [Backend Language Choice](#2️⃣-backend-language-choice-javascripttypescript-vs-alternatives)
3. [Handling High Device Counts & Throughput](#3️⃣-handling-high-device-counts--data-throughput)
4. [Authentication & Authorization](#4️⃣-authentication--authorization)
5. [Data Governance](#5️⃣-data-governance)
6. [Composable Architecture](#6️⃣-composable-architecture)
7. [Summary of Decisions](#summary-of-recommendations)

---

## 1️⃣ Device Connectivity & Protocol Conversion

**Question:** What will handle the device connectivities and protocol conversion? Will this be FlowFuse or something else?

**Answer:** A custom **Protocol Gateway** service written in **Go** (not FlowFuse/Node-RED)

### Why NOT FlowFuse/Node-RED for Protocol Conversion?

| Concern | Issue |
|---------|-------|
| **Performance** | Node-RED is single-threaded Node.js - struggles with 1000+ high-frequency tags |
| **Reliability** | Flow-based tools are great for prototyping, but production protocol conversion needs robustness |
| **Memory** | Node-RED keeps all flows in memory; at scale this becomes problematic |
| **Restart behavior** | Flow-based systems can lose state on restart |

### Protocol Gateway Options Considered:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PROTOCOL GATEWAY OPTIONS                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  OPTION A: Custom Go/Rust Service (RECOMMENDED ✅)                          │
│  ─────────────────────────────────────────────────                          │
│  • Go: Excellent for concurrent I/O (goroutines), battle-tested in IoT     │
│  • Libraries: gopcua, gos7, go-modbus                                       │
│  • Benefits: Low memory, high throughput, native concurrency               │
│  • Used by: InfluxData Telegraf, many industrial gateways                  │
│                                                                             │
│  OPTION B: EMQX Neuron (Commercial/Open-source)                             │
│  ─────────────────────────────────────────────────                          │
│  • Native industrial protocol gateway from EMQX                            │
│  • Supports: S7, OPC UA, Modbus, EtherNet/IP, BACnet, etc.                │
│  • Direct integration with EMQX broker                                     │
│  • Downside: Less customization, licensing for advanced features           │
│                                                                             │
│  OPTION C: Apache PLC4X                                                     │
│  ─────────────────────────────────────────────────                          │
│  • Universal protocol library (Java/Go)                                    │
│  • Supports most industrial protocols                                       │
│  • Can be wrapped as a microservice                                        │
│                                                                             │
│  OPTION D: EdgeX Foundry Device Services                                    │
│  ─────────────────────────────────────────────────                          │
│  • Linux Foundation project for IoT edge                                   │
│  • Pre-built device services for common protocols                          │
│  • Overkill if you only need protocol conversion                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Final Decision: Hybrid Approach

- **Protocol Gateway in Go** - Handles high-performance polling, connection pooling, reconnection logic
- **Node-RED as optional Flow Engine** - For user-defined automation, data transformation, business logic (NOT for raw device connectivity)

```
Devices → Go Protocol Gateway → EMQX → Node-RED (optional processing) → Historian
                    ↓
         (high performance,        (user-defined logic,
          reliable, concurrent)     low-code, flexible)
```

---

## 2️⃣ Backend Language Choice: JavaScript/TypeScript vs Alternatives

**Question:** Is it the best approach for this project to use JavaScript/TypeScript backend?

**Answer:** **No, not for all services.** We recommend a **polyglot architecture** with Go as the primary backend language.

### Honest Assessment:

| Language | Pros | Cons | Best For |
|----------|------|------|----------|
| **TypeScript/Node.js** | Fast dev, great ecosystem, async I/O | Single-threaded, memory hungry at scale, GC pauses | API Gateway, Web servers, Rapid prototyping |
| **Go** | Excellent concurrency, low memory, fast, single binary | Smaller ecosystem, verbose error handling | Protocol Gateway, High-throughput services |
| **Rust** | Maximum performance, memory safety, zero-cost abstractions | Steep learning curve, slower development | Critical path services, edge devices |
| **Python** | ML/AI libraries, data science | Slow, GIL limits concurrency | AI/ML inference, scripts, analytics |
| **Java/Kotlin** | Mature, enterprise-ready, good libraries (PLC4X, Eclipse Milo) | JVM overhead, verbose | Enterprise integrations, OPC UA |

### Recommended Language Distribution:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     LANGUAGE DISTRIBUTION (FINAL)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  GO (Primary for backend services):                                         │
│  ├── Protocol Gateway (high-performance device polling)                    │
│  ├── Historian Ingest Service (high-throughput writes)                     │
│  ├── Alert Service (real-time rule evaluation)                             │
│  └── Orchestrator Service (K8s/Docker API interaction)                     │
│                                                                             │
│  TYPESCRIPT/NODE.JS (API layer & Frontend):                                 │
│  ├── Gateway Core (REST API, WebSocket, auth)                              │
│  ├── Frontend (React + Vite)                                               │
│  └── Flow Engine wrapper (if using Node-RED)                               │
│                                                                             │
│  PYTHON (Future AI/ML):                                                     │
│  └── AI Inference Service (TensorFlow, PyTorch models)                     │
│                                                                             │
│  RUST (Optional, for extreme performance):                                  │
│  └── Custom MQTT bridge or protocol driver if needed                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why Go for Critical Backend Services?

- Goroutines handle 10,000+ concurrent connections easily
- Memory footprint ~10x smaller than Node.js
- No GC pauses like JVM (Go's GC is optimized for low latency)
- Single static binary = simple deployment
- Excellent industrial IoT adoption (Telegraf, etc.)

---

## 3️⃣ Handling High Device Counts & Data Throughput

**Question:** How will this project handle lots of device connections and data streams? Can we ensure maximal throughput?

**Answer:** Through a multi-layer optimization strategy with horizontal scaling capabilities.

### Scaling Strategy:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     THROUGHPUT OPTIMIZATION LAYERS                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  LAYER 1: Protocol Gateway (Go)                                             │
│  ─────────────────────────────                                              │
│  • Connection pooling per PLC/device                                       │
│  • Batch reads (read multiple tags in single request)                      │
│  • Adaptive polling (reduce frequency for stable values)                   │
│  • Report-by-exception (OPC UA subscriptions vs polling)                   │
│  • Horizontal scaling: multiple gateway instances, each handling subset    │
│                                                                             │
│  LAYER 2: EMQX Broker                                                       │
│  ─────────────────────────────                                              │
│  • EMQX handles 100M+ connections, 1M+ msg/sec per node                   │
│  • Clustering for horizontal scale                                          │
│  • Shared subscriptions for load balancing consumers                       │
│  • Message queuing with persistence for spikes                             │
│                                                                             │
│  LAYER 3: Historian Ingestion                                               │
│  ─────────────────────────────                                              │
│  • Batch writes (buffer 1000-5000 points, write in batch)                 │
│  • Connection pooling to TimescaleDB                                       │
│  • Async writes (don't block on DB response)                               │
│  • Multiple ingestion workers (shared subscription from MQTT)              │
│                                                                             │
│  LAYER 4: TimescaleDB                                                       │
│  ─────────────────────────────                                              │
│  • Hypertables auto-partition by time                                      │
│  • Compression (10x+ storage reduction)                                    │
│  • Continuous aggregates (pre-computed rollups)                            │
│  • Read replicas for query load                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Expected Performance Numbers (Single Node):

| Component | Capacity (Single Node) | Horizontal Scale |
|-----------|------------------------|------------------|
| Protocol Gateway (Go) | 5,000-10,000 tags @ 1s | Add more instances |
| EMQX Broker | 1M+ msg/sec | Cluster nodes |
| Historian Ingest | 100,000+ writes/sec | Add workers |
| TimescaleDB | 1M+ inserts/sec | Read replicas, sharding |

### Key Implementation Pattern (Batch Writing in Go):

```go
// Example: Batch writing in Go historian service
type BatchWriter struct {
    buffer    chan DataPoint
    batchSize int
    interval  time.Duration
    db        *pgxpool.Pool
}

func (w *BatchWriter) Run() {
    batch := make([]DataPoint, 0, w.batchSize)
    ticker := time.NewTicker(w.interval)
    
    for {
        select {
        case point := <-w.buffer:
            batch = append(batch, point)
            if len(batch) >= w.batchSize {
                w.writeBatch(batch)
                batch = batch[:0]
            }
        case <-ticker.C:
            if len(batch) > 0 {
                w.writeBatch(batch)
                batch = batch[:0]
            }
        }
    }
}

func (w *BatchWriter) writeBatch(batch []DataPoint) {
    // Use COPY protocol for maximum insert performance
    _, err := w.db.CopyFrom(ctx, 
        pgx.Identifier{"metrics"},
        []string{"time", "topic", "value", "quality"},
        pgx.CopyFromSlice(len(batch), func(i int) ([]any, error) {
            return []any{batch[i].Time, batch[i].Topic, batch[i].Value, batch[i].Quality}, nil
        }),
    )
}
```

---

## 4️⃣ Authentication & Authorization

**Question:** What about authentication and authorization? Do we need Keycloak for this?

**Answer:** **Start with built-in auth, design for Keycloak compatibility.** Keycloak is optional based on enterprise requirements.

### Authentication Options:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     AUTHENTICATION OPTIONS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  OPTION A: Built-in Auth (Simple deployments) ✅ START HERE                │
│  ─────────────────────────────────────────────                              │
│  • Local user database (PostgreSQL)                                        │
│  • JWT tokens issued by Gateway Core                                        │
│  • RBAC with roles: admin, engineer, operator, viewer                      │
│  • Sufficient for: Single-site, small teams, isolated deployments          │
│  • Pros: Simple, no extra infrastructure                                   │
│  • Cons: No SSO, no federation, manual user management                     │
│                                                                             │
│  OPTION B: Keycloak / Auth0 / Okta (Enterprise)                            │
│  ─────────────────────────────────────────────────                          │
│  • External Identity Provider                                               │
│  • OIDC/OAuth2 integration                                                 │
│  • SSO with corporate directory (LDAP/AD)                                  │
│  • Sufficient for: Multi-site, enterprise, compliance requirements         │
│  • Pros: Enterprise SSO, federation, MFA, audit                           │
│  • Cons: Additional complexity, resource usage                             │
│                                                                             │
│  RECOMMENDED: Start with Built-in, add Keycloak later                      │
│  ─────────────────────────────────────────────────                          │
│  • Design Gateway Core to support both modes                               │
│  • Use OIDC-compatible JWT validation                                      │
│  • Easy to switch issuer from "self" to "keycloak"                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Authorization Model (RBAC + ABAC):

```typescript
// Role-Based Access Control (RBAC)
const permissions = {
  admin: {
    devices: ['create', 'read', 'update', 'delete'],
    flows: ['create', 'read', 'update', 'delete', 'deploy'],
    dashboards: ['create', 'read', 'update', 'delete'],
    containers: ['create', 'read', 'update', 'delete', 'start', 'stop'],
    users: ['create', 'read', 'update', 'delete'],
    settings: ['read', 'update'],
  },
  engineer: {
    devices: ['create', 'read', 'update'],
    flows: ['create', 'read', 'update', 'deploy'],
    dashboards: ['create', 'read', 'update'],
    containers: ['read'],
    historian: ['read', 'query', 'export'],
  },
  operator: {
    devices: ['read'],
    dashboards: ['read'],
    alerts: ['read', 'acknowledge'],
    historian: ['read', 'query'],
  },
  viewer: {
    dashboards: ['read'],
    historian: ['read'],
  }
};

// Attribute-Based Access Control (ABAC) for fine-grained control
// e.g., "User X can only access devices in Plant A, Line 1"
interface AccessPolicy {
  resource: string;
  action: string;
  conditions: {
    attribute: string;
    operator: 'equals' | 'in' | 'startsWith';
    value: string | string[];
  }[];
}
```

---

## 5️⃣ Data Governance

**Question:** What about data governance?

**Answer:** Comprehensive data governance is crucial for industrial systems. We implement a multi-faceted approach.

### Data Governance Framework:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DATA GOVERNANCE FRAMEWORK                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. DATA LINEAGE & PROVENANCE                                               │
│  ────────────────────────────                                               │
│  • Every data point tracks: source device, protocol, gateway, timestamp    │
│  • Metadata attached to MQTT messages and stored in historian              │
│  • Query: "Where did this value come from? What transformations?"          │
│                                                                             │
│  2. DATA QUALITY                                                            │
│  ───────────────                                                            │
│  • OPC UA quality codes preserved (Good, Bad, Uncertain)                   │
│  • Validation rules at ingestion (range checks, type validation)           │
│  • Quality flags stored with each data point                               │
│  • Dashboards show quality indicators                                       │
│                                                                             │
│  3. DATA RETENTION & LIFECYCLE                                              │
│  ─────────────────────────────                                              │
│  • Configurable retention policies per data class                          │
│  • Automatic downsampling (raw → 1min → 1hour → 1day)                      │
│  • Compression for historical data                                          │
│  • Archival to cold storage (S3, Azure Blob) for compliance               │
│                                                                             │
│  4. AUDIT TRAIL                                                             │
│  ───────────────                                                            │
│  • All configuration changes logged (who, what, when)                      │
│  • User actions audited                                                     │
│  • Immutable audit log (append-only, no deletions)                         │
│  • Export for compliance reporting                                          │
│                                                                             │
│  5. DATA CLASSIFICATION                                                     │
│  ─────────────────────────                                                  │
│  • Tag data with sensitivity levels                                        │
│  • PII/sensitive data handling                                              │
│  • Access controls based on classification                                  │
│                                                                             │
│  6. DATA CATALOG                                                            │
│  ────────────────                                                           │
│  • Central registry of all data points                                     │
│  • Searchable metadata (tags, descriptions, units)                         │
│  • Relationships between data points                                        │
│  • Documentation and context                                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation in Database Schema:

```sql
-- Data lineage tracking
CREATE TABLE data_lineage (
    id              UUID PRIMARY KEY,
    topic           TEXT NOT NULL,
    source_device   UUID REFERENCES devices(id),
    source_protocol TEXT,
    source_address  TEXT,
    transformations JSONB DEFAULT '[]',  -- List of applied transformations
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Data quality rules
CREATE TABLE quality_rules (
    id              UUID PRIMARY KEY,
    topic_pattern   TEXT NOT NULL,  -- MQTT topic pattern (supports wildcards)
    rule_type       TEXT NOT NULL,  -- 'range', 'type', 'rate_of_change'
    rule_config     JSONB NOT NULL, -- {"min": 0, "max": 100}
    action          TEXT NOT NULL,  -- 'flag', 'reject', 'alert'
    enabled         BOOLEAN DEFAULT TRUE
);

-- Data classification
CREATE TABLE data_classification (
    topic_pattern   TEXT PRIMARY KEY,
    classification  TEXT NOT NULL,  -- 'public', 'internal', 'confidential', 'restricted'
    retention_days  INTEGER,
    encryption_required BOOLEAN DEFAULT FALSE,
    pii_contains    BOOLEAN DEFAULT FALSE
);
```

---

## 6️⃣ Composable Architecture

**Question:** What about composable architecture?

**Answer:** The architecture IS designed to be composable from the ground up.

### Composable Architecture Principles:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      COMPOSABLE ARCHITECTURE PRINCIPLES                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. MICROSERVICES (Loosely Coupled)                                         │
│  ──────────────────────────────────                                         │
│  • Each service is independent, deployable, scalable                       │
│  • Services communicate via MQTT (async) or REST (sync)                    │
│  • Can replace any service without affecting others                        │
│                                                                             │
│  2. PLUGIN ARCHITECTURE                                                     │
│  ─────────────────────────                                                  │
│  • Protocol Gateway: Add new protocols via plugins                         │
│  • Flow Engine: Add custom nodes                                           │
│  • Frontend: Add custom widgets                                             │
│  • Alert Service: Add notification channels                                 │
│                                                                             │
│  3. EVENT-DRIVEN (MQTT as backbone)                                         │
│  ──────────────────────────────────                                         │
│  • Services react to events, not direct calls                              │
│  • Easy to add new consumers without changing producers                    │
│  • Enables future AI/ML services to "plug in"                              │
│                                                                             │
│  4. CONTAINERIZED                                                           │
│  ─────────────────                                                          │
│  • Each component is a Docker container                                    │
│  • Deploy only what you need                                                │
│  • Scale components independently                                           │
│                                                                             │
│  5. API-FIRST                                                               │
│  ────────────                                                               │
│  • Every capability exposed via API                                        │
│  • Enables custom integrations                                              │
│  • Supports headless deployments                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Composable Deployment Examples:

```yaml
# Minimal Edge (Resource-constrained device)
services:
  - emqx           # MQTT broker
  - protocol-gw    # Device connectivity
  - historian-lite # SQLite-based, local only

# Standard Edge (Factory floor)
services:
  - emqx
  - protocol-gw
  - historian      # Full TimescaleDB
  - flow-engine    # Node-RED for automation
  - alert-service
  - frontend

# Enterprise Edge (Full featured)
services:
  - emqx (clustered)
  - protocol-gw (scaled)
  - historian (HA)
  - flow-engine
  - alert-service
  - ai-inference   # ML models
  - frontend
  - keycloak       # Enterprise auth
  - cloud-agent    # Sync to cloud

# Headless (No UI, API only)
services:
  - emqx
  - protocol-gw
  - historian
  - gateway-core   # API only
```

### Future: Packaged Business Capabilities (PBCs)

The composable architecture enables creating "packaged" vertical solutions:

```
┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│  OEE Package       │  │  Energy Monitor    │  │  Predictive Maint  │
│  ────────────────  │  │  ────────────────  │  │  ────────────────  │
│  • Pre-built flows │  │  • Energy tags     │  │  • Vibration model │
│  • OEE dashboard   │  │  • Cost calculation│  │  • Failure predict │
│  • KPI widgets     │  │  • Carbon tracking │  │  • Work orders     │
└────────────────────┘  └────────────────────┘  └────────────────────┘
         ↓                       ↓                       ↓
         └───────────────────────┴───────────────────────┘
                                 ↓
                    ┌────────────────────────┐
                    │   NEXUS Edge Core      │
                    │   (Composable Platform)│
                    └────────────────────────┘
```

---

## Summary of Recommendations

| Question | Decision |
|----------|----------|
| **Protocol Conversion** | Go-based Protocol Gateway (not Node-RED) + optional Node-RED for user logic |
| **Backend Language** | Polyglot: **Go** for high-performance services, TypeScript for API/Frontend |
| **Throughput** | Batch writes, connection pooling, EMQX shared subscriptions, TimescaleDB hypertables |
| **Auth** | Start with built-in JWT + RBAC, design for Keycloak compatibility |
| **Data Governance** | Quality codes, lineage tracking, retention policies, audit logs, data catalog |
| **Composable** | Already composable via microservices, MQTT events, containerization, plugin architecture |

---

*Document created during architecture review phase. These decisions should guide all implementation work.*

