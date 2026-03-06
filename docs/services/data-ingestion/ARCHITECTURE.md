# Data Ingestion Service — Architecture

## Overview

The Data Ingestion Service is a high-throughput Go pipeline that subscribes to
MQTT topics (published by the Protocol Gateway), parses incoming data points,
batches them for efficiency, and bulk-writes them to TimescaleDB using the
PostgreSQL COPY protocol.

The service is **stateless** — all persistent state lives in EMQX (message
queues) and TimescaleDB (time-series storage). This makes it horizontally
scalable via Kubernetes or `docker-compose --scale`.

---

## Why This Service Exists

TimescaleDB has no native MQTT ingestion. The alternatives:

| Approach | Tradeoff |
|----------|----------|
| **EMQX Enterprise Data Integration** | Ties to paid EMQX Enterprise. Config lives in broker, not repo. No custom parsing, no circuit breaker, no backpressure metrics. |
| **Telegraf** (`mqtt_consumer` → `postgresql`) | Generic tool — no UNS-aware parsing, no OPC UA quality codes, limited batching. Needs custom parser plugin anyway. |
| **This service** | Full control over the entire pipeline. |

**The value this service provides:**
- **Schema-aware parsing** — understands the Protocol Gateway's compact JSON format (`v`, `q`, `ts`, `source_ts`), OPC UA quality codes, timestamp validation with skew detection
- **Production resilience** — circuit breaker prevents DB connection exhaustion, retry with exponential backoff, backpressure with drop counting, graceful shutdown that flushes in-flight data
- **Observability** — 13 Prometheus metrics purpose-built for ingestion monitoring (lag, buffer pressure, drops, breaker state), plus PrometheusRule alerts
- **COPY protocol** — 10-50x faster than row-by-row INSERT, which Telegraf and most generic bridges don't use
- **Object pooling** — `sync.Pool` for DataPoints and Batches eliminates per-message GC pressure at high throughput

---

## High-Level Data Flow

```
                         ┌──────────────────────────────────────────────┐
                         │            EMQX MQTT Broker                  │
                         │                                              │
                         │  $share/ingestion/dev/#                      │
                         │  $share/ingestion/uns/#                      │
                         └──────────────┬───────────────────────────────┘
                                        │  MQTT QoS 1 (at-least-once)
                                        │  Shared subscriptions load-
                                        │  balance across instances
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DATA INGESTION SERVICE                               │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  MQTT Subscriber (Paho v1)                                          │    │
│  │                                                                     │    │
│  │  • Single Paho client connection to EMQX                            │    │
│  │  • Auto-reconnect with exponential backoff                          │    │
│  │  • Resubscribes on reconnection                                     │    │
│  │  • onMessage callback → IngestionService.handleMessage()            │    │
│  └──────────────────────────────┬──────────────────────────────────────┘    │
│                                 │                                           │
│                                 │  handleMessage():                         │
│                                 │  1. Check shutdownFlag (fast reject)      │
│                                 │  2. ParsePayload (JSON → DataPoint)       │
│                                 │  3. Non-blocking send to pointsChan       │
│                                 │  4. If full → increment drop counter      │
│                                 ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  pointsChan (buffered channel)                         [200,000]    │    │
│  │                                                                     │    │
│  │  Backpressure buffer between MQTT callbacks and the batcher.        │    │
│  │  Non-blocking sends mean MQTT callbacks never block — if the        │    │
│  │  channel is full, points are dropped and counted.                   │    │
│  └──────────────────────────────┬──────────────────────────────────────┘    │
│                                 │                                           │
│                                 ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Batcher (Accumulator Loop)                                         │    │
│  │                                                                     │    │
│  │  Single goroutine reads from pointsChan:                            │    │
│  │                                                                     │    │
│  │  ┌─── select ───────────────────────────────────────────────────┐   │    │
│  │  │  case dp := <-pointsChan:                                    │   │    │
│  │  │      append to currentBatch                                  │   │    │
│  │  │      if len(currentBatch) >= BatchSize → flush()             │   │    │
│  │  │                                                              │   │    │
│  │  │  case <-ticker.C:  (every FlushInterval)                     │   │    │
│  │  │      if currentBatch not empty → flush()                     │   │    │
│  │  └──────────────────────────────────────────────────────────────┘   │    │
│  │                                                                     │    │
│  │  flush() swaps currentBatch with a fresh one from sync.Pool         │    │
│  │  and sends the full batch to batchChan.                             │    │
│  └──────────────────────────────┬──────────────────────────────────────┘    │
│                                 │                                           │
│                                 ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  batchChan (buffered channel)                     [WriterCount×2]   │    │
│  │                                                                     │    │
│  │  Decouples accumulation from writing. If writers are slow,          │    │
│  │  batches queue here before backpressure reaches the accumulator.    │    │
│  └─────────┬───────┬───────┬───────┬───────┬───────┬───────┬──────┬────┘    │
│            │       │       │       │       │       │       │      │         │
│            ▼       ▼       ▼       ▼       ▼       ▼       ▼      ▼         │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  Writer Workers (N = WriterCount, default 8)                     │       │
│  │                                                                  │       │
│  │  Each worker:                                                    │       │
│  │  1. Reads batch from batchChan                                   │       │
│  │  2. Calls WriteBatch() → circuit breaker → writeBatchWithRetry() │       │
│  │  3. Returns batch to sync.Pool                                   │       │
│  │                                                                  │       │
│  │  Writer 0  Writer 1  Writer 2  Writer 3                          │       │
│  │  Writer 4  Writer 5  Writer 6  Writer 7                          │       │
│  │     │         │         │         │                              │       │
│  │     └─────────┴─────────┴─────────┘                              │       │
│  │                    │                                             │       │
│  └────────────────────┼─────────────────────────────────────────────┘       │
│                       │                                                     │
└───────────────────────┼─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TimescaleDB Writer                                 │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Circuit Breaker (sony/gobreaker)                                   │    │
│  │                                                                     │    │
│  │  • 5 consecutive failures → OPEN (reject all writes for 10s)        │    │
│  │  • After 10s → HALF-OPEN (allow 2 test batches)                     │    │
│  │  • Test batches succeed → CLOSED (resume normal operation)          │    │
│  │  • State changes emitted as Prometheus gauge                        │    │
│  └──────────────────────────────┬──────────────────────────────────────┘    │
│                                 │                                           │
│  ┌──────────────────────────────┴──────────────────────────────────────┐    │
│  │  Retry Loop (exponential backoff)                                   │    │
│  │                                                                     │    │
│  │  attempt 0: immediate                                               │    │
│  │  attempt 1: RetryDelay × 1     (100ms)                              │    │
│  │  attempt 2: RetryDelay × 2     (200ms)                              │    │
│  │  attempt 3: RetryDelay × 4     (400ms, capped at 5s)                │    │
│  │                                                                     │    │
│  │  Only retries transient errors:                                     │    │
│  │  • PG SQLSTATE 08 (connection), 40 (serialization), 53, 57          │    │
│  │  • Non-PG: connection refused/reset, timeout, broken pipe           │    │
│  └──────────────────────────────┬──────────────────────────────────────┘    │
│                                 │                                           │
│  ┌──────────────────────────────┴──────────────────────────────────────┐    │
│  │  COPY Protocol (pgx.CopyFrom)                                       │    │
│  │                                                                     │    │
│  │  INSERT INTO metrics (time, topic, value, value_str, quality,       │    │
│  │                        metadata)                                    │    │
│  │  FROM STDIN WITH (FORMAT binary)                                    │    │
│  │                                                                     │    │
│  │  • 10-50x faster than individual INSERTs                            │    │
│  │  • Metadata JSON built inline (no map allocation per point)         │    │
│  │  • Fallback: pgx.Batch multi-INSERT if COPY disabled                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  pgxpool.Pool (default 20 connections, configurable)                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            TimescaleDB                                      │
│                                                                             │
│  Table: metrics (hypertable, partitioned by time)                           │
│  ┌──────────┬────────┬────────┬───────────┬─────────┬──────────┐            │
│  │ time     │ topic  │ value  │ value_str │ quality │ metadata │            │
│  │ TIMESTZ  │ TEXT   │ FLOAT8 │ TEXT      │ INT2    │ JSONB    │            │
│  └──────────┴────────┴────────┴───────────┴─────────┴──────────┘            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## HTTP Servers

The service runs two HTTP servers on separate ports for security isolation:

```
Port 8080 (Public — exposed to K8s kubelet)     Port 8081 (Internal — cluster only)
┌─────────────────────────────────────────┐     ┌──────────────────────────────────┐
│  GET /health       Full health check    │     │  GET /metrics    Prometheus      │
│  GET /health/live  Liveness (200 always)│     │  GET /status     JSON pipeline   │
│  GET /health/ready Readiness (DB+MQTT)  │     │  GET /debug/pprof/ (if enabled)  │
└─────────────────────────────────────────┘     └──────────────────────────────────┘
```

**K8s probe mapping:**
- `livenessProbe` → `/health/live` (process-alive only, no DB ping)
- `readinessProbe` → `/health/ready` (checks MQTT + DB connectivity)
- `startupProbe` → `/health` (full check, tolerates slow startup)

Both servers have graceful shutdown — in-flight Prometheus scrapes and health
checks complete before the process exits.

---

## MQTT Resilience

The Paho client handles all connection failures autonomously:

```
Paho client disconnects (broker restart, network blip, etc.)
        │
        ▼
onConnectionLost() fires
  → isConnected = false
  → readinessProbe /health/ready returns 503
  → metrics: mqtt_reconnects_total++ (on reconnect)
        │
        ▼
Paho auto-reconnect (built-in)
  → Retries every 5s (configurable ReconnectDelay)
  → No manual intervention or pod restart needed
        │
        ▼
onConnect() fires
  → isConnected = true
  → Resubscribes to all topics automatically
  → readinessProbe returns 200 again
```

**During the disconnect window:**
- Messages queue in EMQX (because `clean_session: false` = persistent session)
- EMQX holds messages up to its session expiry (default: 2h)
- On reconnect, queued messages are delivered — **zero data loss** for short outages
- The buffer (200k points) absorbs the burst of redelivered messages

**Liveness probe (`/health/live`) always returns 200** — the process is alive,
just disconnected. K8s does NOT restart the pod for MQTT disconnections. Only
an actual process crash triggers a restart.

---

## Message Format (MQTT → DataPoint)

The Protocol Gateway publishes JSON messages with compact field names:

```json
{
  "v": 23.5,              // value (float64, string, or bool)
  "q": "good",            // quality: "good", "bad", "uncertain"
  "u": "°C",              // unit (optional)
  "ts": 1709712000000,    // timestamp (unix milliseconds)
  "source_ts": 1709712000000,  // device timestamp (optional)
  "device_id": "plc-001",
  "tag_id": "temperature"
}
```

Parsing pipeline in `domain.ParsePayload()`:
1. Size guards: payload ≤ 64KB, topic ≤ 1024 chars
2. JSON unmarshal via `goccy/go-json` (fastest Go JSON library)
3. Value type coercion: `float64` → `*float64`, `string` → `*string`, `bool` → `0.0/1.0`
4. Timestamp validation: not >1h in future, not >30d in past
5. Quality string → OPC UA quality code (192=good, 0=bad, 64=uncertain)
6. DataPoint acquired from `sync.Pool` to minimize GC pressure

---

## Object Pooling

High-throughput ingestion generates millions of short-lived objects. Two pools
reduce GC pressure:

```
dataPointPool (sync.Pool)          batchPool (sync.Pool)
┌─────────────────────┐            ┌─────────────────────────────┐
│  Acquire() in       │            │  AcquireBatchWithCap(10000) │
│  ParsePayload()     │            │  in accumulator             │
│                     │            │                             │
│  Release() in       │            │  ReleaseBatch() in          │
│  ReleaseBatch()     │            │  writerLoop after write     │
│  (per-point clear)  │            │  (returns all DataPoints)   │
└─────────────────────┘            └─────────────────────────────┘
```

---

## Graceful Shutdown Sequence

```
SIGINT/SIGTERM received
        │
        ▼
1. cancel() — cancels root context
        │
        ▼
2. shutdownFlag.Store(true) — handleMessage() rejects new points
        │
        ▼
3. subscriber.Disconnect() — stops MQTT message delivery
        │
        ▼
4. sleep(100ms) — drain in-flight Paho callbacks
        │
        ▼
5. close(pointsChan) — signals accumulator to exit
        │
        ▼
6. Accumulator flushes currentBatch → close(batchChan)
        │
        ▼
7. Writers drain batchChan → write remaining batches to DB
        │
        ▼
8. batcher.wg.Wait() — all goroutines exited
        │
        ▼
9. server.Shutdown() + internalServer.Shutdown()
        │
        ▼
10. dbWriter.Close() (deferred) — closes connection pool
```

The shutdown has a 30-second timeout. Writers use `context.Background()` so
in-flight DB writes complete even after the root context is cancelled.

---

## Backpressure & Data Loss Protection

```
                    Normal                    Backpressure              Overload
                    ──────                    ────────────              ────────
pointsChan:         [····░░░░░░░░░░]          [████████░░░░]           [████████████]
                     20% full                  70% full                 100% full

Behavior:           Points flow through       Batches queue up         Points DROPPED
                    immediately               in batchChan             (counted in metrics)

Metrics:            buffer_usage: 0.2         buffer_usage: 0.7        points_dropped++
                                              batch_queue_depth: 3+    buffer_usage: 1.0

HPA response:                                 Scales up (buffer_usage  Scales up (drop rate
                                              target: 0.6)            target: >0)

Alert:                                        IngestionBufferHigh      IngestionDataLoss
                                              (warning, >80%)          (critical)
```

Drop reporting is rate-limited: accumulated drop counts are logged every 5s
instead of per-message to avoid log flooding under sustained backpressure.

---

## Horizontal Scaling

```
                    EMQX Broker
                         │
          $share/ingestion/uns/#
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │ Pod 1    │   │ Pod 2    │   │ Pod 3    │
    │ Client:  │   │ Client:  │   │ Client:  │
    │ data-    │   │ data-    │   │ data-    │
    │ ingestion│   │ ingestion│   │ ingestion│
    │ -abc123  │   │ -def456  │   │ -ghi789  │
    └────┬─────┘   └────┬─────┘   └────┬─────┘
         │              │              │
         └──────────────┼──────────────┘
                        ▼
                   TimescaleDB
```

- **MQTT shared subscriptions** (`$share/ingestion/...`) ensure each message is
  delivered to exactly one pod. EMQX handles the load balancing.
- **Client IDs** are set from `metadata.name` (K8s pod name) to avoid
  broker-side collisions.
- Each instance is independent — no inter-pod coordination needed.
- `clean_session: false` ensures messages queued during pod restart are
  redelivered.

### Scaling Strategy

Horizontal scaling via K8s is the preferred approach for increasing throughput.
Each pod handles ~35-50k msg/s with tuned config. Scaling is linear:

| Pods | Throughput | Notes |
|------|-----------|-------|
| 2 (min) | ~70-100k msg/s | Default minReplicas |
| 4 | ~140-200k msg/s | Typical production |
| 8 (max) | ~280-400k msg/s | HPA maxReplicas |

**HPA scales on ingestion-specific metrics** (not just CPU):
- `data_ingestion_buffer_usage` > 0.6 → scale up (leads CPU by seconds)
- `data_ingestion_points_dropped_rate` > 0 → scale up (active data loss)
- CPU > 75% → scale up (fallback if custom metrics unavailable)

Scale-down is conservative (300s stabilization, 1 pod per 120s) to avoid
flapping during bursty workloads.

---

## Prometheus Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `data_ingestion_points_received_total` | Counter | Total points received from MQTT |
| `data_ingestion_points_dropped_total` | Counter | Points dropped due to full buffer |
| `data_ingestion_points_written_total` | Counter | Points written to TimescaleDB |
| `data_ingestion_parse_errors_total` | Counter | JSON parse failures |
| `data_ingestion_write_errors_total` | Counter | DB write failures (after retries) |
| `data_ingestion_batches_flushed_total` | Counter | Batches sent to writers |
| `data_ingestion_write_retries_total` | Counter | DB write retry attempts |
| `data_ingestion_mqtt_reconnects_total` | Counter | MQTT reconnection events |
| `data_ingestion_batch_duration_seconds` | Histogram | Batch write latency |
| `data_ingestion_buffer_usage` | Gauge | Buffer fill ratio (0.0–1.0) |
| `data_ingestion_lag_seconds` | Gauge | Time from receive to write |
| `data_ingestion_batch_queue_depth` | Gauge | Batches queued for writing |
| `data_ingestion_circuit_breaker_state` | Gauge | 0=closed, 1=half-open, 2=open |

### Alerting Rules (PrometheusRule)

| Alert | Severity | Condition |
|-------|----------|-----------|
| IngestionCircuitBreakerOpen | critical | Breaker open >1m |
| IngestionDataLoss | critical | Drop rate >0 for 2m |
| IngestionWriteErrors | warning | Write error rate >0.1/s for 5m |
| IngestionBufferHigh | warning | Buffer usage >80% for 2m |
| IngestionLagHigh | warning | Lag >30s for 5m |
| IngestionMQTTDisconnected | warning | >3 reconnects in 10m |

---

## Configuration Defaults

| Parameter | Default | Description |
|-----------|---------|-------------|
| `ingestion.buffer_size` | 200,000 | pointsChan capacity (~5s at 40k/s) |
| `ingestion.batch_size` | 10,000 | Points per COPY batch |
| `ingestion.flush_interval` | 250ms | Max time before partial flush |
| `ingestion.writer_count` | 8 | Parallel DB writer goroutines |
| `ingestion.use_copy_protocol` | true | COPY vs INSERT batching |
| `ingestion.max_retries` | 3 | Retry attempts per batch |
| `ingestion.retry_delay` | 100ms | Base backoff (exponential) |
| `ingestion.write_timeout` | 30s | Per-batch DB deadline |
| `database.pool_size` | 20 | pgx connection pool size |
| `mqtt.qos` | 1 | At-least-once delivery |
| `mqtt.clean_session` | false | Persistent MQTT session |

---

## Project Structure

```
services/data-ingestion/
├── cmd/ingestion/
│   └── main.go                    # Entrypoint, wiring, HTTP servers, shutdown
├── internal/
│   ├── adapter/
│   │   ├── config/
│   │   │   └── config.go          # YAML + env var config loading
│   │   ├── mqtt/
│   │   │   └── subscriber.go      # Paho MQTT client, subscribe, reconnect
│   │   └── timescaledb/
│   │       └── writer.go          # pgx COPY/INSERT, circuit breaker, retry
│   ├── domain/
│   │   ├── datapoint.go           # DataPoint, Batch, ParsePayload, sync.Pool
│   │   └── ports.go               # MQTTSubscriber + BatchWriter interfaces
│   ├── health/
│   │   └── checker.go             # /health, /health/live, /health/ready
│   ├── metrics/
│   │   └── registry.go            # Prometheus counter/gauge/histogram defs
│   └── service/
│       ├── ingestion.go           # Pipeline orchestration, handleMessage
│       └── batcher.go             # Accumulator loop, flush, writer workers
├── pkg/logging/
│   └── logger.go                  # zerolog wrapper
├── config/
│   └── config.yaml                # Default configuration
├── testing/
│   ├── benchmark/                 # Benchmarks
│   ├── fixtures/                  # Test config files
│   ├── mocks/                     # Interface mocks
│   ├── testutil/                  # Test helpers
│   └── unit/                      # Unit tests by package
├── Dockerfile                     # Multi-stage build (alpine)
├── docker-compose.yaml            # Production compose
└── docker-compose.dev.yaml        # Dev compose with EMQX + TimescaleDB
```
