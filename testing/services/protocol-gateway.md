# Protocol Gateway V2 Testing Guide

This document provides a comprehensive guide for testing the Protocol Gateway V2 service, including startup instructions, deployment information, and detailed testing procedures.

> **Note:** Protocol Gateway V2 includes enhanced features: OPC UA subscriptions, address space browse, PKI trust store management, and NTP clock drift detection.

---

## Table of Contents

1. [How to Start the Gateway](#1-how-to-start-the-gateway)
2. [Production Deployment](#2-production-deployment)
3. [Testing Plan](#3-testing-plan)
4. [Quick Start Commands](#quick-start-commands-summary)
5. [Troubleshooting](#troubleshooting-quick-reference)

---

## 1. How to Start the Gateway

### Option A: Docker Compose (Recommended for First Test)

This is the **easiest** way - it starts everything you need (EMQX broker + OPC UA simulator + Gateway + Prometheus + Grafana):

```powershell
# Navigate to the protocol-gateway folder
cd services/protocol-gateway

# Start the development environment
docker-compose up -d

# View logs (watch what's happening)
docker-compose logs -f
```

**What gets started:**

| Container | Port | Purpose |
|-----------|------|---------|
| `protocol-gateway-emqx` | 1884, 18083 | MQTT Broker (Dashboard: http://localhost:18083) |
| `nexus-opcua-sim` | 4840 | OPC UA Simulator |
| `protocol-gateway` | 8080 | Protocol Gateway (API, health, metrics) |
| `protocol-gateway-prometheus` | 9090 | Prometheus (metrics collection) |
| `protocol-gateway-grafana` | 3000 | Grafana (dashboards) |

### Option B: Run Locally (Native Go)

```powershell
# Navigate to the protocol-gateway folder
cd services/protocol-gateway

# Download dependencies
go mod download

# Build the binary
go build -o bin/protocol-gateway.exe ./cmd/gateway

# Run it (you need EMQX running first!)
./bin/protocol-gateway.exe
```

Or using the Makefile (if you have `make` installed):

```powershell
make build
make run
```

> ⚠️ **Note:** Running locally requires EMQX to be running. Easiest way:
> ```powershell
> docker run -d --name emqx -p 1883:1883 -p 18083:18083 emqx/emqx:5.4.0
> ```

---

## 2. Production Deployment

Yes! This will be a **Docker image** that you deploy:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT OPTIONS                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  DEVELOPMENT (what you'll do now):                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  docker-compose.dev.yaml                                            │    │
│  │                                                                     │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │    │
│  │  │ EMQX Broker  │  │ Modbus Sim   │  │ Protocol Gateway         │   │    │
│  │  │ (included)   │  │ (included)   │  │ (your code)              │   │    │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  PRODUCTION (later):                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Kubernetes / Docker Swarm / ECS                                    │    │
│  │                                                                     │    │
│  │  ┌──────────────┐     ┌──────────────────────────────────────────┐  │    │
│  │  │ EMQX Cluster │────>│ Protocol Gateway (multiple replicas)     │  │    │
│  │  │ (managed)    │     │                                          │  │    │
│  │  └──────────────┘     └──────────────────────────────────────────┘  │    │
│  │                                    │                                │    │
│  │                                    v                                │    │
│  │                       Real PLCs / Devices                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Build the production image:**

```powershell
docker build -t nexus/protocol-gateway:latest .
```

The Dockerfile creates a minimal ~20MB Alpine Linux image with just the binary.

---

## 3. Testing Plan

### Phase 1: Basic Startup Test ✅

| Step | What to Check | Expected Result |
|------|---------------|-----------------|
| 1 | Start with `docker-compose -f docker-compose.dev.yaml up -d` | All containers start |
| 2 | Check logs: `docker-compose -f docker-compose.dev.yaml logs gateway` | No errors, shows "Protocol Gateway started successfully" |
| 3 | Open http://localhost:8080/health | Returns `{"status":"healthy"}` |
| 4 | Open http://localhost:8080/health/live | Returns 200 OK |
| 5 | Open http://localhost:8080/health/ready | Returns 200 OK |

### Phase 2: MQTT Data Flow Test 📊

**Recommended: EMQX Dashboard WebSocket Client**

The built-in EMQX WebSocket client is the most reliable way to view messages:

| Step | What to Check | How |
|------|---------------|-----|
| 1 | Open EMQX Dashboard | http://localhost:18083 |
| 2 | Login | Username: `admin`, Password: `admin123` |
| 3 | Navigate to WebSocket Client | Menu: "Diagnose" → "WebSocket Client" |
| 4 | Click "Connect" | Should show "Connected" |
| 5 | Subscribe to topics | Topic: `dev/#`, then click "Subscribe" |
| 6 | Watch for messages | Messages appear in the panel below |

> ⚠️ **Topic Format:** Topics are `{uns_prefix}/{topic_suffix}` (e.g., `dev/simulator/plc001/test/register1`)
> 
> Subscribe to `dev/#` to see all messages from the dev environment.

**Alternative: Local MQTT Explorer (Desktop App)**

| Step | What to Check | How |
|------|---------------|-----|
| 1 | Download & Install | http://mqtt-explorer.com |
| 2 | Connect to broker | Host: `localhost`, Port: `1883` |
| 3 | Topics auto-populate | Should see `dev/simulator/plc001/...` tree |
| 4 | Check message format | JSON with `v`, `u`, `q`, `ts` fields |

> 💡 **Tip:** EMQX Dashboard WebSocket Client is recommended as it's built into the broker and always works.

**Expected MQTT message format (compact):**

```json
{
  "v": 0,
  "u": "units",
  "q": "good",
  "ts": 1733165430000
}
```

| Field | Meaning |
|-------|---------|
| `v` | Value |
| `u` | Unit |
| `q` | Quality (good, bad, uncertain) |
| `ts` | Timestamp (Unix milliseconds) |

**Topic format:** `{uns_prefix}/{topic_suffix}`
Example: `dev/simulator/plc001/test/register1`

### Phase 3: EMQX Dashboard Verification 🖥️

| Step | What to Check | Expected |
|------|---------------|----------|
| 1 | Open http://localhost:18083 | EMQX Dashboard login |
| 2 | Login with `admin` / `admin123` | Dashboard loads |
| 3 | Go to "Clients" | See `protocol-gateway-dev` connected |
| 4 | Go to "Topics" → "Metrics" | See message rates |

### Phase 4: Metrics Test 📈

| Step | Endpoint | What to Check |
|------|----------|---------------|
| 1 | http://localhost:8080/metrics | Prometheus metrics |
| 2 | Look for `protocol_gateway_polls_total` | Polling counter |
| 3 | Look for `protocol_gateway_points_published_total` | Publishing counter |
| 4 | http://localhost:8080/status | JSON status summary |

### Phase 5: Error Handling Test 🔥

| Test | How | Expected Behavior |
|------|-----|-------------------|
| Stop Modbus simulator | `docker stop nexus-modbus-sim` | Gateway logs errors, continues running |
| Restart simulator | `docker start nexus-modbus-sim` | Gateway reconnects, resumes polling |
| Stop EMQX | `docker stop nexus-emqx-dev` | Gateway buffers messages, logs errors |
| Restart EMQX | `docker start nexus-emqx-dev` | Gateway reconnects, resumes publishing |

### Phase 6: Write Command Test (Bidirectional) ✍️

Test writing values back to the Modbus simulator using EMQX Dashboard WebSocket Client:

**Step-by-Step:**

| Step | Action | Details |
|------|--------|---------|
| 1 | Open EMQX Dashboard | http://localhost:18083 |
| 2 | Login | `admin` / `admin123` |
| 3 | Go to WebSocket Client | Menu: "Diagnose" → "WebSocket Client" |
| 4 | Click "Connect" | Wait for "Connected" status |
| 5 | Subscribe to responses | Topic: `$nexus/cmd/response/#`, click "Subscribe" |
| 6 | Publish write command | See below |
| 7 | Check response | Should see success message in subscriptions |
| 8 | Verify value changed | Subscribe to `dev/#` and check the tag value |

**Write Command (Method 1 - JSON):**

| Field | Value |
|-------|-------|
| **Topic** | `$nexus/cmd/modbus-simulator-001/write` |
| **Payload** | `{"tag_id": "test_register_1", "value": 42}` |

**Write Command (Method 2 - Simple):**

| Field | Value |
|-------|-------|
| **Topic** | `$nexus/cmd/modbus-simulator-001/test_register_1/set` |
| **Payload** | `42` |

**Expected Response** (on `$nexus/cmd/response/modbus-simulator-001/test_register_1`):

```json
{
  "request_id": "",
  "device_id": "modbus-simulator-001",
  "tag_id": "test_register_1",
  "success": true,
  "timestamp": "2025-12-02T21:30:00Z",
  "duration_ms": 5000000
}
```

**Topic Reference:**

| Purpose | Topic Pattern | Example |
|---------|---------------|---------|
| JSON write | `$nexus/cmd/{device_id}/write` | `$nexus/cmd/modbus-simulator-001/write` |
| Simple write | `$nexus/cmd/{device_id}/{tag_id}/set` | `$nexus/cmd/modbus-simulator-001/test_register_1/set` |
| Response | `$nexus/cmd/response/{device_id}/{tag_id}` | `$nexus/cmd/response/modbus-simulator-001/test_register_1` |

> ⚠️ **Note:** Tags must have `access_mode: readwrite` in `devices-dev.yaml` to be writable. Input registers are read-only by Modbus protocol.

---

## Quick Start Commands Summary

```powershell
# Navigate to protocol-gateway
cd services/protocol-gateway

# Start everything
docker-compose up -d

# Watch logs (Ctrl+C to exit)
docker-compose logs -f

# Check health
Invoke-RestMethod http://localhost:8080/health

# View API (device management, browse, etc.)
# Open http://localhost:8080/api/devices

# View metrics
# Open http://localhost:8080/metrics

# View Grafana dashboards
# Open http://localhost:3000 (admin/admin)

# View EMQX dashboard & MQTT messages
# Open http://localhost:18083 (admin/public)
# Go to: Diagnose → WebSocket Client → Connect → Subscribe to uns/#

# Stop everything
docker-compose down
```

---

## Troubleshooting Quick Reference

| Problem | Check | Solution |
|---------|-------|----------|
| Gateway won't start | `docker logs nexus-protocol-gateway-dev` | Check error message |
| No MQTT messages | Wrong topic? | Subscribe to `dev/#` not `uns/#` |
| "Connection refused" | Is EMQX running? | `docker ps` to check |
| Build fails | Missing dependencies? | `go mod download` |
| EMQX high CPU (600%+) | Many messages/sec | Normal under load, see note below |
| "authorization_permission_denied" | ACL blocking `#` | Subscribe to `dev/#` instead |
| Write command fails | Tag not writable? | Check `access_mode: readwrite` in devices-dev.yaml |

### EMQX High CPU Usage

EMQX may show high CPU usage (e.g., 600%) during testing. This is because:
- The gateway publishes 6 messages per second (6 tags × 1 poll/sec)
- EMQX runs multiple Erlang schedulers (shows as high % on multi-core)
- 600% = using 6 CPU cores, which is normal for Erlang/BEAM VM

**To reduce CPU for testing:**
1. Increase poll interval in `devices-dev.yaml` (e.g., `poll_interval: 5s`)
2. Reduce number of tags being polled
3. This is not an issue in production with proper resource allocation

---

## Test Results Checklist

Use this checklist to track your testing progress:

### Phase 1: Basic Startup
- [ ] All containers started successfully
- [ ] No errors in gateway logs
- [ ] `/health` endpoint returns healthy
- [ ] `/health/live` returns 200 OK
- [ ] `/health/ready` returns 200 OK

### Phase 2: MQTT Data Flow
- [ ] EMQX WebSocket Client connected
- [ ] Subscribed to `dev/#` topic
- [ ] Messages appearing (e.g., `dev/simulator/plc001/test/register1`)
- [ ] Message format is correct JSON (`v`, `u`, `q`, `ts`)
- [ ] Values updating at poll interval (every 5 seconds)

### Phase 3: EMQX Dashboard
- [ ] Dashboard accessible
- [ ] Protocol Gateway client visible
- [ ] Message metrics showing activity

### Phase 4: Metrics
- [ ] `/metrics` endpoint accessible
- [ ] Prometheus metrics present
- [ ] `/status` returns JSON summary

### Phase 5: Error Handling
- [ ] Gateway survives Modbus simulator stop
- [ ] Gateway reconnects after simulator restart
- [ ] Gateway survives EMQX stop
- [ ] Gateway reconnects after EMQX restart

### Phase 6: Write Commands
- [ ] Subscribed to `$nexus/cmd/response/#` for responses
- [ ] Write command published to `$nexus/cmd/modbus-simulator-001/write`
- [ ] Response received with `"success": true`
- [ ] Value changed on `dev/simulator/plc001/test/register1` topic

---

## Notes

_Add your testing notes, observations, and issues here:_

```
Date: _______________
Tester: _______________

Notes:
-
-
-
```

