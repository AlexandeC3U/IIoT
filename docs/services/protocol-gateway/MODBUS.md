# Protocol Gateway Service - Complete Documentation

This document provides a comprehensive overview of all files created for the Protocol Gateway service, a production-grade Go implementation for industrial protocol translation.

---

## 📁 Project Structure Overview

```
services/protocol-gateway/
├── cmd/
│   └── gateway/
│       └── main.go                 # Application entry point
├── internal/
│   ├── adapter/
│   │   ├── config/
│   │   │   ├── config.go           # Configuration management
│   │   │   └── devices.go          # Device configuration loader
│   │   ├── modbus/
│   │   │   ├── client.go           # Modbus client implementation
│   │   │   └── pool.go             # Connection pool manager
│   │   └── mqtt/
│   │       └── publisher.go        # MQTT publisher with buffering
│   ├── domain/
│   │   ├── device.go               # Device entity
│   │   ├── tag.go                  # Tag entity
│   │   ├── datapoint.go            # DataPoint entity
│   │   └── errors.go               # Domain errors
│   ├── health/
│   │   └── checker.go              # Health check system
│   ├── metrics/
│   │   └── registry.go             # Prometheus metrics
│   └── service/
│       └── polling.go              # Polling orchestration service
├── pkg/
│   └── logging/
│       └── logger.go               # Structured logging utilities
├── config/
│   ├── config.yaml                 # Main configuration file
│   ├── devices.yaml                # Production device definitions
│   └── devices-dev.yaml            # Development device definitions
├── go.mod                          # Go module definition
├── Dockerfile                      # Container build instructions
├── docker-compose.dev.yaml         # Development environment
└── Makefile                        # Build and development commands
```

---

## 📄 File-by-File Documentation

### Entry Point

#### `cmd/gateway/main.go`
**Purpose**: Application entry point and dependency injection

**What it does**:
- Initializes the structured logger
- Loads configuration from files and environment variables
- Creates and connects the MQTT publisher
- Initializes the Modbus connection pool with circuit breaker
- Starts the polling service with all registered devices
- Sets up HTTP server for health checks and Prometheus metrics
- Handles graceful shutdown on SIGINT/SIGTERM

**Key Features**:
- Graceful shutdown with 30-second timeout
- Health endpoints at `/health`, `/health/live`, `/health/ready`
- Metrics endpoint at `/metrics`

---

### Domain Layer (`internal/domain/`)

#### `device.go`
**Purpose**: Core device entity definition

**What it does**:
- Defines the `Device` struct representing an industrial device
- Contains connection configuration (host, port, slave ID, timeouts)
- Holds the list of tags to poll
- Includes UNS (Unified Namespace) prefix for MQTT topics
- Provides validation logic

**Key Types**:
- `Device` - Main device configuration
- `ConnectionConfig` - Protocol-specific connection parameters
- `DeviceStatus` - Online/Offline/Error states
- `Protocol` - Enum for modbus-tcp, modbus-rtu, opcua, s7, mqtt

---

#### `tag.go`
**Purpose**: Data point/tag definition

**What it does**:
- Defines `Tag` struct for individual data points to read
- Supports multiple register types (coil, discrete input, holding, input)
- Supports multiple data types (bool, int16, uint16, int32, float32, etc.)
- Handles byte ordering (big-endian, little-endian, word-swap, byte-swap)
- Supports scaling (scale factor + offset) and engineering units
- Implements deadband filtering (absolute/percentage)

**Key Types**:
- `Tag` - Data point configuration
- `DataType` - Value type enumeration
- `RegisterType` - Modbus register type
- `ByteOrder` - Byte ordering for multi-register values
- `DeadbandType` - Filtering mode

---

#### `datapoint.go`
**Purpose**: Runtime data point representation

**What it does**:
- Represents a single measurement read from a device
- Contains value, quality, timestamp, and metadata
- Provides compact MQTT payload serialization
- Supports Sparkplug B format (future compatibility)

**Key Types**:
- `DataPoint` - Single measurement with metadata
- `MQTTPayload` - Compact JSON format for publishing
- `Quality` - Good/Bad/Uncertain quality indicators

---

#### `errors.go`
**Purpose**: Domain-specific error definitions

**What it does**:
- Defines all error types used throughout the application
- Groups errors by category (connection, read/write, Modbus-specific, MQTT)
- Provides Modbus exception code translation
- Enables precise error handling and logging

---

### Adapters Layer (`internal/adapter/`)

#### `config/config.go`
**Purpose**: Application configuration management

**What it does**:
- Loads configuration from YAML files
- Supports environment variable overrides
- Provides sensible defaults for all settings
- Validates configuration at startup

**Configuration Sections**:
- HTTP server settings (port, timeouts)
- MQTT connection (broker URL, credentials, TLS, QoS)
- Modbus pool settings (max connections, timeouts, retries)
- Polling service settings (workers, batch size, intervals)
- Logging settings (level, format, output)

---

#### `config/devices.go`
**Purpose**: Device configuration file loader

**What it does**:
- Parses YAML device configuration files
- Converts YAML structures to domain entities
- Validates device and tag configurations
- Supports saving device configurations back to YAML

---

#### `modbus/client.go`
**Purpose**: Production-grade Modbus TCP client

**What it does**:
- Establishes TCP connections to Modbus devices
- Reads all register types (coils, discrete inputs, holding, input)
- Parses raw bytes into typed values with proper byte ordering
- Applies scaling and offset transformations
- Implements retry logic with exponential backoff
- Tracks performance statistics

**Key Features**:
- Thread-safe operations with mutex protection
- Automatic reconnection on connection loss
- Configurable timeouts and retry counts
- Support for all common byte orderings (ABCD, DCBA, BADC, CDAB)

---

#### `modbus/pool.go`
**Purpose**: Connection pool with circuit breaker

**What it does**:
- Manages a pool of Modbus client connections
- Limits concurrent connections to prevent resource exhaustion
- Implements circuit breaker pattern to prevent cascade failures
- Performs periodic health checks on all connections
- Automatically removes idle connections

**Key Features**:
- **Connection Pooling**: Reuses connections across poll cycles
- **Circuit Breaker**: Opens after 60% failure rate, auto-recovers
- **Health Checks**: Periodic connection validation
- **Idle Reaper**: Closes unused connections after timeout
- **Thread-Safe**: All operations are protected by mutexes

---

#### `mqtt/publisher.go`
**Purpose**: Reliable MQTT message publishing

**What it does**:
- Connects to MQTT broker with auto-reconnection
- Publishes data points to UNS topics
- Buffers messages when disconnected (10,000 message buffer)
- Supports TLS/SSL connections with client certificates
- Tracks publishing statistics

**Key Features**:
- **Auto-Reconnect**: Unlimited reconnection attempts
- **Message Buffering**: Queues messages during disconnection
- **Buffer Overflow Handling**: Drops oldest messages when full
- **TLS Support**: Full certificate-based authentication
- **Batch Publishing**: Efficient multi-message publishing

---

### Service Layer (`internal/service/`)

#### `polling.go`
**Purpose**: Core polling orchestration

**What it does**:
- Manages polling for all registered devices
- Uses worker pool to limit concurrent operations
- Publishes data points to MQTT with proper topics
- Tracks per-device and global statistics
- Supports dynamic device registration/unregistration

**Key Features**:
- **Worker Pool**: Configurable number of concurrent workers
- **Per-Device Polling**: Each device has its own ticker
- **Quality Tracking**: Records good/bad data points
- **Graceful Shutdown**: Waits for in-flight operations
- **Statistics**: Tracks polls, errors, points read/published

---

### Infrastructure (`internal/health/`, `internal/metrics/`, `pkg/logging/`)

#### `health/checker.go`
**Purpose**: Kubernetes-compatible health checks

**What it does**:
- Aggregates health status from all components
- Provides HTTP endpoints for health probes
- Supports liveness and readiness separation
- Caches check results for performance

**Endpoints**:
- `/health` - Full health check with all components
- `/health/live` - Liveness probe (is the process running?)
- `/health/ready` - Readiness probe (can it accept traffic?)

---

#### `metrics/registry.go`
**Purpose**: Prometheus metrics collection

**What it does**:
- Defines all application metrics
- Provides helper methods for recording events
- Exposes metrics at `/metrics` endpoint

**Metrics Categories**:
- **Connection**: Active connections, errors, latency
- **Polling**: Polls total, duration, errors, points read
- **MQTT**: Messages published, failed, buffer size, latency
- **Devices**: Registered count, online count, errors
- **System**: Goroutines, memory usage

---

#### `pkg/logging/logger.go`
**Purpose**: Structured logging utilities

**What it does**:
- Creates pre-configured zerolog loggers
- Supports JSON and console output formats
- Adds service context to all log entries
- Provides helper functions for common patterns

---

### Configuration Files

#### `config/config.yaml`
**Purpose**: Main application configuration

**Contains**:
- Environment setting (development/staging/production)
- HTTP server configuration
- MQTT broker connection details
- Modbus pool settings
- Polling service parameters
- Logging configuration

---

#### `config/devices.yaml`
**Purpose**: Production device definitions

**Contains**:
- Example Modbus TCP PLC configuration
- Multiple tag examples (temperature, pressure, flow, etc.)
- Various data types and byte orderings
- Deadband filtering examples

---

#### `config/devices-dev.yaml`
**Purpose**: Development/testing device definitions

**Contains**:
- Configuration for the Modbus simulator
- Simple test tags for verification

---

### Build & Deployment

#### `Dockerfile`
**Purpose**: Multi-stage container build

**Stages**:
1. **Builder**: Compiles Go binary with optimizations
2. **Final**: Minimal Alpine image with binary only

**Features**:
- Non-root user for security
- Health check built-in
- Optimized binary (stripped symbols)

---

#### `docker-compose.dev.yaml`
**Purpose**: Local development environment

**Services**:
- **EMQX**: MQTT broker with dashboard
- **modbus-simulator**: Test Modbus device
- **protocol-gateway**: The gateway service
- **mqtt-explorer**: Debugging UI

---

#### `Makefile`
**Purpose**: Build automation

**Commands**:
- `make build` - Compile binary
- `make test` - Run tests
- `make lint` - Code quality checks
- `make docker-build` - Build container
- `make docker-dev-up` - Start dev environment
- `make help` - Show all commands

---

#### `go.mod`
**Purpose**: Go module definition

**Key Dependencies**:
- `github.com/goburrow/modbus` - Modbus TCP/RTU library
- `github.com/eclipse/paho.mqtt.golang` - MQTT client
- `github.com/rs/zerolog` - Structured logging
- `github.com/prometheus/client_golang` - Metrics
- `github.com/sony/gobreaker` - Circuit breaker
- `github.com/spf13/viper` - Configuration management

---

## 🔄 Data Flow

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐     ┌──────────────┐
│   Modbus    │     │    Polling      │     │   Modbus    │     │    MQTT      │
│   Device    │◄────│    Service      │────►│    Pool     │────►│   Publisher  │
└─────────────┘     └─────────────────┘     └─────────────┘     └──────────────┘
                           │                       │                    │
                           ▼                       ▼                    ▼
                    ┌─────────────┐         ┌─────────────┐      ┌─────────────┐
                    │  Device     │         │  Circuit    │      │   Message   │
                    │  Registry   │         │  Breaker    │      │   Buffer    │
                    └─────────────┘         └─────────────┘      └─────────────┘
```

1. **Polling Service** triggers reads based on configured intervals
2. **Modbus Pool** manages connections and handles retries
3. **Circuit Breaker** prevents cascade failures
4. **MQTT Publisher** publishes to Unified Namespace topics
5. **Message Buffer** queues messages during disconnection

---

## 📊 Architecture Principles

| Principle | Implementation |
|-----------|----------------|
| **Clean Architecture** | Domain layer has no external dependencies |
| **Dependency Injection** | All dependencies injected in main.go |
| **Separation of Concerns** | Each package has single responsibility |
| **Fail-Safe** | Circuit breaker, retries, graceful degradation |
| **Observable** | Metrics, structured logging, health checks |
| **Configurable** | YAML files + environment variables |
| **Testable** | Interfaces for all dependencies |

---

## 🚀 Getting Started

```bash
# Start development environment
make docker-dev-up

# View logs
make docker-dev-logs

# Access EMQX Dashboard
open http://localhost:18083  # admin / admin123

# Access MQTT Explorer
open http://localhost:4000

# Stop environment
make docker-dev-down
```

