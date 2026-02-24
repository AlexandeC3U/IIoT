# NEXUS Edge Platform - Architecture Overview

> Last updated: January 2026

This document describes the validated production architecture of the NEXUS Edge Platform.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         NEXUS EDGE PLATFORM - PRODUCTION ARCHITECTURE               │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌─────────────┐                                                                    │
│  │  web-ui     │ React SPA                                                          │
│  │  (separate) │                                                                    │
│  └──────┬──────┘                                                                    │
│         │ HTTP                                                                      │
│         ▼                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  gateway-core (Node.js)                                                     │    │
│  │  ├── REST API: /api/devices, /api/tags                                      │    │
│  │  ├── PostgreSQL storage (source of truth for config)                        │    │
│  │  ├── Device/Tag CRUD operations                                             │    │
│  │  └── Future: Webhook to notify protocol-gateway of changes                  │    │
│  └──────────────────────────────────┬──────────────────────────────────────────┘    │
│                                     │                                               │
│                                     │ PostgreSQL                                    │
│                                     ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  PostgreSQL Container                                                       │    │
│  │  ├── devices, tags tables (configuration)                                   │    │
│  │  └── Managed by gateway-core                                                │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  protocol-gateway (Go) - StatefulSet replicas: 1                            │    │
│  │  ├── Startup: Load from YAML (current), future: GET from gateway-core       │    │
│  │  ├── REST API: /api/browse, /api/opcua/certificates (protocol-specific)     │    │
│  │  ├── Industrial protocols: OPC UA, Modbus TCP/RTU, Siemens S7               │    │
│  │  ├── Connection pools with per-device circuit breakers                      │    │
│  │  ├── Polling engine with worker pools                                       │    │
│  │  ├── OPC UA subscriptions (push mode for high-frequency tags)               │    │
│  │  ├── Bidirectional: MQTT commands → device writes                           │    │
│  │  ├── Prometheus metrics: /metrics                                           │    │
│  │  └── PKI trust store: /app/certs/pki (PersistentVolume in K8S)              │    │
│  └──────────────────────────────────┬──────────────────────────────────────────┘    │
│                                     │                                               │
│         ┌───────────────────────────┼───────────────────────────────┐               │
│         │                           │ MQTT Publish                  │               │
│         │                           ▼                               │               │
│  ┌──────┴──────┐         ┌─────────────────────────┐        ┌──────┴──────┐         │
│  │ Industrial  │         │  EMQX MQTT Broker       │        │   External  │         │
│  │ Devices     │◄───────►│  ├── UNS topics         │───────►│   Systems   │         │
│  │             │ Polls   │  ├── Command topics     │        │   (SCADA,   │         │
│  │ • OPC UA    │         │  └── QoS 1 guaranteed   │        │   MES, ERP) │         │
│  │ • Modbus    │         └────────────┬────────────┘        └─────────────┘         │
│  │ • S7 PLC    │                      │                                             │
│  └─────────────┘                      │ Subscribe: uns/#                            │
│                                       ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  data-ingestion (Go) - Deployment replicas: N (stateless, horizontally      │    │
│  │                                               scalable)                     │    │
│  │  ├── Subscribes to MQTT wildcard topics                                     │    │
│  │  ├── Batches data points (configurable batch size + flush interval)         │    │
│  │  ├── Writes to TimescaleDB via COPY protocol (high throughput)              │    │
│  │  ├── NO device config needed - purely data pipeline                         │    │
│  │  └── Prometheus metrics: /metrics                                           │    │
│  └──────────────────────────────────┬──────────────────────────────────────────┘    │
│                                     │                                               │
│                                     │ COPY protocol (bulk insert)                   │
│                                     ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  TimescaleDB Container                                                      │    │
│  │  ├── Hypertable: datapoints (time-series optimized)                         │    │
│  │  ├── Automatic compression policies                                         │    │
│  │  └── Configurable retention policies                                        │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  Monitoring Stack                                                           │    │
│  │  ├── Prometheus: Scrapes /metrics from all services (15s interval)          │    │
│  │  └── Grafana: Pre-built dashboards for gateway, polling, MQTT, devices      │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Service Responsibilities

| Service | Language | Scaling | Stateful? | Primary Responsibility |
|---------|----------|---------|-----------|------------------------|
| **web-ui** | React/TS | Deployment (N) | No | User interface |
| **gateway-core** | Node.js/TS | Deployment (N) | No | Config API, PostgreSQL CRUD |
| **protocol-gateway** | Go | StatefulSet (1) | Yes | Industrial protocol polling |
| **data-ingestion** | Go | Deployment (N) | No | MQTT → TimescaleDB pipeline |
| **EMQX** | Erlang | StatefulSet (3) | Yes | MQTT broker cluster |
| **PostgreSQL** | - | StatefulSet (1) | Yes | Configuration storage |
| **TimescaleDB** | - | StatefulSet (1) | Yes | Time-series storage |

---

## Data Flows

### 1. Read Path (Device → Storage)

```
┌──────────────┐    poll     ┌──────────────────┐   publish   ┌────────┐
│  Industrial  │◄───────────►│ protocol-gateway │────────────►│  EMQX  │
│    Device    │  OPC UA/    │                  │  uns/...    │        │
│              │  Modbus/S7  │                  │             │        │
└──────────────┘             └──────────────────┘             └───┬────┘
                                                                  │
                                                                  │ subscribe
                                                                  ▼
                             ┌──────────────────┐             ┌────────┐
                             │    TimescaleDB   │◄────────────│  data- │
                             │                  │   COPY      │  ingest│
                             │  (time-series)   │             │        │
                             └──────────────────┘             └────────┘
```

### 2. Write Path (Command → Device)

```
┌──────────────┐   publish    ┌────────┐   subscribe   ┌──────────────────┐
│   External   │─────────────►│  EMQX  │──────────────►│ protocol-gateway │
│    System    │ $nexus/cmd/  │        │               │  CommandHandler  │
└──────────────┘  {dev}/set   └────────┘               └────────┬─────────┘
                                                                │
                                                                │ write
                                                                ▼
                                                       ┌──────────────┐
                                                       │  Industrial  │
                                                       │    Device    │
                                                       └──────────────┘
```

### 3. Configuration Path (Current - YAML)

```
┌──────────────────┐   edit    ┌──────────────────┐   restart   ┌──────────────────┐
│  devices.yaml    │◄──────────│     Operator     │────────────►│ protocol-gateway │
│  (ConfigMap)     │           │                  │             │  DeviceManager   │
└──────────────────┘           └──────────────────┘             └──────────────────┘
```

### 4. Configuration Path (Future - PostgreSQL)

```
┌──────────────┐   HTTP    ┌──────────────┐   SQL    ┌────────────┐
│    web-ui    │──────────►│ gateway-core │────────►│ PostgreSQL │
└──────────────┘           └──────┬───────┘         └────────────┘
                                  │
                                  │ webhook / MQTT event
                                  ▼
                           ┌──────────────────┐
                           │ protocol-gateway │  (hot reload)
                           └──────────────────┘
```

---

## Why protocol-gateway is StatefulSet (Not Deployment)

| Aspect | Explanation |
|--------|-------------|
| **Long-lived TCP connections** | OPC UA sessions, Modbus/S7 sockets are persistent. Pod restart = reconnect all |
| **In-memory state** | Connection pools, circuit breaker states, browse cache, subscriptions |
| **On-disk state** | PKI trust store (`/app/certs/pki`) - trusted/rejected certificates |
| **Device affinity** | Devices bound to sessions within the process |
| **Cannot horizontally scale** | 2 replicas = 2x connections to each PLC (hits session limits, duplicate data) |

**What rebuilds naturally (not a problem):**
- Browse cache (60s TTL)
- Circuit breakers (reset to closed)
- Connection pools (auto-reconnect with backoff)

**Industry standard:** Kepware, Ignition, and other protocol gateways run as singletons.

---

## Kubernetes Deployment Patterns

### protocol-gateway (StatefulSet)

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: protocol-gateway
spec:
  replicas: 1                    # Single instance
  serviceName: protocol-gateway
  template:
    spec:
      terminationGracePeriodSeconds: 35
      containers:
        - name: gateway
          volumeMounts:
            - name: pki-store
              mountPath: /app/certs/pki
  volumeClaimTemplates:
    - metadata:
        name: pki-store
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 100Mi
```

### data-ingestion (Deployment - Scalable)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: data-ingestion
spec:
  replicas: 2                    # Can scale horizontally
  strategy:
    type: RollingUpdate
```

---

## Port Mapping

| Service | Port | Purpose |
|---------|------|---------|
| protocol-gateway | 8080 | REST API, health, metrics |
| data-ingestion | 8080 | Health, metrics |
| gateway-core | 3000 | REST API |
| web-ui | 80 | Static files (nginx) |
| EMQX | 1883 | MQTT TCP |
| EMQX | 8083 | MQTT WebSocket |
| EMQX | 18083 | Dashboard |
| PostgreSQL | 5432 | SQL |
| TimescaleDB | 5432 | SQL |
| Prometheus | 9090 | UI, API |
| Grafana | 3000 | Dashboards |

---

## Future Enhancements (Roadmap)

See `services/protocol-gateway/TODO.md` for detailed implementation plans:

1. **PostgreSQL Integration** (§22) - Move device config from YAML to gateway-core API
2. **Native MQTT Device Support** (§14) - MQTT → MQTT bridging
3. **OPC UA Events & Alarms** (§17) - Full A&C support
4. **Cross-Protocol Tag Discovery** (§20) - Auto-browse all protocols
5. **Priority-Based Worker Pools** (§6) - Safety > Control > Telemetry queues
