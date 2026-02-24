# Protocol Gateway Service

A high-performance, multi-protocol industrial data gateway written in Go. Connects to industrial devices (PLCs, sensors, SCADA systems) and publishes data to MQTT using the Unified Namespace (UNS) pattern.

> **Architecture Reference**: See [PLATFORM_ARCHITECTURE.md](../../PLATFORM_ARCHITECTURE.md) for the complete system architecture and data flows.

## Features

- **Multi-Protocol Support**: Modbus TCP/RTU, OPC UA, Siemens S7
- **Bidirectional Communication**: Read from and write to devices
- **Connection Pooling**: Efficient connection management with per-device circuit breakers
- **OPC UA Subscriptions**: Push-based data delivery for high-frequency tags
- **OPC UA Address Space Browse**: Explore server nodes via REST API
- **OPC UA Certificate Management**: PKI trust store with REST API
- **REST API**: Device management, browse, test-connection endpoints
- **NTP Clock Drift Monitoring**: Detect time sync issues with industrial devices
- **Production-Ready**: Health checks, Prometheus metrics, structured logging

## Deployment Model

**⚠️ Important**: This service runs as a **StatefulSet with 1 replica** in Kubernetes. It cannot be horizontally scaled because:
- Long-lived TCP connections to industrial devices
- Multiple replicas would cause duplicate connections to PLCs
- OPC UA session limits would be exceeded
- PKI trust store requires persistent storage

This is the industry standard pattern - Kepware, Ignition, and similar gateways run as singletons.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PROTOCOL GATEWAY                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      PROTOCOL ADAPTERS                              │    │
│  │                                                                     │    │
│  │   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐               │    │
│  │   │   Modbus    │   │   OPC UA    │   │     S7      │               │    │
│  │   │   Adapter   │   │   Adapter   │   │   Adapter   │               │    │
│  │   │             │   │             │   │             │               │    │
│  │   │ ┌─────────┐ │   │ ┌─────────┐ │   │ ┌─────────┐ │               │    │
│  │   │ │ Client  │ │   │ │ Client  │ │   │ │ Client  │ │               │    │
│  │   │ │  Pool   │ │   │ │  Pool   │ │   │ │  Pool   │ │               │    │
│  │   │ └─────────┘ │   │ └─────────┘ │   │ └─────────┘ │               │    │
│  │   │ ┌─────────┐ │   │ ┌─────────┐ │   │ ┌─────────┐ │               │    │
│  │   │ │ Circuit │ │   │ │ Circuit │ │   │ │ Circuit │ │               │    │
│  │   │ │ Breaker │ │   │ │ Breaker │ │   │ │ Breaker │ │               │    │
│  │   │ └─────────┘ │   │ └─────────┘ │   │ └─────────┘ │               │    │
│  │   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘               │    │
│  │          └─────────────────┼─────────────────┘                      │    │
│  │                            │                                        │    │
│  │                   ┌────────▼────────┐                               │    │
│  │                   │ProtocolManager  │                               │    │
│  │                   │ (Router)        │                               │    │
│  │                   └────────┬────────┘                               │    │
│  │                            │                                        │    │
│  └────────────────────────────┼────────────────────────────────────────┘    │
│                               │                                             │
│  ┌────────────────────────────┼────────────────────────────────────────┐    │
│  │                    CORE SERVICES                                    │    │
│  │                            │                                        │    │
│  │   ┌────────────────────────┼───────────────────────┐                │    │
│  │   │                        │                       │                │    │
│  │   ▼                        ▼                       ▼                │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │    │
│  │   │PollingService│  │CommandHandler│  │HealthChecker │              │    │
│  │   │              │  │              │  │              │              │    │
│  │   │• Worker pool │  │• MQTT sub    │  │• Liveness    │              │    │
│  │   │• Batch reads │  │• Write route │  │• Readiness   │              │    │
│  │   │• Publish data│  │• Response pub│  │• Pool health │              │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘              │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                               │                                             │
│                               ▼                                             │
│                      ┌────────────────┐                                     │
│                      │ MQTT Publisher │                                     │
│                      │                │                                     │
│                      │ • QoS handling │                                     │
│                      │ • Batching     │                                     │
│                      │ • Reconnection │                                     │
│                      └───────┬────────┘                                     │
│                              │                                              │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │
                               ▼
                      ┌────────────────┐
                      │  EMQX Broker   │
                      │                │
                      │  UNS Topics:   │
                      │  plant/line/   │
                      │  device/tag    │
                      └────────────────┘
```

## Quick Start

### Prerequisites

- Go 1.21 or later
- Docker & Docker Compose
- Access to industrial devices (or simulators for testing)

### Running Locally

```bash
# Clone and navigate
cd services/protocol-gateway

# Start EMQX broker and gateway
docker-compose up -d

# View logs
docker-compose logs -f gateway
```

### Configuration

Edit `config/devices.yaml` to add your devices:

```yaml
devices:
  - id: plc-001
    name: "Production Line PLC"
    protocol: modbus-tcp
    enabled: true
    uns_prefix: plant-a/line-1/plc-001
    poll_interval: 1s
    connection:
      host: 192.168.1.100
      port: 502
      slave_id: 1
      timeout: 5s
    tags:
      - id: temperature
        name: "Motor Temperature"
        address: 40001
        register_type: holding_register
        data_type: float32
        scale_factor: 0.1
        unit: "°C"
        topic_suffix: motor/temperature
        access_mode: readwrite
        enabled: true
```

## Project Structure

```
services/protocol-gateway/
├── cmd/
│   └── gateway/
│       └── main.go              # Application entry point
├── config/
│   ├── config.yaml              # Service configuration
│   └── devices.yaml             # Device definitions
├── internal/
│   ├── adapter/                 # Protocol adapters
│   │   ├── modbus/
│   │   │   ├── client.go        # Modbus client implementation
│   │   │   └── pool.go          # Connection pool
│   │   ├── opcua/
│   │   │   ├── client.go        # OPC UA client
│   │   │   ├── pool.go          # Connection pool
│   │   │   └── subscription.go  # OPC UA subscriptions
│   │   ├── s7/
│   │   │   ├── client.go        # Siemens S7 client
│   │   │   └── pool.go          # Connection pool
│   │   ├── mqtt/
│   │   │   └── publisher.go     # MQTT publishing
│   │   └── config/
│   │       ├── config.go        # Configuration loading
│   │       └── devices.go       # Device config parsing
│   ├── domain/                  # Core business entities
│   │   ├── device.go            # Device model
│   │   ├── tag.go               # Tag model
│   │   ├── datapoint.go         # Data point model
│   │   ├── protocol.go          # Protocol manager
│   │   └── errors.go            # Domain errors
│   ├── service/                 # Business logic
│   │   ├── polling.go           # Polling orchestration
│   │   └── command_handler.go   # Write command handling
│   ├── health/
│   │   └── checker.go           # Health check service
│   └── metrics/
│       └── registry.go          # Prometheus metrics
├── pkg/
│   └── logging/
│       └── logger.go            # Structured logging
├── Dockerfile
├── docker-compose.yaml
├── go.mod
└── go.sum
```

## Supported Protocols

### Modbus TCP/RTU

| Feature | Status |
|---------|--------|
| Read Coils | ✅ |
| Read Discrete Inputs | ✅ |
| Read Holding Registers | ✅ |
| Read Input Registers | ✅ |
| Write Single Coil | ✅ |
| Write Multiple Registers | ✅ |
| Byte Ordering (all modes) | ✅ |
| Scaling & Offset | ✅ |

**Documentation**: [docs/services/protocol-gateway/MODBUS.md](../../docs/services/protocol-gateway/MODBUS.md)

### OPC UA

| Feature | Status |
|---------|--------|
| Read Nodes | ✅ |
| Write Nodes | ✅ |
| Node ID Caching | ✅ |
| Security Policies | ✅ |
| Authentication (Anon/User/Cert) | ✅ |
| Subscriptions (Report-by-Exception) | ✅ |
| Address Space Browse | ✅ |
| PKI Trust Store | ✅ |
| Clock Drift Detection | ✅ |

**Documentation**: [docs/services/protocol-gateway/OPCUA.md](../../docs/services/protocol-gateway/OPCUA.md)

### Siemens S7

| Feature | Status |
|---------|--------|
| S7-200 Smart | ✅ |
| S7-300/400 | ✅ |
| S7-1200/1500 | ✅ |
| Data Blocks (DB) | ✅ |
| Merkers (M) | ✅ |
| Inputs (I) / Outputs (Q) | ✅ |
| All Data Types | ✅ |
| Read Operations | ✅ |
| Write Operations | ✅ |

**Documentation**: [docs/services/protocol-gateway/S7.md](../../docs/services/protocol-gateway/S7.md)

## Data Flow

### Read Flow (Polling)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Device    │    │  Protocol   │    │  Polling    │    │    MQTT     │
│   (PLC)     │◄──►│   Pool      │◄──►│  Service    │───►│  Publisher  │
└─────────────┘    └─────────────┘    └─────────────┘    └──────┬──────┘
                                                                │
                                                                ▼
                                                        ┌─────────────┐
                                                        │    EMQX     │
                                                        │   Broker    │
                                                        └─────────────┘
```

1. **PollingService** triggers poll based on device's `poll_interval`
2. **ProtocolManager** routes request to appropriate protocol pool
3. **Protocol Pool** uses circuit breaker to execute read
4. **Client** reads tags from device
5. Values are normalized (scaling, units, quality)
6. **MQTT Publisher** publishes to UNS topic

### Write Flow (Commands)

```
                   ┌─────────────┐
                   │    EMQX     │
                   │   Broker    │
                   └──────┬──────┘
                          │ Subscribe: $nexus/cmd/+/+/set
                          ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Device    │◄───│  Protocol   │◄───│  Command    │◄───│   Client    │
│   (PLC)     │    │   Pool      │    │  Handler    │    │   App       │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                              │
                                              ▼
                                      Publish response
                                      $nexus/cmd/response/...
```

**Write Command Topic**: `$nexus/cmd/{device_id}/{tag_id}/set`

**Write Command Payload** (JSON):
```json
{
  "value": 75.5,
  "request_id": "uuid-for-correlation"
}
```

**Response Topic**: `$nexus/cmd/response/{device_id}/{tag_id}`

**Response Payload**:
```json
{
  "request_id": "uuid-for-correlation",
  "success": true,
  "duration_ms": 45,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Scaling & Deployment

### Single Instance (Recommended)

A single protocol-gateway instance can handle **200+ OPC UA devices** and **500+ Modbus devices** comfortably. The bottleneck is the PLCs, not the gateway.

```yaml
# One gateway handles all devices
protocol-gateway:
  replicas: 1  # Always 1 - cannot horizontally scale
  devices: config/devices.yaml
```

### Device Sharding (Large Deployments)

For very large deployments (1000+ devices), use separate gateway instances with device partitioning:

```yaml
# Split by plant/line - each is still replicas: 1
protocol-gateway-plant-a:
  replicas: 1
  devices: config/devices-plant-a.yaml

protocol-gateway-plant-b:
  replicas: 1
  devices: config/devices-plant-b.yaml
```

### Kubernetes StatefulSet

```yaml
apiVersion: apps/v1
kind: StatefulSet  # Not Deployment!
metadata:
  name: protocol-gateway
spec:
  replicas: 1  # Must be 1 - see deployment model above
  serviceName: protocol-gateway
  template:
    spec:
      terminationGracePeriodSeconds: 35
      containers:
        - name: gateway
          image: nexus/protocol-gateway:latest
          ports:
            - containerPort: 8080
              name: http
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
          livenessProbe:
            httpGet:
              path: /health/live
              port: 8080
            periodSeconds: 15
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 8080
            periodSeconds: 10
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

## REST API

### Device Management

| Endpoint | Description |
|----------|-------------|
| `GET /api/devices` | List all configured devices |
| `GET /api/devices/{id}` | Get device by ID |
| `POST /api/devices` | Add a new device |
| `PUT /api/devices/{id}` | Update device configuration |
| `DELETE /api/devices/{id}` | Remove a device |
| `POST /api/devices/{id}/test` | Test device connection |

### OPC UA Specific

| Endpoint | Description |
|----------|-------------|
| `POST /api/browse` | Browse OPC UA address space |
| `GET /api/opcua/certificates` | List PKI trust store certificates |
| `POST /api/opcua/certificates/trust` | Trust a certificate |
| `POST /api/opcua/certificates/reject` | Reject a certificate |

### Topics & Logging

| Endpoint | Description |
|----------|-------------|
| `GET /api/topics` | List active MQTT topics |
| `GET /api/logs` | Recent log entries |

## Monitoring

### Health Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Full health status |
| `GET /health/live` | Kubernetes liveness probe |
| `GET /health/ready` | Kubernetes readiness probe |
| `GET /status` | Polling statistics |
| `GET /metrics` | Prometheus metrics |

### Prometheus Metrics

- `protocol_gateway_polls_total` - Total poll operations
- `protocol_gateway_polls_success` - Successful polls
- `protocol_gateway_polls_failed` - Failed polls
- `protocol_gateway_points_published` - Data points published
- `protocol_gateway_connections_active` - Active device connections
- `protocol_gateway_circuit_breaker_state` - Circuit breaker states

### Logging

Structured JSON logging with zerolog:

```json
{
  "level": "info",
  "component": "polling-service",
  "device_id": "plc-001",
  "tags_read": 10,
  "good_points": 10,
  "duration": "45ms",
  "message": "Poll cycle completed"
}
```

## Configuration Reference

### Service Configuration (`config/config.yaml`)

```yaml
environment: production    # development, staging, production
devices_config_path: ./config/devices.yaml

http:
  port: 8080
  read_timeout: 10s
  write_timeout: 10s
  idle_timeout: 60s

mqtt:
  broker_url: tcp://emqx:1883
  client_id: protocol-gateway
  qos: 1
  keep_alive: 30s
  connect_timeout: 10s
  reconnect_delay: 5s

modbus:
  max_connections: 100
  idle_timeout: 5m
  health_check_period: 30s
  connection_timeout: 10s
  retry_attempts: 3
  retry_delay: 100ms

opcua:
  max_connections: 50
  idle_timeout: 5m
  connection_timeout: 15s
  default_security_policy: None
  default_auth_mode: Anonymous

s7:
  max_connections: 100
  idle_timeout: 5m
  connection_timeout: 10s

polling:
  worker_count: 10
  batch_size: 50
  default_interval: 1s
  max_retries: 3
  shutdown_timeout: 30s

logging:
  level: info
  format: json
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GATEWAY_MQTT_BROKER_URL` | MQTT broker URL | `tcp://localhost:1883` |
| `GATEWAY_DEVICES_CONFIG_PATH` | Path to devices.yaml | `./config/devices.yaml` |
| `GATEWAY_LOGGING_LEVEL` | Log level | `info` |
| `GATEWAY_HTTP_PORT` | HTTP server port | `8080` |
| `MQTT_USERNAME` | MQTT username | (none) |
| `MQTT_PASSWORD` | MQTT password | (none) |

## Development

### Building

```bash
# Build binary
go build -o bin/gateway ./cmd/gateway

# Run tests
go test ./...

# Run with race detector
go run -race ./cmd/gateway
```

### Testing with Simulators

For testing without real hardware:

```bash
# Start Modbus simulator
docker run -d -p 502:502 oitc/modbus-server

# Start OPC UA simulator  
docker run -d -p 4840:4840 mcr.microsoft.com/iotedge/opc-plc

# Start S7 simulator
docker run -d -p 102:102 siemenss7plcsimulator
```

## Troubleshooting

### Connection Issues

```bash
# Check device connectivity
nc -zv 192.168.1.100 502  # Modbus
nc -zv 192.168.1.100 4840 # OPC UA
nc -zv 192.168.1.100 102  # S7

# Enable debug logging
export GATEWAY_LOGGING_LEVEL=debug
```

### Circuit Breaker Open

If you see "circuit breaker open" errors:
- Device is unreachable or timing out repeatedly
- Wait 30 seconds for automatic recovery
- Check device health and network

### Memory Usage

Monitor with:
```bash
curl http://localhost:8080/metrics | grep go_memstats
```

## License

MIT License - See [LICENSE](../../LICENSE) for details.

## Related Documentation

- [Platform Architecture (Full Diagram)](../../PLATFORM_ARCHITECTURE.md)
- [Architecture Overview](../../ARCHITECTURE.md)
- [Questions & Decisions](../../QUESTIONS.md)
- [Modbus Adapter](MODBUS.md)
- [OPC UA Adapter](OPCUA.md)
- [S7 Adapter](S7.md)
- [Protocol Gateway TODO](../../../services/protocol-gateway/TODO.md)

