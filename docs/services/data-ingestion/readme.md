# Data Ingestion Service

A high-throughput, production-ready data ingestion service written in Go. Subscribes to MQTT topics and persists time-series data to TimescaleDB using optimized batch writes.

## Features

- **High Throughput**: 200,000+ data points per second using PostgreSQL COPY protocol
- **Horizontal Scaling**: MQTT shared subscriptions for load balancing across instances
- **Fault Tolerant**: Backpressure buffering, graceful shutdown, persistent MQTT sessions
- **Production Ready**: Health checks, Prometheus metrics, structured logging
- **Efficient**: 4 parallel writers, 5000-point batches, minimal memory footprint

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA INGESTION SERVICE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    MQTT SUBSCRIBER                                  │    │
│  │                                                                     │    │
│  │   Subscribe: $share/ingestion/dev/#     ← Shared subscription!      │    │
│  │              $share/ingestion/uns/#                                 │    │
│  │                                                                     │    │
│  │   • Connects to EMQX with QoS 1                                     │    │
│  │   • Uses shared subscriptions for load balancing                    │    │
│  │   • Parses JSON payload (DataPoint format)                          │    │
│  │   • Pushes to internal channel (non-blocking)                       │    │
│  │                                                                     │    │
│  └────────────────────────────┬────────────────────────────────────────┘    │
│                               │                                             │
│                               ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    BATCH ACCUMULATOR                                │    │
│  │                                                                     │    │
│  │   ┌──────────────────────────────────────────────────────────────┐  │    │
│  │   │  Buffered Channel (capacity: 50,000 points)                  │  │    │
│  │   │                                                              │  │    │
│  │   │  Provides backpressure buffer for traffic spikes             │  │    │
│  │   │  ~1.25 seconds of buffer at 40K points/sec                   │  │    │
│  │   │                                                              │  │    │
│  │   └──────────────────────────────────────────────────────────────┘  │    │
│  │                               │                                     │    │
│  │   Flush triggers:             ▼                                     │    │
│  │   • 5,000 points accumulated                                        │    │
│  │   • 100ms timeout                                                   │    │
│  │   • Graceful shutdown                                               │    │
│  │                                                                     │    │
│  └───────────────────────────────┬─────────────────────────────────────┘    │
│                                  │                                          │
│                                  ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    PARALLEL WRITERS (4x)                            │    │
│  │                                                                     │    │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │    │
│  │   │  Writer 1   │  │  Writer 2   │  │  Writer 3   │  │  Writer 4 │  │    │
│  │   │             │  │             │  │             │  │           │  │    │
│  │   │ COPY proto  │  │ COPY proto  │  │ COPY proto  │  │ COPY proto│  │    │
│  │   │ 5000 rows   │  │ 5000 rows   │  │ 5000 rows   │  │ 5000 rows │  │    │
│  │   │ ~10ms       │  │ ~10ms       │  │ ~10ms       │  │ ~10ms     │  │    │
│  │   └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │    │
│  │                                                                     │    │
│  └───────────────────────────────┬─────────────────────────────────────┘    │
│                                  │                                          │
│                                  ▼                                          │
│                      ┌─────────────────────┐                                │
│                      │    TIMESCALEDB      │                                │
│                      │                     │                                │
│                      │  pgxpool (10 conns) │                                │
│                      │  COPY protocol      │                                │
│                      │  metrics hypertable │                                │
│                      └─────────────────────┘                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Go 1.21 or later
- Docker & Docker Compose
- Protocol Gateway running (for data source)

### Running with Docker Compose

```bash
# Navigate to the service directory
cd services/data-ingestion

# Start all services (TimescaleDB, EMQX, Data Ingestion)
make dev

# Or manually:
docker-compose -f docker-compose.dev.yaml up -d

# View logs
make docker-logs
```

### Running Locally

```bash
# Download dependencies
make deps

# Build
make build

# Run (requires MQTT and TimescaleDB running)
make run
```

## Project Structure

```
services/data-ingestion/
├── cmd/
│   └── ingestion/
│       └── main.go               # Application entry point
├── config/
│   └── config.yaml               # Service configuration
├── internal/
│   ├── adapter/                  # External service adapters
│   │   ├── config/
│   │   │   └── config.go         # Configuration loading
│   │   ├── mqtt/
│   │   │   └── subscriber.go     # MQTT subscription handling
│   │   └── timescaledb/
│   │       └── writer.go         # Database batch writer
│   ├── domain/                   # Core business entities
│   │   └── datapoint.go          # DataPoint model & parsing
│   ├── service/                  # Business logic
│   │   ├── ingestion.go          # Ingestion orchestration
│   │   └── batcher.go            # Batch accumulation
│   ├── health/
│   │   └── checker.go            # Health check endpoints
│   └── metrics/
│       └── registry.go           # Prometheus metrics
├── pkg/
│   └── logging/
│       └── logger.go             # Structured logging
├── Dockerfile
├── docker-compose.dev.yaml
├── Makefile
└── init-user.sql                 # Database user setup
```

## Data Flow

### End-to-End Pipeline

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Industrial    │     │    Protocol     │     │      EMQX       │     │ Data Ingestion  │
│    Devices      │────>│    Gateway      │────>│     Broker      │────>│    Service      │
│   (PLCs, etc)   │     │                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                                                 │
                                                                                 ▼
                                                                        ┌─────────────────┐
                                                                        │   TimescaleDB   │
                                                                        │                 │
                                                                        │ metrics table   │
                                                                        │ + aggregates    │
                                                                        └─────────────────┘
```

### Message Format

The service expects JSON messages from the Protocol Gateway:

```json
{
  "value": 75.5,
  "quality": 192,
  "unit": "°C",
  "timestamp": "2024-01-15T10:30:00.123Z",
  "device_id": "plc-001",
  "tag_id": "temperature"
}
```

### Database Schema

Data is written to the `metrics` hypertable:

```sql
CREATE TABLE metrics (
    time        TIMESTAMPTZ NOT NULL,
    topic       TEXT NOT NULL,
    value       DOUBLE PRECISION,
    value_str   TEXT,
    quality     SMALLINT DEFAULT 192,
    metadata    JSONB DEFAULT '{}'::jsonb
);
```

## Scaling

### Horizontal Scaling with Shared Subscriptions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SHARED SUBSCRIPTION LOAD BALANCING                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Topic: $share/ingestion/dev/#                                              │
│         ^^^^^^^^^^^^^^^^                                                    │
│         Group name - EMQX load balances within group                        │
│                                                                             │
│                        ┌─────────────────┐                                  │
│                        │   EMQX Broker   │                                  │
│                        │                 │                                  │
│                        │  Distributes    │                                  │
│                        │  messages       │                                  │
│                        └────────┬────────┘                                  │
│                                 │                                           │
│           ┌─────────────────────┼─────────────────────┐                     │
│           │                     │                     │                     │
│           ▼                     ▼                     ▼                     │
│   ┌───────────────┐     ┌───────────────┐     ┌───────────────┐             │
│   │  Instance 1   │     │  Instance 2   │     │  Instance 3   │             │
│   │               │     │               │     │               │             │
│   │  Messages:    │     │  Messages:    │     │  Messages:    │             │
│   │  A, D, G, ... │     │  B, E, H, ... │     │  C, F, I, ... │             │
│   └───────┬───────┘     └───────┬───────┘     └───────┬───────┘             │
│           │                     │                     │                     │
│           └─────────────────────┴─────────────────────┘                     │
│                                 │                                           │
│                                 ▼                                           │
│                        ┌─────────────────┐                                  │
│                        │   TimescaleDB   │                                  │
│                        │   (shared)      │                                  │
│                        └─────────────────┘                                  │
│                                                                             │
│  Each message is processed by exactly ONE instance - no duplicates!         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Capacity Planning

| Data Points/Second | Recommended Instances | Notes |
|--------------------|----------------------|-------|
| 0 - 50,000 | 1 | Single instance with headroom |
| 50,000 - 150,000 | 2 | Shared subscriptions load balance |
| 150,000 - 300,000 | 3 | Linear scaling |
| 300,000+ | 4+ | Add instances as needed |

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: data-ingestion
spec:
  replicas: 2  # Multiple instances for redundancy
  selector:
    matchLabels:
      app: data-ingestion
  template:
    spec:
      containers:
        - name: ingestion
          image: nexus/data-ingestion:latest
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health/live
              port: 8080
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 8080
```

## Monitoring

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Full health status |
| `GET /health/live` | Kubernetes liveness probe |
| `GET /health/ready` | Kubernetes readiness probe |
| `GET /status` | Detailed ingestion statistics |
| `GET /metrics` | Prometheus metrics |

### Prometheus Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `data_ingestion_points_received_total` | Counter | Points received from MQTT |
| `data_ingestion_points_written_total` | Counter | Points written to database |
| `data_ingestion_points_dropped_total` | Counter | Points dropped (buffer full) |
| `data_ingestion_batches_flushed_total` | Counter | Batches flushed |
| `data_ingestion_batch_duration_seconds` | Histogram | Batch write duration |
| `data_ingestion_parse_errors_total` | Counter | Message parse errors |
| `data_ingestion_write_errors_total` | Counter | Database write errors |

### Status Response

```bash
curl http://localhost:8081/status | jq .
```

```json
{
  "service": "data-ingestion",
  "uptime": "2h15m30s",
  "ingestion": {
    "points_received": 1500000,
    "points_dropped": 0,
    "buffer_size": 50000,
    "buffer_used": 1234,
    "buffer_utilization": 2.47
  },
  "mqtt": {
    "connected": true,
    "broker": "tcp://emqx:1883",
    "messages_received": 1500000
  },
  "database": {
    "batches_written": 300,
    "points_written": 1500000,
    "avg_write_time_ms": 8.5,
    "pool_total_conns": 10,
    "pool_idle_conns": 6
  },
  "batcher": {
    "batches_flushed": 300,
    "current_batch_size": 2500,
    "pending_batches": 1
  }
}
```

## Configuration

### Configuration File (`config/config.yaml`)

```yaml
service:
  name: data-ingestion
  environment: production

http:
  port: 8080
  read_timeout: 10s
  write_timeout: 10s

mqtt:
  broker_url: tcp://emqx:1883
  client_id: data-ingestion-1
  topics:
    - "$share/ingestion/dev/#"
    - "$share/ingestion/uns/#"
  qos: 1
  clean_session: false     # Persistent session

database:
  host: timescaledb
  port: 5432
  database: nexus_historian
  user: nexus_ingestion
  password: ${DB_PASSWORD}
  pool_size: 10

ingestion:
  buffer_size: 50000       # Points in memory buffer
  batch_size: 5000         # Points per database write
  flush_interval: 100ms    # Max time between flushes
  writer_count: 4          # Parallel writer goroutines
  use_copy_protocol: true  # COPY vs INSERT

logging:
  level: info
  format: json
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `INGESTION_HTTP_PORT` | HTTP server port | `8080` |
| `INGESTION_MQTT_BROKER_URL` | MQTT broker URL | `tcp://localhost:1883` |
| `INGESTION_MQTT_CLIENT_ID` | MQTT client ID | `data-ingestion-{hostname}` |
| `INGESTION_MQTT_TOPICS` | Topics (comma-separated) | `$share/ingestion/dev/#,...` |
| `MQTT_USERNAME` | MQTT username | (none) |
| `MQTT_PASSWORD` | MQTT password | (none) |
| `INGESTION_DB_HOST` | TimescaleDB host | `localhost` |
| `INGESTION_DB_PORT` | TimescaleDB port | `5432` |
| `INGESTION_DB_NAME` | Database name | `nexus_historian` |
| `INGESTION_DB_USER` | Database user | `nexus_ingestion` |
| `INGESTION_DB_PASSWORD` | Database password | (none) |
| `INGESTION_LOGGING_LEVEL` | Log level | `info` |

## Performance Tuning

### Why COPY Protocol?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COPY vs INSERT Performance                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Standard INSERT (5000 rows):                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • SQL parsing for each statement                                   │    │
│  │  • Text conversion for all values                                   │    │
│  │  • Protocol overhead per row                                        │    │
│  │  • Time: ~50ms                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  COPY Protocol (5000 rows):                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • Single statement, streamed data                                  │    │
│  │  • Binary format (no text conversion)                               │    │
│  │  • Minimal protocol overhead                                        │    │
│  │  • Time: ~5-10ms (5-10x faster!)                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tuning Parameters

| Parameter | Low Latency | High Throughput | Balanced (Default) |
|-----------|-------------|-----------------|-------------------|
| `batch_size` | 100 | 10000 | 5000 |
| `flush_interval` | 10ms | 500ms | 100ms |
| `buffer_size` | 10000 | 100000 | 50000 |
| `writer_count` | 2 | 8 | 4 |

## Troubleshooting

### MQTT Connection Issues

```bash
# Check EMQX is running
docker-compose -f docker-compose.dev.yaml ps emqx

# Check EMQX logs
docker-compose -f docker-compose.dev.yaml logs emqx

# Test MQTT connectivity
docker run -it --rm --network=nexus-network \
  eclipse-mosquitto mosquitto_sub -h emqx -t "dev/#" -v
```

### Database Connection Issues

```bash
# Check TimescaleDB is running
docker-compose -f docker-compose.dev.yaml ps timescaledb

# Connect to database
docker-compose -f docker-compose.dev.yaml exec timescaledb \
  psql -U postgres -d nexus_historian

# Check metrics table
SELECT count(*) FROM metrics;
```

### Buffer Full (Points Dropped)

If you see "Buffer full, dropping data point" warnings:

1. **Increase buffer size**: `buffer_size: 100000`
2. **Add more writers**: `writer_count: 8`
3. **Scale horizontally**: Add more instances with shared subscriptions

### High Latency

If batch write times are high:

1. **Check database load**: `SELECT * FROM pg_stat_activity;`
2. **Verify COPY protocol**: `use_copy_protocol: true`
3. **Increase pool size**: `pool_size: 20`

## Development

### Building

```bash
# Build binary
make build

# Run tests
make test

# Run with race detector
make run-race

# Format code
make fmt

# Run linter
make lint
```

### Testing Data Flow

```bash
# Start development environment
make dev

# Publish test message to MQTT
docker run -it --rm --network=nexus-network \
  eclipse-mosquitto mosquitto_pub -h emqx \
  -t "dev/test-device/temperature" \
  -m '{"value": 25.5, "quality": 192, "timestamp": "2024-01-15T10:30:00Z"}'

# Check if data was written
docker-compose -f docker-compose.dev.yaml exec timescaledb \
  psql -U postgres -d nexus_historian -c "SELECT * FROM metrics ORDER BY time DESC LIMIT 5;"
```

## License

MIT License - See [LICENSE](../../LICENSE) for details.

## Related Documentation

- [Architecture Overview](../../docs/ARCHITECTURE.md)
- [Questions & Decisions](../../docs/QUESTIONS.md)
- [Protocol Gateway](../protocol-gateway/readme.md)
- [TimescaleDB Schema](../../config/timescaledb/init.sql)

