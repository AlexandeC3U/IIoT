# NEXUS Edge Platform - Development Roadmap

> **From Zero to Production-Ready IIoT Platform**

This document outlines the complete development journey of NEXUS Edge, from initial concept to a fully-featured enterprise IIoT platform.

---

## 📊 Overall Progress

```
Phase 1: Foundation          ████████████████████ 100% ✅
Phase 2: Kubernetes          ████████████████░░░░  85% ✅
Phase 3: Gateway Core        ░░░░░░░░░░░░░░░░░░░░   0% ⏳
Phase 4: Analytics           ░░░░░░░░░░░░░░░░░░░░   0% 📋
Phase 5: Enterprise          ░░░░░░░░░░░░░░░░░░░░   0% 📋
─────────────────────────────────────────────────────────
Total Progress               ████████░░░░░░░░░░░░  37%
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

| Component | Status | Description |
|-----------|--------|-------------|
| **Protocol Gateway** | ✅ Complete | Go service for device communication |
| ├─ Modbus TCP/RTU | ✅ Complete | Holding/Input registers, coils, batch reads |
| ├─ OPC UA | ✅ Complete | Polling + subscriptions, security policies |
| ├─ Siemens S7 | ✅ Complete | S7-300/400/1200/1500 support |
| ├─ Connection Pooling | ✅ Complete | Reusable connections per device |
| ├─ Circuit Breakers | ✅ Complete | Fail-fast on device issues |
| └─ Worker Pool | ✅ Complete | Bounded concurrency with back-pressure |
| **MQTT Integration** | ✅ Complete | EMQX broker with UNS topics |
| ├─ Publish Telemetry | ✅ Complete | QoS 1, auto-reconnect, buffering |
| ├─ Write Commands | ✅ Complete | Bidirectional via $nexus/cmd/# |
| └─ Shared Subscriptions | ✅ Complete | Load balancing across consumers |
| **Data Ingestion Service** | ✅ Complete | Go service for historian writes |
| ├─ TimescaleDB Integration | ✅ Complete | Hypertables, compression, aggregates |
| ├─ Batch Processing | ✅ Complete | 5K point batches, COPY protocol |
| ├─ Object Pooling | ✅ Complete | sync.Pool for GC reduction |
| └─ Retry Logic | ✅ Complete | Exponential backoff |
| **Development Environment** | ✅ Complete | Docker Compose for local dev |
| **Testing Documentation** | ✅ Complete | Step-by-step testing guides |

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

| Component | Status | Description |
|-----------|--------|-------------|
| **Kubernetes Manifests** | ✅ Complete | Kustomize-based organization |
| ├─ Base Resources | ✅ Complete | Namespace, ConfigMaps, Secrets |
| ├─ Protocol Gateway | ✅ Complete | Deployment, HPA, PDB, ServiceAccount |
| ├─ Data Ingestion | ✅ Complete | Deployment, HPA, PDB, ServiceAccount |
| ├─ EMQX Cluster | ✅ Complete | StatefulSet (3 nodes), DNS discovery |
| └─ TimescaleDB | ✅ Complete | StatefulSet with PVC |
| **Horizontal Pod Autoscaling** | ✅ Complete | CPU/Memory based scaling |
| **Pod Disruption Budgets** | ✅ Complete | Safe rolling updates |
| **Service Accounts + RBAC** | ✅ Complete | Minimal permissions |
| **Environment Overlays** | ✅ Complete | Dev/Prod configurations |
| **OPC UA Subscriptions** | 📝 Documented | Config flag added, full integration Phase 3 |
| **TimescaleDB HA** | ⏸️ Not Needed | Single instance sufficient for edge (see below) |
| **Helm Charts** | ⏸️ Deferred | Kustomize sufficient for now |

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
│                    HORIZONTAL SCALING BEHAVIOR                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Protocol Gateway:                                                          │
│  ├── Min replicas: 2 (dev: 1)                                               │
│  ├── Max replicas: 10                                                       │
│  ├── Scale up: CPU > 70% or Memory > 80%                                    │
│  └── Each pod handles ~500 devices at 1s poll interval                      │
│                                                                             │
│  Data Ingestion:                                                            │
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

| Improvement | Impact |
|-------------|--------|
| Back-pressure on poll | No backlog accumulation when workers busy |
| Poll interval jitter | Prevents synchronized bursts (0-10% random delay) |
| sync.Pool for slices | Reduced GC pressure during high-rate polling |
| Bounded command queue | Memory-safe under command bursts |
| Enhanced metrics | skipped_polls, worker_pool_utilization, per-device latency |

---

## Phase 3: Gateway Core & Management ⏳

**Timeline**: Q1-Q2 2026  
**Status**: NOT STARTED

### Goals
- Centralized device configuration management
- **Unified Web UI** (single app for all management)
- Dynamic device registration (hot-reload)
- Role-based access control

### Deliverables

| Component | Priority | Description |
|-----------|----------|-------------|
| **Gateway Core Service** | 🔴 High | Central management API (TypeScript/Fastify) |
| ├─ Device CRUD API | 🔴 High | REST API for device management |
| ├─ Tag CRUD API | 🔴 High | REST API for tag configuration |
| ├─ Configuration Store | 🔴 High | PostgreSQL for persistent config |
| ├─ MQTT Notifications | 🔴 High | Publish config changes to gateways |
| └─ WebSocket Gateway | 🟡 Medium | Real-time updates to UI |
| **Unified Web UI (React)** | 🔴 High | Single app for ALL management |
| ├─ Device List/Grid | 🔴 High | View all connected devices |
| ├─ Device Editor | 🔴 High | Add/edit device configurations |
| ├─ Tag Browser | 🔴 High | Browse and configure tags |
| ├─ Connection Status | 🔴 High | Real-time device health (WebSocket) |
| ├─ System Overview | 🟡 Medium | Polling stats, message throughput |
| └─ Navigation Shell | 🔴 High | Shared layout for all future features |
| **Data Normalizer** | 🟡 Medium | Transformation pipeline |
| ├─ Unit Conversion | 🟡 Medium | °F → °C, bar → psi, etc. |
| ├─ Value Clamping | 🟡 Medium | Min/max limits |
| ├─ Scaling/Offset | 🟡 Medium | Linear transformations |
| └─ Expression Evaluation | 🟢 Low | Calculated/derived tags |
| **Authentication** | 🟡 Medium | JWT tokens, API keys |
| **RBAC** | 🟡 Medium | Role-based permissions |
| **Audit Logging** | 🟡 Medium | Track configuration changes |

### Unified UI Vision

The Web UI is designed as a **single React application** that grows with each phase:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    UNIFIED WEB UI - PROGRESSIVE FEATURES                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PHASE 3 (This phase):                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Navigation: [Devices] [System]                                     │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │  Device Management                                                  │    │
│  │  ├── Device list with search/filter                                 │    │
│  │  ├── Add/Edit device wizard                                         │    │
│  │  ├── Tag configuration (addresses, scaling)                         │    │
│  │  ├── Real-time connection status (🟢 online / 🔴 offline)          │    │
│  │  └── Device health metrics (poll success rate, latency)             │    │
│  │                                                                     │    │
│  │  System Overview                                                    │    │
│  │  ├── Gateway instances status                                       │    │
│  │  ├── MQTT broker health                                             │    │
│  │  └── Basic metrics (msgs/sec, active devices)                       │    │
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

| Benefit | Description |
|---------|-------------|
| **Consistent UX** | Same design language, navigation, and interactions everywhere |
| **Shared state** | User session, auth tokens, and preferences shared across features |
| **Faster development** | Reuse components (tables, forms, charts) across features |
| **Better integration** | Devices, dashboards, and flows can reference each other |
| **Simpler deployment** | One container for the entire frontend |

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

| Component | Priority | Description |
|-----------|----------|-------------|
| **Edge Aggregation** | 🟡 Medium | Pre-aggregate before historian |
| ├─ Window Functions | 🟡 Medium | min/max/avg/count per interval |
| ├─ Downsampling | 🟡 Medium | Reduce raw data to summaries |
| └─ Configurable Windows | 🟡 Medium | 1s, 10s, 1min, 5min, etc. |
| **Deadband Filtering** | 🟡 Medium | Only publish on significant change |
| ├─ Absolute Deadband | 🟡 Medium | Value must change by > X |
| ├─ Percent Deadband | 🟡 Medium | Value must change by > X% |
| └─ Per-Tag Configuration | 🟡 Medium | Different thresholds per tag |
| **Adaptive Polling** | 🟢 Low | Adjust intervals based on change rate |
| ├─ Fast on Change | 🟢 Low | Speed up when values changing |
| ├─ Slow on Stable | 🟢 Low | Slow down when stable |
| └─ Min/Max Bounds | 🟢 Low | Configurable limits |
| **SparkplugB Support** | 🟢 Low | Alternative payload format |
| **Anomaly Detection** | 🟢 Low | Real-time quality monitoring |
| ├─ Out-of-Range Alerts | 🟢 Low | Value exceeds limits |
| ├─ Stuck Value Detection | 🟢 Low | No change for too long |
| └─ Rate-of-Change Alerts | 🟢 Low | Changing too fast |
| **OEE Calculations** | 🟡 Medium | Overall Equipment Effectiveness |
| ├─ Availability | 🟡 Medium | Uptime tracking |
| ├─ Performance | 🟡 Medium | Speed vs. ideal |
| └─ Quality | 🟡 Medium | Good vs. bad units |

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

| Component | Priority | Description |
|-----------|----------|-------------|
| **Container/Pod Management** | 🔴 High | Full K8s/Docker management in UI |
| ├─ Container List | 🔴 High | All pods/containers with status |
| ├─ Resource Metrics | 🔴 High | CPU, Memory, Network per container |
| ├─ Log Streaming | 🔴 High | Real-time log viewer |
| ├─ Actions | 🔴 High | Start, Stop, Restart, Scale |
| ├─ Deploy Wizard | 🟡 Medium | Deploy new containers from UI |
| └─ **App Catalog** | 🟡 Medium | Pre-configured apps (Grafana, ML, etc.) |
| **Custom Container Deployment** | 🟡 Medium | Deploy any Docker image |
| ├─ Image Registry Support | 🟡 Medium | Docker Hub, GHCR, private registries |
| ├─ Resource Configuration | 🟡 Medium | CPU/Memory limits, replicas |
| ├─ Environment Variables | 🟡 Medium | Plaintext and secrets |
| ├─ Port Mapping | 🟡 Medium | Expose services |
| └─ Volume Mounts | 🟢 Low | Persistent storage for custom apps |
| **Visual Flow Designer** | 🟡 Medium | Node-RED alternative (custom React Flow) |
| ├─ Flow Canvas | 🟡 Medium | Drag-drop node editor |
| ├─ Node Library | 🟡 Medium | Transform, filter, aggregate, MQTT |
| ├─ Device Integration | 🟡 Medium | Drag devices onto canvas |
| └─ Flow Deployment | 🟡 Medium | Deploy to Gateway runtime |
| **Multi-Tenancy** | 🟡 Medium | Isolated customer environments |
| ├─ Namespace Isolation | 🟡 Medium | Separate K8s namespaces |
| ├─ Data Isolation | 🟡 Medium | Tenant-aware queries |
| └─ Resource Quotas | 🟡 Medium | Per-tenant limits |
| **Security Hardening** | 🔴 High | Production security |
| ├─ TLS Everywhere | 🔴 High | MQTT, HTTP, DB connections |
| ├─ Secret Management | 🔴 High | HashiCorp Vault or K8s secrets |
| ├─ Network Policies | 🟡 Medium | Pod-to-pod restrictions |
| └─ Security Scanning | 🟡 Medium | Container vulnerability scans |
| **Backup/Restore** | 🔴 High | Data protection |
| ├─ TimescaleDB Backups | 🔴 High | Automated backups |
| ├─ Config Backups | 🔴 High | PostgreSQL backups |
| └─ Disaster Recovery | 🟡 Medium | Multi-site replication |
| **Compliance** | 🟢 Low | Industry standards |
| ├─ ISA-95 Data Model | 🟢 Low | Standard hierarchy |
| ├─ OPC UA Information Model | 🟢 Low | Standard node structure |
| └─ Audit Trails | 🟡 Medium | Complete change history |

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
├── Jan     Phase 2 Continues
├── Feb     Phase 2 Complete, Phase 3 Start (Gateway Core)
├── Mar     Phase 3 Continues (API + UI)
├── Apr     Phase 3 Continues (Normalizer + RBAC)
├── May     Phase 3 Complete, Phase 4 Start (Analytics)
├── Jun     Phase 4 Continues (Edge Aggregation)
├── Jul     Phase 4 Continues (Deadband, Adaptive)
├── Aug     Phase 4 Complete, Phase 5 Start (Enterprise)
├── Sep     Phase 5 Continues (Security, Multi-tenant)
├── Oct     Phase 5 Continues (Dashboards, Backup)
├── Nov     Phase 5 Continues (Compliance)
└── Dec     Phase 5 Complete - v1.0 Release 🎉
```

---

## 🧰 Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Runtime** | K3s / Kubernetes | Container orchestration |
| **Protocol Gateway** | Go 1.22+ | High-performance device communication |
| **Data Ingestion** | Go 1.22+ | Efficient database writes |
| **Gateway Core API** | TypeScript, Fastify | Management REST API + WebSocket |
| **Web UI Framework** | React 18, TypeScript, Vite | Single-page application |
| **UI Styling** | TailwindCSS, Radix UI | Modern component library |
| **Flow Editor** | React Flow | Visual flow designer canvas |
| **Charts** | Recharts / Visx | Data visualization |
| **State Management** | Zustand | Lightweight state |
| **Data Fetching** | TanStack Query | Caching, real-time updates |
| **Message Broker** | EMQX 5.8.x | MQTT with free clustering |
| **Time-Series DB** | TimescaleDB 2.x | Historian storage |
| **Config DB** | PostgreSQL 15+ | Device configuration |
| **Observability** | Prometheus + Grafana | Metrics and dashboards |
| **CI/CD** | GitHub Actions | Automated builds/deploys |

> **Note on EMQX**: Using version 5.8.x (Apache 2.0 license) for free clustering. Version 5.9+ requires commercial license for clustering.

---

## 📈 Success Metrics

| Metric | Phase 1-2 Target | Phase 5 Target |
|--------|------------------|----------------|
| **Devices Supported** | 500 | 10,000+ |
| **Tags per Device** | 100 | 500+ |
| **Poll Rate** | 100ms min | 50ms min |
| **Ingestion Rate** | 50K pts/sec | 500K pts/sec |
| **Query Latency (p99)** | <500ms | <100ms |
| **Uptime** | 99% | 99.99% |
| **Deployment Time** | 30 min | 5 min |

---

## 🔗 Related Documents

- [QUESTIONS.md](docs/QUESTIONS.md) - Architectural decisions and Q&A
- [infrastructure.md](infrastructure/infrastructure.md) - Infrastructure details
- [K8s README](infrastructure/k8s/README.md) - Kubernetes deployment guide
- [Protocol Gateway README](docs/services/protocol-gateway/readme.md) - Gateway documentation
- [Testing Guide](testing/services/data-ingestion.md) - Testing procedures

---

*Last updated: December 2025*

