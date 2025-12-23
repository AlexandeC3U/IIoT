# 🏭 NEXUS Edge

### *The Industrial Nervous System*

> A next-generation Industrial IoT Edge Platform that unifies OT devices, real-time data processing, time-series storage, and modern visualization into a single, cohesive system. Built for the factory floor, managed from anywhere.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-ready-brightgreen.svg)](docker-compose.yml)
[![K3s](https://img.shields.io/badge/k3s-compatible-orange.svg)](k8s/)

---

## 🎯 Vision

**NEXUS Edge** isn't just another IIoT platform—it's a complete industrial nervous system that bridges the gap between legacy OT equipment and modern IT infrastructure. Unlike platforms that cobble together disparate tools with iframes, NEXUS provides a **unified, native experience** where every interaction feels purposeful and cohesive.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   "From PLC register to executive dashboard in milliseconds,                │
│    with complete traceability and zero complexity for the operator."        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📐 Architecture Overview

```
                                   ╔═══════════════════════════════════════════════════════════════╗
                                   ║                    NEXUS EDGE PLATFORM                        ║
                                   ╠═══════════════════════════════════════════════════════════════╣
                                   ║                                                               ║
    ┌──────────────┐               ║  ┌─────────────────────────────────────────────────────────┐  ║
    │   Siemens    │───S7 Comm──── ║  │                   PROTOCOL GATEWAY (Go)                 │  ║
    │   S7-1500    │               ║  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │  ║
    └──────────────┘               ║  │  │   S7    │  │  OPC UA │  │ Modbus  │  │  MQTT   │     │  ║
                                   ║  │  │  (gos7) │  │(gopcua) │  │(go-mod) │  │ Native  │     │  ║
    ┌──────────────┐               ║  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘     │  ║
    │   OPC UA     │───OPC UA───── ║  │       │            │            │            │          │  ║
    │   Server     │               ║  │       └────────────┴────────────┴────────────┘          │  ║
    └──────────────┘               ║  │                          │                              │  ║
                                   ║  │              ┌───────────▼───────────┐                  │  ║
    ┌──────────────┐               ║  │              │     UNIFIED MQTT      │                  │  ║
    │   Modbus     │───Modbus TCP─ ║  │              │      NAMESPACE        │                  │  ║
    │   RTU/TCP    │               ║  │              │      (EMQX 5.x)       │                  │  ║
    └──────────────┘               ║  │              └───────────┬───────────┘                  │  ║
                                   ║  └─────────────────────────────────────────────────────────┘  ║
    ┌──────────────┐               ║                             │                                 ║
    │ Native MQTT  │───MQTT─────── ║                             │                                 ║
    │   Sensors    │               ║  ┌─────────────────────────────────────────────────────────┐  ║
    └──────────────┘               ║  │                   PROCESSING LAYER                      │  ║
                                   ║  │                                                         │  ║
                                   ║  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  ║
                                   ║  │  │  FLOW ENGINE │  │   RULE       │  │    AI/ML     │   │  ║
                                   ║  │  │  (Node-RED)  │  │   ENGINE     │  │   RUNTIME    │   │  ║
                                   ║  │  │              │  │   (EMQX)     │  │   (Future)   │   │  ║
                                   ║  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │  ║
                                   ║  │         └─────────────────┴─────────────────┘           │  ║
                                   ║  └─────────────────────────────────────────────────────────┘  ║
                                   ║                             │                                 ║
                                   ║  ┌─────────────────────────────────────────────────────────┐  ║
                                   ║  │                   PERSISTENCE LAYER                     │  ║
                                   ║  │                                                         │  ║
                                   ║  │  ┌──────────────────────────────────────────────────┐   │  ║
                                   ║  │  │              TIME-SERIES HISTORIAN               │   │  ║
                                   ║  │  │           (TimescaleDB / InfluxDB)               │   │  ║
                                   ║  │  │                                                  │   │  ║
                                   ║  │  │   • Compression & Retention Policies             │   │  ║
                                   ║  │  │   • Continuous Aggregates                        │   │  ║
                                   ║  │  │   • Real-time + Historical Queries               │   │  ║
                                   ║  │  └──────────────────────────────────────────────────┘   │  ║
                                   ║  │                                                         │  ║
                                   ║  │  ┌──────────────────────────────────────────────────┐   │  ║
                                   ║  │  │              CONFIGURATION STORE                 │   │  ║
                                   ║  │  │               (PostgreSQL)                       │   │  ║
                                   ║  │  └──────────────────────────────────────────────────┘   │  ║
                                   ║  └─────────────────────────────────────────────────────────┘  ║
                                   ║                             │                                 ║
                                   ║  ┌─────────────────────────────────────────────────────────┐  ║
                                   ║  │                   PRESENTATION LAYER                    │  ║
                                   ║  │                                                         │  ║
                                   ║  │  ┌──────────────────────────────────────────────────┐   │  ║
                                   ║  │  │              NEXUS CONTROL CENTER                │   │  ║
                                   ║  │  │           (React + TypeScript + Vite)            │   │  ║
                                   ║  │  │                                                  │   │  ║
                                   ║  │  │   ┌─────────────┐  ┌─────────────┐  ┌─────────┐  │   │  ║
                                   ║  │  │   │   Device    │  │    Flow     │  │ Dash-   │  │   │  ║
                                   ║  │  │   │   Manager   │  │   Designer  │  │ boards  │  │   │  ║
                                   ║  │  │   └─────────────┘  └─────────────┘  └─────────┘  │   │  ║
                                   ║  │  │   ┌─────────────┐  ┌─────────────┐  ┌─────────┐  │   │  ║
                                   ║  │  │   │ Container   │  │   Alerts    │  │ System  │  │   │  ║
                                   ║  │  │   │ Orchestrator│  │   Center    │  │ Health  │  │   │  ║
                                   ║  │  │   └─────────────┘  └─────────────┘  └─────────┘  │   │  ║
                                   ║  │  └──────────────────────────────────────────────────┘   │  ║
                                   ║  └─────────────────────────────────────────────────────────┘  ║
                                   ║                                                               ║
                                   ╚═══════════════════════════════════════════════════════════════╝
                                                               │
                                                               │ Secure TLS
                                                               ▼
                                   ╔═══════════════════════════════════════════════════════════════╗
                                   ║                    CLOUD MANAGEMENT (Optional)                ║
                                   ║                                                               ║
                                   ║   • Fleet Management    • Remote Configuration                ║
                                   ║   • OTA Updates         • Centralized Analytics               ║
                                   ║   • Multi-Site Sync     • Compliance Reporting                ║
                                   ╚═══════════════════════════════════════════════════════════════╝
```

---

## 📁 Project Structure

```
nexus-edge/
│
├── 📂 services/                          # Core microservices
│   │
│   ├── 📂 gateway-core/                  # Central API Gateway & Auth
│   │   ├── src/
│   │   │   ├── auth/                     # JWT, API Keys, RBAC
│   │   │   ├── routes/                   # REST API endpoints
│   │   │   ├── websocket/                # Real-time subscriptions
│   │   │   ├── middleware/               # Rate limiting, logging
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── 📂 protocol-gateway/              # Industrial protocol conversion (Go) ✅
│   │   ├── cmd/
│   │   │   └── gateway/
│   │   │       └── main.go               # Application entrypoint
│   │   ├── internal/
│   │   │   ├── adapter/                  # Protocol adapters
│   │   │   │   ├── modbus/               # Modbus TCP/RTU (go-modbus)
│   │   │   │   │   ├── client.go
│   │   │   │   │   └── pool.go
│   │   │   │   ├── opcua/                # OPC UA client (gopcua)
│   │   │   │   │   ├── client.go
│   │   │   │   │   ├── pool.go
│   │   │   │   │   └── subscription.go
│   │   │   │   ├── s7/                   # Siemens S7 driver (gos7)
│   │   │   │   │   ├── client.go
│   │   │   │   │   └── pool.go
│   │   │   │   ├── mqtt/
│   │   │   │   │   └── publisher.go      # MQTT publishing
│   │   │   │   └── config/
│   │   │   │       ├── config.go
│   │   │   │       └── devices.go
│   │   │   ├── domain/                   # Core business entities
│   │   │   │   ├── device.go
│   │   │   │   ├── tag.go
│   │   │   │   ├── datapoint.go
│   │   │   │   └── protocol.go
│   │   │   ├── service/
│   │   │   │   ├── polling.go            # Polling orchestration
│   │   │   │   └── command_handler.go    # Write command handling
│   │   │   ├── health/
│   │   │   │   └── checker.go
│   │   │   └── metrics/
│   │   │       └── registry.go
│   │   ├── Dockerfile
│   │   ├── go.mod
│   │   └── go.sum
│   │
│   ├── 📂 data-ingestion/                # MQTT to TimescaleDB ingestion (Go) ✅
│   │   ├── cmd/
│   │   │   └── ingestion/
│   │   │       └── main.go               # Application entrypoint
│   │   ├── internal/
│   │   │   ├── adapter/
│   │   │   │   ├── mqtt/
│   │   │   │   │   └── subscriber.go     # Shared subscription handler
│   │   │   │   ├── timescaledb/
│   │   │   │   │   └── writer.go         # COPY protocol batch writer
│   │   │   │   └── config/
│   │   │   │       └── config.go
│   │   │   ├── domain/
│   │   │   │   └── datapoint.go
│   │   │   ├── service/
│   │   │   │   ├── ingestion.go          # Ingestion orchestration
│   │   │   │   └── batcher.go            # Batch accumulation
│   │   │   ├── health/
│   │   │   │   └── checker.go
│   │   │   └── metrics/
│   │   │       └── registry.go
│   │   ├── Dockerfile
│   │   ├── go.mod
│   │   └── go.sum
│   │
│   ├── 📂 flow-engine/                   # Custom flow runtime (wraps Node-RED)
│   │   ├── src/
│   │   │   ├── runtime/
│   │   │   │   ├── FlowExecutor.ts       # Flow execution engine
│   │   │   │   ├── NodeRegistry.ts       # Custom node types
│   │   │   │   └── FlowDeployer.ts
│   │   │   ├── nodes/                    # Custom NEXUS nodes
│   │   │   │   ├── nexus-device-read/
│   │   │   │   ├── nexus-device-write/
│   │   │   │   ├── nexus-historian-query/
│   │   │   │   ├── nexus-alert/
│   │   │   │   └── nexus-ai-inference/
│   │   │   ├── api/
│   │   │   │   ├── FlowAPI.ts            # CRUD for flows
│   │   │   │   └── NodeAPI.ts            # Available nodes
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── 📂 orchestrator-service/          # Container/pod management (Go)
│   │   ├── cmd/
│   │   │   └── orchestrator/
│   │   │       └── main.go               # Application entrypoint
│   │   ├── internal/
│   │   │   ├── drivers/
│   │   │   │   ├── docker.go             # Docker Engine API (docker/docker)
│   │   │   │   ├── kubernetes.go         # K8s API (client-go)
│   │   │   │   └── k3s.go                # K3s-specific optimizations
│   │   │   ├── controllers/
│   │   │   │   ├── deployment.go
│   │   │   │   ├── service.go
│   │   │   │   ├── logs.go
│   │   │   │   └── metrics.go
│   │   │   └── catalog/
│   │   │       ├── apps.go               # Pre-built app templates
│   │   │       └── registry.go
│   │   ├── Dockerfile
│   │   ├── go.mod
│   │   └── go.sum
│   │
│   ├── 📂 alert-service/                 # Alerting & notifications (Go)
│   │   ├── cmd/
│   │   │   └── alerts/
│   │   │       └── main.go               # Application entrypoint
│   │   ├── internal/
│   │   │   ├── rules/
│   │   │   │   ├── engine.go
│   │   │   │   ├── threshold.go
│   │   │   │   ├── rate_of_change.go
│   │   │   │   └── pattern.go
│   │   │   ├── channels/
│   │   │   │   ├── email.go
│   │   │   │   ├── sms.go
│   │   │   │   ├── webhook.go
│   │   │   │   └── mqtt.go
│   │   │   └── state/
│   │   │       ├── manager.go
│   │   │       └── escalation.go
│   │   ├── Dockerfile
│   │   ├── go.mod
│   │   └── go.sum
│   │
│   └── 📂 cloud-agent/                   # Cloud connectivity agent (Go)
│       ├── cmd/
│       │   └── agent/
│       │       └── main.go               # Application entrypoint
│       ├── internal/
│       │   ├── sync/
│       │   │   ├── config.go             # Pull config from cloud
│       │   │   ├── data.go               # Push data to cloud
│       │   │   └── status.go
│       │   └── ota/
│       │       ├── checker.go
│       │       └── applier.go
│       ├── Dockerfile
│       ├── go.mod
│       └── go.sum
│
├── 📂 frontend/                          # NEXUS Control Center UI
│   ├── 📂 src/
│   │   ├── 📂 app/                       # App shell & routing
│   │   │   ├── App.tsx
│   │   │   ├── Router.tsx
│   │   │   └── Layout.tsx
│   │   │
│   │   ├── 📂 features/                  # Feature modules
│   │   │   │
│   │   │   ├── 📂 dashboard/             # Main dashboard
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   ├── SystemHealthCard.tsx
│   │   │   │   ├── DataRateChart.tsx
│   │   │   │   ├── ActiveAlertsWidget.tsx
│   │   │   │   └── QuickActions.tsx
│   │   │   │
│   │   │   ├── 📂 devices/               # Device management
│   │   │   │   ├── DeviceExplorer.tsx    # Device tree view
│   │   │   │   ├── DeviceWizard/         # Add device wizard
│   │   │   │   │   ├── ProtocolSelect.tsx
│   │   │   │   │   ├── ConnectionConfig.tsx
│   │   │   │   │   ├── TagBrowser.tsx    # Interactive tag discovery
│   │   │   │   │   ├── TagMapper.tsx     # Map to MQTT namespace
│   │   │   │   │   └── TestConnection.tsx
│   │   │   │   ├── DeviceDetail.tsx
│   │   │   │   ├── DeviceStatus.tsx
│   │   │   │   ├── LiveTagTable.tsx      # Real-time tag values
│   │   │   │   └── DeviceCommands.tsx    # Write to device
│   │   │   │
│   │   │   ├── 📂 flows/                 # Visual flow designer
│   │   │   │   ├── FlowCanvas.tsx        # React Flow based canvas
│   │   │   │   ├── FlowSidebar.tsx       # Node palette
│   │   │   │   ├── FlowToolbar.tsx
│   │   │   │   ├── nodes/                # Custom flow node components
│   │   │   │   │   ├── DeviceReadNode.tsx
│   │   │   │   │   ├── DeviceWriteNode.tsx
│   │   │   │   │   ├── TransformNode.tsx
│   │   │   │   │   ├── FilterNode.tsx
│   │   │   │   │   ├── AlertNode.tsx
│   │   │   │   │   ├── HistorianNode.tsx
│   │   │   │   │   ├── FunctionNode.tsx  # Custom JS/Python
│   │   │   │   │   └── AINode.tsx
│   │   │   │   ├── FlowDebugger.tsx      # Real-time flow debugging
│   │   │   │   ├── FlowLibrary.tsx       # Saved flow templates
│   │   │   │   └── FlowExporter.tsx
│   │   │   │
│   │   │   ├── 📂 historian/             # Historical data explorer
│   │   │   │   ├── HistorianExplorer.tsx
│   │   │   │   ├── QueryBuilder.tsx      # Visual query builder
│   │   │   │   ├── TrendChart.tsx        # Interactive time-series
│   │   │   │   ├── DataExport.tsx
│   │   │   │   └── RetentionConfig.tsx
│   │   │   │
│   │   │   ├── 📂 visualization/         # Dashboard builder
│   │   │   │   ├── DashboardGrid.tsx     # Drag-drop dashboard
│   │   │   │   ├── WidgetLibrary.tsx     # Available widgets
│   │   │   │   ├── widgets/
│   │   │   │   │   ├── GaugeWidget.tsx
│   │   │   │   │   ├── TimeSeriesWidget.tsx
│   │   │   │   │   ├── TableWidget.tsx
│   │   │   │   │   ├── HeatmapWidget.tsx
│   │   │   │   │   ├── StatusWidget.tsx
│   │   │   │   │   ├── AlertListWidget.tsx
│   │   │   │   │   └── SVGWidget.tsx     # Custom SVG overlays
│   │   │   │   ├── DashboardEditor.tsx
│   │   │   │   └── DashboardViewer.tsx   # Kiosk/fullscreen mode
│   │   │   │
│   │   │   ├── 📂 containers/            # Container orchestration
│   │   │   │   ├── ContainerList.tsx
│   │   │   │   ├── ContainerDetail.tsx
│   │   │   │   ├── ContainerLogs.tsx     # Real-time log streaming
│   │   │   │   ├── ContainerMetrics.tsx  # CPU, Memory, Network
│   │   │   │   ├── DeployWizard/
│   │   │   │   │   ├── ImageSelect.tsx
│   │   │   │   │   ├── ResourceConfig.tsx
│   │   │   │   │   ├── NetworkConfig.tsx
│   │   │   │   │   ├── VolumeConfig.tsx
│   │   │   │   │   └── EnvConfig.tsx
│   │   │   │   ├── AppCatalog.tsx        # Pre-built apps
│   │   │   │   └── ResourceMonitor.tsx   # System resources
│   │   │   │
│   │   │   ├── 📂 alerts/                # Alert management
│   │   │   │   ├── AlertCenter.tsx
│   │   │   │   ├── AlertRuleBuilder.tsx
│   │   │   │   ├── AlertHistory.tsx
│   │   │   │   ├── NotificationConfig.tsx
│   │   │   │   └── EscalationConfig.tsx
│   │   │   │
│   │   │   ├── 📂 settings/              # System settings
│   │   │   │   ├── GeneralSettings.tsx
│   │   │   │   ├── NetworkSettings.tsx
│   │   │   │   ├── SecuritySettings.tsx
│   │   │   │   ├── UserManagement.tsx
│   │   │   │   ├── BackupRestore.tsx
│   │   │   │   ├── CloudConfig.tsx
│   │   │   │   └── LicenseInfo.tsx
│   │   │   │
│   │   │   └── 📂 discovery/             # Network discovery
│   │   │       ├── DiscoveryPanel.tsx
│   │   │       ├── ScanConfig.tsx
│   │   │       ├── DiscoveredDevices.tsx
│   │   │       └── QuickConnect.tsx
│   │   │
│   │   ├── 📂 components/                # Shared components
│   │   │   ├── 📂 ui/                    # Base UI components
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Select.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   ├── Table.tsx
│   │   │   │   ├── Tree.tsx
│   │   │   │   ├── Tabs.tsx
│   │   │   │   ├── Toast.tsx
│   │   │   │   └── ...
│   │   │   ├── 📂 charts/                # Chart components
│   │   │   │   ├── LineChart.tsx
│   │   │   │   ├── AreaChart.tsx
│   │   │   │   ├── BarChart.tsx
│   │   │   │   ├── GaugeChart.tsx
│   │   │   │   ├── SparklineChart.tsx
│   │   │   │   └── RealtimeChart.tsx
│   │   │   ├── 📂 industrial/            # Industrial-specific
│   │   │   │   ├── PLCStatus.tsx
│   │   │   │   ├── TagValue.tsx
│   │   │   │   ├── ConnectionIndicator.tsx
│   │   │   │   ├── AlarmBanner.tsx
│   │   │   │   └── MIMICDiagram.tsx
│   │   │   └── 📂 layout/
│   │   │       ├── Sidebar.tsx
│   │   │       ├── Header.tsx
│   │   │       ├── Breadcrumbs.tsx
│   │   │       └── CommandPalette.tsx    # Ctrl+K quick actions
│   │   │
│   │   ├── 📂 hooks/                     # Custom React hooks
│   │   │   ├── useWebSocket.ts           # Real-time subscriptions
│   │   │   ├── useMQTT.ts                # MQTT over WebSocket
│   │   │   ├── useDevices.ts
│   │   │   ├── useHistorian.ts
│   │   │   ├── useContainers.ts
│   │   │   ├── useAlerts.ts
│   │   │   └── useAuth.ts
│   │   │
│   │   ├── 📂 stores/                    # State management (Zustand)
│   │   │   ├── deviceStore.ts
│   │   │   ├── flowStore.ts
│   │   │   ├── alertStore.ts
│   │   │   ├── dashboardStore.ts
│   │   │   └── uiStore.ts
│   │   │
│   │   ├── 📂 api/                       # API clients
│   │   │   ├── client.ts                 # Axios instance
│   │   │   ├── devices.ts
│   │   │   ├── flows.ts
│   │   │   ├── historian.ts
│   │   │   ├── containers.ts
│   │   │   ├── alerts.ts
│   │   │   └── auth.ts
│   │   │
│   │   ├── 📂 styles/                    # Global styles
│   │   │   ├── globals.css
│   │   │   ├── themes/
│   │   │   │   ├── industrial-dark.css   # Default dark theme
│   │   │   │   ├── industrial-light.css
│   │   │   │   └── operator-mode.css     # High-contrast for floor
│   │   │   └── animations.css
│   │   │
│   │   ├── 📂 utils/                     # Utilities
│   │   │   ├── formatters.ts
│   │   │   ├── validators.ts
│   │   │   ├── mqtt-topic-builder.ts
│   │   │   └── export-utils.ts
│   │   │
│   │   └── main.tsx
│   │
│   ├── public/
│   │   ├── icons/
│   │   └── industrial-symbols/           # SVG symbols for diagrams
│   │
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── package.json
│
├── 📂 infrastructure/                    # Deployment configs
│   │
│   ├── 📂 docker/
│   │   ├── docker-compose.yml            # Full stack compose
│   │   ├── docker-compose.dev.yml        # Development overrides
│   │   ├── docker-compose.prod.yml       # Production overrides
│   │   └── .env.example
│   │
│   ├── 📂 k8s/                           # Kubernetes manifests
│   │   ├── 📂 base/                      # Base Kustomize configs
│   │   │   ├── kustomization.yaml
│   │   │   ├── namespace.yaml
│   │   │   ├── emqx/
│   │   │   │   ├── deployment.yaml
│   │   │   │   ├── service.yaml
│   │   │   │   └── configmap.yaml
│   │   │   ├── historian/
│   │   │   ├── gateway/
│   │   │   ├── flow-engine/
│   │   │   ├── frontend/
│   │   │   └── ...
│   │   ├── 📂 overlays/
│   │   │   ├── development/
│   │   │   ├── staging/
│   │   │   └── production/
│   │   └── 📂 helm/                      # Helm chart
│   │       └── nexus-edge/
│   │           ├── Chart.yaml
│   │           ├── values.yaml
│   │           └── templates/
│   │
│   ├── 📂 k3s/                           # K3s-specific configs
│   │   ├── install.sh                    # K3s installation script
│   │   ├── k3s-config.yaml
│   │   └── traefik-config.yaml
│   │
│   └── 📂 terraform/                     # Cloud infra (optional)
│       ├── aws/
│       ├── azure/
│       └── gcp/
│
├── 📂 config/                            # Configuration files
│   ├── emqx/
│   │   ├── emqx.conf
│   │   ├── acl.conf                      # Access control
│   │   └── plugins/
│   ├── nodered/
│   │   ├── settings.js
│   │   └── flows/                        # Pre-built flows
│   ├── grafana/                          # Grafana provisioning
│   │   ├── datasources/
│   │   └── dashboards/
│   └── timescaledb/
│       └── init.sql
│
├── 📂 scripts/                           # Utility scripts
│   ├── setup.sh                          # Initial setup
│   ├── backup.sh                         # Backup script
│   ├── restore.sh                        # Restore script
│   ├── update.sh                         # Update script
│   └── health-check.sh
│
├── 📂 docs/                              # Documentation
│   ├── architecture/
│   ├── api/
│   ├── user-guide/
│   ├── deployment/
│   └── development/
│
├── 📂 tests/                             # Test suites
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── simulators/                       # Device simulators
│       ├── s7-simulator/
│       ├── opcua-simulator/
│       └── modbus-simulator/
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── build.yml
│       └── release.yml
│
├── .gitignore
├── LICENSE
└── README.md
```

---

## 🔄 Data Flow Diagrams

### Bidirectional Communication

NEXUS Edge supports **full bidirectional communication** with industrial devices - not just reading data, but also **writing setpoints, commands, and control values** back to PLCs and devices.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      BIDIRECTIONAL COMMUNICATION                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  READ FLOW (Polling / Subscriptions):                                       │
│  ─────────────────────────────────────                                      │
│    Device ──[Protocol Read]──> Gateway ──[MQTT Publish]──> Subscribers      │
│                                                                             │
│  WRITE FLOW (MQTT Commands):                                                │
│  ─────────────────────────────                                              │
│    Frontend/API ──[MQTT]──> Gateway ──[Protocol Write]──> Device            │
│                                                                             │
│  MQTT Command Topics:                                                       │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Write Command:  $nexus/cmd/{device_id}/{tag_id}/set                  │  │
│  │  Payload:        75.5 (raw value) or {"value": 75.5, "request_id":..} │  │
│  │                                                                       │  │
│  │  Response:       $nexus/cmd/response/{device_id}/{tag_id}             │  │
│  │  Payload:        {"success": true, "duration_ms": 45}                 │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Supported Write Operations:                                                │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │  Protocol     │  Writable Types                                    │     │
│  ├───────────────┼────────────────────────────────────────────────────│     │
│  │  Modbus TCP   │  Coils (FC05/15), Holding Registers (FC06/16)      │     │
│  │  OPC UA       │  Any node with write access                        │     │
│  │  S7 (future)  │  DB, Merker, Outputs                               │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1. Device Data Ingestion Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                              DEVICE DATA INGESTION PIPELINE                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────┐     ┌─────────────────────────────────────────────────────────────────┐
    │             │     │                     PROTOCOL GATEWAY (Go)                       │
    │   SIEMENS   │     │  ┌─────────────────────────────────────────────────────────┐    │
    │   S7-1500   │──── │  │                    S7 CLIENT (gos7)                     │    │
    │             │     │  │                                                         │    │
    │  DB1.DBD0   │     │  │  1. Establish TCP connection to PLC (102/TCP)           │    │
    │  DB1.DBD4   │     │  │  2. Authenticate with S7 protocol handshake             │    │
    │  DB1.DBW8   │     │  │  3. Read configured addresses at poll interval          │    │
    └─────────────┘     │  │  4. Parse raw bytes → typed values (REAL, INT, BOOL)    │    │
                        │  │  5. Apply scaling/engineering units                     │    │
                        │  └─────────────────────────┬───────────────────────────────┘    │
                        │                            │                                    │
                        │                            ▼                                    │
                        │  ┌─────────────────────────────────────────────────────────┐    │
                        │  │                  DATA NORMALIZER                        │    │
                        │  │                                                         │    │
                        │  │  Input:  { address: "DB1.DBD0", raw: 0x42A80000 }       │    │
                        │  │  Output: {                                              │    │
                        │  │    tag: "plant1/line2/plc1/temperature",                │    │
                        │  │    value: 84.0,                                         │    │
                        │  │    unit: "°C",                                          │    │
                        │  │    quality: "GOOD",                                     │    │
                        │  │    timestamp: 1700000000000                             │    │
                        │  │  }                                                      │    │
                        │  └─────────────────────────┬───────────────────────────────┘    │
                        └─────────────────────────────┼───────────────────────────────────┘
                                                      │
                                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    EMQX MQTT BROKER                                         │
│                                                                                             │
│   Topic: plant1/line2/plc1/temperature                                                      │
│   Payload: {"v":84.0,"u":"°C","q":"GOOD","ts":1700000000000}                                │
│                                                                                             │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐                         │
│   │   QoS Handling  │    │   Persistence   │    │   Rule Engine   │                         │
│   │   (At least     │    │   (Retained     │    │   (Optional     │                         │
│   │    once/Exactly │    │    messages,    │    │    direct DB    │                         │
│   │    once)        │    │    sessions)    │    │    write)       │                         │
│   └─────────────────┘    └─────────────────┘    └─────────────────┘                         │
│                                                                                             │
│   Subscribers:                                                                              │
│   ├── historian-service (plant1/#)           → Persist to TimescaleDB                       │
│   ├── flow-engine (plant1/line2/+/temperature) → Process in Node-RED flows                  │
│   ├── alert-service (plant1/+/+/temperature)  → Evaluate alert rules                        │
│   └── frontend-gateway (plant1/line2/plc1/#)  → Push to WebSocket clients                   │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
                    │                    │                    │                    │
                    ▼                    ▼                    ▼                    ▼
    ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
    │     HISTORIAN     │  │    FLOW ENGINE    │  │   ALERT SERVICE   │  │     FRONTEND      │
    │                   │  │                   │  │                   │  │                   │
    │  TimescaleDB      │  │  Node-RED         │  │  Rule evaluation: │  │  WebSocket push   │
    │  INSERT INTO      │  │  Custom logic:    │  │  IF value > 90    │  │  to browser for   │
    │  metrics (...)    │  │  - Transform      │  │  THEN trigger     │  │  real-time        │
    │  VALUES (...)     │  │  - Aggregate      │  │  alert + notify   │  │  dashboard        │
    │                   │  │  - Forward        │  │                   │  │  updates          │
    └───────────────────┘  └───────────────────┘  └───────────────────┘  └───────────────────┘
```

### 2. User Interaction: Adding a New Device

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                           USER WORKFLOW: ADD NEW DEVICE                                     │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────────┐
    │                          NEXUS CONTROL CENTER (Browser)                             │
    │                                                                                     │
    │   ┌──────────────────────────────────────────────────────────────────────────────┐  │
    │   │  STEP 1: Select Protocol                                                     │  │
    │   │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐             │  │
    │   │  │  ┌───────┐  │ │  ┌───────┐  │ │  ┌───────┐  │ │  ┌───────┐  │             │  │
    │   │  │  │  S7   │  │ │  │OPC UA │  │ │  │Modbus │  │ │  │ MQTT  │  │             │  │
    │   │  │  └───────┘  │ │  └───────┘  │ │  └───────┘  │ │  └───────┘  │             │  │
    │   │  │  Siemens    │ │  OPC UA     │ │  Modbus     │ │  Native     │             │  │
    │   │  │  S7-300/400 │ │  Client     │ │  TCP/RTU    │ │  MQTT       │             │  │
    │   │  │  S7-1200    │ │             │ │             │ │  Device     │             │  │
    │   │  │  S7-1500    │ │             │ │             │ │             │             │  │
    │   │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘             │  │
    │   │                         ▲ SELECTED                                           │  │
    │   └─────────────────────────┼────────────────────────────────────────────────────┘  │
    │                             │                                                       │
    │   ┌─────────────────────────▼────────────────────────────────────────────────────┐  │
    │   │  STEP 2: Connection Configuration                                            │  │
    │   │  ┌────────────────────────────────────────────────────────────────────────┐  │  │
    │   │  │  OPC UA Server Endpoint                                                │  │  │
    │   │  │  ┌──────────────────────────────────────────────────────────────────┐  │  │  │
    │   │  │  │  opc.tcp://192.168.1.50:4840                                     │  │  │  │
    │   │  │  └──────────────────────────────────────────────────────────────────┘  │  │  │
    │   │  │                                                                        │  │  │
    │   │  │  Security Mode: ○ None  ● Sign  ○ SignAndEncrypt                       │  │  │
    │   │  │  Authentication: ○ Anonymous  ● Username/Password  ○ Certificate       │  │  │
    │   │  │                                                                        │  │  │
    │   │  │  ┌────────────────────┐  ┌────────────────────┐                        │  │  │
    │   │  │  │ Username: operator │  │ Password: ●●●●●●●● │                        │  │  │
    │   │  │  └────────────────────┘  └────────────────────┘                        │  │  │
    │   │  │                                                                        │  │  │
    │   │  │  [ Test Connection ]   Connection successful!                          │  │  │
    │   │  └────────────────────────────────────────────────────────────────────────┘  │  │
    │   └─────────────────────────┬────────────────────────────────────────────────────┘  │
    │                             │                                                       │
    │   ┌─────────────────────────▼────────────────────────────────────────────────────┐  │
    │   │  STEP 3: Browse & Select Tags                                                │  │
    │   │  ┌────────────────────────────────────────────────────────────────────────┐  │  │
    │   │  │  Search tags...                                                        │  │  │
    │   │  ├────────────────────────────────────────────────────────────────────────┤  │  │
    │   │  │  📁 Objects                                                            │  │  │
    │   │  │    📁 Server                                                           │  │  │
    │   │  │    📁 DeviceSet                                                        │  │  │
    │   │  │      📁 PLC_1                                                          │  │  │
    │   │  │        📁 DataBlocksGlobal                                             │  │  │
    │   │  │          ☑️ Temperature        REAL     84.5        (auto-discovered)  │  │  │
    │   │  │          ☑️ Pressure           REAL     2.4         (auto-discovered)  │  │  │
    │   │  │          ☐ MotorSpeed         INT      1750                            │  │  │
    │   │  │          ☑️ ValveStatus       BOOL     TRUE        (auto-discovered)   │  │  │
    │   │  │        📁 Alarms                                                       │  │  │
    │   │  │          ☐ HighTemp           BOOL     FALSE                           │  │  │
    │   │  └────────────────────────────────────────────────────────────────────────┘  │  │
    │   └─────────────────────────┬────────────────────────────────────────────────────┘  │
    │                             │                                                       │
    │   ┌─────────────────────────▼────────────────────────────────────────────────────┐  │
    │   │  STEP 4: Map to Unified Namespace                                            │  │
    │   │  ┌────────────────────────────────────────────────────────────────────────┐  │  │
    │   │  │  Source Tag              →    MQTT Topic (Unified Namespace)           │  │  │
    │   │  ├────────────────────────────────────────────────────────────────────────┤  │  │
    │   │  │  Temperature             →    plant1/line2/mixer1/temperature          │  │  │
    │   │  │  Pressure                →    plant1/line2/mixer1/pressure             │  │  │
    │   │  │  ValveStatus             →    plant1/line2/mixer1/inlet_valve          │  │  │
    │   │  └────────────────────────────────────────────────────────────────────────┘  │  │
    │   │                                                                              │  │
    │   │  Poll Interval: [ 1000 ] ms    [ ] Subscribe to changes (OPC UA monitored)   │  │
    │   │                                                                              │  │
    │   │                    [ Cancel ]  [ Back ]  [  Deploy Device ]                  │  │
    │   └──────────────────────────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────────────────────────┘
                                            │
                                            │ HTTP POST /api/devices
                                            │ {
                                            │   "name": "Mixer 1 OPC UA",
                                            │   "protocol": "opcua",
                                            │   "connection": { ... },
                                            │   "tags": [ ... ]
                                            │ }
                                            ▼
    ┌──────────────────────────────────────────────────────────────────────────────────────┐
    │                              GATEWAY-CORE SERVICE                                    │
    │                                                                                      │
    │   1. Validate configuration                                                          │
    │   2. Store device config in PostgreSQL                                               │
    │   3. Notify Protocol Gateway via internal message                                    │
    │   4. Return device ID to frontend                                                    │
    └──────────────────────────┬───────────────────────────────────────────────────────────┘
                               │
                               ▼
    ┌──────────────────────────────────────────────────────────────────────────────────────┐
    │                            PROTOCOL GATEWAY SERVICE (Go)                             │
    │                                                                                      │
    │   1. Receive new device configuration from gateway-core                              │
    │   2. Instantiate protocol client (OPC UA, S7, Modbus)                                │
    │   3. Create subscriptions/pollers for selected tags                                  │
    │   4. Start publishing to MQTT on value change                                        │
    │   5. Report health status back to gateway-core                                       │
    └──────────────────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
    ┌──────────────────────────────────────────────────────────────────────────────────────┐
    │  Device "Mixer 1 OPC UA" is now online and streaming data to:                        │
    │     • plant1/line2/mixer1/temperature                                                │
    │     • plant1/line2/mixer1/pressure                                                   │
    │     • plant1/line2/mixer1/inlet_valve                                                │
    └──────────────────────────────────────────────────────────────────────────────────────┘
```

### 3. Container Orchestration Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                          CONTAINER MANAGEMENT WORKFLOW                                      │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────────┐
    │                          NEXUS CONTROL CENTER - Containers                          │
    │                                                                                     │
    │   ┌──────────────────────────────────────────────────────────────────────────────┐  │
    │   │  🐳 Running Containers                                    [ + Deploy New ]   │  │
    │   ├──────────────────────────────────────────────────────────────────────────────┤  │
    │   │                                                                              │  │
    │   │   ┌─────────────────────────────────────────────────────────────────────┐    │  │
    │   │   │  🟢 emqx                                                            │    │  │
    │   │   │  ───────────────────────────────────────────────────────────────────│    │  │
    │   │   │  Image: emqx/emqx:5.3.0           Uptime: 14d 3h 22m                │    │  │
    │   │   │  CPU: ████████░░ 78%              Memory: ██████░░░░ 512MB/1GB      │    │  │
    │   │   │  Ports: 1883, 8883, 18083         Network I/O: ↓2.3GB ↑4.1GB        │    │  │
    │   │   │                                                                     │    │  │
    │   │   │  [ 📋 Logs ]  [ 🔄 Restart ]  [ ⚙️ Config ]  [ 📊 Metrics ]       │    │  │
    │   │   └─────────────────────────────────────────────────────────────────────┘    │  │
    │   │                                                                              │  │
    │   │   ┌─────────────────────────────────────────────────────────────────────┐    │  │
    │   │   │  🟢 historian                                                       │    │  │
    │   │   │  ───────────────────────────────────────────────────────────────────│    │  │
    │   │   │  Image: timescale/timescaledb:2.12.0-pg15    Uptime: 14d 3h 22m     │    │  │
    │   │   │  CPU: ██░░░░░░░░ 22%              Memory: ████████░░ 2.1GB/4GB      │    │  │
    │   │   │  Disk: 47GB used                  Connections: 12 active            │    │  │
    │   │   │                                                                     │    │  │
    │   │   │  [ 📋 Logs ]  [ 🔄 Restart ]  [ ⚙️ Config ]  [ 📊 Metrics ]       │    │  │
    │   │   └─────────────────────────────────────────────────────────────────────┘    │  │
    │   │                                                                              │  │
    │   │   ┌─────────────────────────────────────────────────────────────────────┐    │  │
    │   │   │  🟡 flow-engine (High CPU)                                          │   │  │
    │   │   │  ───────────────────────────────────────────────────────────────────│    │  │
    │   │   │  Image: nexus/flow-engine:1.2.0          Uptime: 3d 7h 45m          │    │  │
    │   │   │  CPU: ██████████ 95% ⚠️           Memory: █████░░░░░ 384MB/768MB    │    │  │
    │   │   │  Active Flows: 23                  Messages/sec: 4,521              │    │  │
    │   │   │                                                                     │    │  │
    │   │   │  [ 📋 Logs ]  [ 🔄 Restart ]  [ ⚙️ Config ]  [ 📈 Scale Up ]      │    │  │
    │   │   └─────────────────────────────────────────────────────────────────────┘    │  │
    │   │                                                                              │  │
    │   └──────────────────────────────────────────────────────────────────────────────┘  │
    │                                                                                     │
    │   ┌──────────────────────────────────────────────────────────────────────────────┐  │
    │   │  📦 App Catalog                                                              │  │
    │   ├──────────────────────────────────────────────────────────────────────────────┤  │
    │   │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐  │  │
    │   │  │ Grafana    │ │ AI         │ │ Python     │ │ InfluxDB   │ │ Custom     │  │  │
    │   │  │ Analytics  │ │ Inference  │ │ Notebook   │ │ Bridge     │ │ Image...   │  │  │
    │   │  │  [Deploy]  │ │  [Deploy]  │ │  [Deploy]  │ │  [Deploy]  │ │  [Deploy]  │  │  │
    │   │  └────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────┘  │  │
    │   └──────────────────────────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────────────────────────┘
                                            │
                                            │ User clicks "Scale Up" on flow-engine
                                            ▼
    ┌──────────────────────────────────────────────────────────────────────────────────────┐
    │                           ORCHESTRATOR SERVICE                                       │
    │                                                                                      │
    │   ┌─────────────────────────────────────────────────────────────────────────────┐    │
    │   │  Detected: K3s Kubernetes Cluster                                           │    │
    │   │                                                                             │    │
    │   │  Action: Scale Deployment "flow-engine" from 1 → 2 replicas                 │    │
    │   │                                                                             │    │
    │   │  kubectl scale deployment flow-engine --replicas=2 -n nexus                 │    │
    │   │                                                                             │    │
    │   │  Result:                                                                    │    │
    │   │  ┌───────────────────────────────────────────────────────────────────────┐  │    │
    │   │  │  NAME                              READY   STATUS    RESTARTS   AGE   │  │    │
    │   │  │  flow-engine-7b9f8c6d4-abc12       1/1     Running   0          3d    │  │    │
    │   │  │  flow-engine-7b9f8c6d4-xyz99       1/1     Running   0          10s   │  │    │
    │   │  └───────────────────────────────────────────────────────────────────────┘  │    │
    │   │                                                                             │    │
    │   │  Load balancer automatically distributes MQTT subscriptions across pods     │    │
    │   └─────────────────────────────────────────────────────────────────────────────┘    │
    │                                                                                      │
    └──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎨 Frontend Design Philosophy

### Native Integration, Not Embedded Iframes

NEXUS takes a fundamentally different approach from platforms that simply embed third-party tools. Instead of showing FlowFuse, Portainer, or Grafana in iframes, NEXUS provides **native UI components** that communicate directly with backend services via APIs.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                             │
│   ❌ TRADITIONAL APPROACH                      ✅ NEXUS APPROACH                           │
│                                                                                             │
│   ┌─────────────────────────────┐             ┌─────────────────────────────┐               │
│   │ Your App                    │             │ NEXUS Control Center        │               │
│   │ ┌─────────────────────────┐ │             │                             │               │
│   │ │ <iframe src="portainer">│ │             │ ┌─────────────────────────┐ │               │
│   │ │                         │ │             │ │ Native ContainerList    │ │               │
│   │ │   Portainer UI          │ │   ──────    │ │ component that calls    │ │               │
│   │ │   (different styling)   │ │             │ │ K8s/Docker API directly │ │               │
│   │ │   (separate auth)       │ │             │ │ (unified styling)       │ │               │
│   │ │                         │ │             │ │ (single auth)           │ │               │
│   │ └─────────────────────────┘ │             │ └─────────────────────────┘ │               │
│   └─────────────────────────────┘             └─────────────────────────────┘               │
│                                                                                             │
│   Problems:                                    Benefits:                                    │
│   • Inconsistent UX                            • Unified design system                      │
│   • Multiple auth sessions                     • Single sign-on                             │
│   • No deep integration                        • Deep data integration                      │
│   • iframe security issues                     • Custom workflows                           │
│   • Poor mobile experience                     • Responsive design                          │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Visual Flow Designer (Not Just Node-RED Iframe)

Instead of embedding Node-RED's editor, NEXUS provides a **custom flow designer** built with React Flow that:

1. **Matches the design system** - Same colors, typography, and interactions as the rest of the app
2. **Integrates deeply with devices** - Drag a device from the device tree directly onto the canvas
3. **Live debugging** - See real-time data flowing through connections
4. **Version control** - Built-in git-like versioning of flows
5. **Collaborative editing** - Multiple users can edit simultaneously

```tsx
// Example: Custom Device Read Node Component
const DeviceReadNode = ({ data, selected }) => {
  const { deviceId, tagPath, lastValue, quality } = data;
  const device = useDevice(deviceId);
  
  return (
    <NodeWrapper selected={selected} nodeType="input">
      <NodeHeader 
        icon={<PLCIcon />} 
        title={device?.name} 
        status={quality}
      />
      <NodeBody>
        <TagSelector 
          deviceId={deviceId} 
          value={tagPath}
          onChange={data.onTagChange}
        />
        <LiveValue value={lastValue} unit={data.unit} />
      </NodeBody>
      <Handle type="source" position={Position.Right} />
    </NodeWrapper>
  );
};
```

### Dashboard Builder (Not Just Grafana Embed)

NEXUS includes a native dashboard builder that provides:

1. **Drag-and-drop widget placement** on a responsive grid
2. **Real-time data bindings** directly from MQTT topics
3. **Industrial widget library** - Gauges, trends, alarms, SCADA-style displays
4. **SVG overlay support** - Upload process diagrams, bind values to elements
5. **Operator mode** - Simplified, high-contrast view for factory floor displays

---

## 🔌 API Reference

### REST API Endpoints

```yaml
# Authentication
POST   /api/auth/login                    # Login, returns JWT
POST   /api/auth/refresh                  # Refresh JWT token
POST   /api/auth/logout                   # Invalidate session

# Devices
GET    /api/devices                       # List all devices
POST   /api/devices                       # Create new device
GET    /api/devices/:id                   # Get device details
PUT    /api/devices/:id                   # Update device config
DELETE /api/devices/:id                   # Remove device
POST   /api/devices/:id/test              # Test device connection
GET    /api/devices/:id/tags              # Get device tags
POST   /api/devices/:id/browse            # Browse available tags (OPC UA)
GET    /api/devices/:id/values            # Get current tag values

# Protocol Discovery
POST   /api/discovery/scan                # Start network scan
GET    /api/discovery/results             # Get discovered devices
POST   /api/discovery/opcua/browse        # Browse OPC UA server

# Flows
GET    /api/flows                         # List all flows
POST   /api/flows                         # Create new flow
GET    /api/flows/:id                     # Get flow definition
PUT    /api/flows/:id                     # Update flow
DELETE /api/flows/:id                     # Delete flow
POST   /api/flows/:id/deploy              # Deploy flow to engine
POST   /api/flows/:id/stop                # Stop flow execution
GET    /api/flows/:id/debug               # Get flow debug info

# Historian
GET    /api/historian/query               # Query time-series data
POST   /api/historian/query               # Complex query with body
GET    /api/historian/tags                # List available metrics
GET    /api/historian/retention           # Get retention policies
PUT    /api/historian/retention           # Update retention policies
POST   /api/historian/export              # Export data to file

# Dashboards
GET    /api/dashboards                    # List dashboards
POST   /api/dashboards                    # Create dashboard
GET    /api/dashboards/:id                # Get dashboard config
PUT    /api/dashboards/:id                # Update dashboard
DELETE /api/dashboards/:id                # Delete dashboard

# Containers
GET    /api/containers                    # List containers/pods
POST   /api/containers                    # Deploy new container
GET    /api/containers/:id                # Get container details
DELETE /api/containers/:id                # Remove container
POST   /api/containers/:id/start          # Start container
POST   /api/containers/:id/stop           # Stop container
POST   /api/containers/:id/restart        # Restart container
GET    /api/containers/:id/logs           # Get container logs (streaming)
GET    /api/containers/:id/metrics        # Get resource metrics
POST   /api/containers/:id/scale          # Scale replicas (K8s)

# Alerts
GET    /api/alerts                        # List alert rules
POST   /api/alerts                        # Create alert rule
GET    /api/alerts/:id                    # Get alert rule
PUT    /api/alerts/:id                    # Update alert rule
DELETE /api/alerts/:id                    # Delete alert rule
GET    /api/alerts/active                 # List active alerts
POST   /api/alerts/:id/acknowledge        # Acknowledge alert

# System
GET    /api/system/health                 # System health check
GET    /api/system/metrics                # System metrics
GET    /api/system/info                   # Version, uptime, etc.
POST   /api/system/backup                 # Create backup
POST   /api/system/restore                # Restore from backup
GET    /api/system/logs                   # System logs
```

### WebSocket API

```typescript
// Connection
const ws = new WebSocket('wss://nexus.local/api/ws');
ws.onopen = () => {
  // Authenticate
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'jwt-token-here'
  }));
};

// Subscribe to real-time data
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'devices',
  filter: { deviceId: 'plc-001' }
}));

ws.send(JSON.stringify({
  type: 'subscribe', 
  channel: 'mqtt',
  topics: ['plant1/line2/#']
}));

ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'alerts'
}));

ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'containers',
  filter: { namespace: 'nexus' }
}));

// Receive messages
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  
  switch (msg.channel) {
    case 'mqtt':
      // { channel: 'mqtt', topic: 'plant1/...', payload: {...}, ts: 123 }
      break;
    case 'alerts':
      // { channel: 'alerts', type: 'triggered', alert: {...} }
      break;
    case 'containers':
      // { channel: 'containers', type: 'status_change', container: {...} }
      break;
  }
};
```

---

## 🛡️ Security Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 SECURITY LAYERS                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  LAYER 1: NETWORK SEGMENTATION                                                              │
│                                                                                             │
│   ┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐           │
│   │    OT NETWORK       │     │    EDGE PLATFORM    │     │    IT NETWORK       │           │
│   │   (192.168.1.0/24)  │     │   (10.0.0.0/24)     │     │   (Corporate)       │           │
│   │                     │     │                     │     │                     │           │
│   │  • PLCs             │──── │  • Protocol Gateway │──── │  • Cloud Agent      │─────────▶ Cloud
│   │  • Sensors          │     │  • EMQX Broker      │     │  • Management UI    │           │
│   │  • Field Devices    │     │  • Historian        │     │                     │           │
│   │                     │     │                     │     │                     │           │
│   │  Firewall Rules:    │     │  Firewall Rules:    │     │  Firewall Rules:    │           │
│   │  - Only S7/OPC/Mod  │     │  - No inbound from  │     │  - HTTPS only       │           │
│   │    ports allowed    │     │    IT unless auth   │     │  - Outbound TLS     │           │
│   └─────────────────────┘     └─────────────────────┘     └─────────────────────┘           │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  LAYER 2: AUTHENTICATION & AUTHORIZATION                                                    │
│                                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│   │  Identity Provider                                                                  │   │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │   │
│   │  │ Local Users  │  │    LDAP/AD   │  │    OAuth2    │  │    SAML      │             │   │
│   │  │  (default)   │  │  (enterprise)│  │   (cloud)    │  │  (federated) │             │   │
│   │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘             │   │
│   └─────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│   │  Role-Based Access Control (RBAC)                                                   │   │
│   │                                                                                     │   │
│   │   Role: Admin                  Role: Engineer               Role: Operator          │   │
│   │   ┌────────────────────┐       ┌────────────────────┐       ┌────────────────────┐  │   │
│   │   │ • All permissions  │       │ • View devices     │       │ • View dashboards  │  │   │
│   │   │ • User management  │       │ • Edit devices     │       │ • Acknowledge      │  │   │
│   │   │ • System config    │       │ • Create flows     │       │   alerts           │  │   │
│   │   │ • Container mgmt   │       │ • Edit dashboards  │       │ • View device      │  │   │
│   │   │ • Security config  │       │ • Query historian  │       │   status           │  │   │
│   │   └────────────────────┘       └────────────────────┘       └────────────────────┘  │   │
│   │                                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  LAYER 3: TRANSPORT SECURITY                                                                │
│                                                                                             │
│   ┌───────────────────────────────────────────────────────────────────────────────────┐     │
│   │  All communications encrypted:                                                    │     │
│   │                                                                                   │     │
│   │  • Frontend ↔ Gateway:    HTTPS/TLS 1.3                                           │     │
│   │  • Gateway ↔ Services:    mTLS (mutual TLS)                                       │     │
│   │  • MQTT (internal):       TLS with client certificates                            │     │
│   │  • MQTT (external):       TLS on port 8883                                        │     │
│   │  • Database connections:  TLS + SCRAM-SHA-256                                     │     │
│   │  • Cloud sync:            TLS 1.3 with certificate pinning                        │     │
│   │                                                                                   │     │
│   └───────────────────────────────────────────────────────────────────────────────────┘     │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  LAYER 4: DATA PROTECTION                                                                   │
│                                                                                             │
│   • Secrets Management:      HashiCorp Vault or Kubernetes Secrets (encrypted at rest)      │
│   • Database Encryption:     TDE (Transparent Data Encryption) for TimescaleDB              │
│   • Backup Encryption:       AES-256 encryption for all backup files                        │
│   • Audit Logging:           All security events logged and tamper-evident                  │
│   • PLC Credentials:         Encrypted storage, never logged or exposed in UI               │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Quick Start

### Prerequisites

- Docker Engine 24.0+ and Docker Compose 2.20+
- OR K3s 1.28+ for Kubernetes deployment
- 8GB RAM minimum (16GB recommended)
- 100GB SSD storage
- Network access to PLCs/devices

### Option 1: Docker Compose (Development/Small Deployments)

```bash
# Clone the repository
git clone https://github.com/your-org/nexus-edge.git
cd nexus-edge

# Copy environment template
cp infrastructure/docker/.env.example infrastructure/docker/.env

# Edit configuration
nano infrastructure/docker/.env

# Start all services
cd infrastructure/docker
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Access the UI
open https://localhost:8443
```

### Option 2: K3s Kubernetes (Production)

```bash
# Install K3s (single node)
curl -sfL https://get.k3s.io | sh -

# Wait for K3s to be ready
sudo k3s kubectl get nodes

# Clone repository
git clone https://github.com/your-org/nexus-edge.git
cd nexus-edge

# Apply Kubernetes manifests
sudo k3s kubectl apply -k infrastructure/k8s/overlays/production

# Check pod status
sudo k3s kubectl get pods -n nexus -w

# Get the LoadBalancer IP
sudo k3s kubectl get svc -n nexus nexus-frontend

# Access the UI
open https://<EXTERNAL-IP>
```

### First Login

1. Navigate to `https://localhost:8443` (or your server IP)
2. Default credentials: `admin` / `nexus-admin-2024!`
3. **Change the password immediately** in Settings → Security
4. Configure your first device in Devices → Add Device

---

## 📊 Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React 18, TypeScript, Vite | UI framework |
| | TailwindCSS, Radix UI | Styling & components |
| | React Flow | Flow diagram editor |
| | Recharts, Visx | Data visualization |
| | Zustand | State management |
| | TanStack Query | Data fetching |
| **API Gateway** | TypeScript, Fastify | REST API, WebSocket proxy |
| | jsonwebtoken | Authentication |
| | Socket.IO | WebSocket |
| **Protocol Gateway** | **Go** | High-performance protocol conversion |
| | gos7 | Siemens S7 protocol |
| | gopcua | OPC UA client |
| | go-modbus | Modbus TCP/RTU |
| **Data Ingestion** | **Go** | High-throughput MQTT → TimescaleDB |
| | pgx (COPY) | 200K+ points/sec batch writes |
| | paho.mqtt.golang | Shared subscriptions for scaling |
| **Alert Service** | **Go** | Real-time rule evaluation |
| **Orchestrator** | **Go** | Container/K8s management |
| | docker/docker | Docker API client |
| | client-go | Kubernetes API |
| **Message Broker** | EMQX 5.x | MQTT broker |
| **Flow Engine** | Node-RED (optional) | User-defined automation |
| **Historian DB** | TimescaleDB 2.x | Time-series storage |
| **Config Store** | PostgreSQL 15 | Configuration data |
| **Orchestration** | K3s / Docker | Container management |
| **Observability** | Prometheus, Grafana | Metrics (optional) |

> **Why Go for backend services?** Go provides excellent concurrency (goroutines), low memory footprint (~10x less than Node.js), and single binary deployment. See [docs/QUESTIONS.md](docs/QUESTIONS.md) for detailed rationale.

---

## 🗺️ Roadmap

> 📋 **Full roadmap with detailed timelines: [ROADMAP.md](ROADMAP.md)**

```
Phase 1: Foundation          ████████████████████ 100% ✅
Phase 2: Kubernetes          ████████████████░░░░  85% ✅
Phase 3: Gateway Core        ░░░░░░░░░░░░░░░░░░░░   0% ⏳
Phase 4: Analytics           ░░░░░░░░░░░░░░░░░░░░   0% 📋
Phase 5: Enterprise          ░░░░░░░░░░░░░░░░░░░░   0% 📋
```

### ✅ Completed
- Protocol Gateway (Modbus, OPC UA, S7) with bidirectional communication
- Connection pooling, circuit breakers, worker pools
- EMQX broker integration with shared subscriptions
- Data Ingestion Service (MQTT → TimescaleDB with COPY protocol)
- Kubernetes manifests (Kustomize) with HPA, PDB, RBAC
- EMQX 3-node clustering with DNS discovery

### ⏳ In Progress (Phase 2)
- TimescaleDB High Availability (Patroni)

### 📋 Next Up (Phase 3)
- Gateway Core Service (device management API)
- Web UI for device configuration
- Dynamic device registration (hot-reload)
- Data Normalizer (unit conversion, scaling)

See [ROADMAP.md](ROADMAP.md) for the complete 5-phase plan through v1.0 release.

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.

```bash
# Fork the repository
# Clone your fork
git clone https://github.com/YOUR_USERNAME/nexus-edge.git

# Create a feature branch
git checkout -b feature/amazing-feature

# Make your changes
# ...

# Run tests
npm run test

# Commit with conventional commits
git commit -m "feat(devices): add BACnet protocol support"

# Push and create PR
git push origin feature/amazing-feature
```

---

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [EMQX](https://www.emqx.io/) - High-performance MQTT broker
- [gos7](https://github.com/robinson/gos7) - Go Siemens S7 library
- [gopcua](https://github.com/gopcua/opcua) - Go OPC UA library
- [Node-RED](https://nodered.org/) - Flow-based programming inspiration
- [TimescaleDB](https://www.timescale.com/) - Time-series database
- [Litmus Edge](https://litmus.io/) - Industrial IoT platform inspiration
- [React Flow](https://reactflow.dev/) - Flow diagram library

---

<div align="center">

**Built with ❤️ for the industrial world**

[Documentation](docs/) · [Report Bug](issues) · [Request Feature](issues)

</div>

