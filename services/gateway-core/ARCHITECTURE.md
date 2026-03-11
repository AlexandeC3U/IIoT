# Gateway Core - Architecture

> Central API gateway and configuration owner for the NEXUS Edge platform.
> TypeScript / Fastify / PostgreSQL / MQTT

---

## Table of Contents

- [Role in the Platform](#role-in-the-platform)
- [Responsibilities](#responsibilities)
- [What This Service Does NOT Do](#what-this-service-does-not-do)
- [Data Flow Architecture](#data-flow-architecture)
- [Two-Phase Device Setup](#two-phase-device-setup)
- [API Surface](#api-surface)
- [Protocol-Gateway Integration](#protocol-gateway-integration)
- [Data Model](#data-model)
- [MQTT Contract](#mqtt-contract)
- [Future Services](#future-services)

---

## Role in the Platform

Gateway-core is the **control plane** of NEXUS Edge. It is the single entry point
for the web UI and external consumers. It owns all persistent configuration
(PostgreSQL) and coordinates runtime services via MQTT notifications and HTTP proxying.

```
                        Web UI (React)
                            |
                        REST / WebSocket
                            |
                    +-------v--------+
                    |  GATEWAY-CORE  |   <-- this service
                    |  (TypeScript)  |
                    +--+----+----+---+
                       |    |    |
            +----------+    |    +----------+
            |               |               |
       PostgreSQL      MQTT Broker     HTTP Proxy
       (config DB)      (EMQX)        (to protocol-gateway)
                            |
              +-------------+-------------+
              |                           |
    +---------v----------+    +-----------v---------+
    | PROTOCOL-GATEWAY   |    |   DATA-INGESTION    |
    | (Go - runtime)     |    |   (Go - storage)    |
    +--------------------+    +---------------------+
```

**Key principle:** Gateway-core is a thin API gateway + config owner, NOT a monolith.
It does not process industrial data, poll devices, or run heavy computations.

---

## Responsibilities

### Owns directly (PostgreSQL)

| Domain            | Description                                         |
|-------------------|-----------------------------------------------------|
| **Devices**       | CRUD, validation, persistence of device configs     |
| **Tags**          | CRUD, validation, persistence of tag configs        |
| **Users & Auth**  | JWT validation (via Authentik JWKS), RBAC enforcement |
| **RBAC**          | Role-based access control on every route            |
| **Audit log**     | Who changed what, when                              |
| **System config** | Platform-wide settings (key-value)                  |

### Proxies to protocol-gateway (HTTP)

| Route                                | Target                              | Purpose                          |
|--------------------------------------|-------------------------------------|----------------------------------|
| `POST /api/devices/:id/test`         | `POST /api/test-connection`         | Test device connectivity         |
| `POST /api/devices/:id/browse`       | `GET  /api/browse/:id`              | Protocol-agnostic tag/address discovery |
| `GET  /api/devices/:id/status`       | `GET  /status` (filtered)           | Runtime polling stats per device |
| `GET  /api/opcua/certificates/*`     | `GET  /api/opcua/certificates/*`    | List trusted/rejected certs      |
| `POST /api/opcua/certificates/trust` | `POST /api/opcua/certificates/trust`| Promote rejected cert to trusted |
| `GET  /api/topics`                   | `GET  /api/topics`                  | Active MQTT topics overview      |
| `GET  /api/system/logs`              | `GET  /api/logs`                    | Container log viewer             |
| `GET  /api/system/containers`        | `GET  /api/logs/containers`         | List running containers          |

> **Note:** The browse endpoint is protocol-agnostic. Gateway-core does not know
> how browsing works per protocol — it proxies to protocol-gateway, which returns
> a unified `BrowseResult` regardless of protocol (OPC UA node tree, Modbus register
> scan, MQTT topic discovery, BACnet object enumeration).

### Bridges

| Concern              | Mechanism                                          |
|----------------------|----------------------------------------------------|
| **Config sync**      | MQTT publish on device/tag create/update/delete     |
| **Real-time UI**     | WebSocket server bridging MQTT topics to browser    |
| **Status ingest**    | MQTT subscribe to device status updates from PG     |

---

## What This Service Does NOT Do

- **Poll industrial devices** - that is protocol-gateway's job
- **Store time-series data** - that is data-ingestion + TimescaleDB
- **Evaluate alert rules** - that will be a separate alert-service
- **Query historical data** - that will be a separate historian-query service
- **Run data processing flows** - that will be flow-engine

These concerns are (or will be) separate services with their own lifecycles,
scaling profiles, and failure domains.

---

## Two-Phase Device Setup

Devices and tags are created in **two separate phases**. This solves real-world
problems with OPC UA certificate negotiation, security configuration, and
connection validation that must happen before tag browsing is possible.

```
PHASE 1: Create Device + Establish Connection
==============================================

  User fills in device form:
  +---------------------------+
  | Name: Siemens-S7-1500     |
  | Protocol: OPC UA          |
  | Host: 192.168.1.10        |
  | Port: 4840                |
  | Security: SignAndEncrypt   |
  | Auth: Username/Password   |
  | UNS Prefix: acme/plant/.. |
  |                           |
  | [no tags yet]             |
  +---------------------------+
         |
         v
  1. gateway-core saves device to PostgreSQL (status: "unknown", no tags)
  2. gateway-core publishes MQTT notification to $nexus/config/devices/{id}
  3. protocol-gateway receives notification, registers device (no polling yet - no tags)
  4. protocol-gateway attempts connection, handles cert negotiation
         |
         v
  User clicks "Test Connection":
  POST /api/devices/:id/test --> proxied to protocol-gateway
         |
         +-- Success: device is reachable, connection params are correct
         |
         +-- Cert rejected: user sees rejected cert, can trust it via
         |   POST /api/opcua/certificates/trust, then re-test
         |
         +-- Auth failed: user corrects credentials, updates device, re-tests
         |
         +-- Timeout: user checks host/port/network
         |
         v
  Connection verified --> proceed to Phase 2


PHASE 2: Discover + Add Tags
=============================

  For OPC UA devices:
  +-----------------------------------------------+
  | User clicks "Browse Tags"                     |
  | GET /api/devices/:id/browse?node_id=...       |
  |   --> proxied to protocol-gateway             |
  |   --> uses EXISTING live connection from Ph.1  |
  |   --> returns address space tree               |
  |                                               |
  | User selects nodes from tree:                 |
  |   [x] ns=2;s=Temperature                     |
  |   [x] ns=2;s=Pressure                        |
  |   [ ] ns=2;s=Humidity                         |
  |                                               |
  | User clicks "Add Selected Tags"              |
  +-----------------------------------------------+
         |
         v
  For Modbus / S7 devices:
  +-----------------------------------------------+
  | User manually configures tags:                |
  |   Name: temperature                           |
  |   Address: holding:40001:float32  (Modbus)    |
  |        or: DB1.DBD0               (S7)        |
  |   Data type: float32                          |
  |   Scale: 0.1                                  |
  |   Unit: C                                     |
  +-----------------------------------------------+
         |
         v
  1. gateway-core saves tags to PostgreSQL
  2. gateway-core publishes MQTT tag notification
  3. protocol-gateway receives notification
  4. protocol-gateway adds tags to device, starts polling
```

### Why two phases?

| Problem with single-phase                          | Two-phase solution                              |
|----------------------------------------------------|-------------------------------------------------|
| OPC UA cert rejected during device creation        | Cert negotiation happens in Phase 1, resolved before browsing |
| Cannot browse tags without a live connection       | Connection is established and verified first     |
| Wrong security mode wastes time on tag config      | User gets immediate feedback before entering tags |
| Tags required for device validation in PG          | Device is valid without tags; tags added incrementally |
| Bulk tag entry is error-prone                      | OPC UA: browse and select. Modbus/S7: add one by one |

---

## API Surface

### Existing (device & tag CRUD)

```
GET    /health
GET    /health/live
GET    /health/ready

GET    /api/devices                 List devices (filter, paginate, search)
GET    /api/devices/:id             Get device (optional: ?include=tags)
POST   /api/devices                 Create device
PATCH  /api/devices/:id             Update device
DELETE /api/devices/:id             Delete device (cascades tags)
POST   /api/devices/:id/toggle      Toggle enabled state

GET    /api/tags                    List tags (filter by device, paginate)
GET    /api/tags/:id                Get tag
POST   /api/tags                    Create tag
POST   /api/tags/bulk               Bulk create tags
PATCH  /api/tags/:id                Update tag
DELETE /api/tags/:id                Delete tag
POST   /api/tags/:id/toggle         Toggle enabled state
```

### New - proxy to protocol-gateway

```
POST   /api/devices/:id/test                   Test device connection
GET    /api/devices/:id/browse                  Browse OPC UA address space
GET    /api/devices/:id/status                  Device runtime status + polling stats

GET    /api/opcua/certificates/trusted          List trusted OPC UA certs
GET    /api/opcua/certificates/rejected         List rejected OPC UA certs
POST   /api/opcua/certificates/trust            Promote rejected cert to trusted
DELETE /api/opcua/certificates/trusted/:fp      Remove trusted cert

GET    /api/topics                              Active MQTT topics overview
```

### New - owned by gateway-core

```
POST   /api/auth/login              Login (JWT)
POST   /api/auth/refresh            Refresh token
GET    /api/auth/me                 Current user info

GET    /api/users                   List users (admin)
POST   /api/users                   Create user (admin)
PATCH  /api/users/:id               Update user (admin)
DELETE /api/users/:id               Delete user (admin)

GET    /api/system/logs             Container logs (proxy to PG)
GET    /api/system/containers       Running containers (proxy to PG)
GET    /api/system/health           Aggregated health of all services

/ws                                 WebSocket endpoint (MQTT bridge to browser)
```

---

## Protocol-Gateway Integration

### Current state: two sources of truth (problem)

```
Gateway-Core                           Protocol-Gateway
+--------------------+                 +--------------------+
| PostgreSQL         |                 | devices.yaml       |
| - devices table    |   no link       | - device configs   |
| - tags table       | <--- ??? --->   | - tags embedded    |
+--------------------+                 +--------------------+
```

Both services independently manage device configurations.
Gateway-core stores in PostgreSQL, protocol-gateway loads from YAML.
Changes in one are invisible to the other.

### Target state: single source of truth

```
Gateway-Core                           Protocol-Gateway
+--------------------+                 +--------------------+
| PostgreSQL         |    MQTT         | In-memory          |
| - devices table    | ----notify----> | DeviceManager      |
| - tags table       |                 | (map[id]*Device)   |
+--------------------+                 +--------------------+
  (source of truth)                      (runtime cache)
```

**Gateway-core** is the single owner of device/tag configuration.
**Protocol-gateway** receives config changes via MQTT and maintains
an in-memory DeviceManager for runtime operations.

### What changes in protocol-gateway

**Almost nothing.** The DeviceManager (`internal/api/handlers.go`) already has:
- `AddDevice(device)` with callback to `pollingSvc.RegisterDevice()`
- `UpdateDevice(device)` with callback to `pollingSvc.ReplaceDevice()`
- `DeleteDevice(id)` with callback to `pollingSvc.UnregisterDevice()`
- Thread-safe `sync.RWMutex` protection
- Topic normalization via `normalizeDeviceTopics()`
- Device validation via `device.Validate()`

The only change is the **config source**:

| Current                                        | Target                                           |
|------------------------------------------------|--------------------------------------------------|
| `config.LoadDevices(yamlPath)` on startup      | Subscribe to `$nexus/config/#` on startup         |
| YAML file is source of truth                   | MQTT notifications from gateway-core              |
| `SaveDevices()` writes YAML after each change  | Optional: still save YAML as local cache/fallback |
| API handlers do full CRUD                      | API handlers become read-only (status/browse/test)|

### Device validation change

Protocol-gateway currently requires `len(d.Tags) > 0` in `device.Validate()`.
For the two-phase flow, this validation must be relaxed:
- Devices without tags are valid (Phase 1)
- Devices without tags are registered but not polled
- Polling starts only when tags are added (Phase 2)

### Resilience: startup without gateway-core

Protocol-gateway can still start independently:

1. On startup, load last-known config from YAML cache (if exists)
2. Subscribe to `$nexus/config/devices/#` and `$nexus/config/tags/#`
3. When gateway-core publishes a bulk sync or individual updates, apply them
4. Persist received configs to YAML as a cache for next cold start

Protocol-gateway is **never hard-dependent** on gateway-core being up.
If gateway-core is down, protocol-gateway continues polling with its last known config.

### Protocol-gateway keeps its full operational capability

These endpoints stay in protocol-gateway because they need direct access to
protocol connection pools, the MQTT publisher, and runtime state:

| Endpoint                          | Requires                                |
|-----------------------------------|-----------------------------------------|
| `POST /api/test-connection`       | Protocol pools, live connections         |
| `GET  /api/browse/{deviceID}`     | OPC UA connection pool                  |
| `GET  /api/opcua/certificates/*`  | OPC UA trust store (filesystem)         |
| `POST /api/opcua/certificates/*`  | OPC UA trust store (filesystem)         |
| `GET  /api/topics`                | MQTT publisher topic tracker            |
| `GET  /api/logs`, `/containers`   | Docker CLI access                       |
| `GET  /status`                    | Polling service stats                   |
| `GET  /health`, `/metrics`        | Health checker, Prometheus registry     |

The DeviceManager remains fully functional - it just receives its data from
MQTT instead of YAML. All callbacks, validation, normalization, and thread
safety are preserved exactly as they are.

---

## Data Model

### Current gateway-core schema vs protocol-gateway domain

The gateway-core PostgreSQL schema needs to be **aligned** with protocol-gateway's
richer domain model. Key gaps to address:

| Field                        | Protocol-Gateway (Go)     | Gateway-Core (DB)         | Action needed              |
|------------------------------|---------------------------|---------------------------|----------------------------|
| `uns_prefix`                 | `Device.UNSPrefix`        | Missing                   | Add column                 |
| `connection.timeout`         | `ConnectionConfig`        | In `protocolConfig` JSON  | OK (JSON is flexible)      |
| `connection.retry_count`     | `ConnectionConfig`        | Missing                   | Add to `protocolConfig`    |
| `connection.slave_id`        | `ConnectionConfig`        | In `protocolConfig` JSON  | OK                         |
| `connection.opc_*` fields    | `ConnectionConfig`        | In `protocolConfig` JSON  | OK                         |
| `connection.s7_*` fields     | `ConnectionConfig`        | In `protocolConfig` JSON  | OK                         |
| `tag.register_type`          | `Tag.RegisterType`        | In `address` string       | Consider structured field  |
| `tag.byte_order`             | `Tag.ByteOrder`           | Missing                   | Add column or metadata     |
| `tag.opc_node_id`            | `Tag.OPCNodeID`           | In `address` string       | OK (address is flexible)   |
| `tag.s7_address`             | `Tag.S7Address`           | In `address` string       | OK                         |
| `tag.access_mode`            | `Tag.AccessMode`          | Missing                   | Add column                 |
| `tag.priority`               | `Tag.Priority`            | Missing                   | Add column                 |
| `tag.topic_suffix`           | `Tag.TopicSuffix`         | `customTopic`             | Rename/align               |
| `tag.deadband_type`          | `Tag.DeadbandType`        | Split absolute/percent    | Consolidate                |
| `device.config_version`      | `Device.ConfigVersion`    | Missing                   | Add column                 |

### MQTT payload alignment

When gateway-core publishes config notifications, the payload must be
directly unmarshalable into protocol-gateway's `domain.Device` and `domain.Tag`
Go structs. Use protocol-gateway's field names (snake_case JSON tags) in the
notification payload, transforming from the DB schema as needed.

---

## MQTT Contract

### Gateway-core publishes (config changes)

```
Topic: $nexus/config/devices/{deviceId}
QoS:   1
Retain: false

Payload:
{
  "action": "create" | "update" | "delete",
  "timestamp": "2026-03-06T10:30:00Z",
  "data": {
    "id": "uuid",
    "name": "PLC-001",
    "protocol": "opcua",
    "enabled": true,
    "connection": { ... },
    "uns_prefix": "acme/plant/...",
    "poll_interval": "1s",
    "tags": []
  }
}
```

```
Topic: $nexus/config/tags/{deviceId}/{tagId}
QoS:   1

Payload:
{
  "action": "create" | "update" | "delete",
  "timestamp": "...",
  "data": {
    "id": "uuid",
    "name": "temperature",
    "opc_node_id": "ns=2;s=Temp",
    "data_type": "float32",
    "topic_suffix": "temperature",
    "enabled": true,
    ...
  }
}
```

```
Topic: $nexus/config/devices/bulk
QoS:   1

Payload:
{
  "action": "bulk",
  "timestamp": "...",
  "data": [ { device1_with_tags }, { device2_with_tags }, ... ]
}
```

### Gateway-core subscribes (status from protocol-gateway)

```
Topic: $nexus/status/devices/{deviceId}

Payload:
{
  "status": "online" | "offline" | "error" | "connecting",
  "last_seen": "2026-03-06T10:30:00Z",
  "last_error": "connection refused",
  "stats": {
    "total_polls": 1523,
    "success_polls": 1500,
    "failed_polls": 23
  }
}
```

Gateway-core updates device status in PostgreSQL from these messages,
making it available to the web UI without polling protocol-gateway.

---

## Protocol Modularity

Gateway-core is **protocol-agnostic**. It does not contain protocol-specific logic.
The `protocol` field on devices is just a label; protocol-specific behavior lives
entirely in protocol-gateway.

Adding a new protocol (e.g., BACnet, EtherNet/IP, MQTT) requires:

| Change                    | Where                        | Effort      |
|---------------------------|------------------------------|-------------|
| Add enum value            | DB migration + Drizzle schema| 1 line each |
| Add protocol config schema| Zod `protocolConfig` schemas | ~10-20 lines|
| Implement pool + handler  | protocol-gateway (Go)        | Protocol-specific |

No gateway-core code changes beyond schema. The `protocolConfig` JSONB column
stores any protocol-specific fields without structural migrations. The browse
endpoint proxies to protocol-gateway regardless of protocol.

Currently supported: `modbus`, `opcua`, `s7`
Planned: `mqtt` (topic ingestion), `bacnet`, `ethernetip`

---

## Future Services

Services that will be separate from gateway-core, with their build order:

| #  | Service              | Language | Why separate                                         | Gateway-core role          |
|----|----------------------|----------|------------------------------------------------------|----------------------------|
| 1  | **historian-query**  | Go       | Different DB (TimescaleDB), CPU-heavy aggregations   | Proxy `/api/historian/*`   |
| 2  | **alert-service**    | Go       | Long-running MQTT subscriber, different lifecycle    | Proxy `/api/alerts/*`, manage rules in PG |
| 3  | **flow-engine**      | TBD      | Custom runtime, separate concern                     | Proxy `/api/flows/*`, store definitions in PG |

Gateway-core manages **configuration** for these services (alert rules,
flow definitions, dashboard layouts) in PostgreSQL and notifies via MQTT.
The services handle **runtime execution**.

---

## Internal Architecture

```
src/
  config/
    env.ts                    Environment variables
  db/
    schema.ts                 Drizzle ORM schema (devices, tags, users, ...)
    index.ts                  Database connection
    migrate.ts                Migration runner
    migrations/               SQL migration files
  lib/
    errors.ts                 Error types (NotFound, Conflict, Validation)
    logger.ts                 Pino structured logger
  mqtt/
    client.ts                 MQTT publish (config notifications)
    subscriber.ts             MQTT subscribe (status updates from PG)  [new]
  proxy/
    protocol-gateway.ts       HTTP proxy to protocol-gateway           [new]
  routes/
    index.ts                  Route registration
    health/
      routes.ts               Health check endpoints
    devices/
      routes.ts               Device CRUD routes
      service.ts              Device business logic
      schema.ts               Zod validation schemas
    tags/
      routes.ts               Tag CRUD routes
      service.ts              Tag business logic
      schema.ts               Zod validation schemas
    auth/                     [new]
      routes.ts               Login, refresh, me
      service.ts              JWT, password hashing
    users/                    [new]
      routes.ts               User CRUD
      service.ts              User business logic
    system/                   [new]
      routes.ts               Logs, containers, aggregated health
  websocket/                  [new]
    bridge.ts                 MQTT-to-WebSocket bridge for browser
  index.ts                    App entry point, plugin registration, shutdown
```

---

## Configuration

```env
# Server
PORT=3001
HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info

# Database (PostgreSQL)
DATABASE_URL=postgresql://nexus:password@postgres:5432/nexus_config
DATABASE_POOL_SIZE=10

# MQTT (EMQX)
MQTT_BROKER_URL=tcp://emqx:1883
MQTT_CLIENT_ID=gateway-core
MQTT_USERNAME=gateway
MQTT_PASSWORD=secret

# Protocol-Gateway (HTTP proxy target)
PROTOCOL_GATEWAY_URL=http://protocol-gateway:8080

# Auth
JWT_SECRET=change-me-in-production
JWT_EXPIRES_IN=24h

# CORS
CORS_ORIGIN=http://localhost:5173,http://localhost:8080
```
