# Contributing to NEXUS Edge

First off, thank you for considering contributing to NEXUS Edge! It's people like you that make this platform a great tool for the industrial IoT community.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Architecture Overview](#architecture-overview)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Style Guides](#style-guides)

---

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to [conduct@nexus-edge.io].

---

## Getting Started

### Prerequisites

- **Node.js 20+** - For frontend and TypeScript services
- **Docker & Docker Compose** - For local development environment
- **Git** - Version control
- **pnpm** - Package manager (preferred over npm/yarn)

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/nexus-edge.git
   cd nexus-edge
   ```
3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/nexus-edge/nexus-edge.git
   ```

---

## Development Setup

### Quick Start (Docker)

The fastest way to get a development environment running:

```bash
# Start all services in development mode
cd infrastructure/docker
cp env.template .env
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# View logs
docker-compose logs -f

# The frontend will be available at http://localhost:5173 with hot reload
```

### Local Development (Without Docker)

For faster iteration on specific services:

```bash
# Install dependencies
pnpm install

# Start infrastructure only (databases, broker)
cd infrastructure/docker
docker-compose up -d emqx timescaledb postgres

# Run frontend in dev mode
cd ../../frontend
pnpm dev

# Run a specific service
cd ../services/gateway-core
pnpm dev
```

### Service Ports (Development)

| Service | Port | URL |
|---------|------|-----|
| Frontend (Vite) | 5173 | http://localhost:5173 |
| Gateway Core | 3000 | http://localhost:3000 |
| Protocol Gateway | 4000 | http://localhost:4000 |
| Orchestrator | 5000 | http://localhost:5000 |
| Alert Service | 6000 | http://localhost:6000 |
| Historian Service | 7000 | http://localhost:7000 |
| Node-RED (Flow Engine) | 1880 | http://localhost:1880 |
| EMQX Dashboard | 18083 | http://localhost:18083 |
| PostgreSQL | 5433 | localhost:5433 |
| TimescaleDB | 5432 | localhost:5432 |

---

## Architecture Overview

Before contributing, please familiarize yourself with the system architecture:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Frontend (React/Vite)                                                  │
│      │                                                                  │
│      ▼                                                                  │
│  Gateway Core (REST + WebSocket)                                        │
│      │                                                                  │
│      ├──────────────────┬──────────────────┬─────────────────────┐     │
│      ▼                  ▼                  ▼                     ▼     │
│  Protocol          Historian          Orchestrator           Alert    │
│  Gateway           Service            Service                Service  │
│      │                  │                  │                     │     │
│      ▼                  ▼                  ▼                     │     │
│  EMQX Broker ◄──────────────────────────────────────────────────┘     │
│      │                                                                  │
│      ▼                                                                  │
│  TimescaleDB                          PostgreSQL                       │
│  (Historian)                          (Config)                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

See [docs/ARCHITECTURE.md](ARCHITECTURE.md) for detailed documentation.

---

## Making Changes

### Branch Naming

Use descriptive branch names:

- `feature/device-discovery` - New features
- `fix/s7-connection-timeout` - Bug fixes
- `docs/api-reference` - Documentation
- `refactor/historian-queries` - Code refactoring
- `test/flow-engine-unit-tests` - Test additions

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `style` - Formatting, missing semicolons, etc.
- `refactor` - Code change that neither fixes a bug nor adds a feature
- `perf` - Performance improvement
- `test` - Adding or correcting tests
- `chore` - Maintenance tasks

**Examples:**

```bash
feat(devices): add OPC UA tag discovery

Implement browsing of OPC UA server address space to discover
available tags. Users can now select tags from a tree view
instead of manually entering node IDs.

Closes #123

---

fix(protocol-gateway): handle S7 connection timeout

Previously, if the S7 PLC didn't respond within the TCP timeout,
the gateway would crash. Now it properly catches the timeout
and attempts reconnection.

---

docs(api): add historian query examples
```

### Code Changes Checklist

Before submitting a PR, ensure:

- [ ] Code follows the project style guide
- [ ] All tests pass locally
- [ ] New code has test coverage
- [ ] Documentation is updated (if applicable)
- [ ] No console.log or debugging code left in
- [ ] Commit messages follow conventional commits
- [ ] Branch is rebased on latest `main`

---

## Testing

### Running Tests

**Frontend & Gateway (TypeScript):**

```bash
# Run all tests
pnpm test

# Run tests for a specific service
cd services/gateway-core
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run E2E tests
pnpm test:e2e
```

**Go Services:**

```bash
# Run all Go tests
cd services/protocol-gateway
go test ./...

# Run with verbose output
go test -v ./...

# Run with coverage
go test -cover ./...

# Run with race detection
go test -race ./...

# Generate coverage report
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out

# Run benchmarks
go test -bench=. ./...
```

### Test Structure

```
tests/
├── unit/                    # Unit tests for individual functions
│   ├── services/
│   │   ├── gateway-core/
│   │   ├── protocol-gateway/
│   │   └── ...
│   └── frontend/
├── integration/             # Integration tests between services
│   ├── device-flow.test.ts
│   ├── historian-ingestion.test.ts
│   └── ...
├── e2e/                     # End-to-end browser tests
│   ├── device-wizard.spec.ts
│   ├── dashboard-builder.spec.ts
│   └── ...
└── simulators/              # Device simulators for testing
    ├── s7-simulator/
    ├── opcua-simulator/
    └── modbus-simulator/
```

### Writing Tests

**Go Unit Tests:**

```go
package s7_test

import (
    "testing"
    
    "github.com/nexus-edge/protocol-gateway/internal/protocols/s7"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

func TestParseS7Address(t *testing.T) {
    tests := []struct {
        name     string
        address  string
        expected *s7.Address
        wantErr  bool
    }{
        {
            name:    "valid DB REAL address",
            address: "DB1.DBD0",
            expected: &s7.Address{
                Area:     s7.AreaDB,
                DBNumber: 1,
                Type:     s7.TypeDBD,
                Offset:   0,
                DataType: s7.DataTypeREAL,
            },
            wantErr: false,
        },
        {
            name:    "invalid address",
            address: "INVALID",
            wantErr: true,
        },
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result, err := s7.ParseAddress(tt.address)
            if tt.wantErr {
                require.Error(t, err)
                return
            }
            require.NoError(t, err)
            assert.Equal(t, tt.expected, result)
        })
    }
}

func BenchmarkParseS7Address(b *testing.B) {
    for i := 0; i < b.N; i++ {
        s7.ParseAddress("DB1.DBD0")
    }
}
```

**TypeScript Unit Tests (Vitest):**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { parseS7Address } from '../src/protocols/s7/parser';

describe('S7 Address Parser', () => {
  it('should parse DB address with REAL type', () => {
    const result = parseS7Address('DB1.DBD0');
    expect(result).toEqual({
      area: 'DB',
      dbNumber: 1,
      type: 'DBD',
      offset: 0,
      dataType: 'REAL'
    });
  });

  it('should throw on invalid address', () => {
    expect(() => parseS7Address('INVALID')).toThrow('Invalid S7 address');
  });
});
```

**Integration Tests:**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestClient } from '../helpers';

describe('Device API Integration', () => {
  let client;

  beforeAll(async () => {
    client = await createTestClient();
  });

  afterAll(async () => {
    await client.cleanup();
  });

  it('should create and retrieve a device', async () => {
    const device = await client.post('/api/devices', {
      name: 'Test PLC',
      protocol: 'S7',
      connection: { host: '192.168.1.1', rack: 0, slot: 1 }
    });

    expect(device.id).toBeDefined();
    
    const retrieved = await client.get(`/api/devices/${device.id}`);
    expect(retrieved.name).toBe('Test PLC');
  });
});
```

---

## Pull Request Process

### 1. Create Your PR

1. Push your branch to your fork
2. Open a PR against `nexus-edge/nexus-edge:main`
3. Fill out the PR template completely
4. Link any related issues

### 2. PR Template

```markdown
## Description

Brief description of changes.

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update

## How Has This Been Tested?

Describe the tests you ran to verify your changes.

## Checklist

- [ ] My code follows the project style guidelines
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes

## Screenshots (if applicable)

Add screenshots for UI changes.
```

### 3. Review Process

- At least one maintainer must approve the PR
- All CI checks must pass
- No unresolved review comments
- Branch must be up to date with `main`

### 4. After Merge

- Delete your branch
- Close related issues
- Update your local `main`:
  ```bash
  git checkout main
  git pull upstream main
  ```

---

## Style Guides

### Go (Backend Services)

We use `gofmt`, `golint`, and `staticcheck` for consistent code style:

```bash
# Format code
go fmt ./...

# Run linter
golangci-lint run

# Run static analysis
staticcheck ./...
```

**Key Conventions:**

```go
// Package comments should be descriptive
// Package s7 implements the Siemens S7 protocol client.
package s7

// Use descriptive error variables
var (
    ErrConnectionFailed = errors.New("s7: connection failed")
    ErrInvalidAddress   = errors.New("s7: invalid address format")
)

// Prefer returning errors over panicking
func (c *Client) ReadTag(address string) (interface{}, error) {
    parsed, err := ParseAddress(address)
    if err != nil {
        return nil, fmt.Errorf("parsing address: %w", err)
    }
    // ...
    return value, nil
}

// Use context for cancellation and timeouts
func (c *Client) Connect(ctx context.Context) error {
    ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
    defer cancel()
    // ...
}

// Use table-driven tests
func TestParseAddress(t *testing.T) {
    tests := []struct {
        name    string
        input   string
        want    *Address
        wantErr bool
    }{
        // test cases...
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // ...
        })
    }
}

// Interfaces should be small and focused
type Reader interface {
    Read(address string) (interface{}, error)
}

type Writer interface {
    Write(address string, value interface{}) error
}

// Prefer composition over large interfaces
type ReadWriter interface {
    Reader
    Writer
}

// Use channels for concurrent communication
type Publisher struct {
    messages chan Message
    done     chan struct{}
}

func (p *Publisher) Start(ctx context.Context) {
    go func() {
        for {
            select {
            case msg := <-p.messages:
                p.publish(msg)
            case <-ctx.Done():
                close(p.done)
                return
            }
        }
    }()
}
```

**Project Structure for Go Services:**

```
services/protocol-gateway/
├── cmd/
│   └── gateway/
│       └── main.go           # Entry point
├── internal/                  # Private packages
│   ├── protocols/
│   │   ├── s7/
│   │   ├── opcua/
│   │   └── modbus/
│   ├── core/
│   └── config/
├── pkg/                       # Public packages (if any)
├── go.mod
├── go.sum
├── Dockerfile
└── Makefile
```

---

### TypeScript (API Gateway & Frontend)

We use ESLint and Prettier for consistent code style:

```bash
# Check linting
pnpm lint

# Fix auto-fixable issues
pnpm lint:fix

# Format code
pnpm format
```

**Key Conventions:**

```typescript
// Use explicit types for function parameters and returns
function processData(data: SensorReading[]): ProcessedResult {
  // ...
}

// Prefer interfaces over types for object shapes
interface Device {
  id: string;
  name: string;
  protocol: ProtocolType;
}

// Use const assertions for literal types
const PROTOCOLS = ['S7', 'OPCUA', 'MODBUS'] as const;
type Protocol = typeof PROTOCOLS[number];

// Prefer async/await over .then()
async function fetchDevices(): Promise<Device[]> {
  const response = await fetch('/api/devices');
  return response.json();
}

// Use early returns for cleaner code
function validateDevice(device: Device): ValidationResult {
  if (!device.name) {
    return { valid: false, error: 'Name is required' };
  }
  if (!device.protocol) {
    return { valid: false, error: 'Protocol is required' };
  }
  return { valid: true };
}
```

### React Components

```tsx
// Use function components with TypeScript
interface DeviceCardProps {
  device: Device;
  onSelect: (id: string) => void;
}

export function DeviceCard({ device, onSelect }: DeviceCardProps) {
  const handleClick = () => {
    onSelect(device.id);
  };

  return (
    <div className="device-card" onClick={handleClick}>
      <h3>{device.name}</h3>
      <StatusIndicator status={device.status} />
    </div>
  );
}

// Use custom hooks for logic
function useDeviceStatus(deviceId: string) {
  const [status, setStatus] = useState<DeviceStatus>('unknown');
  
  useEffect(() => {
    const unsubscribe = subscribeToStatus(deviceId, setStatus);
    return unsubscribe;
  }, [deviceId]);
  
  return status;
}
```

### CSS / Tailwind

```tsx
// Use Tailwind utility classes
<div className="flex items-center gap-4 p-4 bg-slate-800 rounded-lg">

// Extract repeated patterns to components, not @apply
// Good:
<Button variant="primary" size="lg">Save</Button>

// Avoid:
<button className="btn-primary-lg">Save</button>  // with @apply in CSS
```

### SQL

```sql
-- Use UPPERCASE for SQL keywords
SELECT
    id,
    name,
    created_at
FROM devices
WHERE enabled = TRUE
ORDER BY created_at DESC;

-- Use snake_case for table and column names
CREATE TABLE device_tags (
    id UUID PRIMARY KEY,
    device_id UUID REFERENCES devices(id),
    tag_name VARCHAR(255) NOT NULL
);

-- Add comments for complex queries
-- Find devices with more than 100 active tags that haven't
-- reported data in the last hour
SELECT d.id, d.name, COUNT(t.id) as tag_count
FROM devices d
JOIN device_tags t ON t.device_id = d.id
WHERE d.last_seen < NOW() - INTERVAL '1 hour'
GROUP BY d.id
HAVING COUNT(t.id) > 100;
```

---

## Questions?

- Open a [Discussion](https://github.com/nexus-edge/nexus-edge/discussions) for questions
- Join our [Discord](https://discord.gg/nexus-edge) community
- Check existing [Issues](https://github.com/nexus-edge/nexus-edge/issues)

Thank you for contributing! 🚀

