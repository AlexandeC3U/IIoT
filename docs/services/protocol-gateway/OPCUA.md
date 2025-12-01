# OPC UA Protocol Adapter

> Production-grade OPC UA client implementation with bidirectional communication, subscriptions, and comprehensive error handling.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Files Created](#files-created)
4. [Bidirectional Communication Flow](#bidirectional-communication-flow)
5. [Configuration](#configuration)
6. [Usage Examples](#usage-examples)
7. [Comparison: Polling vs Subscriptions](#comparison-polling-vs-subscriptions)
8. [Security](#security)
9. [Error Handling](#error-handling)
10. [Metrics & Monitoring](#metrics--monitoring)

---

## Overview

The OPC UA adapter provides a complete implementation for communicating with OPC UA servers in industrial environments. Unlike Modbus (which uses polling), OPC UA supports **Report-by-Exception** via subscriptions, where the server pushes data changes to the client.

### Key Features

| Feature | Description |
|---------|-------------|
| **Bidirectional** | Full read/write support for OPC UA nodes |
| **Subscriptions** | Server-side subscriptions for efficient data change notifications |
| **Security** | Supports None, Basic128Rsa15, Basic256, Basic256Sha256 |
| **Authentication** | Anonymous, Username/Password, Certificate |
| **Connection Pool** | Efficient connection management with circuit breaker |
| **Node Caching** | Parsed NodeIDs are cached for performance |
| **Scaling/Offset** | Automatic value transformation |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OPC UA ADAPTER ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────┐      │
│  │                         CONNECTION POOL                           │      │
│  │  ┌─────────────────────────────────────────────────────────────┐  │      │
│  │  │  Circuit Breaker (gobreaker)                                │  │      │
│  │  │  • Prevents cascade failures                                │  │      │
│  │  │  • Auto-recovery on server restore                          │  │      │
│  │  └─────────────────────────────────────────────────────────────┘  │      │
│  │                                                                   │      │
│  │  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐            │      │
│  │  │ OPC UA Client │ │ OPC UA Client │ │ OPC UA Client │            │      │
│  │  │ (Server 1)    │ │ (Server 2)    │ │ (Server N)    │            │      │
│  │  └───────┬───────┘ └───────┬───────┘ └───────┬───────┘            │      │
│  │          │                 │                 │                    │      │
│  │          ▼                 ▼                 ▼                    │      │
│  │  ┌───────────────────────────────────────────────────────────┐    │      │
│  │  │              SUBSCRIPTION MANAGER                         │    │      │
│  │  │  • Creates OPC UA subscriptions                           │    │      │
│  │  │  • Manages monitored items                                │    │      │
│  │  │  • Handles data change notifications                      │    │      │
│  │  │  • Supports deadband filtering                            │    │      │
│  │  └───────────────────────────────────────────────────────────┘    │      │
│  └───────────────────────────────────────────────────────────────────┘      │
│                                      │                                      │
│                                      ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────┐      │
│  │                      COMMAND HANDLER                              │      │
│  │                                                                   │      │
│  │  MQTT Subscribe: $nexus/cmd/+/+/set                               │      │
│  │  ─────────────────────────────────                                │      │
│  │  • Receives write commands from MQTT                              │      │
│  │  • Validates tag writability                                      │      │
│  │  • Routes to appropriate protocol driver                          │      │
│  │  • Publishes response on: $nexus/cmd/response/{device}/{tag}      │      │
│  │                                                                   │      │
│  └───────────────────────────────────────────────────────────────────┘      │
│                                      │                                      │
│                                      ▼                                      │
│                              ┌───────────────┐                              │
│                              │  EMQX Broker  │                              │
│                              └───────────────┘                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Files Created

### 1. `internal/adapter/opcua/client.go`

**Purpose:** Core OPC UA client with read/write operations.

| Component | Description |
|-----------|-------------|
| `Client` struct | Manages connection to a single OPC UA server |
| `ClientConfig` | Configuration (endpoint, security, auth, timeouts) |
| `ClientStats` | Performance metrics (reads, writes, errors) |
| `Connect()` | Establishes secure connection to server |
| `Disconnect()` | Gracefully closes connection |
| `ReadTag()` | Reads a single node value |
| `ReadTags()` | Batch reads multiple nodes |
| `WriteTag()` | **Writes a value to a node** |
| `WriteTags()` | **Batch writes multiple values** |

**Key Features:**
- **Node ID Caching**: Parsed NodeIDs are cached to avoid repeated parsing
- **Automatic Reconnection**: Detects connection loss and attempts reconnect
- **Retry Logic**: Exponential backoff on transient failures
- **Value Conversion**: Automatic type conversion between Go and OPC UA types
- **Scaling Support**: Applies scale factor and offset, with reverse scaling for writes

```go
// Example: Reading and writing a tag
client, _ := opcua.NewClient(deviceID, config, logger)
client.Connect(ctx)

// Read
dataPoint, _ := client.ReadTag(ctx, tag)
fmt.Printf("Value: %v\n", dataPoint.Value)

// Write
err := client.WriteTag(ctx, tag, 75.5)
```

### 2. `internal/adapter/opcua/pool.go`

**Purpose:** Connection pool with circuit breaker for multiple OPC UA servers.

| Component | Description |
|-----------|-------------|
| `ConnectionPool` | Manages pool of OPC UA clients |
| `PoolConfig` | Pool configuration (max connections, timeouts) |
| `GetClient()` | Retrieves or creates a client for a device |
| `ReadTags()` | Reads through circuit breaker |
| `WriteTag()` | **Writes through circuit breaker** |
| `WriteTags()` | **Batch writes through circuit breaker** |
| `healthCheckLoop()` | Background health monitoring |
| `idleReaperLoop()` | Cleans up idle connections |

**Key Features:**
- **Circuit Breaker**: Prevents cascade failures when servers are down
- **Health Checks**: Periodic connection health verification
- **Idle Connection Reaping**: Closes unused connections to free resources
- **Max Connection Limit**: Prevents resource exhaustion

```go
// Pool configuration
poolConfig := opcua.PoolConfig{
    MaxConnections:    50,
    IdleTimeout:       5 * time.Minute,
    HealthCheckPeriod: 30 * time.Second,
    ConnectionTimeout: 15 * time.Second,
}

pool := opcua.NewConnectionPool(poolConfig, logger, metricsRegistry)

// Write through pool (with circuit breaker protection)
err := pool.WriteTag(ctx, device, tag, value)
```

### 3. `internal/adapter/opcua/subscription.go`

**Purpose:** OPC UA subscription management for real-time data notifications.

| Component | Description |
|-----------|-------------|
| `SubscriptionManager` | Manages subscriptions for all devices |
| `Subscription` | Single subscription with monitored items |
| `SubscriptionConfig` | Subscription parameters (intervals, deadband) |
| `Subscribe()` | Creates subscription for a device |
| `Unsubscribe()` | Removes subscription |
| `DataHandler` | Callback for data change notifications |

**Key Features:**
- **Report-by-Exception**: Server pushes changes instead of client polling
- **Deadband Filtering**: Reduces traffic by filtering small value changes
- **Monitored Item Mapping**: Maps OPC UA items to domain tags
- **Last Value Cache**: Stores most recent values per tag

```go
// Create subscription with deadband
config := opcua.SubscriptionConfig{
    PublishInterval:  1 * time.Second,
    SamplingInterval: 500 * time.Millisecond,
    QueueSize:        10,
    DeadbandType:     "Absolute",
    DeadbandValue:    0.5,
}

manager.Subscribe(device, tags, config)
```

### 4. `internal/service/command_handler.go`

**Purpose:** Handles write commands received via MQTT for all protocols.

| Component | Description |
|-----------|-------------|
| `CommandHandler` | Subscribes to MQTT command topics |
| `WriteCommand` | Incoming write request structure |
| `WriteResponse` | Outgoing response structure |
| `ProtocolWriter` | Interface for protocol-specific writes |

**MQTT Topics:**
- **Subscribe**: `$nexus/cmd/+/write` (JSON payload)
- **Subscribe**: `$nexus/cmd/+/+/set` (simple value)
- **Publish**: `$nexus/cmd/response/{device}/{tag}` (response)

```json
// Write command (JSON)
{
    "request_id": "abc123",
    "tag_id": "temperature",
    "value": 75.5
}

// Response
{
    "request_id": "abc123",
    "device_id": "plc-001",
    "tag_id": "temperature",
    "success": true,
    "timestamp": "2024-01-15T10:30:00Z",
    "duration_ms": 45
}
```

---

## Bidirectional Communication Flow

### Read Flow (OPC UA Subscriptions)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         READ FLOW (SUBSCRIPTIONS)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   1. Gateway creates subscription on OPC UA server                          │
│      ┌───────────────────────────────────────────────────────────────┐      │
│      │  SubscriptionManager.Subscribe(device, tags, config)          │      │
│      │  → Creates OPC UA subscription                                │      │
│      │  → Adds monitored items for each tag                          │      │
│      │  → Sets deadband filter (optional)                            │      │
│      └───────────────────────────────────────────────────────────────┘      │
│                                      │                                      │
│   2. Server pushes data changes                                             │
│      ┌───────────────────────────────────────────────────────────────┐      │
│      │  OPC UA Server ───[notification]───> SubscriptionManager      │      │
│      │  • Only when value changes (Report-by-Exception)              │      │
│      │  • Filtered by deadband                                       │      │
│      └───────────────────────────────────────────────────────────────┘      │
│                                      │                                      │
│   3. Gateway publishes to MQTT                                              │
│      ┌───────────────────────────────────────────────────────────────┐      │
│      │  DataHandler(dataPoint) ───> MQTT Publisher                   │      │
│      │  Topic: plant/line/device/temperature                         │      │
│      │  Payload: {"value": 75.5, "quality": "good", ...}             │      │
│      └───────────────────────────────────────────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Write Flow (MQTT Commands)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WRITE FLOW (MQTT COMMANDS)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   1. Application publishes write command                                    │
│      ┌───────────────────────────────────────────────────────────────┐      │
│      │  Frontend/API ───[MQTT]───> $nexus/cmd/plc-001/setpoint/set   │      │
│      │  Payload: 75.5                                                │      │
│      └───────────────────────────────────────────────────────────────┘      │
│                                      │                                      │
│   2. Command Handler receives and validates                                 │
│      ┌───────────────────────────────────────────────────────────────┐      │
│      │  CommandHandler.handleTagWriteCommand(msg)                    │      │
│      │  • Parse device ID and tag ID from topic                      │      │
│      │  • Find device in registry                                    │      │
│      │  • Find tag and check IsWritable()                            │      │
│      │  • Route to protocol-specific writer                          │      │
│      └───────────────────────────────────────────────────────────────┘      │
│                                      │                                      │
│   3. OPC UA Client writes to server                                         │
│      ┌───────────────────────────────────────────────────────────────┐      │
│      │  opcuaPool.WriteTag(ctx, device, tag, value)                  │      │
│      │  → Parse NodeID                                               │      │
│      │  → Convert value to OPC UA Variant                            │      │
│      │  → Reverse scaling (if configured)                            │      │
│      │  → Send WriteRequest                                          │      │
│      └───────────────────────────────────────────────────────────────┘      │
│                                      │                                      │
│   4. Response published to MQTT                                             │
│      ┌───────────────────────────────────────────────────────────────┐      │
│      │  CommandHandler ───[MQTT]───> $nexus/cmd/response/plc-001/... │      │
│      │  Payload: {"success": true, "duration_ms": 45}                │      │
│      └───────────────────────────────────────────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Configuration

### Device Configuration (YAML)

```yaml
devices:
  - id: opcua-server-001
    name: "Production OPC UA Server"
    protocol: opcua
    enabled: true
    uns_prefix: plant-a/line-1/opcua-001
    poll_interval: 1s  # Fallback if not using subscriptions
    
    connection:
      host: 192.168.1.50
      port: 4840
      opc_endpoint_url: "opc.tcp://192.168.1.50:4840"
      opc_security_policy: "Basic256Sha256"
      opc_security_mode: "SignAndEncrypt"
      opc_auth_mode: "UserName"
      opc_username: "operator"
      opc_password: "${OPC_PASSWORD}"
      opc_publish_interval: 1s
      opc_sampling_interval: 500ms
      timeout: 10s
      retry_count: 3
      retry_delay: 500ms
    
    tags:
      - id: temperature
        name: "Reactor Temperature"
        opc_node_id: "ns=2;s=Reactor.Temperature"
        data_type: float32
        access_mode: readwrite  # Allows both read and write
        scale_factor: 1.0
        offset: 0.0
        unit: "°C"
        topic_suffix: temperature
        deadband_type: absolute
        deadband_value: 0.5
        enabled: true
      
      - id: setpoint
        name: "Temperature Setpoint"
        opc_node_id: "ns=2;i=1234"
        data_type: float32
        access_mode: readwrite
        unit: "°C"
        topic_suffix: setpoint
        enabled: true
      
      - id: status
        name: "Reactor Status"
        opc_node_id: "ns=2;s=Reactor.Status"
        data_type: uint16
        access_mode: read  # Read-only
        topic_suffix: status
        enabled: true
```

### Node ID Formats

| Format | Example | Description |
|--------|---------|-------------|
| Numeric | `ns=2;i=1234` | Namespace 2, numeric ID 1234 |
| String | `ns=2;s=Temperature` | Namespace 2, string ID "Temperature" |
| GUID | `ns=2;g=...` | Namespace 2, GUID ID |
| Opaque | `ns=2;b=...` | Namespace 2, byte string ID |

### Security Policies

| Policy | Description |
|--------|-------------|
| `None` | No security (development only) |
| `Basic128Rsa15` | Legacy encryption |
| `Basic256` | Standard encryption |
| `Basic256Sha256` | **Recommended** for production |

### Security Modes

| Mode | Description |
|------|-------------|
| `None` | No signing or encryption |
| `Sign` | Messages signed but not encrypted |
| `SignAndEncrypt` | **Recommended** - Full security |

---

## Usage Examples

### 1. Single Tag Read

```go
client, _ := opcua.NewClient("device-001", clientConfig, logger)
client.Connect(ctx)
defer client.Disconnect()

tag := &domain.Tag{
    ID:        "temperature",
    OPCNodeID: "ns=2;s=Temperature",
    DataType:  domain.DataTypeFloat32,
}

dataPoint, err := client.ReadTag(ctx, tag)
if err != nil {
    log.Error().Err(err).Msg("Read failed")
    return
}

fmt.Printf("Value: %v, Quality: %s\n", dataPoint.Value, dataPoint.Quality)
```

### 2. Batch Read

```go
tags := []*domain.Tag{
    {ID: "temp", OPCNodeID: "ns=2;s=Temperature"},
    {ID: "pressure", OPCNodeID: "ns=2;s=Pressure"},
    {ID: "flow", OPCNodeID: "ns=2;s=FlowRate"},
}

dataPoints, err := client.ReadTags(ctx, tags)
for _, dp := range dataPoints {
    fmt.Printf("%s = %v\n", dp.TagID, dp.Value)
}
```

### 3. Write Tag

```go
tag := &domain.Tag{
    ID:          "setpoint",
    OPCNodeID:   "ns=2;s=Setpoint",
    DataType:    domain.DataTypeFloat32,
    AccessMode:  domain.AccessModeReadWrite,
    ScaleFactor: 1.0,
}

err := client.WriteTag(ctx, tag, 75.5)
if err != nil {
    log.Error().Err(err).Msg("Write failed")
}
```

### 4. Subscription (Report-by-Exception)

```go
// Create subscription manager
manager, _ := opcua.NewSubscriptionManager(client, func(dp *domain.DataPoint) {
    // Called on every data change
    mqttPublisher.Publish(ctx, dp)
}, logger)

// Subscribe to device tags
config := opcua.SubscriptionConfig{
    PublishInterval:  time.Second,
    SamplingInterval: 500 * time.Millisecond,
    QueueSize:        10,
    DeadbandType:     "Absolute",
    DeadbandValue:    0.5,
}

manager.Subscribe(device, tags, config)
```

### 5. MQTT Write Command

```bash
# Simple value write
mosquitto_pub -t '$nexus/cmd/opcua-001/setpoint/set' -m '75.5'

# JSON command with request ID
mosquitto_pub -t '$nexus/cmd/opcua-001/write' -m '{
    "request_id": "abc123",
    "tag_id": "setpoint",
    "value": 75.5
}'

# Listen for response
mosquitto_sub -t '$nexus/cmd/response/opcua-001/#'
```

---

## Comparison: Polling vs Subscriptions

| Aspect | Polling (Modbus-style) | Subscriptions (OPC UA) |
|--------|------------------------|------------------------|
| **Initiative** | Client polls server | Server pushes to client |
| **Efficiency** | Wastes bandwidth on unchanged values | Only sends changes |
| **Latency** | Depends on poll interval | Near real-time |
| **Server Load** | Continuous requests | Lower server overhead |
| **Deadband** | Client-side only | Server-side filtering |
| **Use Case** | Modbus, simple protocols | OPC UA, advanced systems |

### Recommendation

- Use **subscriptions** for OPC UA when possible (more efficient)
- Fall back to **polling** when subscriptions are not supported or for compatibility

---

## Security

### Certificate-Based Authentication

```yaml
connection:
  opc_auth_mode: "Certificate"
  opc_cert_file: "/certs/client.crt"
  opc_key_file: "/certs/client.key"
```

### Best Practices

1. **Use Basic256Sha256** security policy in production
2. **Use SignAndEncrypt** security mode
3. **Store credentials in environment variables or secrets manager**
4. **Rotate certificates regularly**
5. **Use dedicated service accounts with minimal permissions**

---

## Error Handling

### OPC UA Specific Errors

| Error | Description | Action |
|-------|-------------|--------|
| `ErrOPCUAInvalidNodeID` | Invalid NodeID format | Check NodeID syntax |
| `ErrOPCUASubscriptionFailed` | Subscription creation failed | Check server capabilities |
| `ErrOPCUABadStatus` | Bad status code from server | Check node access rights |
| `ErrOPCUASecurityFailed` | Security negotiation failed | Check certificates/policy |
| `ErrOPCUASessionExpired` | Session timed out | Auto-reconnect triggered |
| `ErrOPCUAAccessDenied` | Insufficient permissions | Check user rights |
| `ErrOPCUAWriteNotPermitted` | Write not allowed | Node is read-only |

### Circuit Breaker States

```
┌─────────┐     5 failures     ┌────────┐     60s timeout    ┌───────────┐
│ CLOSED  │ ─────────────────> │  OPEN  │ ─────────────────> │ HALF-OPEN │
│ (Normal)│                    │(Failed)│                    │ (Testing) │
└─────────┘                    └────────┘                    └───────────┘
     ▲                                                             │
     │                         Success                             │
     └─────────────────────────────────────────────────────────────┘
```

---

## Metrics & Monitoring

### Available Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `opcua_reads_total` | Counter | Total read operations |
| `opcua_writes_total` | Counter | Total write operations |
| `opcua_errors_total` | Counter | Total errors |
| `opcua_subscriptions_active` | Gauge | Active subscription count |
| `opcua_notifications_total` | Counter | Received notifications |
| `opcua_read_duration_seconds` | Histogram | Read latency |
| `opcua_write_duration_seconds` | Histogram | Write latency |

### Health Check Endpoint

```json
GET /health

{
    "status": "healthy",
    "components": {
        "opcua_pool": {
            "status": "healthy",
            "connections": 5,
            "max_connections": 50,
            "circuit_breaker": "closed"
        }
    }
}
```

---

## Summary

The OPC UA adapter provides a complete, production-ready implementation for industrial communication with OPC UA servers. Key highlights:

✅ **Bidirectional Communication** - Full read/write support  
✅ **Subscriptions** - Efficient report-by-exception data collection  
✅ **Security** - Full OPC UA security model support  
✅ **Connection Pooling** - Efficient resource management  
✅ **Circuit Breaker** - Resilience against server failures  
✅ **MQTT Integration** - Write commands via MQTT topics  
✅ **Type Conversion** - Automatic Go ↔ OPC UA type conversion  
✅ **Scaling** - Value transformation with scale factor and offset  

---

*Document created as part of Protocol Gateway implementation. See also: [MODBUS.md](./MODBUS.md) for Modbus documentation.*

