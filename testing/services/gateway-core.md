# Gateway Core Testing Guide

This document provides a comprehensive guide for testing the Gateway Core service, including startup instructions, deployment information, and detailed testing procedures.

---

## Table of Contents

1. [How to Start the Service](#1-how-to-start-the-service)
2. [Production Deployment](#2-production-deployment)
3. [Testing Plan](#3-testing-plan)
4. [Quick Start Commands](#quick-start-commands-summary)
5. [Troubleshooting](#troubleshooting-quick-reference)

---

## 1. How to Start the Service

### Prerequisites

Before starting the Gateway Core service, ensure you have:

- **Docker Desktop** installed and running
- **Node.js 20+** and **pnpm 8+** for local development
- **No port conflicts** on 3001, 5433, 1883, 18083

> **Note:** Gateway Core requires PostgreSQL and EMQX to be running.

### Option A: pnpm (Recommended for Development)

This runs the service locally with hot reload for rapid development:

```powershell
# Navigate to the gateway-core folder
cd services/gateway-core

# Install dependencies (first time only)
pnpm install

# Start the service in development mode
pnpm dev
```

**What you need running:**

| Service    | Port        | How to Start                                                |
| ---------- | ----------- | ----------------------------------------------------------- |
| PostgreSQL | 5433        | `cd infrastructure/docker && docker-compose up -d postgres` |
| EMQX       | 1883, 18083 | `cd infrastructure/docker && docker-compose up -d emqx`     |

**Available Scripts:**

| Command            | Purpose                           |
| ------------------ | --------------------------------- |
| `pnpm dev`         | Start with hot reload (tsx watch) |
| `pnpm build`       | Compile TypeScript to JavaScript  |
| `pnpm start`       | Run compiled production build     |
| `pnpm lint`        | Check code quality                |
| `pnpm format`      | Format code with Prettier         |
| `pnpm db:generate` | Generate Drizzle migrations       |
| `pnpm db:migrate`  | Apply migrations manually         |

### Option B: Docker Compose (Full Stack)

This starts the entire NEXUS Edge stack including Gateway Core:

```powershell
# Navigate to the docker folder
cd infrastructure/docker

# Start the full stack (PostgreSQL, EMQX, Gateway Core, Web UI, etc.)
docker-compose up -d

# View Gateway Core logs
docker-compose logs -f gateway-core

# View all logs
docker-compose logs -f
```

**What gets started:**

| Container            | Port        | Purpose                              |
| -------------------- | ----------- | ------------------------------------ |
| `nexus-postgres`     | 5433        | Configuration database               |
| `nexus-emqx`         | 1883, 18083 | MQTT Broker for config notifications |
| `nexus-gateway-core` | 3001        | Gateway Core API                     |
| `nexus-web-ui`       | 5173        | Web UI (uses Gateway Core API)       |
| `nexus-nginx`        | 80          | Reverse proxy                        |

### Option C: Docker Container (Gateway Core Only)

Build and run Gateway Core as a standalone container:

```powershell
# Navigate to gateway-core
cd services/gateway-core

# Build the Docker image
docker build -t nexus/gateway-core:latest .

# Run the container (requires PostgreSQL and EMQX)
docker run -d \
  --name nexus-gateway-core \
  -p 3001:3001 \
  -e DATABASE_URL=postgresql://nexus:nexus_config_secret@host.docker.internal:5433/nexus_config \
  -e MQTT_BROKER_URL=mqtt://host.docker.internal:1883 \
  nexus/gateway-core:latest
```

> ⚠️ **Note:** Use `host.docker.internal` on Windows/Mac to access services on the host machine.

---

## 2. Production Deployment

The Gateway Core Service is deployed as a containerized API that manages device configurations:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT ARCHITECTURE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐     ┌──────────────────────┐     ┌──────────────────┐     │
│  │ Web UI       │────>│ Gateway Core         │────>│ PostgreSQL       │     │
│  │ (React)      │     │ (Fastify API)        │     │ (Config DB)      │     │
│  └──────────────┘     └──────────┬───────────┘     └──────────────────┘     │
│                                  │                                          │
│                                  ▼                                          │
│                       ┌──────────────────┐                                  │
│                       │ EMQX Broker      │                                  │
│                       │ (Notifications)  │                                  │
│                       └────────┬─────────┘                                  │
│                                │                                            │
│                                ▼                                            │
│                       ┌──────────────────┐                                  │
│                       │ Protocol Gateway │                                  │
│                       │ (Subscribes to   │                                  │
│                       │  config changes) │                                  │
│                       └──────────────────┘                                  │
│                                                                             │
│  SCALING: Gateway Core is stateless and can run multiple replicas behind    │
│  a load balancer. PostgreSQL manages concurrency with transactions.         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Build the production image:**

```powershell
docker build -t nexus/gateway-core:latest .
```

**Kubernetes Deployment (planned):**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gateway-core
spec:
  replicas: 3
  selector:
    matchLabels:
      app: gateway-core
  template:
    metadata:
      labels:
        app: gateway-core
    spec:
      containers:
        - name: gateway-core
          image: nexus/gateway-core:latest
          ports:
            - containerPort: 3001
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: gateway-core-secrets
                  key: database-url
            - name: MQTT_BROKER_URL
              value: mqtt://emqx:1883
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3001
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3001
```

---

## 3. Testing Plan

### Phase 1: Basic Startup Test ✅

| Step | What to Check                           | Expected Result                                 |
| ---- | --------------------------------------- | ----------------------------------------------- |
| 1    | Start with `pnpm dev` or Docker Compose | Service starts without errors                   |
| 2    | Check logs                              | Shows "Server listening at http://0.0.0.0:3001" |
| 3    | Open http://localhost:3001/health       | Returns `{"status":"ok","timestamp":"..."}`     |
| 4    | Open http://localhost:3001/health/live  | Returns 200 OK with `{"status":"ok"}`           |
| 5    | Open http://localhost:3001/health/ready | Returns 200 OK with database and MQTT status    |
| 6    | Open http://localhost:3001/docs         | Swagger API documentation loads                 |

### Phase 2: Health Check Verification 🏥

**Step-by-Step:**

| Step | Action                 | Details                                                |
| ---- | ---------------------- | ------------------------------------------------------ |
| 1    | Check basic health     | `Invoke-RestMethod http://localhost:3001/health`       |
| 2    | Check readiness        | `Invoke-RestMethod http://localhost:3001/health/ready` |
| 3    | Verify database status | `status.database.status` should be "ok"                |
| 4    | Verify MQTT status     | `status.mqtt.status` should be "ok"                    |
| 5    | Check liveness         | `Invoke-RestMethod http://localhost:3001/health/live`  |

**Expected Readiness Response:**

```json
{
  "status": "ok",
  "timestamp": "2026-01-09T10:00:00.000Z",
  "checks": {
    "database": {
      "status": "ok",
      "latencyMs": 5.234,
      "connected": true
    },
    "mqtt": {
      "status": "ok",
      "connected": true,
      "broker": "mqtt://emqx:1883"
    }
  }
}
```

### Phase 3: Device API Test 🖥️

**Create a Device:**

```powershell
# Create a Modbus device
$device = @{
  name = "Test PLC"
  protocol = "modbus"
  enabled = $true
  host = "192.168.1.100"
  port = 502
  protocolConfig = @{
    slaveId = 1
    timeout = 5000
  }
  pollIntervalMs = 1000
  location = "Factory Floor A"
} | ConvertTo-Json

Invoke-RestMethod -Method POST -Uri "http://localhost:3001/api/devices" -Body $device -ContentType "application/json"
```

**List Devices:**

```powershell
# Get all devices
Invoke-RestMethod http://localhost:3001/api/devices

# Get with pagination
Invoke-RestMethod "http://localhost:3001/api/devices?limit=10&offset=0"

# Filter by protocol
Invoke-RestMethod "http://localhost:3001/api/devices?protocol=modbus"

# Search by name
Invoke-RestMethod "http://localhost:3001/api/devices?search=PLC"
```

**Get Device by ID:**

```powershell
Invoke-RestMethod http://localhost:3001/api/devices/1
```

**Update Device:**

```powershell
$update = @{
  name = "Updated PLC"
  enabled = $false
} | ConvertTo-Json

Invoke-RestMethod -Method PUT -Uri "http://localhost:3001/api/devices/1" -Body $update -ContentType "application/json"
```

**Delete Device:**

```powershell
Invoke-RestMethod -Method DELETE -Uri "http://localhost:3001/api/devices/1"
```

### Phase 4: Tag API Test 🏷️

**Create a Tag:**

```powershell
$tag = @{
  deviceId = 1
  name = "Temperature"
  address = "40001"
  dataType = "float32"
  accessMode = "read"
  scalingFactor = 1.0
  scalingOffset = 0.0
  unit = "°C"
  description = "Tank temperature sensor"
} | ConvertTo-Json

Invoke-RestMethod -Method POST -Uri "http://localhost:3001/api/tags" -Body $tag -ContentType "application/json"
```

**Bulk Create Tags:**

```powershell
$tags = @(
  @{
    deviceId = 1
    name = "Pressure"
    address = "40002"
    dataType = "float32"
    accessMode = "read"
    unit = "bar"
  },
  @{
    deviceId = 1
    name = "Flow Rate"
    address = "40003"
    dataType = "float32"
    accessMode = "read"
    unit = "m3/h"
  }
) | ConvertTo-Json

Invoke-RestMethod -Method POST -Uri "http://localhost:3001/api/tags/bulk" -Body $tags -ContentType "application/json"
```

**List Tags:**

```powershell
# Get all tags
Invoke-RestMethod http://localhost:3001/api/tags

# Get tags for a specific device
Invoke-RestMethod "http://localhost:3001/api/tags?deviceId=1"

# Search tags
Invoke-RestMethod "http://localhost:3001/api/tags?search=temperature"
```

**Update Tag:**

```powershell
$update = @{
  scalingFactor = 0.1
  unit = "°F"
} | ConvertTo-Json

Invoke-RestMethod -Method PUT -Uri "http://localhost:3001/api/tags/1" -Body $update -ContentType "application/json"
```

**Delete Tag:**

```powershell
Invoke-RestMethod -Method DELETE -Uri "http://localhost:3001/api/tags/1"
```

### Phase 5: MQTT Notification Test 📢

Gateway Core publishes configuration changes to MQTT for Protocol Gateway to consume.

**Test MQTT Notifications:**

| Step | Action                     | Details                                                       |
| ---- | -------------------------- | ------------------------------------------------------------- |
| 1    | Open EMQX Dashboard        | http://localhost:18083 (admin/admin123)                       |
| 2    | Go to WebSocket Client     | Menu: "Diagnose" → "WebSocket Client"                         |
| 3    | Click "Connect"            | Wait for "Connected" status                                   |
| 4    | Subscribe to config topics | Topic: `$nexus/config/#`, click "Subscribe"                   |
| 5    | Create/update a device     | Use API endpoint from Phase 3                                 |
| 6    | Check for notification     | Should see message on `$nexus/config/devices/{deviceId}`      |
| 7    | Create/update a tag        | Use API endpoint from Phase 4                                 |
| 8    | Check for notification     | Should see message on `$nexus/config/tags/{deviceId}/{tagId}` |

**Expected Device Config Notification:**

Topic: `$nexus/config/devices/1`

```json
{
  "action": "create",
  "timestamp": "2026-01-09T10:00:00.000Z",
  "data": {
    "id": 1,
    "name": "Test PLC",
    "protocol": "modbus",
    "enabled": true,
    "host": "192.168.1.100",
    "port": 502,
    "protocolConfig": {
      "slaveId": 1,
      "timeout": 5000
    },
    "pollIntervalMs": 1000
  }
}
```

**Expected Tag Config Notification:**

Topic: `$nexus/config/tags/1/1`

```json
{
  "action": "create",
  "timestamp": "2026-01-09T10:00:00.000Z",
  "data": {
    "id": 1,
    "deviceId": 1,
    "name": "Temperature",
    "address": "40001",
    "dataType": "float32",
    "accessMode": "read"
  }
}
```

### Phase 6: Database Verification 🗃️

**Connect to PostgreSQL:**

Using Adminer (if running):

- System: PostgreSQL
- Server: localhost:5433
- Username: nexus
- Password: nexus_config_secret
- Database: nexus_config

Or using psql:

```powershell
docker exec -it nexus-postgres psql -U nexus -d nexus_config
```

**Verify Device Data:**

```sql
-- List all devices
SELECT id, name, protocol, enabled, host, port, status, last_seen
FROM devices
ORDER BY created_at DESC;

-- Check protocol-specific config
SELECT id, name, protocol, protocol_config
FROM devices
WHERE protocol = 'modbus';

-- Check device metrics
SELECT
  protocol,
  COUNT(*) as total,
  SUM(CASE WHEN enabled THEN 1 ELSE 0 END) as enabled_count,
  SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online_count
FROM devices
GROUP BY protocol;
```

**Verify Tag Data:**

```sql
-- List all tags
SELECT t.id, t.name, t.address, t.data_type, d.name as device_name
FROM device_tags t
JOIN devices d ON t.device_id = d.id
ORDER BY d.name, t.name;

-- Count tags per device
SELECT
  d.name as device,
  COUNT(t.id) as tag_count
FROM devices d
LEFT JOIN device_tags t ON d.id = t.device_id
GROUP BY d.name;
```

### Phase 7: Web UI Integration Test 🌐

**Start Web UI:**

```powershell
# Navigate to web-ui
cd services/web-ui

# Install dependencies (first time)
pnpm install

# Start dev server
pnpm dev
```

**Test Web UI:**

| Step | Action                     | Expected Result                   |
| ---- | -------------------------- | --------------------------------- |
| 1    | Open http://localhost:5173 | Web UI loads                      |
| 2    | Navigate to "Devices"      | Device list page loads            |
| 3    | Check system health        | System Overview shows "Connected" |
| 4    | Click "Add Device"         | Device dialog opens               |
| 5    | Fill in device form        | Protocol dropdown works           |
| 6    | Save device                | Device appears in list            |
| 7    | Click device row           | Device editor opens               |
| 8    | Update device              | Changes save successfully         |
| 9    | Delete device              | Device removed from list          |

### Phase 8: Error Handling Test 🔥

| Test                | How                           | Expected Behavior                                 |
| ------------------- | ----------------------------- | ------------------------------------------------- |
| Stop PostgreSQL     | `docker stop nexus-postgres`  | `/health/ready` returns error, API returns 500    |
| Restart PostgreSQL  | `docker start nexus-postgres` | Service reconnects automatically                  |
| Stop EMQX           | `docker stop nexus-emqx`      | `/health/ready` shows MQTT error, API still works |
| Restart EMQX        | `docker start nexus-emqx`     | MQTT reconnects automatically                     |
| Invalid device data | Send malformed JSON           | Returns 400 with validation error                 |
| Duplicate device    | Create device with same name  | Database constraint prevents duplicate            |
| Delete non-existent | DELETE `/api/devices/999`     | Returns 404 Not Found                             |

### Phase 9: Performance Test 📊

**Bulk Device Creation:**

```powershell
# Create 100 devices
1..100 | ForEach-Object {
  $device = @{
    name = "Device $_"
    protocol = "modbus"
    enabled = $true
    host = "192.168.1.$_"
    port = 502
    protocolConfig = @{ slaveId = $_ }
  } | ConvertTo-Json

  Invoke-RestMethod -Method POST -Uri "http://localhost:3001/api/devices" -Body $device -ContentType "application/json"
}

# Measure query performance
Measure-Command { Invoke-RestMethod "http://localhost:3001/api/devices?limit=100" }
```

**Expected Performance:**

| Metric            | Target  | Notes                            |
| ----------------- | ------- | -------------------------------- |
| API response time | < 100ms | For list/get operations          |
| Device create     | < 200ms | Includes DB write + MQTT publish |
| Database query    | < 50ms  | For paginated list               |
| Health check      | < 10ms  | Should be very fast              |

---

## Quick Start Commands Summary

```powershell
# =============================================================================
# Option 1: Local Development (pnpm)
# =============================================================================

# Start dependencies (PostgreSQL + EMQX)
cd infrastructure/docker
docker-compose up -d postgres emqx

# Start Gateway Core
cd ../../services/gateway-core
pnpm install
pnpm dev

# Gateway Core runs at http://localhost:3001
# API docs at http://localhost:3001/docs

# =============================================================================
# Option 2: Full Stack (Docker Compose)
# =============================================================================

cd infrastructure/docker
docker-compose up -d

# View logs
docker-compose logs -f gateway-core

# =============================================================================
# Testing Commands
# =============================================================================

# Health check
Invoke-RestMethod http://localhost:3001/health
Invoke-RestMethod http://localhost:3001/health/ready

# List devices
Invoke-RestMethod http://localhost:3001/api/devices

# Create device
$device = @{ name="Test"; protocol="modbus"; enabled=$true; host="localhost"; port=502 } | ConvertTo-Json
Invoke-RestMethod -Method POST -Uri "http://localhost:3001/api/devices" -Body $device -ContentType "application/json"

# Access EMQX Dashboard (view MQTT notifications)
# Open http://localhost:18083 (admin/admin123)

# Access PostgreSQL
docker exec -it nexus-postgres psql -U nexus -d nexus_config

# =============================================================================
# Stop Services
# =============================================================================

# Stop pnpm dev (Ctrl+C)

# Stop Docker Compose
cd infrastructure/docker
docker-compose down
```

---

## Troubleshooting Quick Reference

| Problem                    | Check                    | Solution                                                 |
| -------------------------- | ------------------------ | -------------------------------------------------------- |
| Service won't start        | Check logs               | `pnpm dev` or `docker-compose logs gateway-core`         |
| "Connection refused" to DB | Is PostgreSQL running?   | `docker ps` - start with `docker-compose up -d postgres` |
| MQTT disconnected          | Check EMQX status        | Verify broker is running, check `MQTT_BROKER_URL`        |
| 404 on API calls           | Wrong URL?               | Ensure using `http://localhost:3001/api/...`             |
| Validation errors          | Check request body       | Use `/docs` to see required fields                       |
| Migrations not running     | Check DB connection      | Service runs migrations on startup automatically         |
| CORS errors from Web UI    | Check CORS_ORIGIN env    | Should include `http://localhost:5173`                   |
| Swagger docs not loading   | Check route registration | Navigate to `/docs` not `/api/docs`                      |

### Common Database Issues

**"relation devices does not exist":**

```powershell
# Migrations didn't run - check logs
# Service automatically creates schema on startup
# If needed, restart the service
```

**"duplicate key value violates unique constraint":**

- Device names must be unique
- Check existing devices before creating

**Connection pool exhausted:**

- Default pool size is 10
- Increase `DATABASE_POOL_SIZE` environment variable

### Common MQTT Issues

**"MQTT not connected" in health check:**

```powershell
# Check EMQX is running
docker ps | grep emqx

# Check MQTT_BROKER_URL environment variable
# Should be: mqtt://localhost:1883 (local) or mqtt://emqx:1883 (Docker)
```

**No notifications appearing:**

- Subscribe to `$nexus/config/#` to see all notifications
- Check EMQX Dashboard → Clients to verify gateway-core is connected
- Check Gateway Core logs for MQTT publish errors

### Checking Logs

```powershell
# pnpm dev (local)
# Logs appear in console

# Docker Compose
docker-compose logs gateway-core
docker-compose logs -f gateway-core  # Follow logs
docker-compose logs --tail=100 gateway-core  # Last 100 lines
```

---

## Test Results Checklist

Use this checklist to track your testing progress:

### Phase 1: Basic Startup

- [ ] Service starts without errors
- [ ] `/health` endpoint returns healthy
- [ ] `/health/live` returns 200 OK
- [ ] `/health/ready` returns 200 OK with database and MQTT status
- [ ] `/docs` loads Swagger API documentation

### Phase 2: Health Checks

- [ ] Database check shows "ok" status
- [ ] MQTT check shows "ok" status
- [ ] Readiness endpoint includes latency metrics
- [ ] Liveness endpoint responds quickly (< 10ms)

### Phase 3: Device API

- [ ] Create device succeeds
- [ ] List devices returns data
- [ ] Get device by ID works
- [ ] Update device saves changes
- [ ] Delete device removes from database
- [ ] Pagination works correctly
- [ ] Search/filter works

### Phase 4: Tag API

- [ ] Create tag succeeds
- [ ] Bulk create tags works
- [ ] List tags returns data
- [ ] Filter tags by deviceId works
- [ ] Update tag saves changes
- [ ] Delete tag removes from database

### Phase 5: MQTT Notifications

- [ ] Device create publishes notification
- [ ] Device update publishes notification
- [ ] Device delete publishes notification
- [ ] Tag create publishes notification
- [ ] Tag update publishes notification
- [ ] Tag delete publishes notification
- [ ] Notification payload format is correct

### Phase 6: Database Verification

- [ ] Devices table contains data
- [ ] Tags table contains data
- [ ] Protocol config stored as JSONB
- [ ] Timestamps are accurate
- [ ] Foreign keys work correctly

### Phase 7: Web UI Integration

- [ ] Web UI connects to API
- [ ] Device list loads
- [ ] Add device works
- [ ] Edit device works
- [ ] Delete device works
- [ ] System health displays correctly

### Phase 8: Error Handling

- [ ] Service survives PostgreSQL stop
- [ ] Service reconnects after PostgreSQL restart
- [ ] Service survives EMQX stop
- [ ] Service reconnects after EMQX restart
- [ ] Invalid requests return proper error codes
- [ ] Not found returns 404
- [ ] Validation errors return 400

### Phase 9: Performance

- [ ] API response times under 100ms
- [ ] Bulk operations complete successfully
- [ ] Database queries are fast (< 50ms)
- [ ] Health checks are very fast (< 10ms)

---

## Performance Benchmarks

Expected performance under optimal conditions:

| Metric            | Target        | Notes                      |
| ----------------- | ------------- | -------------------------- |
| API throughput    | 1000+ req/sec | For simple GET operations  |
| Device create     | < 200ms       | Includes DB + MQTT publish |
| Device list (100) | < 100ms       | With pagination            |
| Health check      | < 10ms        | Very fast, no DB query     |
| Memory usage      | ~100MB        | Base Node.js + Fastify     |
| CPU usage         | < 5%          | Idle, < 20% under load     |

---

## Notes

_Add your testing notes, observations, and issues here:_

```
Date: _______________
Tester: _______________

Environment:
- OS: Windows/Linux/Mac
- Node.js version: _______________
- pnpm version: _______________
- Docker version: _______________

Notes:
-
-
-

Issues Found:
-
-
-

Suggestions:
-
-
-
```

---

## API Reference

For complete API documentation, see:

- **Live Swagger Docs**: http://localhost:3001/docs
- **Service Documentation**: `/docs/services/gateway-core/readme.md`

## Related Documentation

- [Gateway Core Service README](../../docs/services/gateway-core/readme.md)
- [Web UI Testing Guide](./web-ui.md) (planned)
- [Protocol Gateway Testing Guide](./protocol-gateway.md)
- [Data Ingestion Testing Guide](./data-ingestion.md)
- [Architecture Documentation](../../docs/ARCHITECTURE.md)
