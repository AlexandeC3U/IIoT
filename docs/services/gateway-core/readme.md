# Gateway Core Service

Central management API for the NEXUS Edge platform. Provides RESTful endpoints for device and tag configuration, stores configuration in PostgreSQL, and publishes changes to MQTT for real-time propagation to protocol gateways.

## Features

- **Device Management**: CRUD operations for industrial device configurations
- **Tag Configuration**: Manage data tags per device with protocol-specific settings
- **MQTT Notifications**: Publish config changes to `$nexus/config/` topics
- **Health Checks**: Kubernetes-ready liveness and readiness probes
- **API Documentation**: Auto-generated Swagger/OpenAPI docs
- **Type Safety**: End-to-end TypeScript with Zod validation

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GATEWAY CORE SERVICE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         FASTIFY SERVER                              │    │
│  │                                                                     │    │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │    │
│  │   │   /health   │  │ /api/devices│  │  /api/tags  │  │   /docs   │  │    │
│  │   │   Routes    │  │   Routes    │  │   Routes    │  │  Swagger  │  │    │
│  │   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └───────────┘  │    │
│  │          │                │                │                        │    │
│  │          └────────────────┴────────────────┘                        │    │
│  │                           │                                         │    │
│  │                    ┌──────▼──────┐                                  │    │
│  │                    │  Services   │                                  │    │
│  │                    │  (Business  │                                  │    │
│  │                    │   Logic)    │                                  │    │
│  │                    └──────┬──────┘                                  │    │
│  │                           │                                         │    │
│  └───────────────────────────┼─────────────────────────────────────────┘    │
│                              │                                              │
│  ┌───────────────────────────┼───────────────────────────────────────────┐  │
│  │                     DATA LAYER                                        │  │
│  │         ┌─────────────────┴─────────────────┐                         │  │
│  │         ▼                                   ▼                         │  │
│  │  ┌──────────────┐                   ┌──────────────┐                  │  │
│  │  │  Drizzle ORM │                   │ MQTT Client  │                  │  │
│  │  │              │                   │              │                  │  │
│  │  │ • Type-safe  │                   │ • Publish    │                  │  │
│  │  │ • Migrations │                   │   configs    │                  │  │
│  │  │ • Queries    │                   │ • QoS 1      │                  │  │
│  │  └──────┬───────┘                   └──────┬───────┘                  │  │
│  │         │                                  │                          │  │
│  └─────────┼──────────────────────────────────┼──────────────────────────┘  │
│            │                                  │                             │
│            ▼                                  ▼                             │
│   ┌─────────────────┐                ┌─────────────────┐                    │
│   │   PostgreSQL    │                │      EMQX       │                    │
│   │  (nexus_config) │                │    (Broker)     │                    │
│   │                 │                │                 │                    │
│   │  • devices      │                │ Topic prefix:   │                    │
│   │  • tags         │                │ $nexus/config/  │                    │
│   └─────────────────┘                └─────────────────┘                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ (with `pgcrypto` extension)
- EMQX or another MQTT broker

### Running Locally

```bash
# Navigate to service directory
cd services/gateway-core

# Install dependencies
pnpm install

# Start dependencies (PostgreSQL + EMQX)
cd ../../infrastructure/docker
docker-compose up -d postgres emqx

# Return and start in development mode
cd ../../services/gateway-core
pnpm dev
```

### Environment Variables

Create a `.env` file or set these environment variables:

```bash
# Server
PORT=3001
HOST=0.0.0.0
NODE_ENV=development
LOG_LEVEL=debug

# Database
DATABASE_URL=postgresql://nexus:nexus_password@localhost:5433/nexus_config

# MQTT
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_CLIENT_ID=gateway-core
# MQTT_USERNAME=optional
# MQTT_PASSWORD=optional

# CORS
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
```

## Project Structure

```
services/gateway-core/
├── src/
│   ├── config/
│   │   └── env.ts              # Environment validation (Zod)
│   ├── db/
│   │   ├── index.ts            # PostgreSQL connection pool
│   │   ├── schema.ts           # Drizzle ORM schema (devices, tags)
│   │   └── migrate.ts          # Auto-migration on startup
│   ├── lib/
│   │   ├── errors.ts           # Custom error classes
│   │   └── logger.ts           # Pino logger configuration
│   ├── mqtt/
│   │   └── client.ts           # MQTT service (publish config changes)
│   ├── routes/
│   │   ├── devices/
│   │   │   ├── routes.ts       # Device CRUD endpoints
│   │   │   ├── schema.ts       # Zod validation schemas
│   │   │   └── service.ts      # Device business logic
│   │   ├── tags/
│   │   │   ├── routes.ts       # Tag CRUD endpoints
│   │   │   ├── schema.ts       # Zod validation schemas
│   │   │   └── service.ts      # Tag business logic
│   │   ├── health/
│   │   │   └── routes.ts       # Health check endpoints
│   │   └── index.ts            # Route exports
│   └── index.ts                # Application entry point
├── drizzle.config.ts           # Drizzle ORM configuration
├── package.json
├── tsconfig.json
└── Dockerfile
```

## API Reference

### Devices

| Method   | Endpoint           | Description                        |
| -------- | ------------------ | ---------------------------------- |
| `GET`    | `/api/devices`     | List all devices (with pagination) |
| `GET`    | `/api/devices/:id` | Get device by ID                   |
| `POST`   | `/api/devices`     | Create new device                  |
| `PUT`    | `/api/devices/:id` | Update device                      |
| `DELETE` | `/api/devices/:id` | Delete device                      |

**Create Device Example:**

```bash
curl -X POST http://localhost:3001/api/devices \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production PLC",
    "description": "Main production line controller",
    "protocol": "modbus-tcp",
    "host": "192.168.1.100",
    "port": 502,
    "pollIntervalMs": 1000,
    "unsPrefix": "plant-a/line-1/plc-001",
    "protocolConfig": {
      "unitId": 1,
      "timeout": 5000
    }
  }'
```

**Response:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Production PLC",
  "description": "Main production line controller",
  "protocol": "modbus-tcp",
  "host": "192.168.1.100",
  "port": 502,
  "pollIntervalMs": 1000,
  "unsPrefix": "plant-a/line-1/plc-001",
  "enabled": true,
  "protocolConfig": {
    "unitId": 1,
    "timeout": 5000
  },
  "createdAt": "2026-01-09T10:00:00.000Z",
  "updatedAt": "2026-01-09T10:00:00.000Z"
}
```

### Tags

| Method   | Endpoint        | Description                        |
| -------- | --------------- | ---------------------------------- |
| `GET`    | `/api/tags`     | List all tags (filter by deviceId) |
| `GET`    | `/api/tags/:id` | Get tag by ID                      |
| `POST`   | `/api/tags`     | Create new tag                     |
| `PUT`    | `/api/tags/:id` | Update tag                         |
| `DELETE` | `/api/tags/:id` | Delete tag                         |

### Health

| Method | Endpoint        | Description                      |
| ------ | --------------- | -------------------------------- |
| `GET`  | `/health`       | Basic health status              |
| `GET`  | `/health/ready` | Full readiness check (DB + MQTT) |
| `GET`  | `/health/live`  | Liveness probe                   |

**Readiness Response:**

```json
{
  "status": "healthy",
  "uptime": 3600,
  "checks": {
    "database": {
      "status": "ok",
      "latencyMs": 2
    },
    "mqtt": {
      "connected": true
    }
  }
}
```

## MQTT Integration

When devices or tags are created/updated/deleted, Gateway Core publishes notifications:

### Topics

| Topic Pattern                           | Trigger         |
| --------------------------------------- | --------------- |
| `$nexus/config/devices/{deviceId}`      | Device CRUD     |
| `$nexus/config/devices/bulk`            | Bulk operations |
| `$nexus/config/tags/{deviceId}/{tagId}` | Tag CRUD        |

### Payload Format

```json
{
  "action": "create|update|delete",
  "timestamp": "2026-01-09T10:00:00.000Z",
  "data": {
    /* full device or tag object */
  }
}
```

**Example: Protocol Gateway subscribes:**

```
$nexus/config/devices/+        → Receive all device changes
$nexus/config/tags/+/+         → Receive all tag changes
```

## Database Schema

```sql
-- Devices table
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  protocol VARCHAR(50) NOT NULL,  -- 'modbus-tcp', 'opcua', 's7'
  host VARCHAR(255) NOT NULL,
  port INTEGER NOT NULL,
  poll_interval_ms INTEGER DEFAULT 1000,
  uns_prefix VARCHAR(255),
  enabled BOOLEAN DEFAULT true,
  protocol_config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tags table
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  data_type VARCHAR(50) NOT NULL,
  address VARCHAR(255),
  access_mode VARCHAR(20) DEFAULT 'read',
  poll_interval_ms INTEGER,
  scale_factor DOUBLE PRECISION DEFAULT 1,
  offset DOUBLE PRECISION DEFAULT 0,
  unit VARCHAR(50),
  enabled BOOLEAN DEFAULT true,
  protocol_config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Deployment

### Docker

```bash
# Build image
docker build -t nexus/gateway-core:latest .

# Run container
docker run -d \
  --name gateway-core \
  -p 3001:3001 \
  -e DATABASE_URL=postgresql://... \
  -e MQTT_BROKER_URL=mqtt://emqx:1883 \
  nexus/gateway-core:latest
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gateway-core
spec:
  replicas: 2
  selector:
    matchLabels:
      app: gateway-core
  template:
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
                  name: gateway-secrets
                  key: database-url
            - name: MQTT_BROKER_URL
              value: mqtt://emqx:1883
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3001
            initialDelaySeconds: 5
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3001
            initialDelaySeconds: 10
          resources:
            requests:
              memory: '128Mi'
              cpu: '100m'
            limits:
              memory: '512Mi'
              cpu: '500m'
```

## Development

### Available Scripts

```bash
pnpm dev           # Start with hot reload (tsx watch)
pnpm build         # Build for production (tsup)
pnpm start         # Run production build
pnpm lint          # Run ESLint
pnpm typecheck     # TypeScript type checking
pnpm test          # Run tests (Vitest)
pnpm db:generate   # Generate Drizzle migrations
pnpm db:migrate    # Run migrations
pnpm db:studio     # Open Drizzle Studio (DB browser)
```

### Technology Stack

| Component  | Technology     | Why                                       |
| ---------- | -------------- | ----------------------------------------- |
| Runtime    | Node.js 20+    | LTS, fast, TypeScript support             |
| Framework  | Fastify 4      | 2x faster than Express, schema validation |
| ORM        | Drizzle        | Type-safe, lightweight, great DX          |
| Validation | Zod            | Runtime + compile-time safety             |
| Logging    | Pino           | Fastest Node.js logger                    |
| Database   | PostgreSQL     | Reliable, JSONB support                   |
| Messaging  | MQTT (mqtt.js) | Industry standard for IoT                 |

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker-compose -f infrastructure/docker/docker-compose.yml ps postgres

# Test connection
psql postgresql://nexus:nexus_password@localhost:5433/nexus_config
```

### MQTT Connection Issues

```bash
# Check EMQX is running
docker-compose -f infrastructure/docker/docker-compose.yml ps emqx

# Test MQTT
mosquitto_pub -h localhost -p 1883 -t "test" -m "hello"
```

### Common Errors

| Error                               | Cause                  | Solution                                |
| ----------------------------------- | ---------------------- | --------------------------------------- |
| `ECONNREFUSED 5432`                 | PostgreSQL not running | Start postgres container                |
| `relation "devices" does not exist` | Migrations not run     | Migrations run automatically on startup |
| `MQTT not connected`                | Broker unavailable     | Check EMQX, will auto-reconnect         |

## Related Documentation

- [Architecture Overview](../../ARCHITECTURE.md)
- [Protocol Gateway](../protocol-gateway/readme.md)
- [Web UI](../web-ui/readme.md)
- [Questions & Decisions](../../QUESTIONS.md)
