# Data Ingestion Service Testing Guide

This document provides a comprehensive guide for testing the Data Ingestion Service, including startup instructions, deployment information, and detailed testing procedures.

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

Before starting the Data Ingestion service, ensure you have:
- **Docker Desktop** installed and running
- **No port conflicts** on 1883, 5432, 8081, 8082, 8083, 8084, 18083

> **Note:** The `docker-compose.dev.yaml` starts ALL dependencies (EMQX, TimescaleDB, Protocol Gateway, Modbus Simulator) automatically.

### Option A: Docker Compose (Recommended for First Test)

This starts everything you need (TimescaleDB + Data Ingestion service):

```powershell
# Navigate to the data-ingestion folder
cd services/data-ingestion

# Start the development environment
docker-compose -f docker-compose.dev.yaml up -d

# View logs (watch what's happening)
docker-compose -f docker-compose.dev.yaml logs -f data-ingestion
```

**What gets started:**

| Container | Port | Purpose |
|-----------|------|---------|
| `nexus-emqx-ingestion` | 1883, 18083 | MQTT Broker (Dashboard: http://localhost:18083) |
| `nexus-timescaledb` | 5432 | TimescaleDB (PostgreSQL with time-series extensions) |
| `nexus-data-ingestion` | 8081 | Data Ingestion Service |
| `nexus-protocol-gateway-ingestion` | 8082 | Protocol Gateway (for testing data flow) |
| `nexus-adminer-dev` | 8084 | Database Admin UI (http://localhost:8084) |
| `nexus-modbus-simulator-ingestion` | 5020 | Modbus Simulator |

### Option B: Run Locally (Native Go)

```powershell
# Navigate to the data-ingestion folder
cd services/data-ingestion

# Download dependencies
go mod download

# Build the binary
go build -o bin/data-ingestion.exe ./cmd/ingestion

# Set required environment variables
$env:INGESTION_MQTT_BROKER_URL = "tcp://localhost:1883"
$env:INGESTION_DB_HOST = "localhost"
$env:INGESTION_DB_PASSWORD = "nexus_dev"

# Run it
./bin/data-ingestion.exe
```

Or using the Makefile:

```powershell
make build
make run
```

> ⚠️ **Note:** Running locally requires EMQX and TimescaleDB to be running.

---

## 2. Production Deployment

The Data Ingestion Service is deployed as a Docker container that connects to existing infrastructure:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT ARCHITECTURE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────────┐     │
│  │ Protocol     │────>│ EMQX         │────>│ Data Ingestion           │     │
│  │ Gateway      │     │ Cluster      │     │ (multiple replicas)      │     │
│  └──────────────┘     └──────────────┘     └──────────┬───────────────┘     │
│                                                       │                     │
│                                                       ▼                     │
│                                             ┌──────────────────┐            │
│                                             │  TimescaleDB     │            │
│                                             │  (Historian)     │            │
│                                             └──────────────────┘            │
│                                                                             │
│  SCALING: MQTT Shared Subscriptions ($share/ingestion/...) distribute       │
│  messages across multiple Data Ingestion instances automatically.           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Build the production image:**

```powershell
docker build -t nexus/data-ingestion:latest .
```

---

## 3. Testing Plan

### Phase 1: Basic Startup Test ✅

| Step | What to Check | Expected Result |
|------|---------------|-----------------|
| 1 | Start with `docker-compose -f docker-compose.dev.yaml up -d` | All containers start |
| 2 | Check logs: `docker-compose -f docker-compose.dev.yaml logs data-ingestion` | No errors, shows "Data Ingestion Service started successfully" |
| 3 | Open http://localhost:8081/health | Returns `{"status":"healthy", "components":{"mqtt":"healthy","timescaledb":"healthy"}}` |
| 4 | Open http://localhost:8081/health/live | Returns 200 OK with `{"status":"alive"}` |
| 5 | Open http://localhost:8081/health/ready | Returns 200 OK with `{"status":"ready"}` |

### Phase 2: End-to-End Data Flow Test 📊

**Step-by-Step:**

| Step | Action | Details |
|------|--------|---------|
| 1 | Start everything | `docker-compose -f docker-compose.dev.yaml up -d` (Protocol Gateway is included) |
| 2 | Verify Gateway is publishing | Check EMQX Dashboard (http://localhost:18083) → Diagnose → WebSocket Client → Subscribe to `#` |
| 3 | Check ingestion status | `Invoke-RestMethod http://localhost:8081/status` |
| 4 | Query TimescaleDB | Use Adminer (http://localhost:8084) or psql |

**Verify Data in TimescaleDB:**

Using Adminer (http://localhost:8084):
- System: PostgreSQL
- Server: timescaledb
- Username: nexus_ingestion
- Password: ingestion_password
- Database: nexus_historian

Run this query:
```sql
SELECT 
    time,
    topic,
    value,
    quality,
    metadata
FROM metrics 
ORDER BY time DESC 
LIMIT 20;
```

**Expected Result:**
- Rows should appear with data from Protocol Gateway
- Topics should match pattern like `dev/simulator/plc001/test/register1`
- Values should update every poll interval

### Phase 3: Service Status Verification 📈

| Step | Endpoint | What to Check |
|------|----------|---------------|
| 1 | http://localhost:8081/status | Full JSON status with ingestion metrics |
| 2 | Check `ingestion.points_received` | Counter should increase over time |
| 3 | Check `ingestion.points_dropped` | Should be 0 under normal load |
| 4 | Check `database.batches_written` | Counter should increase |
| 5 | http://localhost:8081/metrics | Prometheus metrics endpoint |

**Sample Status Response:**
```json
{
  "service": "data-ingestion",
  "uptime": "5m30s",
  "ingestion": {
    "points_received": 1500,
    "points_dropped": 0,
    "buffer_size": 50000,
    "buffer_used": 25,
    "buffer_utilization": 0.05
  },
  "mqtt": {
    "connected": true,
    "broker": "tcp://emqx:1883",
    "messages_received": 1500
  },
  "database": {
    "batches_written": 5,
    "points_written": 1500,
    "write_errors": 0,
    "avg_write_time_ms": 12.5,
    "pool_total_conns": 10,
    "pool_idle_conns": 8
  },
  "batcher": {
    "batches_flushed": 5,
    "current_batch_size": 200,
    "pending_batches": 0
  }
}
```

### Phase 4: Metrics Test 📈

| Step | Endpoint | What to Check |
|------|----------|---------------|
| 1 | http://localhost:8081/metrics | Prometheus metrics |
| 2 | Look for `data_ingestion_points_received_total` | Receiving counter |
| 3 | Look for `data_ingestion_points_written_total` | Writing counter |
| 4 | Look for `data_ingestion_batch_duration_seconds` | Write latency histogram |

### Phase 5: Error Handling Test 🔥

| Test | How | Expected Behavior |
|------|-----|-------------------|
| Stop TimescaleDB | `docker stop nexus-timescaledb` | Service logs errors, buffers data, retries |
| Restart TimescaleDB | `docker start nexus-timescaledb` | Service reconnects, resumes writing |
| Stop EMQX | `docker stop nexus-emqx-ingestion` | Service disconnects, attempts reconnect |
| Restart EMQX | `docker start nexus-emqx-ingestion` | Service reconnects, resumes receiving |
| High load test | Generate 10K+ messages | Buffer fills, metrics show behavior |

### Phase 6: Batch Verification 📦

Verify batching is working correctly:

```sql
-- Check data rate over time
SELECT 
    time_bucket('1 minute', time) AS bucket,
    COUNT(*) as points,
    COUNT(DISTINCT topic) as unique_topics
FROM metrics 
WHERE time > NOW() - INTERVAL '10 minutes'
GROUP BY bucket
ORDER BY bucket DESC;
```

```sql
-- Check data by device
SELECT 
    metadata->>'device_id' as device,
    COUNT(*) as points,
    MIN(time) as first_seen,
    MAX(time) as last_seen
FROM metrics 
GROUP BY metadata->>'device_id';
```

### Phase 7: TimescaleDB Features Test 🗃️

**Verify Hypertable is Working:**
```sql
-- Check chunk info
SELECT chunk_name, range_start, range_end, total_bytes
FROM timescaledb_information.chunks
WHERE hypertable_name = 'metrics'
ORDER BY range_start DESC
LIMIT 5;
```

**Verify Compression (if enabled):**
```sql
-- Check compression status
SELECT 
    hypertable_name,
    total_chunks,
    compressed_chunks,
    pg_size_pretty(before_compression_total_bytes) as before,
    pg_size_pretty(after_compression_total_bytes) as after
FROM timescaledb_information.compression_settings cs
JOIN timescaledb_information.hypertables h ON cs.hypertable_name = h.hypertable_name
WHERE h.hypertable_name = 'metrics';
```

---

## Quick Start Commands Summary

```powershell
# Navigate to data-ingestion
cd services/data-ingestion

# Start everything (including Protocol Gateway for data)
docker-compose -f docker-compose.dev.yaml up -d

# Watch logs (Ctrl+C to exit)
docker-compose -f docker-compose.dev.yaml logs -f data-ingestion

# Check health
Invoke-RestMethod http://localhost:8081/health

# Check full status
Invoke-RestMethod http://localhost:8081/status

# Access database UI
# Open http://localhost:8084
# Server: timescaledb, User: nexus_ingestion, Pass: ingestion_password, DB: nexus_historian

# Query data via psql
docker exec -it nexus-timescaledb psql -U nexus_ingestion -d nexus_historian -c "SELECT * FROM metrics ORDER BY time DESC LIMIT 10;"

# Stop everything
docker-compose -f docker-compose.dev.yaml down
```

---

## Troubleshooting Quick Reference

| Problem | Check | Solution |
|---------|-------|----------|
| Service won't start | `docker logs nexus-data-ingestion` | Check error message |
| No data in database | Is Protocol Gateway running? | Check `docker ps` - it starts automatically |
| "Connection refused" to DB | Is TimescaleDB running? | `docker ps` to check |
| MQTT disconnected | Check EMQX status | Verify broker is running |
| Buffer filling up | Database slow or down | Check DB connection and performance |
| High memory usage | Large buffer/batch sizes | Tune BufferSize and BatchSize |
| Missing data | Check points_dropped metric | Increase buffer size |

### Common Database Issues

**"relation metrics does not exist":**
```powershell
# The init script didn't run, recreate the container
docker-compose -f docker-compose.dev.yaml down -v
docker-compose -f docker-compose.dev.yaml up -d
```

**"too many connections":**
- Reduce `pool_size` in config
- Check for connection leaks

**Slow writes:**
- Verify COPY protocol is enabled (`use_copy_protocol: true`)
- Increase `batch_size` (optimal: 5000)
- Add more `writer_count` workers

### Checking Logs

```powershell
# All logs
docker-compose -f docker-compose.dev.yaml logs

# Just data-ingestion
docker-compose -f docker-compose.dev.yaml logs data-ingestion

# Follow logs in real-time
docker-compose -f docker-compose.dev.yaml logs -f data-ingestion

# Last 100 lines
docker-compose -f docker-compose.dev.yaml logs --tail=100 data-ingestion
```

---

## Test Results Checklist

Use this checklist to track your testing progress:

### Phase 1: Basic Startup
- [ ] All containers started successfully
- [ ] No errors in data-ingestion logs
- [ ] `/health` endpoint returns healthy
- [ ] `/health/live` returns 200 OK
- [ ] `/health/ready` returns 200 OK

### Phase 2: End-to-End Data Flow
- [ ] Protocol Gateway is publishing to MQTT
- [ ] Data Ingestion is receiving messages
- [ ] Data appears in TimescaleDB
- [ ] Topics and values are correct
- [ ] Timestamps are accurate

### Phase 3: Service Status
- [ ] `/status` endpoint returns full metrics
- [ ] `points_received` counter increasing
- [ ] `points_dropped` is 0 or low
- [ ] `batches_written` counter increasing

### Phase 4: Metrics
- [ ] `/metrics` endpoint accessible
- [ ] Prometheus metrics present
- [ ] Histogram buckets populated

### Phase 5: Error Handling
- [ ] Service survives TimescaleDB stop
- [ ] Service reconnects after TimescaleDB restart
- [ ] Service survives EMQX stop
- [ ] Service reconnects after EMQX restart
- [ ] Retries are logged during failures

### Phase 6: Batch Verification
- [ ] Data arrives in batches (check DB logs)
- [ ] Batch sizes are as configured (5000 default)
- [ ] Flush interval is respected (100ms default)

### Phase 7: TimescaleDB Features
- [ ] Hypertable is created
- [ ] Chunks are being created
- [ ] (Optional) Compression is working

---

## Performance Benchmarks

Expected performance under optimal conditions:

| Metric | Target | Notes |
|--------|--------|-------|
| Throughput | 200K+ points/sec | With COPY protocol |
| Latency (p99) | < 50ms | Batch write time |
| Memory usage | ~100MB | Base service |
| CPU usage | < 10% | Per core, at 10K pts/sec |

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

