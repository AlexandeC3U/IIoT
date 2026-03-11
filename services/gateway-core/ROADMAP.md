# Gateway Core V2 - Roadmap

> Complete implementation guide for upgrading gateway-core from V1 (basic CRUD)
> to V2 (production-ready API gateway and configuration owner).
>
> **See also:** [ARCHITECTURE.md](./ARCHITECTURE.md) for the full architectural context.

---

## Table of Contents

- [Service Identity](#service-identity)
- [Current State (V1)](#current-state-v1)
- [Target State (V2)](#target-state-v2)
- [Implementation Phases](#implementation-phases)
  - [Phase 1: Schema Alignment](#phase-1-schema-alignment)
  - [Phase 2: Protocol-Gateway Proxy](#phase-2-protocol-gateway-proxy)
  - [Phase 3: MQTT Subscriber (Status Ingest)](#phase-3-mqtt-subscriber-status-ingest)
  - [Phase 4: Two-Phase Device Flow](#phase-4-two-phase-device-flow)
  - [Phase 5: Authentication & Authorization](#phase-5-authentication--authorization)
  - [Phase 6: WebSocket Bridge](#phase-6-websocket-bridge)
  - [Phase 7: System Management](#phase-7-system-management)
  - [Phase 8: Production Hardening](#phase-8-production-hardening)
- [Deployment & Resilience](#deployment--resilience)
- [Build & Run (Unified)](#build--run-unified)
- [Dependency Changes](#dependency-changes)
- [Testing Strategy](#testing-strategy)
- [Migration Notes](#migration-notes)

---

## Service Identity

### What it is

- Central REST API for the web UI and external consumers
- Single source of truth for device and tag configuration (PostgreSQL)
- API gateway that proxies runtime requests to protocol-gateway
- MQTT bridge: publishes config changes, subscribes to status updates
- WebSocket server for real-time browser updates
- JWT validation and RBAC enforcement (identity provided by Authentik)

### What it is NOT

- Not a data-plane service (does not poll devices or process industrial data)
- Not a historian (does not store or query time-series data)
- Not an alert engine (does not evaluate rules against live data)
- Not a monolith (proxies to specialized services, does not absorb them)

### Tech stack

- **Runtime:** Node.js 20+ / TypeScript
- **Framework:** Fastify 4.x
- **Database:** PostgreSQL 15 via Drizzle ORM
- **Messaging:** MQTT via mqtt.js (EMQX broker)
- **Validation:** Zod
- **Logging:** Pino
- **Build:** tsup (ESM)
- **Test:** Vitest

---

## Current State (V1)

### What exists

```
src/
  config/env.ts                 Zod-validated env vars (PORT, DB, MQTT, JWT, CORS)
  db/
    schema.ts                   Drizzle schema: devices + tags tables
    index.ts                    pg Pool + Drizzle instance
    migrate.ts                  Migration runner with inline fallback
  lib/
    errors.ts                   AppError, NotFound, Validation, Conflict, Unauthorized, Forbidden
    logger.ts                   Pino logger
  mqtt/
    client.ts                   MQTT publish-only: notifyDeviceChange, notifyTagChange, notifyDevicesBulk
  routes/
    index.ts                    Re-exports device, tag, health routes
    health/routes.ts            GET /health, /health/ready, /health/live
    devices/
      schema.ts                 Zod schemas: createDevice, updateDevice, deviceQuery
      service.ts                DeviceService: list, getById, create, update, delete, toggleEnabled, updateStatus
      routes.ts                 GET/POST/PUT/DELETE /api/devices, POST /:id/toggle
    tags/
      schema.ts                 Zod schemas: createTag, updateTag, tagQuery, bulkCreateTags
      service.ts                TagService: list, getById, getByDeviceId, create, bulkCreate, update, delete, toggleEnabled
      routes.ts                 GET/POST/PUT/DELETE /api/tags, POST /bulk, POST /:id/toggle
  index.ts                      Fastify app: plugins (cors, helmet, websocket, swagger), routes, shutdown
```

---

## Target State (V2)

### File structure

```
src/
  config/
    env.ts                      Extended: + PROTOCOL_GATEWAY_URL, RATE_LIMIT_*
  db/
    schema.ts                   Extended: aligned with PG domain model + users table
    index.ts                    Unchanged
    migrate.ts                  Unchanged (migrations handle schema changes)
    migrations/                 Drizzle migration files
  lib/
    errors.ts                   Unchanged (already has Unauthorized, Forbidden)
    logger.ts                   Unchanged
  middleware/
    auth.ts                     JWT verification + user injection into request
    rate-limit.ts               Per-IP and per-user rate limiting
    audit.ts                    Audit log middleware (POST/PUT/DELETE actions)
  mqtt/
    client.ts                   Refactored: payload format aligned to PG domain structs
    transform.ts                DB row to protocol-gateway format mapping
    subscriber.ts               Subscribe to $nexus/status/devices/# for status updates
  proxy/
    protocol-gateway.ts         HTTP proxy client to protocol-gateway
  routes/
    index.ts                    Extended: + auth, users, system, opcua route registrations
    health/routes.ts            Extended: + protocol-gateway health aggregation
    devices/
      schema.ts                 Extended: + unsPrefix, accessMode, configVersion fields
      service.ts                Extended: + proxy methods (test, browse, status)
      routes.ts                 Extended: + POST /:id/test, GET /:id/browse, GET /:id/status
    tags/
      schema.ts                 Extended: + topicSuffix, accessMode, priority, deadbandType
      service.ts                Updated: include new fields in create/update
      routes.ts                 Unchanged
    opcua/
      routes.ts                 Proxy routes to PG certificate endpoints
    system/
      routes.ts                 Logs, containers, aggregated health
  websocket/
    bridge.ts                   MQTT-to-WebSocket bridge for browser
  index.ts                      Extended: + middleware registration, WS setup
```

---

## Implementation Phases

Each phase is self-contained and results in a deployable, testable increment.
Phases should be implemented in order - each builds on the previous.

### Status Overview

| Phase | Name                           | Status      |
| ----- | ------------------------------ | ----------- |
| 1     | Schema Alignment               | DONE        |
| 2     | Protocol-Gateway Proxy         | DONE        |
| 3     | MQTT Subscriber (Status)       | DONE        |
| 4     | Two-Phase Device Flow          | DONE        |
| 5     | Authentication & Authorization | DONE        |
| 6     | WebSocket Bridge               | DONE        |
| 7     | System Management (Level 1)    | DONE        |
| 8     | Production Hardening           | DONE        |

---

### Phase 1: Schema Alignment

**Status: DONE**

**Goal:** Align the PostgreSQL schema and Zod validation with protocol-gateway's
domain model so config notifications can be deserialized by protocol-gateway directly.

**Priority:** CRITICAL - blocks all other phases

#### 1.1 Extend devices table

Update `protocolConfig` JSON documentation to explicitly support:

- Modbus: `{ slaveId, timeout, retryCount, retryDelay }`
- OPC UA: `{ securityPolicy, securityMode, authMode, username, password, endpointUrl, useSubscriptions }`
- S7: `{ rack, slot, pduSize, timeout }`

No additional columns needed for connection config - the existing `host`, `port`,
and `protocolConfig` JSONB cover it. The JSONB approach is correct here because
protocol-specific fields vary significantly.

#### 1.2 Extend tags table

Add columns to match protocol-gateway's `domain.Tag` struct

#### 1.3 Align MQTT notification payload

The MQTT notification must produce JSON that protocol-gateway can unmarshal
into `domain.Device` and `domain.Tag` without transformation.

#### 1.4 Increment config version on every change

When a device or any of its tags change, increment `devices.config_version`.
Protocol-gateway can use this to detect stale configs.

---

### Phase 2: Protocol-Gateway Proxy

**Status: DONE**

**Goal:** Gateway-core can forward runtime requests to protocol-gateway,
giving the web UI a single API endpoint.

#### 2.1 Create proxy client

#### 2.2 Add proxy routes for device operations

```
POST   /api/devices/:id/test          --> PG POST /api/test-connection
GET    /api/devices/:id/browse        --> PG GET  /api/browse/:id
GET    /api/devices/:id/status        --> PG GET  /status (filter by device)
```

For `POST /api/devices/:id/test`:

1. Load device + tags from PostgreSQL
2. Transform to protocol-gateway's format using `deviceToProtocolGateway()`
3. POST to PG's `/api/test-connection` with the full device payload
4. Return PG's response to the client

For `POST /api/devices/:id/browse`:

1. Verify device exists in PostgreSQL
2. Forward request to PG's `/api/browse/:id` (protocol-agnostic)
3. PG returns unified `BrowseResult` regardless of protocol:
   - OPC UA: node tree browsing
   - Modbus: register scanning (probe known ranges)
   - MQTT: topic discovery (subscribe briefly)
   - S7: DB block enumeration
   - BACnet (future): Who-Is + object enumeration
4. Return the unified browse result to the client

#### 2.3 Add OPC UA certificate routes

```
GET    /api/opcua/certificates/trusted    --> PG GET    /api/opcua/certificates/trusted
GET    /api/opcua/certificates/rejected   --> PG GET    /api/opcua/certificates/rejected
POST   /api/opcua/certificates/trust      --> PG POST   /api/opcua/certificates/trust
DELETE /api/opcua/certificates/trusted/:fp --> PG DELETE /api/opcua/certificates/trusted?fingerprint=:fp
```

These are pure pass-through proxies with no business logic in gateway-core.

#### 2.4 Add topics route

```
GET    /api/topics                        --> PG GET /api/topics
```

---

### Phase 3: MQTT Subscriber (Status Ingest)

**Status: DONE**

**Goal:** Gateway-core listens for device status updates from protocol-gateway
and persists them to PostgreSQL, so the web UI sees live device status.

#### 3.1 Create MQTT subscriber

This means device status in the DB is always current. The web UI queries
`GET /api/devices` and gets status included - no separate call to protocol-gateway.

#### 3.2 Protocol-gateway side (separate task)

Protocol-gateway needs to publish status updates. Add a periodic status publisher
that sends to `$nexus/status/devices/{deviceId}` on status changes and every
30 seconds as a heartbeat. This is a protocol-gateway change documented here
for coordination.

---

### Phase 4: Two-Phase Device Flow

**Status: DONE**

**Goal:** Devices can be created without tags (Phase 1) and tags added
later (Phase 2), supporting the browse-then-select workflow for OPC UA.

#### 4.1 Allow tagless devices

Gateway-core already allows creating devices without tags. The key changes:

When creating a device without tags:

1. Publish to `$nexus/config/devices/{id}` with `"tags": []`
2. Protocol-gateway receives it, registers device (no polling - no tags)
3. User can test connection and browse

When adding tags later:

1. Each tag create publishes to `$nexus/config/tags/{deviceId}/{tagId}`
2. Protocol-gateway adds tag to device, starts polling that tag

#### 4.2 Bulk tag create from browse results

The existing `POST /api/tags/bulk` endpoint already supports this. The web UI
transforms browse results into the bulk create payload.

#### 4.3 Device setup status tracking

Add a `setup_status` column to track where the user is in the two-phase flow:

Transitions:

- Create device --> `created`
- Successful test-connection --> `connected`
- First tag added --> `configured`
- Device enabled with tags + status online --> `active`

This is informational for the web UI (setup wizard / progress indicator).

---

### Phase 5: Authentication & Authorization

**Status: DONE**

**Goal:** Secure all API endpoints with JWT validation and role-based access control.

**Architecture decision: Authentik as identity provider.**

Gateway-core does NOT manage users, passwords, login flows, or token issuance.
An external identity provider (Authentik or Authentik) handles all of that.
Gateway-core only validates JWTs and enforces RBAC.

Why:

- No reinventing auth (password policies, MFA, brute force protection, account lockout)
- SSO across all platform services (web UI, Grafana, EMQX dashboard)
- LDAP/Active Directory integration for enterprise customers
- OAuth2/OIDC standard — any compliant IdP works, not locked to one vendor
- Gateway-core stays focused on its actual job (config management, API gateway)

```
Browser                Gateway-Core              Authentik
  |                        |                           |
  |--- GET /login -------->|                           |
  |<-- 302 redirect -------|------ redirect ---------->|
  |                        |                           |
  |--- login form -------->|                           |
  |<-- JWT (access+refresh)|<----- issue tokens -------|
  |                        |                           |
  |--- GET /api/devices -->|                           |
  |    Authorization:      |                           |
  |    Bearer <jwt>        |-- verify JWT signature    |
  |                        |   (via JWKS endpoint)     |
  |                        |-- extract role claim      |
  |                        |-- enforce RBAC            |
  |<-- 200 devices --------|                           |
```

#### 5.1 Authentik deployment

Add to docker-compose and K8s manifests.

Configure in Authentik admin:

1. Create realm: `nexus`
2. Create client: `nexus-gateway` (confidential, OIDC)
3. Create roles: `admin`, `engineer`, `operator`, `viewer`
4. Create users and assign roles
5. Configure token claims to include `realm_roles` or `resource_access`

#### 5.2 JWT validation middleware

Gateway-core validates JWTs using Authentik's JWKS (JSON Web Key Set) endpoint.
No shared secret needed — uses RS256 public key verification.

#### 5.3 RBAC middleware

Permission matrix:

| Action                    | admin                   | engineer | operator | viewer |
| ------------------------- | ----------------------- | -------- | -------- | ------ |
| View devices/tags         | Y                       | Y        | Y        | Y      |
| Create/edit devices/tags  | Y                       | Y        | N        | N      |
| Delete devices            | Y                       | Y        | N        | N      |
| Test connection / browse  | Y                       | Y        | Y        | N      |
| Toggle device enabled     | Y                       | Y        | Y        | N      |
| Manage users              | Authentik admin console |
| View system logs          | Y                       | Y        | N        | N      |
| Trust/remove certificates | Y                       | Y        | N        | N      |
| Restart/scale services    | Y                       | N        | N        | N      |

User management (create/edit/delete users, password reset, MFA setup) is handled
entirely in Authentik's admin console or its REST API. Gateway-core does NOT
need a users table or user CRUD endpoints.

#### 5.4 Audit log

No foreign key to a users table — we store the Authentik subject ID and username
directly from the JWT. This decouples audit from user management.

---

### Phase 6: WebSocket Bridge

**Status: DONE**

**Goal:** Browser connects via WebSocket to receive real-time MQTT data
(live tag values, device status changes) without polling.

#### 6.1 WebSocket server

Key design decisions:

- **One shared MQTT client** across all WebSocket connections (not per-client)
- **Reference counting** on MQTT subscriptions (subscribe once per topic, even with multiple WS clients)
- **JWT required** for WebSocket connections (validate on connect)
- **Topic filtering** based on user role
- **Heartbeat** via ping/pong every 30s to detect stale connections
- **Max subscriptions per client** to prevent abuse (default: 100)

---

### Phase 7: System Management

**Status: DONE (Level 1)**

**Goal:** Web UI can view service health, container status, and logs.

There are two levels of system management. V2 covers Level 1 only.

#### Level 1: Aggregated health + log viewing (V2 - gateway-core)

What gateway-core handles directly:

```
GET  /api/system/health          Aggregated health of all services
GET  /api/system/containers      Proxy to PG: /api/logs/containers
GET  /api/system/logs            Proxy to PG: /api/logs?container=...&tail=...
GET  /api/system/info            Service versions, uptime, config summary
```

For aggregated health:

1. Gateway-core's own health (DB + MQTT connectivity)
2. Fetch `GET /health` from protocol-gateway (with 2s timeout)
3. Fetch `GET /health` from data-ingestion (with 2s timeout)
4. Combine into overall status with per-service breakdown

This gives the web UI a "System" page showing all services with green/yellow/red
status, versions, uptime — without needing Docker/K8s access.

#### Level 2: Container/pod lifecycle management (future - system-agent service)

Full service lifecycle management (restart, scale, resource monitoring) requires
host-level access (Docker socket or K8s API). This does NOT belong in gateway-core
because:

- Gateway-core should NOT mount `docker.sock` or hold K8s admin credentials
- It's an infrastructure concern, not a configuration concern
- Security blast radius: a vulnerability in gateway-core should not grant
  container-level control over the entire platform

**Future `system-agent` service (Go or TypeScript):**

This is NOT part of V2 but documented here for planning. When implemented,
the container/log endpoints currently in protocol-gateway migrate to system-agent,
and protocol-gateway drops its Docker CLI dependency.

---

### Phase 8: Production Hardening

**Status: DONE**

**Goal:** Make the service production-ready.

#### Pre-Phase-8 Review Fixes (DONE)

A senior-level review of the full codebase identified 6 critical issues that were
fixed before starting Phase 8:

1. **Race condition in duplicate name checks** — Replaced check-then-insert pattern
   with insert-then-catch-constraint (`23505` unique violation) in `DeviceService`
   and `TagService` (`create`, `update`, `bulkCreate`). The DB unique indexes are
   the single source of truth for uniqueness.

2. **MQTT notification failures bubble to HTTP** — All `notifyDeviceChange` /
   `notifyTagChange` calls changed from `await` to fire-and-forget `.catch()` with
   logging. MQTT is best-effort; the HTTP response reflects the DB state, not MQTT.

3. **No body size limit** — Added `bodyLimit: 1_048_576` (1 MB) to Fastify config
   to prevent oversized payloads.

4. **Proxy errors are generic** — Added `proxyErrorFromCause()` that classifies
   errors as timeout (504 `PROXY_TIMEOUT`), connection refused (502
   `PROXY_CONNECTION_REFUSED`), DNS failure (502 `PROXY_DNS_ERROR`), or generic
   unreachable (502 `PROXY_UNREACHABLE`).

5. **No DB statement timeout** — Added `statement_timeout: 30_000` and
   `idle_in_transaction_session_timeout: 60_000` to the pg Pool config.

6. **WS topic array unbounded** — Added max 50 topics per subscribe message
   validation in the WebSocket bridge.

#### 8.1 Rate limiting — DONE

```typescript
import rateLimit from '@fastify/rate-limit';

await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (request) => request.user?.id ?? request.ip,
});
```

Per-route overrides for expensive operations:

- `/api/devices/:id/test` - 10/min (triggers real device connections)
- `/api/devices/:id/browse` - 10/min (triggers OPC UA browse)

**Dependencies to add:** `@fastify/rate-limit`

**Files to modify:**

- `src/index.ts` - register rate limit plugin

#### 8.2 Request ID and correlation — DONE

Use Fastify's built-in `request.id` and include it in:

- All log entries (Pino already does this) — DONE
- Error responses (`requestId` field) — DONE (in error handler)
- Proxy requests to protocol-gateway (`X-Request-ID` header) — DONE (in proxy client)

No remaining work.

#### 8.3 Graceful shutdown — DONE

Current shutdown handles:

- WebSocket bridge stop — DONE
- HTTP server close — DONE
- MQTT disconnect — DONE
- Database pool close — DONE

Note: In-flight proxy requests are cancelled by Fastify's `app.close()` which
terminates active connections. The circuit breaker also prevents new requests
from starting during shutdown.

#### 8.4 Health check improvements — DONE

Already implemented in Phase 7 system routes:

- Protocol-gateway reachability — DONE
- Data-ingestion reachability — DONE
- MQTT connectivity — DONE
- WebSocket stats — DONE
- Database connectivity with latency — DONE

#### 8.5 Prometheus metrics — DONE

```
gateway_core_http_requests_total{method, route, status}
gateway_core_http_request_duration_seconds{method, route}
gateway_core_ws_connections_active
gateway_core_mqtt_messages_received_total
gateway_core_proxy_requests_total{target, status}
gateway_core_proxy_latency_seconds{target}
```

**Dependencies to add:** `prom-client`

**Files to create:**

- `src/lib/metrics.ts` - Prometheus metrics registry and route

#### 8.6 Circuit breaker for proxy — DONE

Implemented in `src/proxy/protocol-gateway.ts`. States: CLOSED → OPEN (after 5
consecutive failures) → HALF_OPEN (after 30s cooldown) → CLOSED (on successful
probe). Circuit state exposed in health check response. Health probes skip the
circuit breaker via `skipCircuitBreaker` option.

---

### Remaining Findings (Post-Review)

Items identified during the comprehensive review that are acceptable for V2
but should be addressed in future iterations:

| Finding                                    | Severity | Status  | Notes                                                                                           |
| ------------------------------------------ | -------- | ------- | ----------------------------------------------------------------------------------------------- |
| No tests                                   | Medium   | Open    | Unit + integration tests should cover transform, services, middleware, proxy                    |
| MQTT client ID collision on multi-instance | Low      | Fixed   | Client ID uses `${MQTT_CLIENT_ID}-${Date.now()}` suffix — unique per instance                  |
| Audit log retention / cleanup              | Low      | Open    | No TTL or rotation — audit_log table will grow unbounded                                        |
| WS multi-instance state                    | Low      | N/A     | Works because MQTT handles fan-out; clients reconnect to any instance                           |
| ILIKE search injection                     | Low      | Fixed   | Added `escapeLike()` to escape `%`, `_`, `\` in device and tag search                          |
| No idempotency keys on create              | Low      | Open    | Acceptable for config API (low write volume, UI-driven)                                         |
| SQL init scripts out of sync               | Medium   | Fixed   | All .sql files consolidated to V2 schema matching `db/schema.ts`                                |
| Rate limiting disabled by default           | —        | Done    | Added `RATE_LIMIT_ENABLED` env flag (default false)                                             |

---

## Deployment & Resilience

### K8s/K3s deployment model

| Service          | Type        | Replicas | Scaling strategy                      |
| ---------------- | ----------- | -------- | ------------------------------------- |
| gateway-core     | Deployment  | 1-3      | Stateless, HPA on CPU/requests        |
| protocol-gateway | Deployment  | 1-2      | Stateful connections, careful scaling |
| data-ingestion   | Deployment  | 1-3      | Stateless, HPA on MQTT throughput     |
| PostgreSQL       | StatefulSet | 1        | Single instance, PVC for storage      |
| TimescaleDB      | StatefulSet | 1        | Single instance, PVC for storage      |
| EMQX             | StatefulSet | 1-3      | Native clustering support             |
| Authentik        | Deployment  | 1        | Stateless (DB-backed sessions)        |

### PostgreSQL: why one instance is enough

Gateway-core's workload is config CRUD: maybe 10-100 writes/day, a few hundred
reads/day. A single PostgreSQL 15 instance handles 10K+ TPS. Sharding is for
write-heavy multi-TB workloads — this is not that.

What to do instead:

- **Backups:** pg_dump daily + WAL archiving for point-in-time recovery
- **If HA needed later:** PostgreSQL streaming replication with a hot standby
  (not sharding — that is unnecessary complexity for this workload)
- **Connection pooling:** Drizzle's pg Pool (default max: 10) is sufficient

### Resilience: dependency failure handling

Gateway-core must handle dependency failures gracefully without crashing.

```
PostgreSQL down:
  - Health readiness probe returns 503
  - K8s stops routing traffic to this pod
  - Drizzle/pg pool retries connections automatically
  - Service stays up, returns 503 on DB-dependent routes
  - Recovers automatically when PostgreSQL comes back

Protocol-gateway unreachable:
  - Proxy routes return 502 Bad Gateway with descriptive error
  - Device/tag CRUD still works (PostgreSQL is independent)
  - MQTT config notifications still publish (EMQX is independent)
  - Health check shows protocol-gateway as degraded component
  - Proxy client uses timeout (30s) and AbortController

MQTT broker (EMQX) down:
  - mqtt.js client reconnects automatically (built-in, configurable delay)
  - Config notifications queue in memory until reconnected
  - Status subscriber reconnects and resubscribes automatically
  - WebSocket bridge stops receiving data (clients see stale values)
  - Health check shows MQTT as degraded component
  - No data loss: QoS 1 ensures delivery after reconnect

Authentik down:
  - JWKS cache serves existing public keys (cached for 24h)
  - Existing JWTs continue to validate until expiry
  - New logins fail (browser redirects to Authentik, gets error)
  - Gateway-core itself stays fully operational
  - Health check shows auth as degraded (optional check)
```

None of these should crash the service or require a restart. The current code
already handles MQTT reconnection. Phase 8 adds proper error handling for the
proxy client and ensures health checks reflect all component statuses.

---

## Build & Run (Unified)

All services must be buildable and runnable from the **project root** with a
single command. No scattered scripts, no manual ordering.

### Development (docker-compose)

```bash
# From project root - starts everything
make dev

# Or directly:
docker compose -f infrastructure/docker/docker-compose.yml up --build
```

docker-compose handles startup ordering via `depends_on` with health checks:

```yaml
gateway-core:
  depends_on:
    postgres:
      condition: service_healthy
    emqx:
      condition: service_healthy
  # gateway-core's own migrate.ts handles DB readiness with retries

protocol-gateway:
  depends_on:
    emqx:
      condition: service_healthy
  # protocol-gateway loads cached config from YAML, subscribes to MQTT for updates
```

No manual "run migration first, then start services" — each service handles
its own initialization (migrations, connection retries) on startup.

### Production (K8s/K3s)

```bash
# From project root
kubectl apply -k infrastructure/k8s/

# Or via Makefile
make deploy-k8s
```

K8s handles startup ordering via:

- **Init containers:** wait for PostgreSQL, EMQX to be ready before starting
- **Readiness probes:** K8s only routes traffic after `/health/ready` returns 200
- **Liveness probes:** K8s restarts pods that fail `/health/live`

### Makefile targets (project root)

```makefile
# Development
dev:              Start all services locally (docker-compose)
dev-gateway:      Start gateway-core only (pnpm dev)
dev-protocol:     Start protocol-gateway only (go run)
dev-ingestion:    Start data-ingestion only (go run)

# Build
build:            Build all services
build-docker:     Build all Docker images
build-gateway:    Build gateway-core only

# Test
test:             Run all tests across all services
test-gateway:     Run gateway-core tests only

# Deploy
deploy-k8s:       Apply K8s manifests
deploy-compose:   Docker compose up (production config)

# Database
db-migrate:       Run gateway-core migrations
db-studio:        Open Drizzle Studio
```

---

## Dependency Changes

### Added

| Package               | Phase | Purpose                                       |
| --------------------- | ----- | --------------------------------------------- |
| `jose`                | 5     | JWT/JWKS verification (zero transitive deps)  |
| `@fastify/rate-limit` | 8     | Global + per-route rate limiting              |
| `prom-client`         | 8     | Prometheus metrics (Node.js + HTTP + custom)  |

### Already available (no install needed)

| Feature        | Already available via            |
| -------------- | -------------------------------- |
| HTTP proxy     | Native `fetch` (Node 20+)        |
| WebSocket      | `@fastify/websocket` (installed) |
| MQTT subscribe | `mqtt` package (installed)       |
| Request ID     | Fastify built-in `request.id`    |

---

## Testing Strategy

### Unit tests (Vitest)

| Module                   | What to test                                    |
| ------------------------ | ----------------------------------------------- |
| `mqtt/transform.ts`      | DB row to PG format mapping for all 3 protocols |
| `routes/*/schema.ts`     | Zod validation: valid, invalid, edge cases      |
| `routes/*/service.ts`    | Business logic with mocked DB                   |
| `routes/auth/service.ts` | JWT sign/verify, password hash/verify           |
| `middleware/auth.ts`     | Token extraction, skip paths, invalid tokens    |
| `middleware/rbac.ts`     | Role permission matrix                          |
| `proxy/*.ts`             | Error handling, timeout, response mapping       |

### Integration tests (Vitest + test containers)

| Test             | What it covers                                  |
| ---------------- | ----------------------------------------------- |
| Device CRUD flow | Create -> verify DB -> verify MQTT notification |
| Tag bulk create  | Create device -> bulk tags -> verify all notifs |
| Two-phase flow   | Create (no tags) -> test -> browse -> add tags  |
| Auth flow        | Login -> token -> protected route -> expired    |
| Proxy flow       | Mock PG server -> verify proxy request/response |

### Commands

```bash
pnpm test              # Run all unit tests
pnpm test:watch        # Watch mode
pnpm test:coverage     # Coverage report
```

---

## Migration Notes

### Upgrading from V1 to V2

1. **Database migration:** Run Drizzle migrations to add new columns. All new
   columns have defaults so existing rows remain valid.

2. **MQTT payload format:** V2 uses the same topics (`$nexus/config/devices/#`,
   `$nexus/config/tags/#`) but the payload structure changes to match
   protocol-gateway's Go structs. Deploy protocol-gateway update before or
   simultaneously with gateway-core V2.

3. **Environment variables:** Add `PROTOCOL_GATEWAY_URL` (required),
   `DATA_INGESTION_URL` (optional, Phase 7), `OIDC_ISSUER_URL` and
   `OIDC_AUDIENCE` (Phase 5). All existing env vars unchanged.

4. **Auth rollout:** Deploy Phase 5 with `AUTH_ENABLED=false`. Enable once
   users are seeded and the web UI supports login.

5. **Breaking change:** `custom_topic` field on tags is renamed to `topic_suffix`.
   The web UI must be updated for this field name change.

### Deployment order

```
1. Database migrations (add columns - safe, all have defaults)
2. Authentik (deploy, configure realm, roles, users)
3. Protocol-gateway update (accept new MQTT format, relax tag validation)
4. Gateway-core V2 (new schema, proxy, subscriber, JWT validation)
5. Web UI updates (login redirect, two-phase setup, new field names)
```

### Rollback

If V2 has issues:

- Gateway-core V1 can still run against the extended schema (new columns are
  nullable / have defaults, V1 code ignores them)
- Protocol-gateway can fall back to YAML config if MQTT notifications stop
- Auth can be disabled via env flag without redeployment
