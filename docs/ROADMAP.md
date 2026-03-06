# NEXUS Edge Platform - Development Roadmap

> **From Zero to Production-Ready IIoT Platform**

This document outlines the complete development journey of NEXUS Edge, from initial concept to a fully-featured enterprise IIoT platform.

---

## 📊 Overall Progress

```
Phase 1: Foundation          ████████████████████ 100% ✅
Phase 2: Kubernetes          ████████████████████  95% ✅
Phase 3: Gateway Core        ██████████░░░░░░░░░░  55% 🔄
Phase 4: Analytics           ░░░░░░░░░░░░░░░░░░░░   0% 📋
Phase 5: Enterprise          ░░░░░░░░░░░░░░░░░░░░   0% 📋
─────────────────────────────────────────────────────────
Total Progress               ██████████░░░░░░░░░░  50%
```

---

## 🎯 Vision

Build a **lightweight, scalable, and production-ready** Industrial IoT platform that:

- Connects to industrial devices (PLCs, sensors, HMIs) using standard protocols
- Normalizes data into a Unified Namespace (UNS)
- Stores time-series data efficiently
- Scales horizontally from small edge deployments to large enterprise installations
- Provides a management interface for device configuration and monitoring

---

## Phase 1: Foundation ✅

**Timeline**: November - December 2025
**Status**: **COMPLETE**

### Goals

- Establish core data collection pipeline
- Support major industrial protocols
- Implement time-series storage
- Create development environment

### Deliverables

| Component                   | Status      | Description                                 |
| --------------------------- | ----------- | ------------------------------------------- |
| **Protocol Gateway**        | ✅ Hardened | Go service for device communication         |
| ├─ Modbus TCP/RTU           | ✅ Complete | Holding/Input registers, coils, batch reads |
| ├─ OPC UA                   | ✅ Hardened | Polling, security, session limit handling   |
| ├─ Siemens S7               | ✅ Complete | S7-300/400/1200/1500 support                |
| ├─ Connection Pooling       | ✅ Hardened | Per-device circuit breakers, 500 conn limit |
| ├─ Circuit Breakers         | ✅ Hardened | Per-device isolation (not pool-wide)        |
| ├─ Worker Pool              | ✅ Complete | Bounded concurrency with back-pressure      |
| └─ Rate Limiting            | ✅ Complete | Per-device token bucket rate limiter        |
| **MQTT Integration**        | ✅ Complete | EMQX broker with UNS topics                 |
| ├─ Publish Telemetry        | ✅ Complete | QoS 1, auto-reconnect, buffering            |
| ├─ Write Commands           | ✅ Complete | Bidirectional via $nexus/cmd/#              |
| └─ Shared Subscriptions     | ✅ Complete | Load balancing across consumers             |
| **Data Ingestion Service**  | ✅ Complete | Go service for historian writes             |
| ├─ TimescaleDB Integration  | ✅ Complete | Hypertables, compression, aggregates        |
| ├─ Batch Processing         | ✅ Complete | 5K point batches, COPY protocol             |
| ├─ Object Pooling           | ✅ Complete | sync.Pool for GC reduction                  |
| └─ Retry Logic              | ✅ Complete | Exponential backoff                         |
| **Development Environment** | ✅ Complete | Docker Compose for local dev                |
| **Testing Documentation**   | ✅ Complete | Step-by-step testing guides                 |

### Architecture (Phase 1)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 1 ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Industrial                                                                │
│   Devices              ┌─────────────────┐     ┌─────────────────┐          │
│   ┌─────┐              │                 │     │                 │          │
│   │ PLC │──Modbus──────│                 │     │                 │          │
│   └─────┘              │    Protocol     │MQTT │      EMQX       │          │
│   ┌─────┐              │    Gateway      │────>│     Broker      │          │
│   │ OPC │──OPC UA──────│     (Go)        │     │                 │          │
│   └─────┘              │                 │     │                 │          │
│   ┌─────┐              │                 │     │                 │          │
│   │ S7  │──S7 TCP──────│                 │     │                 │          │
│   └─────┘              └─────────────────┘     └────────┬────────┘          │
│                                                         │                   │
│                                                         │ MQTT              │
│                                                         ▼                   │
│                                                ┌─────────────────┐          │
│                                                │      Data       │          │
│                                                │   Ingestion     │          │
│                                                │     (Go)        │          │
│                                                └────────┬────────┘          │
│                                                         │                   │
│                                                         │ COPY              │
│                                                         ▼                   │
│                                                ┌─────────────────┐          │
│                                                │   TimescaleDB   │          │
│                                                │   (Historian)   │          │
│                                                └─────────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Decisions Made

- **Go** for high-performance services (Protocol Gateway, Data Ingestion)
- **TypeScript** planned for API/Frontend
- **EMQX** as MQTT broker (enterprise features, clustering)
- **TimescaleDB** for time-series (PostgreSQL compatible, compression)
- **Unified Namespace (UNS)** topic structure for data organization

---

## Phase 2: Kubernetes & Scaling ✅

**Timeline**: December 2025 - January 2026
**Status**: **95% COMPLETE**

### Goals

- Production-ready container orchestration
- Horizontal scaling capabilities
- High availability for critical components
- GitOps-friendly deployment

### Deliverables

| Component                      | Status        | Description                                     |
| ------------------------------ | ------------- | ----------------------------------------------- |
| **Kubernetes Manifests**       | ✅ Complete   | Kustomize-based organization                    |
| ├─ Base Resources              | ✅ Complete   | Namespace, ConfigMaps, Secrets                  |
| ├─ Protocol Gateway            | ✅ Complete   | StatefulSet (1 replica), PDB, PVC for PKI       |
| ├─ Data Ingestion              | ✅ Complete   | Deployment, HPA, PDB, ServiceAccount            |
| ├─ EMQX Cluster                | ✅ Complete   | StatefulSet (3 nodes), DNS discovery            |
| └─ TimescaleDB                 | ✅ Complete   | StatefulSet with PVC                            |
| **Horizontal Pod Autoscaling** | ✅ Complete   | CPU/Memory based (data-ingestion only)          |
| **Pod Disruption Budgets**     | ✅ Complete   | Safe rolling updates                            |
| **Service Accounts + RBAC**    | ✅ Complete   | Minimal permissions                             |
| **Environment Overlays**       | ✅ Complete   | Dev/Prod configurations                         |
| **OPC UA Subscriptions**       | 📝 Documented | Config flag added, full integration Phase 3     |
| **TimescaleDB HA**             | ⏸️ Not Needed | Single instance sufficient for edge (see below) |
| **Helm Charts**                | ⏸️ Deferred   | Kustomize sufficient for now                    |

### Why TimescaleDB HA is Not Needed

For edge deployments, a single TimescaleDB instance is **sufficient**:

- Data persists on PVC (survives pod restarts)
- Kubernetes restarts failed pods automatically (~10-30 seconds)
- Data Ingestion buffers messages during brief outages
- HA adds complexity (Patroni) without proportional benefit for edge

**When to consider HA:**

- 99.99% uptime SLA requirements
- Multi-site replication needed
- Heavy concurrent query load (read replicas)

### Deployment Commands

```bash
# Development (local K3s/minikube)
kubectl apply -k infrastructure/k8s/overlays/dev

# Production
kubectl apply -k infrastructure/k8s/overlays/prod
```

### Scaling Behavior

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SCALING BEHAVIOR                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Protocol Gateway (StatefulSet - NOT horizontally scalable):                │
│  ├── Replicas: 1 (always - cannot scale horizontally)                       │
│  ├── Handles 200+ OPC UA devices, 500+ Modbus devices                       │
│  ├── PersistentVolume for PKI trust store                                   │
│  ├── Long-lived TCP connections (scaling would duplicate)                   │
│  └── For larger deployments: use device sharding (multiple gateways)        │
│                                                                             │
│  Data Ingestion (Deployment - horizontally scalable):                       │
│  ├── Min replicas: 2 (dev: 1)                                               │
│  ├── Max replicas: 10                                                       │
│  ├── Scale up: CPU > 70% or Memory > 80%                                    │
│  └── Uses EMQX shared subscriptions for load balancing                      │
│                                                                             │
│  EMQX Cluster:                                                              │
│  ├── StatefulSet: 3 nodes (prod), 1 node (dev)                              │
│  ├── Automatic clustering via DNS discovery                                 │
│  └── Session persistence across nodes                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Performance Optimizations (Senior Review)

| Improvement           | Impact                                                     |
| --------------------- | ---------------------------------------------------------- |
| Back-pressure on poll | No backlog accumulation when workers busy                  |
| Poll interval jitter  | Prevents synchronized bursts (0-10% random delay)          |
| sync.Pool for slices  | Reduced GC pressure during high-rate polling               |
| Bounded command queue | Memory-safe under command bursts                           |
| Enhanced metrics      | skipped_polls, worker_pool_utilization, per-device latency |

### Protocol Gateway V2 Migration (January 2026) ✅

The protocol gateway was completely rewritten as V2 with enhanced features:

| Enhancement | Description |
|-------------|-------------|
| **OPC UA Subscriptions** | Push-based data delivery (Report-by-Exception) |
| **Address Space Browse** | REST API to explore OPC UA server nodes |
| **PKI Trust Store** | Certificate management with REST API |
| **NTP Clock Drift** | Detect time sync issues with devices |
| **Enhanced Metrics** | Protocol-labeled connections, S7-specific metrics |
| **Load Shaping** | Brownout mode for overloaded servers |
| **StatefulSet Pattern** | Single replica with PVC for PKI storage |

See `docs/PLATFORM_ARCHITECTURE.md` for the complete architecture diagram.

### Protocol Gateway Hardening (January 2026) ✅

Production-readiness improvements following senior engineer review:

| Category          | Task                              | Status      | Description                                                                                         |
| ----------------- | --------------------------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| **P0 - Critical** | Topic/Tag Mapping Bug             | ✅ Complete | Fixed index-based tag lookup; now uses TagID map to prevent data routing to wrong MQTT topics       |
| **P0 - Critical** | OPC UA Session Limit Handling     | ✅ Complete | Added `StatusBadTooManySessions` detection with 5-minute extended backoff; prevents server DoS      |
| **P0 - Critical** | Reconnect State Observability     | ✅ Complete | Added session backoff metrics, `GetSessionBackoffState()` for monitoring                            |
| **P1 - High**     | OPC UA Per-Device Circuit Breaker | ✅ Complete | Moved from pool-wide to per-device; one failing device no longer affects others                     |
| **P1 - High**     | Modbus Per-Device Circuit Breaker | ✅ Complete | Same isolation pattern applied to Modbus pool                                                       |
| **P1 - High**     | Concurrent Reconnect Prevention   | ✅ Complete | Health check now respects session backoff; prevents reconnect storms                                |
| **P2 - Medium**   | Scale Configuration               | ✅ Complete | Increased `max_connections` default from 50/100 to 500 for industrial scale                         |
| **P2 - Medium**   | Per-Device Rate Limiting          | ✅ Complete | Token bucket rate limiter with configurable `min_interval`, `max_requests_per_second`, `burst_size` |

**Key Files Modified:**

- `internal/adapter/opcua/client.go` - Session limit detection, extended backoff, error classification
- `internal/adapter/opcua/pool.go` - Per-device circuit breakers, device health API
- `internal/adapter/modbus/pool.go` - Per-device circuit breakers, device health API
- `internal/service/polling.go` - TagID-based topic mapping, rate limiter integration
- `internal/service/ratelimiter.go` - New token bucket rate limiter implementation
- `internal/domain/device.go` - Added `RateLimitConfig` struct
- `internal/domain/errors.go` - Added `ErrOPCUASessionLimit`
- `config/config.yaml` - Updated defaults for scale

### Protocol Gateway - Remaining Items (Next Cycle)

The following P3 optimizations are deferred to the next development cycle:

| Task                           | Priority | Description                                                                                          |
| ------------------------------ | -------- | ---------------------------------------------------------------------------------------------------- |
| **OPC UA Subscription Mode**   | P3 - Low | Implement Report-by-Exception for high tag counts; reduces polling overhead for slow-changing values |
| **S7 Block Reads**             | P3 - Low | Batch reads by memory area instead of per-tag; reduces PLC communication overhead                    |
| **Jittered Scheduling Config** | P3 - Low | Make poll interval jitter configurable (currently fixed at 0-10%); allow per-device jitter settings  |

These optimizations improve efficiency but are not required for production deployment.

---

## Phase 3: Gateway Core & Management 🔄

**Timeline**: Q1-Q2 2026
**Status**: IN PROGRESS (60%)

### Goals

- Centralized device configuration management
- **Unified Web UI** (single app for all management)
- Dynamic device registration (hot-reload)
- Role-based access control

### Deliverables

| Component                  | Status      | Description                                     |
| -------------------------- | ----------- | ----------------------------------------------- |
| **Gateway Core Service**   | 🔄 85%      | Central management API (TypeScript/Fastify)     |
| ├─ Device CRUD API         | ✅ Complete | REST API for device management                  |
| ├─ Tag CRUD API            | ✅ Complete | REST API for tag configuration                  |
| ├─ Configuration Store     | ✅ Complete | PostgreSQL + Drizzle ORM with migrations        |
| ├─ MQTT Notifications      | ✅ Complete | Publish config changes to gateways              |
| ├─ Health Check Endpoints  | ✅ Complete | /health, /health/ready, /health/live            |
| └─ WebSocket Gateway       | ⏳ Pending  | Real-time updates to UI                         |
| **Unified Web UI (React)** | 🔄 65%      | Single app for ALL management                   |
| ├─ Device List/Grid        | ✅ Complete | View all connected devices with search/filter   |
| ├─ Device Editor (basic)   | ✅ Complete | Add/edit with generic fields                    |
| ├─ **Protocol Fields**     | ⏳ Pending  | Dynamic config per protocol (see below)         |
| ├─ Tag Browser             | ⏳ Pending  | Browse and configure tags                       |
| ├─ Connection Status       | ⏳ Pending  | Real-time device health (WebSocket)             |
| ├─ System Overview         | ✅ Complete | Health cards + interactive architecture diagram |
| └─ Navigation Shell        | ✅ Complete | Shared layout with dark theme                   |
| **Infrastructure**         | ✅ Complete | Docker & deployment config                      |
| ├─ Docker Compose          | ✅ Complete | gateway-core + web-ui services                  |
| ├─ Dockerfiles             | ✅ Complete | Multi-stage builds                              |
| └─ K8s Manifests           | ⏳ Pending  | Deployment, Service, HPA for new services       |
| **Config Sync**            | ⏳ Pending  | Protocol Gateway ↔ PostgreSQL integration       |
| ├─ MQTT Config Subscriber  | ⏳ Pending  | Protocol Gateway listens to $nexus/config/#     |
| └─ REST API Fetch          | ⏳ Pending  | Fetch devices from Gateway Core on startup      |
| **Data Normalizer**        | ⏳ Pending  | Transformation pipeline                         |
| ├─ Unit Conversion         | ⏳ Pending  | °F → °C, bar → psi, etc.                        |
| ├─ Value Clamping          | ⏳ Pending  | Min/max limits                                  |
| ├─ Scaling/Offset          | ⏳ Pending  | Linear transformations                          |
| └─ Expression Evaluation   | ⏳ Pending  | Calculated/derived tags                         |
| **Authentication**         | ⏳ Pending  | JWT tokens, API keys                            |
| **RBAC**                   | ⏳ Pending  | Role-based permissions                          |
| **Audit Logging**          | ⏳ Pending  | Track configuration changes                     |

### What's Working Now ✅

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PHASE 3 - CURRENT STATE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Development (pnpm dev):                                                   │
│   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐           │
│   │   Web UI    │ REST    │  Gateway    │  SQL    │  PostgreSQL │           │
│   │  :5173      │◄───────►│    Core     │◄───────►│   :5433     │           │
│   │ (Vite+HMR)  │  /api   │   :3001     │         │ nexus_config│           │
│   └─────────────┘         └──────┬──────┘         └─────────────┘           │
│                                  │                                          │
│                                  │ MQTT                                     │
│                                  ▼                                          │
│                           ┌─────────────┐                                   │
│                           │    EMQX     │                                   │
│                           │   :1883     │                                   │
│                           └─────────────┘                                   │
│                                                                             │
│   Docker Compose:                                                           │
│   $ cd infrastructure/docker && docker-compose up -d                        │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│   │  web-ui     │  │gateway-core │  │  postgres   │  │    emqx     │        │
│   │   :8080     │  │   :3001     │  │   :5433     │  │   :1883     │        │
│   └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Protocol-Specific Configuration Fields ⏳ (TODO)

The device dialog currently uses generic fields. Each protocol needs specific configuration:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PROTOCOL-SPECIFIC FIELDS NEEDED                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  MODBUS TCP:                        OPC UA:                                 │
│  ├── Host*          [192.168.1.10]  ├── Endpoint URL*   [opc.tcp://...]     │
│  ├── Port*          [502]           ├── Security Policy [None ▼]            │
│  ├── Unit ID*       [1]             │     - None                            │
│  ├── Timeout (ms)   [5000]          │     - Basic128Rsa15                   │
│  └── Max Retries    [3]             │     - Basic256Sha256                  │
│                                     ├── Security Mode   [None ▼]            │
│  MODBUS RTU:                        │     - None / Sign / SignAndEncrypt    │
│  ├── Serial Port*   [COM1]          ├── Username        [optional]          │
│  ├── Baud Rate*     [9600 ▼]        ├── Password        [●●●●●●●●]          │
│  ├── Parity         [None ▼]        └── Timeout (ms)    [10000]             │
│  └── Unit ID*       [1]                                                     │
│                                     SIEMENS S7:                             │
│                                     ├── Host*          [192.168.1.20]       │
│                                     ├── Rack*          [0]                  │
│                                     ├── Slot*          [1]                  │
│                                     ├── PLC Type       [S7-1500 ▼]          │
│                                     └── Timeout (ms)   [5000]               │
│                                                                             │
│  (* = required field)                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Implementation approach:**

1. Device dialog shows common fields (name, description, protocol, poll interval)
2. On protocol selection → render protocol-specific field component dynamically
3. Store protocol config in `protocol_config` JSONB column (already in DB schema)
4. Validate with Zod discriminated unions per protocol type

### Tech Stack (Implemented)

| Component     | Technology            | Notes                              |
| ------------- | --------------------- | ---------------------------------- |
| Gateway Core  | TypeScript, Fastify 4 | REST API with Swagger/OpenAPI      |
| Database ORM  | Drizzle ORM           | Type-safe queries, auto-migrations |
| Validation    | Zod                   | Runtime schema validation          |
| Web UI        | React 18, Vite 5      | Fast HMR, TypeScript               |
| Styling       | TailwindCSS 3         | Dark theme, responsive             |
| Data Fetching | TanStack Query v5     | Caching, auto-refetch              |
| Icons         | Lucide React          | Consistent iconography             |

### Unified UI Vision

The Web UI is designed as a **single React application** that grows with each phase:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    UNIFIED WEB UI - PROGRESSIVE FEATURES                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PHASE 3 (Current - 70% Complete):                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Navigation: [Devices] [System]                            ✅ DONE  │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │  Device Management                                                  │    │
│  │  ├── Device list with search/filter                         ✅ DONE │    │
│  │  ├── Add/Edit device dialog (basic fields)                  ✅ DONE │    │
│  │  ├── Delete device with confirmation                        ✅ DONE │    │
│  │  ├── Protocol badges (Modbus/OPC UA/S7)                     ✅ DONE │    │
│  │  ├── Protocol-specific config fields (see below)            ⏳ TODO │    │
│  │  ├── Tag configuration UI                                   ⏳ TODO │    │
│  │  └── Real-time connection status (WebSocket)                ⏳ TODO │    │
│  │                                                                     │    │
│  │  System Overview                                                    │    │
│  │  ├── Gateway Core health status                             ✅ DONE │    │
│  │  ├── PostgreSQL connection status + latency                 ✅ DONE │    │
│  │  ├── MQTT broker connection status                          ✅ DONE │    │
│  │  └── Architecture diagram (ASCII art)                       ✅ DONE │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  PHASE 4 (Adds to same UI):                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Navigation: [Devices] [Dashboards] [Historian] [Alerts] [System]   │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │  Dashboard Builder                                                  │    │
│  │  ├── Drag-drop widget grid                                          │    │
│  │  ├── Widget library (gauges, charts, tables)                        │    │
│  │  ├── Real-time data bindings (MQTT → widgets)                       │    │
│  │  └── Kiosk/fullscreen mode                                          │    │
│  │                                                                     │    │
│  │  Historian Explorer                                                 │    │
│  │  ├── Visual query builder (tag picker, time range)                  │    │
│  │  ├── Interactive trend charts                                       │    │
│  │  └── Data export (CSV, JSON)                                        │    │
│  │                                                                     │    │
│  │  Alert Management                                                   │    │
│  │  └── Rule configuration (thresholds, notifications)                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  PHASE 5 (Adds to same UI):                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Nav: [Devices] [Dashboards] [Flows] [Historian] [Containers] [...] │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │  Container/Pod Management                                           │    │
│  │  ├── List all containers/pods with status                           │    │
│  │  ├── CPU, Memory, Network metrics per container                     │    │
│  │  ├── Real-time log streaming                                        │    │
│  │  ├── Start/Stop/Restart actions                                     │    │
│  │  ├── Scale replicas (for K8s deployments)                           │    │
│  │  └── Deploy new containers via wizard                               │    │
│  │                                                                     │    │
│  │  Visual Flow Designer (Node-RED alternative)                        │    │
│  │  ├── Custom React Flow canvas (not iframe)                          │    │
│  │  ├── Drag devices from sidebar onto canvas                          │    │
│  │  ├── Pre-built nodes (transform, filter, aggregate)                 │    │
│  │  ├── MQTT input/output nodes                                        │    │
│  │  └── Deploy flows to Gateway                                        │    │
│  │                                                                     │    │
│  │  User Management                                                    │    │
│  │  ├── Create/edit users                                              │    │
│  │  ├── Assign roles (Admin, Engineer, Operator)                       │    │
│  │  └── Audit log viewer                                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why One Unified UI?

| Benefit                | Description                                                       |
| ---------------------- | ----------------------------------------------------------------- |
| **Consistent UX**      | Same design language, navigation, and interactions everywhere     |
| **Shared state**       | User session, auth tokens, and preferences shared across features |
| **Faster development** | Reuse components (tables, forms, charts) across features          |
| **Better integration** | Devices, dashboards, and flows can reference each other           |
| **Simpler deployment** | One container for the entire frontend                             |

### Architecture (Phase 3)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 3 ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐                                                          │
│   │   Web UI     │◄────────────────────────────────────────────┐            │
│   │  (React)     │                                             │            │
│   └──────┬───────┘                                             │            │
│          │ REST API                                            │            │
│          ▼                                                     │            │
│   ┌──────────────┐     ┌─────────────┐                         │            │
│   │   Gateway    │────>│ PostgreSQL  │                         │            │
│   │    Core      │     │  (Config)   │                         │            │
│   └──────┬───────┘     └─────────────┘                         │            │
│          │                                                     │            │
│          │ MQTT (config updates)                               │            │
│          ▼                                                     │            │
│   ┌──────────────┐     ┌─────────────┐     ┌─────────────┐     │            │
│   │   Protocol   │────>│    EMQX     │────>│    Data     │     │            │
│   │   Gateway    │<────│   Cluster   │     │  Ingestion  │     │            │
│   └──────────────┘     └──────┬──────┘     └──────┬──────┘     │            │
│          │                    │                   │            │            │
│          │                    │                   ▼            │            │
│          │                    │            ┌─────────────┐     │            │
│          │                    └───────────>│ TimescaleDB │─────┘            │
│          ▼                                 └─────────────┘                  │
│   ┌──────────────┐                              (Query API)                 │
│   │   Devices    │                                                          │
│   └──────────────┘                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Dynamic Configuration Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DYNAMIC DEVICE CONFIGURATION                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. User adds device via Web UI                                             │
│     └── POST /api/devices { name: "PLC-001", protocol: "modbus", ... }      │
│                                                                             │
│  2. Gateway Core saves to PostgreSQL                                        │
│     └── INSERT INTO devices ...                                             │
│                                                                             │
│  3. Gateway Core publishes MQTT notification                                │
│     └── Topic: $nexus/config/devices/PLC-001                                │
│     └── Payload: { action: "create", device: {...} }                        │
│                                                                             │
│  4. Protocol Gateway receives notification                                  │
│     └── Subscribes to: $nexus/config/devices/#                              │
│     └── Registers new device for polling (hot-reload, no restart!)          │
│                                                                             │
│  5. Device starts polling immediately                                       │
│     └── Data flows to EMQX → Data Ingestion → TimescaleDB                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 4: Analytics & Advanced Features 📋

**Timeline**: Q2-Q3 2026
**Status**: PLANNED

### Goals

- Reduce data volume at the edge
- Improve data quality
- Enable real-time analytics
- Support industry-standard protocols

### Deliverables

| Component                | Priority  | Description                           |
| ------------------------ | --------- | ------------------------------------- |
| **Edge Aggregation**     | 🟡 Medium | Pre-aggregate before historian        |
| ├─ Window Functions      | 🟡 Medium | min/max/avg/count per interval        |
| ├─ Downsampling          | 🟡 Medium | Reduce raw data to summaries          |
| └─ Configurable Windows  | 🟡 Medium | 1s, 10s, 1min, 5min, etc.             |
| **Deadband Filtering**   | 🟡 Medium | Only publish on significant change    |
| ├─ Absolute Deadband     | 🟡 Medium | Value must change by > X              |
| ├─ Percent Deadband      | 🟡 Medium | Value must change by > X%             |
| └─ Per-Tag Configuration | 🟡 Medium | Different thresholds per tag          |
| **Adaptive Polling**     | 🟢 Low    | Adjust intervals based on change rate |
| ├─ Fast on Change        | 🟢 Low    | Speed up when values changing         |
| ├─ Slow on Stable        | 🟢 Low    | Slow down when stable                 |
| └─ Min/Max Bounds        | 🟢 Low    | Configurable limits                   |
| **SparkplugB Support**   | 🟢 Low    | Alternative payload format            |
| **Anomaly Detection**    | 🟢 Low    | Real-time quality monitoring          |
| ├─ Out-of-Range Alerts   | 🟢 Low    | Value exceeds limits                  |
| ├─ Stuck Value Detection | 🟢 Low    | No change for too long                |
| └─ Rate-of-Change Alerts | 🟢 Low    | Changing too fast                     |
| **OEE Calculations**     | 🟡 Medium | Overall Equipment Effectiveness       |
| ├─ Availability          | 🟡 Medium | Uptime tracking                       |
| ├─ Performance           | 🟡 Medium | Speed vs. ideal                       |
| └─ Quality               | 🟡 Medium | Good vs. bad units                    |

### Data Volume Reduction

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DATA VOLUME OPTIMIZATION                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Without Optimization:                                                      │
│  ├── 1000 tags × 1 sec polling × 86400 sec/day = 86.4M points/day           │
│  └── Storage: ~8.6 GB/day (100 bytes/point)                                 │
│                                                                             │
│  With Deadband (50% filtered):                                              │
│  ├── 43.2M points/day                                                       │
│  └── Storage: ~4.3 GB/day                                                   │
│                                                                             │
│  With Edge Aggregation (1-min windows):                                     │
│  ├── 1000 tags × 1440 min/day = 1.44M points/day                            │
│  └── Storage: ~144 MB/day (99.8% reduction!)                                │
│                                                                             │
│  Combined (Deadband + Aggregation):                                         │
│  ├── Raw: Only on change (for detail)                                       │
│  ├── Aggregates: Always (for trending)                                      │
│  └── Best of both worlds                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 5: Enterprise Features 📋

**Timeline**: Q3-Q4 2026
**Status**: PLANNED

### Goals

- Production hardening
- Container/Pod management in UI
- Visual flow designer (Node-RED alternative)
- Operational visibility
- Compliance and standards

### Deliverables

| Component                       | Priority  | Description                              |
| ------------------------------- | --------- | ---------------------------------------- |
| **Container/Pod Management**    | 🔴 High   | Full K8s/Docker management in UI         |
| ├─ Container List               | 🔴 High   | All pods/containers with status          |
| ├─ Resource Metrics             | 🔴 High   | CPU, Memory, Network per container       |
| ├─ Log Streaming                | 🔴 High   | Real-time log viewer                     |
| ├─ Actions                      | 🔴 High   | Start, Stop, Restart, Scale              |
| ├─ Deploy Wizard                | 🟡 Medium | Deploy new containers from UI            |
| └─ **App Catalog**              | 🟡 Medium | Pre-configured apps (Grafana, ML, etc.)  |
| **Custom Container Deployment** | 🟡 Medium | Deploy any Docker image                  |
| ├─ Image Registry Support       | 🟡 Medium | Docker Hub, GHCR, private registries     |
| ├─ Resource Configuration       | 🟡 Medium | CPU/Memory limits, replicas              |
| ├─ Environment Variables        | 🟡 Medium | Plaintext and secrets                    |
| ├─ Port Mapping                 | 🟡 Medium | Expose services                          |
| └─ Volume Mounts                | 🟢 Low    | Persistent storage for custom apps       |
| **Visual Flow Designer**        | 🟡 Medium | Node-RED alternative (custom React Flow) |
| ├─ Flow Canvas                  | 🟡 Medium | Drag-drop node editor                    |
| ├─ Node Library                 | 🟡 Medium | Transform, filter, aggregate, MQTT       |
| ├─ Device Integration           | 🟡 Medium | Drag devices onto canvas                 |
| └─ Flow Deployment              | 🟡 Medium | Deploy to Gateway runtime                |
| **Multi-Tenancy**               | 🟡 Medium | Isolated customer environments           |
| ├─ Namespace Isolation          | 🟡 Medium | Separate K8s namespaces                  |
| ├─ Data Isolation               | 🟡 Medium | Tenant-aware queries                     |
| └─ Resource Quotas              | 🟡 Medium | Per-tenant limits                        |
| **Security Hardening**          | 🔴 High   | Production security                      |
| ├─ TLS Everywhere               | 🔴 High   | MQTT, HTTP, DB connections               |
| ├─ Secret Management            | 🔴 High   | HashiCorp Vault or K8s secrets           |
| ├─ Network Policies             | 🟡 Medium | Pod-to-pod restrictions                  |
| └─ Security Scanning            | 🟡 Medium | Container vulnerability scans            |
| **Backup/Restore**              | 🔴 High   | Data protection                          |
| ├─ TimescaleDB Backups          | 🔴 High   | Automated backups                        |
| ├─ Config Backups               | 🔴 High   | PostgreSQL backups                       |
| └─ Disaster Recovery            | 🟡 Medium | Multi-site replication                   |
| **Compliance**                  | 🟢 Low    | Industry standards                       |
| ├─ ISA-95 Data Model            | 🟢 Low    | Standard hierarchy                       |
| ├─ OPC UA Information Model     | 🟢 Low    | Standard node structure                  |
| └─ Audit Trails                 | 🟡 Medium | Complete change history                  |

### Container Management UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONTAINER/POD MANAGEMENT                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Running Containers                                 [+ Deploy New]   │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │                                                                     │    │
│  │  ┌──────────────────────────────────────────────────────────────┐   │    │
│  │  │ protocol-gateway                                             │   │    │
│  │  │ ─────────────────────────────────────────────────────────────│   │    │
│  │  │ Image: nexus/protocol-gateway:1.0.0      Uptime: 14d 3h 22m  │   │    │
│  │  │ CPU: ████████░░ 78%              Memory: ██████░░░░ 256MB    │   │    │
│  │  │ Pods: 3/3 ready                  Restarts: 0                 │   │    │
│  │  │                                                              │   │    │
│  │  │ [ 📋 Logs ]  [ 🔄 Restart ]  [ ⚙️ Config ]  [ 📈 Scale Up ]│   │    │
│  │  └──────────────────────────────────────────────────────────────┘   │    │
│  │                                                                     │    │
│  │  ┌──────────────────────────────────────────────────────────────┐   │    │
│  │  │  emqx (StatefulSet)                                          │   │    │
│  │  │ ─────────────────────────────────────────────────────────────│   │    │
│  │  │ Image: emqx/emqx:5.8.0                   Uptime: 14d 3h 22m  │   │    │
│  │  │ CPU: ██████░░░░ 55%              Memory: ████████░░ 512MB    │   │    │
│  │  │ Replicas: 3/3                    Active Connections: 12,543  │   │    │
│  │  │                                                              │   │    │
│  │  │ [ 📋 Logs ]  [ 🔄 Restart ]  [ ⚙️ Config ]  [ 📊 Metrics ] │   │    │
│  │  └──────────────────────────────────────────────────────────────┘   │    │
│  │                                                                     │    │
│  │  ┌──────────────────────────────────────────────────────────────┐   │    │
│  │  │ custom-python-ml (High Memory)                               │   │    │
│  │  │ ─────────────────────────────────────────────────────────────│   │    │
│  │  │ Image: ghcr.io/user/ml-model:v2.1        Uptime: 2d 5h 12m   │   │    │
│  │  │ CPU: ████░░░░░░ 35%              Memory: █████████░ 1.8GB    │   │    │
│  │  │ Pods: 1/1                        GPU: 1x RTX 3080            │   │    │
│  │  │                                                              │   │    │
│  │  │ [ 📋 Logs ]  [ 🔄 Restart ]  [ ⚙️ Config ]  [ 🗑️ Delete ]  │   │    │
│  │  └──────────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Real-time metrics via Kubernetes Metrics API or Docker stats API           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### App Catalog & Custom Deployment

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         APP CATALOG + CUSTOM DEPLOYMENT                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ App Catalog                                       [Add Custom ▼]    │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │                                                                     │    │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐     │    │
│  │  │            │  │            │  │            │  │            │     │    │
│  │  │  Grafana   │  │  Python    │  │  Jupyter   │  │  InfluxDB  │     │    │
│  │  │            │  │  ML        │  │  Notebook  │  │  Bridge    │     │    │
│  │  │            │  │            │  │            │  │            │     │    │
│  │  │ [Deploy]   │  │ [Deploy]   │  │ [Deploy]   │  │ [Deploy]   │     │    │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘     │    │
│  │                                                                     │    │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐     │    │
│  │  │            │  │            │  │            │  │            │     │    │
│  │  │  Node-RED  │  │  Alerting  │  │  MQTT      │  │  Custom    │     │    │
│  │  │  (Legacy)  │  │  Engine    │  │  Explorer  │  │  Image...  │     │    │
│  │  │            │  │            │  │            │  │            │     │    │
│  │  │ [Deploy]   │  │ [Deploy]   │  │ [Deploy]   │  │ [Deploy]   │     │    │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘     │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Clicking "Custom Image..." opens the deployment wizard:                    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Deploy Custom Container                                            │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │                                                                     │    │
│  │  Image*        [ ghcr.io/myorg/my-app:v1.0.0              ]         │    │
│  │  Name*         [ my-custom-app                            ]         │    │
│  │  Replicas      [ 1 ▼]                                               │    │
│  │                                                                     │    │
│  │  ┌─ Resource Limits ────────────────────────────────────────────┐   │    │
│  │  │  CPU Request: [ 100m  ]   CPU Limit: [ 500m  ]               │   │    │
│  │  │  Mem Request: [ 128Mi ]   Mem Limit: [ 512Mi ]               │   │    │
│  │  └──────────────────────────────────────────────────────────────┘   │    │
│  │                                                                     │    │
│  │  ┌─ Environment Variables ──────────────────────────────────────┐   │    │
│  │  │  MQTT_BROKER    = [ emqx.nexus.svc.cluster.local ]           │   │    │
│  │  │  MY_SECRET      = [ ●●●●●●●● ]  from Secret                  │   │    │
│  │  │  [+ Add Variable]                                            │   │    │
│  │  └──────────────────────────────────────────────────────────────┘   │    │
│  │                                                                     │    │
│  │  ┌─ Ports ──────────────────────────────────────────────────────┐   │    │
│  │  │  Container: [ 8080 ]  Service: [ 8080 ]  Type: [ ClusterIP ▼]│   │    │
│  │  │  [+ Add Port]                                                │   │    │
│  │  └──────────────────────────────────────────────────────────────┘   │    │
│  │                                                                     │    │
│  │  ☐ Enable Ingress (external access)                                │    │
│  │  ☑ Connect to MQTT broker                                          │    │
│  │  ☐ Mount persistent volume                                         │    │
│  │                                                                     │    │
│  │                              [ Cancel ]  [  Deploy ]                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Visual Flow Designer (Not Node-RED Iframe)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    VISUAL FLOW DESIGNER                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐  ┌────────────────────────────────────────────────────┐   │
│  │ Devices      │  │                  FLOW CANVAS                       │   │
│  │──────────────│  │                                                    │   │
│  │ - PLC-001    │  │   ┌─────────┐      ┌─────────┐      ┌─────────┐    │   │
│  │ - PLC-002    │  │   │ Device  │──────│Transform│──────│  MQTT   │    │   │
│  │ - OPC-001    │  │   │ PLC-001 │      │  ×1.5   │      │ Publish │    │   │
│  │              │  │   └─────────┘      └─────────┘      └─────────┘    │   │
│  │ Nodes        │  │                                                    │   │
│  │──────────────│  │   ┌─────────┐      ┌─────────┐                     │   │
│  │ - Transform  │  │   │  MQTT   │──────│ Filter  │──────► ...          │   │
│  │ - Filter     │  │   │Subscribe│      │ >100    │                     │   │
│  │ - Aggregate  │  │   └─────────┘      └─────────┘                     │   │
│  │ - MQTT Out   │  │                                                    │   │
│  │ - MQTT In    │  │                                                    │   │
│  └──────────────┘  └────────────────────────────────────────────────────┘   │
│                                                                             │
│  Built with React Flow - native look & feel, deep device integration        │
│  Flows compiled and deployed to Gateway Core runtime                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Final Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 5 - ENTERPRISE ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                          MANAGEMENT PLANE                           │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │    │
│  │  │ Web UI  │  │ Grafana │  │  Auth   │  │   API   │  │ Audit   │    │    │
│  │  │         │  │         │  │ (OIDC)  │  │ Gateway │  │  Logs   │    │    │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘    │    │
│  └───────┼────────────┼────────────┼────────────┼────────────┼─────────┘    │
│          │            │            │            │            │              │
│          └────────────┴────────────┼────────────┴────────────┘              │
│                                    │                                        │
│  ┌─────────────────────────────────┼───────────────────────────────────┐    │
│  │                                 ▼        CONTROL PLANE              │    │
│  │  ┌──────────────┐     ┌─────────────────┐     ┌──────────────┐      │    │
│  │  │   Gateway    │────>│   PostgreSQL    │     │   Secrets    │      │    │
│  │  │    Core      │     │    (Config)     │     │   (Vault)    │      │    │
│  │  └──────┬───────┘     └─────────────────┘     └──────────────┘      │    │
│  └─────────┼───────────────────────────────────────────────────────────┘    │
│            │                                                                │
│            │ MQTT                                                           │
│  ┌─────────┼───────────────────────────────────────────────────────────┐    │
│  │         ▼                    DATA PLANE                             │    │
│  │  ┌──────────────┐     ┌─────────────────┐     ┌──────────────┐      │    │
│  │  │   Protocol   │────>│      EMQX       │────>│    Data      │      │    │
│  │  │   Gateway    │<────│    Cluster      │     │  Ingestion   │      │    │
│  │  │   (×N pods)  │     │   (3+ nodes)    │     │  (×N pods)   │      │    │
│  │  └──────┬───────┘     └─────────────────┘     └──────┬───────┘      │    │
│  │         │                                            │              │    │
│  │         │                                     ┌──────▼───────┐      │    │
│  │         │                                     │  TimescaleDB │      │    │
│  │         │                                     │     (HA)     │      │    │
│  │         │                                     └──────────────┘      │    │
│  └─────────┼───────────────────────────────────────────────────────────┘    │
│            │                                                                │
│            ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                          DEVICE LAYER                               │    │
│  │    ┌─────┐  ┌─────┐  ┌─────┐  ┌───────┐  ┌─────┐  ┌─────┐  ┌─────┐  │    │
│  │    │ PLC │  │ OPC │  │ S7  │  │Sensor │  │ HMI │  │ VFD │  │ ... │  │    │
│  │    └─────┘  └─────┘  └─────┘  └───────┘  └─────┘  └─────┘  └─────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📅 Timeline Summary

```
2025
├── Nov     Phase 1 Start (Foundation)
└── Dec     Phase 1 Complete ✅, Phase 2 Start (Kubernetes)

2026
├── Jan     Phase 2 Complete ✅, Phase 3 Start (Gateway Core) 🔄 ← WE ARE HERE
│           ├── Gateway Core API scaffolded ✅
│           ├── Device/Tag CRUD APIs ✅
│           ├── Web UI (Devices + System pages) ✅
│           ├── Docker Compose integration ✅
│           └── Protocol Gateway Hardening ✅ (P0-P2 complete, P3 deferred)
├── Feb     Phase 3 Continues (WebSocket, Tag Browser, Auth)
├── Mar     Phase 3 Continues (RBAC, Normalizer)
├── Apr     Phase 3 Complete, Phase 4 Start (Analytics)
├── May     Phase 4 Continues (Edge Aggregation)
├── Jun     Phase 4 Continues (Deadband, Adaptive)
├── Jul     Phase 4 Complete, Phase 5 Start (Enterprise)
├── Aug     Phase 5 Continues (Security, Multi-tenant)
├── Sep     Phase 5 Continues (Container Management)
├── Oct     Phase 5 Continues (Flow Designer)
├── Nov     Phase 5 Continues (Compliance)
└── Dec     Phase 5 Complete - v1.0 Release 🎉
```

---

## 🧰 Technology Stack

| Layer                | Technology                 | Purpose                               |
| -------------------- | -------------------------- | ------------------------------------- |
| **Runtime**          | K3s / Kubernetes           | Container orchestration               |
| **Protocol Gateway** | Go 1.22+                   | High-performance device communication |
| **Data Ingestion**   | Go 1.22+                   | Efficient database writes             |
| **Gateway Core API** | TypeScript, Fastify        | Management REST API + WebSocket       |
| **Web UI Framework** | React 18, TypeScript, Vite | Single-page application               |
| **UI Styling**       | TailwindCSS, Radix UI      | Modern component library              |
| **Flow Editor**      | React Flow                 | Visual flow designer canvas           |
| **Charts**           | Recharts / Visx            | Data visualization                    |
| **State Management** | Zustand                    | Lightweight state                     |
| **Data Fetching**    | TanStack Query             | Caching, real-time updates            |
| **Message Broker**   | EMQX 5.8.x                 | MQTT with free clustering             |
| **Time-Series DB**   | TimescaleDB 2.x            | Historian storage                     |
| **Config DB**        | PostgreSQL 15+             | Device configuration                  |
| **Observability**    | Prometheus + Grafana       | Metrics and dashboards                |
| **CI/CD**            | GitHub Actions             | Automated builds/deploys              |

> **Note on EMQX**: Using version 5.8.x (Apache 2.0 license) for free clustering. Version 5.9+ requires commercial license for clustering.

---

## 📈 Success Metrics

| Metric                  | Phase 1-2 Target | Phase 5 Target |
| ----------------------- | ---------------- | -------------- |
| **Devices Supported**   | 500              | 10,000+        |
| **Tags per Device**     | 100              | 500+           |
| **Poll Rate**           | 100ms min        | 50ms min       |
| **Ingestion Rate**      | 50K pts/sec      | 500K pts/sec   |
| **Query Latency (p99)** | <500ms           | <100ms         |
| **Uptime**              | 99%              | 99.99%         |
| **Deployment Time**     | 30 min           | 5 min          |

---

## 🔗 Related Documents

- [PLATFORM_ARCHITECTURE.md](docs/PLATFORM_ARCHITECTURE.md) - Complete system architecture diagram
- [QUESTIONS.md](docs/QUESTIONS.md) - Architectural decisions and Q&A
- [infrastructure.md](infrastructure/infrastructure.md) - Infrastructure details
- [K8s README](infrastructure/k8s/README.md) - Kubernetes deployment guide
- [Protocol Gateway README](docs/services/protocol-gateway/readme.md) - Gateway documentation
- [Protocol Gateway TODO](services/protocol-gateway/TODO.md) - Future improvements
- [Testing Guide](testing/services/data-ingestion.md) - Testing procedures

---

_Last updated: January 26, 2026_
