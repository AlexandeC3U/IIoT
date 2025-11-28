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
7. [Protocol Gateway: Why Custom Go](#7️⃣-protocol-gateway-why-custom-go-instead-of-emqx-neuron)
8. [Protocol Gateway: Code Architecture](#8️⃣-protocol-gateway-code-architecture)
9. [Scaling: 1000+ or 10000+ Devices](#9️⃣-scaling-1000-or-10000-devices)
10. [Summary of Decisions](#summary-of-recommendations)

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
│                    PROTOCOL GATEWAY OPTIONS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  OPTION A: Custom Go/Rust Service (RECOMMENDED)                             │
│  ─────────────────────────────────────────────────                          │
│  • Go: Excellent for concurrent I/O (goroutines), battle-tested in IoT      │
│  • Libraries: gopcua, gos7, go-modbus                                       │
│  • Benefits: Low memory, high throughput, native concurrency                │
│  • Used by: InfluxData Telegraf, many industrial gateways                   │
│                                                                             │
│  OPTION B: EMQX Neuron (Commercial/Open-source)                             │
│  ─────────────────────────────────────────────────                          │
│  • Native industrial protocol gateway from EMQX                             │
│  • Supports: S7, OPC UA, Modbus, EtherNet/IP, BACnet, etc.                  │
│  • Direct integration with EMQX broker                                      │
│  • Downside: Less customization, licensing for advanced features            │
│                                                                             │
│  OPTION C: Apache PLC4X                                                     │
│  ─────────────────────────────────────────────────                          │
│  • Universal protocol library (Java/Go)                                     │
│  • Supports most industrial protocols                                       │
│  • Can be wrapped as a microservice                                         │
│                                                                             │
│  OPTION D: EdgeX Foundry Device Services                                    │
│  ─────────────────────────────────────────────────                          │
│  • Linux Foundation project for IoT edge                                    │
│  • Pre-built device services for common protocols                           │
│  • Overkill if you only need protocol conversion                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Final Decision: Custom Go Protocol Gateway

- **Go Protocol Gateway** - Handles industrial protocol conversion using open-source libraries (gos7, gopcua, go-modbus)
- **Node-RED as optional Flow Engine** - For user-defined automation, data transformation, business logic (NOT for raw device connectivity)

```
                    ┌─────────────────────────────────────────────┐
                    │         GO PROTOCOL GATEWAY                 │
                    │                                             │
Devices ──────────  │  ┌─────────┐ ┌─────────┐ ┌─────────┐        │
  (S7, OPC UA,      │  │  gos7   │ │ gopcua  │ │go-modbus│        │
   Modbus, etc.)    │  └────┬────┘ └────┬────┘ └────┬────┘        │
                    │       └───────────┼───────────┘             │
                    │                   ▼                         │
                    │       ┌──────────────────────┐              │
                    │       │  Device Manager      │              │
                    │       │  Tag Registry        │              │
                    │       │  MQTT Publisher      │              │
                    │       └──────────┬───────────┘              │
                    └──────────────────┼──────────────────────────┘
                                       │ MQTT
                                       ▼
                               ┌───────────────┐
                               │     EMQX      │
                               │    Broker     │
                               └───────┬───────┘
                                       │
                       ┌───────────────┼───────────────┐
                       ▼               ▼               ▼
                  Historian    Node-RED (opt)    Alert Service
```

> **See [Question 7](#7️⃣-protocol-gateway-why-custom-go-instead-of-emqx-neuron) for detailed analysis of why we chose custom Go over EMQX Neuron.**

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
│                     LANGUAGE DISTRIBUTION (FINAL)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  GO (Primary for backend services):                                         │
│  ├── Protocol Gateway (high-performance device polling)                     │
│  ├── Historian Ingest Service (high-throughput writes)                      │
│  ├── Alert Service (real-time rule evaluation)                              │
│  └── Orchestrator Service (K8s/Docker API interaction)                      │
│                                                                             │
│  TYPESCRIPT/NODE.JS (API layer & Frontend):                                 │
│  ├── Gateway Core (REST API, WebSocket, auth)                               │
│  ├── Frontend (React + Vite)                                                │
│  └── Flow Engine wrapper (if using Node-RED)                                │
│                                                                             │
│  PYTHON (Future AI/ML):                                                     │
│  └── AI Inference Service (TensorFlow, PyTorch models)                      │
│                                                                             │
│  RUST (Optional, for extreme performance):                                  │
│  └── Custom MQTT bridge or protocol driver if needed                        │
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
│  • Connection pooling per PLC/device                                        │
│  • Batch reads (read multiple tags in single request)                       │
│  • Adaptive polling (reduce frequency for stable values)                    │
│  • Report-by-exception (OPC UA subscriptions vs polling)                    │
│  • Horizontal scaling: multiple gateway instances, each handling subset     │
│                                                                             │
│  LAYER 2: EMQX Broker                                                       │
│  ─────────────────────────────                                              │
│  • EMQX handles 100M+ connections, 1M+ msg/sec per node                     │
│  • Clustering for horizontal scale                                          │
│  • Shared subscriptions for load balancing consumers                        │
│  • Message queuing with persistence for spikes                              │
│                                                                             │
│  LAYER 3: Historian Ingestion                                               │
│  ─────────────────────────────                                              │
│  • Batch writes (buffer 1000-5000 points, write in batch)                   │
│  • Connection pooling to TimescaleDB                                        │
│  • Async writes (don't block on DB response)                                │
│  • Multiple ingestion workers (shared subscription from MQTT)               │
│                                                                             │
│  LAYER 4: TimescaleDB                                                       │
│  ─────────────────────────────                                              │
│  • Hypertables auto-partition by time                                       │
│  • Compression (10x+ storage reduction)                                     │
│  • Continuous aggregates (pre-computed rollups)                             │
│  • Read replicas for query load                                             │
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
│                     AUTHENTICATION OPTIONS                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  OPTION A: Built-in Auth (Simple deployments)  START HERE                   │
│  ─────────────────────────────────────────────                              │
│  • Local user database (PostgreSQL)                                         │
│  • JWT tokens issued by Gateway Core                                        │
│  • RBAC with roles: admin, engineer, operator, viewer                       │
│  • Sufficient for: Single-site, small teams, isolated deployments           │
│  • Pros: Simple, no extra infrastructure                                    │
│  • Cons: No SSO, no federation, manual user management                      │
│                                                                             │
│  OPTION B: Keycloak / Auth0 / Okta (Enterprise)                             │
│  ─────────────────────────────────────────────────                          │
│  • External Identity Provider                                               │
│  • OIDC/OAuth2 integration                                                  │
│  • SSO with corporate directory (LDAP/AD)                                   │
│  • Sufficient for: Multi-site, enterprise, compliance requirements          │
│  • Pros: Enterprise SSO, federation, MFA, audit                             │
│  • Cons: Additional complexity, resource usage                              │
│                                                                             │
│  RECOMMENDED: Start with Built-in, add Keycloak later                       │
│  ─────────────────────────────────────────────────                          │
│  • Design Gateway Core to support both modes                                │
│  • Use OIDC-compatible JWT validation                                       │
│  • Easy to switch issuer from "self" to "keycloak"                          │
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
│                        DATA GOVERNANCE FRAMEWORK                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. DATA LINEAGE & PROVENANCE                                               │
│  ────────────────────────────                                               │
│  • Every data point tracks: source device, protocol, gateway, timestamp     │
│  • Metadata attached to MQTT messages and stored in historian               │
│  • Query: "Where did this value come from? What transformations?"           │
│                                                                             │
│  2. DATA QUALITY                                                            │
│  ───────────────                                                            │
│  • OPC UA quality codes preserved (Good, Bad, Uncertain)                    │
│  • Validation rules at ingestion (range checks, type validation)            │
│  • Quality flags stored with each data point                                │
│  • Dashboards show quality indicators                                       │
│                                                                             │
│  3. DATA RETENTION & LIFECYCLE                                              │
│  ─────────────────────────────                                              │
│  • Configurable retention policies per data class                           │
│  • Automatic downsampling (raw → 1min → 1hour → 1day)                       │
│  • Compression for historical data                                          │
│  • Archival to cold storage (S3, Azure Blob) for compliance                 │
│                                                                             │
│  4. AUDIT TRAIL                                                             │
│  ───────────────                                                            │
│  • All configuration changes logged (who, what, when)                       │
│  • User actions audited                                                     │
│  • Immutable audit log (append-only, no deletions)                          │
│  • Export for compliance reporting                                          │
│                                                                             │
│  5. DATA CLASSIFICATION                                                     │
│  ─────────────────────────                                                  │
│  • Tag data with sensitivity levels                                         │
│  • PII/sensitive data handling                                              │
│  • Access controls based on classification                                  │
│                                                                             │
│  6. DATA CATALOG                                                            │
│  ────────────────                                                           │
│  • Central registry of all data points                                      │
│  • Searchable metadata (tags, descriptions, units)                          │
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
│                      COMPOSABLE ARCHITECTURE PRINCIPLES                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. MICROSERVICES (Loosely Coupled)                                         │
│  ──────────────────────────────────                                         │
│  • Each service is independent, deployable, scalable                        │
│  • Services communicate via MQTT (async) or REST (sync)                     │
│  • Can replace any service without affecting others                         │
│                                                                             │
│  2. PLUGIN ARCHITECTURE                                                     │
│  ─────────────────────────                                                  │
│  • Protocol Gateway: Add new protocols via plugins                          │
│  • Flow Engine: Add custom nodes                                            │
│  • Frontend: Add custom widgets                                             │
│  • Alert Service: Add notification channels                                 │
│                                                                             │
│  3. EVENT-DRIVEN (MQTT as backbone)                                         │
│  ──────────────────────────────────                                         │
│  • Services react to events, not direct calls                               │
│  • Easy to add new consumers without changing producers                     │
│  • Enables future AI/ML services to "plug in"                               │
│                                                                             │
│  4. CONTAINERIZED                                                           │
│  ─────────────────                                                          │
│  • Each component is a Docker container                                     │
│  • Deploy only what you need                                                │
│  • Scale components independently                                           │
│                                                                             │
│  5. API-FIRST                                                               │
│  ────────────                                                               │
│  • Every capability exposed via API                                         │
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

## 7️⃣ Protocol Gateway: Why Custom Go Instead of EMQX Neuron

**Question:** Should we use EMQX Neuron for protocol conversion or build a custom Go implementation?

**Answer:** **Custom Go implementation.** After thorough analysis, EMQX Neuron's licensing limitations make it unsuitable for production use.

### EMQX Neuron Analysis

We initially considered EMQX Neuron as a quick-start option. Here's our evaluation:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      EMQX NEURON LICENSING ANALYSIS                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  FREE VERSION LIMITATIONS (Verified from official EMQX docs):               │
│  ───────────────────────────────────────────────────────────────            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Limit Type          │  Free Version   │  Commercial License        │    │
│  ├──────────────────────┼─────────────────┼────────────────────────────│    │
│  │  Data Tags           │  30 tags        │  Unlimited                 │    │
│  │  Device Connections  │  30 connections │  Unlimited                 │    │
│  │  Time Limit          │  Unlimited      │  License period            │    │
│  │  All Drivers         │  Included       │  Included                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Source: docs.emqx.com/en/neuronex/latest/installation/license_setting      │
│  Docker: hub.docker.com/r/emqx/neuron (same limits apply)                   │
│                                                                             │
│  15-Day Trial License Available:                                            │
│  • 100 connections, 1,000 tags                                              │
│  • 2 trial requests per email                                               │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  WHY 30 TAGS IS NOT VIABLE:                                                 │
│  ────────────────────────────────                                           │
│                                                                             │
│  Typical Industrial Setup:                                                  │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Device Type        │  Typical Tags  │  Devices with 30-tag limit    │   │
│  ├─────────────────────┼────────────────┼────────────────────────────── │   │
│  │  Small PLC          │  20-50 tags    │  0-1 devices max              │   │
│  │  Medium PLC         │  100-500 tags  │  0 devices                    │   │
│  │  Large PLC          │  500-2000 tags │  0 devices                    │   │
│  │  OPC UA Server      │  500-5000 tags │  0 devices                    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  30 tags = DEMO MODE ONLY. Not viable for any real deployment.              │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  COMMERCIAL LICENSE:                                                        │
│  ─────────────────────                                                      │
│  • Pricing not publicly available (contact EMQX sales)                      │
│  • Typically subscription-based per connection/tag                          │
│  • Creates ongoing licensing cost and vendor dependency                     │
│                                                                             │
│  DECISION: Commercial license adds cost and dependency we want to avoid.    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Decision: Custom Go Protocol Gateway ✅

Given Neuron's licensing constraints, we will implement a **custom Go Protocol Gateway** using proven open-source libraries:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CUSTOM GO IMPLEMENTATION (CHOSEN)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  GO PROTOCOL LIBRARIES (All MIT/Apache Licensed, No Limits):                │
│  ───────────────────────────────────────────────────────────                │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Protocol      │  Library                      │  License │ Status  │    │
│  ├────────────────┼───────────────────────────────┼──────────┼─────────│    │
│  │  Siemens S7    │  github.com/robinson/gos7     │  MIT     │ Mature  │    │
│  │  OPC UA        │  github.com/gopcua/opcua      │  MIT     │ Active  │    │
│  │  Modbus TCP    │  github.com/simonvetter/      │  MIT     │ Stable  │    │
│  │                │  modbus                       │          │         │    │
│  │  Modbus RTU    │  github.com/goburrow/modbus   │  BSD     │ Stable  │    │
│  │  EtherNet/IP   │  github.com/loki-os/          │  MIT     │ Usable  │    │
│  │                │  go-ethernet-ip               │          │         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  BENEFITS:                                                                  │
│  • No connection limits                                                     │
│  • No tag limits                                                            │
│  • No licensing costs - ever                                                │
│  • Full control over implementation                                         │
│  • Single codebase in Go                                                    │
│  • No vendor lock-in                                                        │
│                                                                             │
│  DEVELOPMENT TIMELINE:                                                      │
│  ├── Modbus Driver (simplest):      2-3 weeks                               │
│  ├── S7 Driver (gos7):              4-6 weeks                               │
│  ├── OPC UA Driver (gopcua):        4-8 weeks                               │
│  ├── Connection Management:         2-4 weeks                               │
│  ├── Tag Discovery:                 2-4 weeks                               │
│  └── Total for robust system:       3-6 months                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Architecture: Pure Go Protocol Gateway

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      GO PROTOCOL GATEWAY ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      GO PROTOCOL GATEWAY                            │    │
│  │                                                                     │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐   │    │
│  │  │ S7 Driver   │  │ OPC UA      │  │ Modbus      │  │ Future    │   │    │
│  │  │ (gos7)      │  │ (gopcua)    │  │ (go-modbus) │  │ Protocols │   │    │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘   │    │
│  │         │                │                │               │         │    │
│  │         └────────────────┴────────────────┴───────────────┘         │    │
│  │                                   │                                 │    │
│  │                        ┌──────────▼──────────┐                      │    │
│  │                        │  DEVICE MANAGER     │                      │    │
│  │                        │  • Connection pool  │                      │    │
│  │                        │  • Health monitor   │                      │    │
│  │                        │  • Reconnection     │                      │    │
│  │                        └──────────┬──────────┘                      │    │
│  │                                   │                                 │    │
│  │  ┌────────────────────────────────┼────────────────────────────┐    │    │
│  │  │                                │                            │    │    │
│  │  ▼                                ▼                            ▼    │    │
│  │  ┌──────────────┐  ┌──────────────────────┐  ┌──────────────────┐   │    │
│  │  │ TAG REGISTRY │  │ DATA NORMALIZER      │  │ MQTT PUBLISHER   │   │    │
│  │  │ • Address    │  │ • Scaling            │  │ • QoS handling   │   │    │
│  │  │   mapping    │  │ • Unit conversion    │  │ • Batching       │   │    │
│  │  │ • Metadata   │  │ • Quality codes      │  │ • Topic routing  │   │    │
│  │  └──────────────┘  └──────────────────────┘  └────────┬─────────┘   │    │
│  │                                                        │            │    │
│  └────────────────────────────────────────────────────────┼────────────┘    │
│                                                           │                 │
│                                                           ▼                 │
│                                                    ┌──────────────┐         │
│                                                    │  EMQX BROKER │         │
│                                                    └──────────────┘         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Comparison: Custom Go vs Neuron

| Aspect | Custom Go | Neuron Free | Neuron Commercial |
|--------|-----------|-------------|-------------------|
| **Tag Limit** | ∞ Unlimited | 30 tags ❌ | Unlimited |
| **Connection Limit** | ∞ Unlimited | 30 conn ❌ | Unlimited |
| **Licensing Cost** | $0 forever | $0 | $$$ ongoing |
| **Development Time** | 3-6 months | Days | Days |
| **Vendor Lock-in** | None | None | EMQX |
| **Customization** | Full control | Limited | Limited |
| **Protocol Support** | S7, OPC UA, Modbus | 80+ | 80+ |
| **Long-term Cost** | Dev time only | N/A (unusable) | Recurring fees |

### Final Decision

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FINAL DECISION                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ✅ CHOSEN: Custom Go Protocol Gateway                                      │
│                                                                             │
│  Rationale:                                                                 │
│  1. Neuron free version (30 tags/30 connections) is demo-only               │
│  2. Commercial license adds cost and vendor dependency                      │
│  3. Go libraries (gos7, gopcua, go-modbus) are mature and MIT licensed      │
│  4. Full control over implementation and no artificial limits               │
│  5. Investment in development pays off with zero ongoing license costs      │
│                                                                             │
│  ❌ REJECTED: EMQX Neuron                                                   │
│                                                                             │
│  Reason: Licensing limitations make free version unusable for production.   │
│  Commercial license creates ongoing cost and vendor dependency.             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8️⃣ Protocol Gateway: Code Architecture

**Question:** The Protocol Gateway has many files - won't this slow down the application? Does every device need a separate container? Why not one Dockerfile per protocol?

**Answer:** These are common misconceptions. Here's the clarification:

### Many Files ≠ Slower Performance

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      GO COMPILATION MODEL                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   SOURCE FILES (Development)              BINARY (Runtime)                  │
│   ─────────────────────────              ─────────────────                  │
│                                                                             │
│   ├── cmd/gateway/main.go                                                   │
│   ├── internal/adapter/modbus/   ════════════════════╗                      │
│   │   ├── client.go              ║                   ║                      │
│   │   └── pool.go                ║   COMPILES TO     ║                      │
│   ├── internal/adapter/mqtt/     ║                   ▼                      │
│   │   └── publisher.go           ║     ┌───────────────────────┐            │
│   ├── internal/domain/           ║     │  protocol-gateway     │            │
│   │   ├── device.go              ║     │  (Single Binary)      │            │
│   │   ├── tag.go                 ║     │  ~15-20 MB            │            │
│   │   └── datapoint.go           ║     │  Zero Dependencies    │            │
│   ├── internal/service/          ║     └───────────────────────┘            │
│   │   └── polling.go             ║                                          │
│   └── ...                        ╚════════════════════════════════╝         │
│                                                                             │
│   Files are for DEVELOPER ORGANIZATION only.                                │
│   At runtime: ONE binary, NO file loading, NO performance impact.           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

| Concern | Reality |
|---------|---------|
| Many `.go` files | Go compiles **everything into a single binary** |
| Runtime impact | **Zero** - there's no file loading at runtime |
| Binary size | ~15-20 MB total (very small) |
| Startup time | Milliseconds |

### One Container, Many Devices

**The architecture does NOT spin up a container per device.** One Protocol Gateway container handles ALL devices:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ONE PROTOCOL GATEWAY CONTAINER                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌───────────────────────────────────────────────────────────────────┐     │
│   │              CONNECTION POOL (Max 100 connections by default)     │     │
│   │                                                                   │     │
│   │   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────┐     │     │
│   │   │Device 1 │  │Device 2 │  │Device 3 │  │Device 4 │  │ ... │     │     │
│   │   │ Conn    │  │ Conn    │  │ Conn    │  │ Conn    │  │     │     │     │
│   │   │192.168. │  │192.168. │  │192.168. │  │192.168. │  │     │     │     │
│   │   │1.100    │  │1.101    │  │1.102    │  │1.103    │  │     │     │     │
│   │   └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────┘     │     │
│   └───────────────────────────────────────────────────────────────────┘     │
│                                     │                                       │
│   ┌───────────────────────────────────────────────────────────────────┐     │
│   │              WORKER POOL (10 concurrent pollers)                  │     │
│   │   Worker 1  Worker 2  Worker 3  Worker 4  ... Worker 10           │     │
│   └───────────────────────────────────────────────────────────────────┘     │
│                                     │                                       │
│                            ONE MQTT CONNECTION                              │
│                                     │                                       │
│                                     ▼                                       │
│                              EMQX Broker                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

    To add devices: Edit devices.yaml → Restart (or hot-reload in future)
    NO new containers needed!
```

### One Dockerfile for All Protocols

There is only **ONE Dockerfile** for the entire Protocol Gateway. All protocols compile into the same binary:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MULTI-PROTOCOL SINGLE BINARY                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   services/protocol-gateway/                                                │
│   ├── internal/adapter/                                                     │
│   │   ├── modbus/          ← Modbus driver (implemented)                    │
│   │   ├── opcua/           ← OPC UA driver (future)                         │
│   │   ├── s7/              ← Siemens S7 driver (future)                     │
│   │   └── mqtt-bridge/     ← MQTT bridge (future)                           │
│   └── Dockerfile           ← ONE Dockerfile for ALL                         │
│                                                                             │
│   devices.yaml determines which driver to use:                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  devices:                                                           │   │
│   │    - id: plc-001                                                    │   │
│   │      protocol: modbus-tcp    # Uses Modbus driver                   │   │
│   │                                                                     │   │
│   │    - id: plc-002                                                    │   │
│   │      protocol: opcua         # Uses OPC UA driver (future)          │   │
│   │                                                                     │   │
│   │    - id: plc-003                                                    │   │
│   │      protocol: s7            # Uses S7 driver (future)              │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Summary

| Question | Answer |
|----------|--------|
| Many files = slow? | ❌ No - compiles to single binary |
| Container per device? | ❌ No - ONE container, many devices |
| Container per protocol? | ❌ No - ONE container, all protocols |

---

## 9️⃣ Scaling: 1000+ or 10000+ Devices

**Question:** What happens with 1000+ or 10,000+ devices? Do we spin up a new connection pool?

**Answer:** **Horizontal scaling with multiple gateway instances**, not bigger connection pools.

### Scaling Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DEVICE SCALING ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SMALL DEPLOYMENT (< 100 devices)                                           │
│  ─────────────────────────────────                                          │
│                                                                             │
│    ┌─────────────────────────────────────────┐                              │
│    │       Protocol Gateway Instance 1       │                              │
│    │       (100 devices, 5000 tags)          │                              │
│    │       Pool: 100 connections             │                              │
│    └───────────────────┬─────────────────────┘                              │
│                        │                                                    │
│                        ▼                                                    │
│                  EMQX Broker                                                │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  MEDIUM DEPLOYMENT (100-500 devices)                                        │
│  ───────────────────────────────────                                        │
│                                                                             │
│    ┌──────────────────────────┐   ┌──────────────────────────┐              │
│    │   Gateway Instance 1     │   │   Gateway Instance 2     │              │
│    │   (Devices 1-250)        │   │   (Devices 251-500)      │              │
│    │   Plant A, Lines 1-3     │   │   Plant A, Lines 4-6     │              │
│    └─────────────┬────────────┘   └─────────────┬────────────┘              │
│                  │                              │                           │
│                  └──────────┬───────────────────┘                           │
│                             ▼                                               │
│                       EMQX Broker                                           │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  LARGE DEPLOYMENT (1000+ devices)                                           │
│  ────────────────────────────────                                           │
│                                                                             │
│    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│    │ Gateway 1   │ │ Gateway 2   │ │ Gateway 3   │ │ Gateway 4   │          │
│    │ Plant A     │ │ Plant B     │ │ Plant C     │ │ Plant D     │          │
│    │ 250 devices │ │ 250 devices │ │ 250 devices │ │ 250 devices │          │
│    └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘          │
│           │               │               │               │                 │
│           └───────────────┴───────────────┴───────────────┘                 │
│                                   │                                         │
│                                   ▼                                         │
│                          EMQX Broker Cluster                                │
│                    (3-5 nodes for HA and scale)                             │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ENTERPRISE DEPLOYMENT (10,000+ devices)                                    │
│  ────────────────────────────────────────                                   │
│                                                                             │
│   ┌─── Region 1 ───┐   ┌─── Region 2 ───┐   ┌─── Region 3 ───┐              │
│   │ ┌───────────┐  │   │ ┌───────────┐  │   │ ┌───────────┐  │              │
│   │ │Gateway x10│  │   │ │Gateway x10│  │   │ │Gateway x10│  │              │
│   │ │2500 dev   │  │   │ │2500 dev   │  │   │ │2500 dev   │  │              │
│   │ └─────┬─────┘  │   │ └─────┬─────┘  │   │ └─────┬─────┘  │              │
│   │       │        │   │       │        │   │       │        │              │
│   │ ┌─────▼─────┐  │   │ ┌─────▼─────┐  │   │ ┌─────▼─────┐  │              │
│   │ │EMQX Local │  │   │ │EMQX Local │  │   │ │EMQX Local │  │              │
│   │ │ Cluster   │  │   │ │ Cluster   │  │   │ │ Cluster   │  │              │
│   │ └─────┬─────┘  │   │ └─────┬─────┘  │   │ └─────┬─────┘  │              │
│   └───────┼────────┘   └───────┼────────┘   └───────┼────────┘              │
│           │                    │                    │                       │
│           └────────────────────┴────────────────────┘                       │
│                                │                                            │
│                    ┌───────────▼───────────┐                                │
│                    │  Central EMQX Cloud   │                                │
│                    │  or Bridge            │                                │
│                    └───────────────────────┘                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why Horizontal Scaling, Not Bigger Pools?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                WHY HORIZONTAL > VERTICAL SCALING                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ❌ VERTICAL (One Giant Gateway)              ✅ HORIZONTAL (Multiple)     │
│  ─────────────────────────────────            ─────────────────────────     │
│                                                                             │
│  ┌─────────────────────────────┐              ┌─────────┐  ┌─────────┐      │
│  │   Gateway (10,000 devices)  │              │Gateway 1│  │Gateway 2│      │
│  │   Pool: 10,000 connections  │              │ 100 dev │  │ 100 dev │      │
│  │                             │              └────┬────┘  └────┬────┘      │
│  │   Problems:                 │                   │            │           │
│  │   • Single point of failure │              ┌─────────┐  ┌─────────┐      │
│  │   • One crash = ALL down    │              │Gateway 3│  │Gateway N│      │
│  │   • Memory pressure         │              │ 100 dev │  │ 100 dev │      │
│  │   • Can't update without    │              └─────────┘  └─────────┘      │
│  │     total downtime          │                                            │
│  │   • Network bottleneck      │              Benefits:                     │
│  └─────────────────────────────┘              • Fault isolation             │
│                                               • Rolling updates             │
│                                               • Geographic distribution     │
│                                               • Independent scaling         │
│                                               • No single point of failure  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Scaling Guidelines

| Device Count | Recommended Setup | Notes |
|--------------|-------------------|-------|
| **1-100** | 1 Gateway instance | Single instance sufficient |
| **100-500** | 2-5 Gateway instances | Split by plant/area |
| **500-2000** | 5-20 instances + EMQX cluster | Add EMQX clustering |
| **2000-10000** | 20-100 instances, regional | Regional EMQX clusters |
| **10000+** | Federated architecture | Multiple regions, EMQX bridge |

### How to Partition Devices Across Gateways

```yaml
# Gateway Instance 1 (devices-plant-a.yaml)
devices:
  - id: plc-a-001
    uns_prefix: plant-a/line-1/plc-001
    connection:
      host: 192.168.1.100
  - id: plc-a-002
    uns_prefix: plant-a/line-1/plc-002
    connection:
      host: 192.168.1.101
  # ... 100 devices for Plant A

# Gateway Instance 2 (devices-plant-b.yaml)  
devices:
  - id: plc-b-001
    uns_prefix: plant-b/line-1/plc-001
    connection:
      host: 192.168.2.100
  # ... 100 devices for Plant B
```

### Kubernetes Deployment Example (1000+ devices)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: protocol-gateway-plant-a
spec:
  replicas: 4  # 4 instances for Plant A
  selector:
    matchLabels:
      app: protocol-gateway
      plant: plant-a
  template:
    spec:
      containers:
        - name: gateway
          image: nexus/protocol-gateway:latest
          env:
            - name: DEVICES_CONFIG_PATH
              value: /config/devices-plant-a.yaml
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
---
# Repeat for plant-b, plant-c, etc.
```

### Connection Pool Limits: Why 100?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONNECTION POOL SIZING                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Per Gateway Instance (default 100 connections):                            │
│                                                                             │
│  • Memory per connection: ~50KB (TCP buffers, state)                        │
│  • 100 connections = ~5MB memory overhead                                   │
│  • 1000 connections = ~50MB memory overhead (still manageable)              │
│                                                                             │
│  The 100 limit is CONFIGURABLE:                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  modbus:                                                             │   │
│  │    max_connections: 100    # Default                                 │   │
│  │    max_connections: 250    # For larger instances                    │   │
│  │    max_connections: 500    # Maximum recommended per instance        │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Beyond 500 connections per instance: Consider horizontal scaling instead.  │
│                                                                             │
│  Why not 10,000 in one pool?                                                │
│  • Diminishing returns on connection reuse                                  │
│  • Higher blast radius on failure                                           │
│  • Harder to debug/monitor                                                  │
│  • Network interface limits                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Summary

| Scale | Strategy |
|-------|----------|
| **1-100 devices** | Single gateway, single pool |
| **100-1000 devices** | Multiple gateways, partitioned by location |
| **1000-10000 devices** | Regional gateway clusters + EMQX clusters |
| **10000+ devices** | Federated multi-region architecture |

**Key Principle**: Scale OUT (more instances), not UP (bigger pools). This provides fault isolation, rolling updates, and geographic distribution.

---

## Summary of Recommendations

| Question | Decision |
|----------|----------|
| **Protocol Conversion** | Custom **Go Protocol Gateway** using gos7, gopcua, go-modbus |
| **Backend Language** | Polyglot: **Go** for high-performance services, TypeScript for API/Frontend |
| **Throughput** | Batch writes, connection pooling, EMQX shared subscriptions, TimescaleDB hypertables |
| **Auth** | Start with built-in JWT + RBAC, design for Keycloak compatibility |
| **Data Governance** | Quality codes, lineage tracking, retention policies, audit logs, data catalog |
| **Composable** | Already composable via microservices, MQTT events, containerization, plugin architecture |
| **EMQX Neuron** | **Rejected** - Free version limited to 30 tags/30 connections (unusable for production) |
| **Code Architecture** | Many files = single binary. One container handles ALL devices and protocols |
| **1000+ Devices** | Horizontal scaling - multiple gateway instances, NOT bigger pools |

---

*Document created during architecture review phase. These decisions should guide all implementation work.*

