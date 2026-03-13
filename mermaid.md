# NEXUS Edge — Complete Platform Architecture

## 1. System Overview

```mermaid
graph TB
  subgraph External["🌐 External Access"]
    Browser["🖥️ Browser<br/><i>localhost</i>"]
    MQTTClient["📡 MQTT Client<br/><i>MQTT Explorer / External Systems</i>"]
  end

  subgraph EntryPoints["🚪 Entry Points"]
    Nginx["<b>Nginx Reverse Proxy</b><br/>Port 80 / 443<br/><i>SSL termination, routing</i>"]
    EMQXExternal["<b>EMQX (External)</b><br/>TCP 1884 · WS 8083 · SSL 8883<br/>Dashboard 18083"]
  end

  subgraph CoreServices["⚙️ Core Application Services"]
    WebUI["<b>Web UI</b><br/>React + Vite + Tailwind<br/>Port 8080 → nginx:80<br/><i>SPA + /grafana/ proxy</i>"]
    GatewayCore["<b>Gateway Core</b><br/>Fastify (Node.js/TS)<br/>Port 3001<br/><i>Config API · WebSocket Bridge<br/>Swagger /docs · RBAC</i>"]
    ProtocolGW["<b>Protocol Gateway</b><br/>Go · StatefulSet(1)<br/>Port 8085<br/><i>OPC UA · Modbus · S7<br/>Polling · Commands · Browse</i>"]
    DataIngestion["<b>Data Ingestion</b><br/>Go · Deployment(N)<br/>Port 7000 (pub) · 8081 (int)<br/><i>MQTT → TimescaleDB<br/>COPY protocol · Batching</i>"]
  end

  subgraph MessageBus["📨 Message Bus"]
    EMQX["<b>EMQX 5.3</b><br/>MQTT Broker<br/>Internal 1883<br/><i>100k connections · Shared subs<br/>QoS 0/1/2 · Retain</i>"]
  end

  subgraph DataStores["🗄️ Data Stores"]
    Postgres["<b>PostgreSQL 15</b><br/>Config Database<br/>Port 5433 → 5432<br/><i>nexus_config<br/>devices · tags · audit_log</i>"]
    TimescaleDB["<b>TimescaleDB 2.13</b><br/>Time-Series Historian<br/>Port 5432<br/><i>nexus_historian<br/>metrics · 1min/1hour aggregates</i>"]
  end

  subgraph Monitoring["📊 Monitoring Stack <i>(profile: monitoring)</i>"]
    Prometheus["<b>Prometheus</b><br/>Port 9090<br/><i>15s scrape interval</i>"]
    Grafana["<b>Grafana 10.2</b><br/>Port 3000 · /grafana/<br/><i>Auto-provisioned datasources<br/>Embedded in Web UI</i>"]
  end

  subgraph Testing["🧪 Testing <i>(profile: testing)</i>"]
    OPCUASim["<b>OPC UA Simulator</b><br/>Port 4840<br/><i>Simulated PLC tags</i>"]
  end

  subgraph FieldDevices["🏭 Field Devices (Level 1-2)"]
    PLC_OPCUA["OPC UA Devices<br/><i>S7-1500, B&R, Beckhoff</i>"]
    PLC_Modbus["Modbus Devices<br/><i>TCP/RTU slaves</i>"]
    PLC_S7["Siemens S7<br/><i>S7-1200/1500 via TCP/102</i>"]
  end

  %% External → Entry Points
  Browser -->|"HTTP/WS"| Nginx
  MQTTClient -->|"MQTT TCP 1884"| EMQXExternal

  %% Nginx routing
  Nginx -->|"/ → static SPA"| WebUI
  Nginx -->|"/api/* → proxy"| GatewayCore
  Nginx -->|"/health/* → proxy"| GatewayCore
  Nginx -->|"/ws → upgrade"| GatewayCore

  %% WebUI internal proxy
  WebUI -.->|"/grafana/ → proxy"| Grafana
  WebUI -.->|"/api/ → gateway-core:3001"| GatewayCore

  %% Gateway Core connections
  GatewayCore -->|"SQL<br/>devices, tags, audit"| Postgres
  GatewayCore -->|"MQTT pub/sub<br/>config sync, status"| EMQX
  GatewayCore -->|"HTTP proxy<br/>browse, test, certs"| ProtocolGW
  GatewayCore -->|"HTTP proxy<br/>/api/historian/history"| DataIngestion

  %% Protocol Gateway connections
  ProtocolGW -->|"MQTT publish<br/>UNS data topics"| EMQX
  ProtocolGW -->|"MQTT subscribe<br/>config + commands"| EMQX
  ProtocolGW -->|"OPC UA<br/>TCP 4840"| PLC_OPCUA
  ProtocolGW -->|"Modbus TCP<br/>Port 502"| PLC_Modbus
  ProtocolGW -->|"S7 ISO-on-TCP<br/>Port 102"| PLC_S7
  ProtocolGW -.->|"OPC UA sim"| OPCUASim

  %% Data Ingestion connections
  DataIngestion -->|"MQTT subscribe<br/>$share/ingestion/#"| EMQX
  DataIngestion -->|"pgx COPY protocol<br/>bulk insert"| TimescaleDB

  %% EMQX external
  EMQXExternal ---|"same broker"| EMQX

  %% Monitoring
  Prometheus -->|"scrape /metrics"| ProtocolGW
  Prometheus -->|"scrape /metrics"| DataIngestion
  Prometheus -->|"scrape stats API"| EMQX
  Grafana -->|"query"| Prometheus
  Grafana -->|"query"| TimescaleDB
  Grafana -->|"query"| Postgres

  %% Styles
  classDef service fill:#1e3a5f,stroke:#3b82f6,stroke-width:2px,color:#e2e8f0
  classDef infra fill:#1a1a2e,stroke:#8b5cf6,stroke-width:2px,color:#e2e8f0
  classDef store fill:#1a2e1a,stroke:#22c55e,stroke-width:2px,color:#e2e8f0
  classDef monitor fill:#2e2a1a,stroke:#eab308,stroke-width:2px,color:#e2e8f0
  classDef external fill:#2e1a1a,stroke:#ef4444,stroke-width:2px,color:#e2e8f0
  classDef field fill:#1a2e2e,stroke:#06b6d4,stroke-width:2px,color:#e2e8f0

  class WebUI,GatewayCore,ProtocolGW,DataIngestion service
  class Nginx,EMQX,EMQXExternal infra
  class Postgres,TimescaleDB store
  class Prometheus,Grafana monitor
  class Browser,MQTTClient external
  class PLC_OPCUA,PLC_Modbus,PLC_S7,OPCUASim field
```

---

## 2. Data Read Path (Device → Browser)

```mermaid
sequenceDiagram
  autonumber
  participant PLC as 🏭 PLC / Field Device
  participant PG as ⚙️ Protocol Gateway
  participant EMQX as 📨 EMQX Broker
  participant DI as 📥 Data Ingestion
  participant TSDB as 🗄️ TimescaleDB
  participant GC as 🔌 Gateway Core
  participant UI as 🖥️ Web UI (Browser)

  rect rgb(30, 58, 95)
    Note over PLC,PG: Step 1: Poll Device
    PG->>PLC: OPC UA Read / Modbus Read / S7 Read
    PLC-->>PG: Raw values + quality codes
    PG->>PG: Scale, clamp, apply deadband
  end

  rect rgb(40, 30, 70)
    Note over PG,EMQX: Step 2: Publish to UNS
    PG->>EMQX: PUBLISH ghent/prd/line1/temp<br/>{ value: 21.5, quality: 192 }
    PG->>EMQX: PUBLISH $nexus/status/devices/{id}<br/>{ status: "online" }
  end

  rect rgb(30, 70, 40)
    Note over EMQX,TSDB: Step 3: Ingest & Persist
    EMQX->>DI: DELIVER (shared sub: $share/ingestion/#)
    DI->>DI: Buffer message (batch_size=1000 or 5s flush)
    DI->>TSDB: pgx COPY INTO metrics(time, topic, value, quality)
    TSDB->>TSDB: Continuous aggregates (1min, 1hour)
  end

  rect rgb(70, 50, 20)
    Note over GC,UI: Step 4a: Real-time Push (WebSocket)
    EMQX->>GC: DELIVER ghent/prd/line1/temp
    GC->>UI: WS: { type:"data", topic, payload, timestamp }
  end

  rect rgb(50, 30, 30)
    Note over UI,TSDB: Step 4b: Historical Query
    UI->>GC: GET /api/historian/history?topic=...&from=...&to=...
    GC->>DI: HTTP proxy → /api/history?topic=...
    DI->>TSDB: SELECT time, value, quality FROM metrics WHERE ...
    TSDB-->>DI: Time-series rows + stats (avg/min/max/count)
    DI-->>GC: JSON { topic, stats, points[] }
    GC-->>UI: Forward response
    UI->>UI: Render recharts LineChart + stats table
  end
```

---

## 3. Data Write Path (Command → Device)

```mermaid
sequenceDiagram
  autonumber
  participant Ext as 📡 External System / UI
  participant EMQX as 📨 EMQX Broker
  participant CH as ⚙️ Command Handler<br/>(Protocol Gateway)
  participant Driver as 🔌 Protocol Driver<br/>(OPC UA / Modbus / S7)
  participant PLC as 🏭 PLC / Field Device

  rect rgb(50, 30, 30)
    Note over Ext,EMQX: Step 1: Issue Command
    Ext->>EMQX: PUBLISH $nexus/cmd/{device_id}/{tag_id}/set<br/>{ value: 42.0, request_id: "abc-123" }
  end

  rect rgb(30, 58, 95)
    Note over EMQX,CH: Step 2: Receive & Validate
    EMQX->>CH: DELIVER (subscribed: $nexus/cmd/+/+/set)
    CH->>CH: Lookup device + tag in memory
    CH->>CH: Rate limit check (semaphore + bounded queue)
  end

  rect rgb(30, 70, 40)
    Note over CH,PLC: Step 3: Execute Write
    CH->>Driver: Write(address, value, dataType)
    Driver->>PLC: OPC UA Write / Modbus Write / S7 Write
    PLC-->>Driver: Success / Error
    Driver-->>CH: Result
  end

  rect rgb(40, 30, 70)
    Note over CH,Ext: Step 4: Acknowledge
    CH->>EMQX: PUBLISH $nexus/cmd/response/abc-123<br/>{ success: true, device_id, tag_id, value: 42.0 }
    EMQX->>Ext: DELIVER response
  end
```

---

## 4. Configuration Flow (Hot Reload)

```mermaid
sequenceDiagram
  autonumber
  participant UI as 🖥️ Web UI
  participant GC as 🔌 Gateway Core
  participant DB as 🗄️ PostgreSQL
  participant EMQX as 📨 EMQX Broker
  participant CS as 📋 Config Subscriber<br/>(Protocol Gateway)
  participant PS as ⚙️ Polling Service
  participant CH as 🎯 Command Handler

  rect rgb(30, 58, 95)
    Note over UI,DB: Step 1: User Creates/Updates Device
    UI->>GC: POST /api/devices { name, protocol, host, port, unsPrefix, ... }
    GC->>DB: INSERT INTO devices (...) / UPDATE devices SET ...
    GC->>GC: Increment config_version
    DB-->>GC: Device record (with ID)
    GC-->>UI: 201 Created / 200 OK
  end

  rect rgb(40, 30, 70)
    Note over GC,EMQX: Step 2: Broadcast Config Change
    GC->>EMQX: PUBLISH $nexus/config/devices/{id}<br/>{ action:"created", device: {...} }
  end

  rect rgb(30, 70, 40)
    Note over EMQX,PS: Step 3: Protocol Gateway Reacts
    EMQX->>CS: DELIVER $nexus/config/devices/{id}
    CS->>CS: Parse wire format → domain.Device
    CS->>PS: AddDevice(device) / UpdateDevice(device)
    CS->>CH: AddDevice(device) / UpdateDevice(device)
    PS->>PS: Start polling new device
    CH->>CH: Register device for write commands
  end

  rect rgb(50, 30, 30)
    Note over CS,EMQX: Step 4: Startup Sync
    Note right of CS: On startup, request full config
    CS->>EMQX: PUBLISH $nexus/config/sync/request
    EMQX->>GC: DELIVER sync request
    GC->>DB: SELECT * FROM devices; SELECT * FROM tags
    GC->>EMQX: PUBLISH $nexus/config/devices/{id} (for each device)
    GC->>EMQX: PUBLISH $nexus/config/tags/{deviceId}/{tagId} (for each tag)
    EMQX->>CS: DELIVER all config messages
  end
```

---

## 5. Gateway Core Internal Architecture

```mermaid
graph TB
  subgraph Clients["Incoming Requests"]
    HTTP["HTTP Requests<br/>/api/*"]
    WS["WebSocket<br/>/ws"]
    Health["Health Probes<br/>/health/*"]
  end

  subgraph Middleware["Fastify Middleware Stack"]
    CORS["CORS"]
    Helmet["Helmet<br/>(Security Headers)"]
    RateLimit["Rate Limiter<br/>(optional)"]
    Auth["OIDC Auth<br/>(optional)"]
    RBAC["RBAC Guard<br/>(admin > engineer > operator > viewer)"]
    Audit["Audit Logger<br/>(mutations → audit_log)"]
  end

  subgraph Routes["API Routes"]
    DeviceRoutes["/api/devices<br/>CRUD + toggle"]
    TagRoutes["/api/tags<br/>CRUD + bulk + toggle"]
    HistorianRoutes["/api/historian<br/>history queries"]
    OPCUARoutes["/api/opcua<br/>certificates"]
    SystemRoutes["/api/system<br/>health, info, containers"]
    Swagger["/docs<br/>Swagger UI"]
  end

  subgraph Proxies["Outbound Proxies"]
    PGProxy["Protocol Gateway Proxy<br/><i>Circuit Breaker: 5 fails → 30s open</i>"]
    DIProxy["Data Ingestion Proxy"]
  end

  subgraph Bridge["WebSocket Bridge"]
    SubMgr["Subscription Manager<br/><i>Reference-counted MQTT subs</i>"]
    Broadcast["Broadcast to clients<br/><i>{ type: data, topic, payload }</i>"]
  end

  subgraph Connections["External Connections"]
    PG_DB[("PostgreSQL<br/>nexus_config")]
    MQTT_Broker["EMQX Broker"]
    PG_Service["Protocol Gateway<br/>:8080"]
    DI_Service["Data Ingestion<br/>:8080"]
  end

  HTTP --> CORS --> Helmet --> RateLimit --> Auth --> RBAC
  RBAC --> DeviceRoutes & TagRoutes & HistorianRoutes & OPCUARoutes & SystemRoutes
  RBAC --> Audit
  Health --> Swagger

  WS --> SubMgr --> MQTT_Broker
  MQTT_Broker --> Broadcast --> WS

  DeviceRoutes & TagRoutes --> PG_DB
  DeviceRoutes --> MQTT_Broker
  OPCUARoutes & SystemRoutes --> PGProxy --> PG_Service
  HistorianRoutes --> DIProxy --> DI_Service

  classDef route fill:#1e3a5f,stroke:#3b82f6,stroke-width:1px,color:#e2e8f0
  classDef mw fill:#2e2a1a,stroke:#eab308,stroke-width:1px,color:#e2e8f0
  classDef conn fill:#1a2e1a,stroke:#22c55e,stroke-width:1px,color:#e2e8f0
  classDef bridge fill:#2a1a2e,stroke:#a855f7,stroke-width:1px,color:#e2e8f0

  class DeviceRoutes,TagRoutes,HistorianRoutes,OPCUARoutes,SystemRoutes,Swagger route
  class CORS,Helmet,RateLimit,Auth,RBAC,Audit mw
  class PG_DB,MQTT_Broker,PG_Service,DI_Service conn
  class SubMgr,Broadcast bridge
```

---

## 6. Protocol Gateway Internal Architecture

```mermaid
graph TB
  subgraph Entry["Entry Points"]
    MQTT_In["MQTT Subscriptions"]
    REST_In["REST API :8080"]
    Metrics_In["Prometheus /metrics"]
  end

  subgraph ConfigSub["Config Subscriber"]
    ConfigListen["Listen:<br/>$nexus/config/devices/+<br/>$nexus/config/tags/+/+"]
    SyncReq["Startup: request full sync<br/>$nexus/config/sync/request"]
    WireConvert["Wire → Domain conversion"]
  end

  subgraph DevMgr["MQTT Device Manager"]
    DevStore["In-Memory Device Store<br/><i>map[deviceID]*Device</i>"]
    Callbacks["Lifecycle Callbacks<br/>OnAdd · OnEdit · OnDelete"]
  end

  subgraph Polling["Polling Service"]
    WorkerPool["Worker Pool<br/><i>Configurable worker count</i>"]
    PollLoop["Poll Loop<br/><i>Per-device interval</i>"]
    Backpressure["Backpressure<br/><i>Skip if queue full</i>"]
    StatusPub["Status Publisher<br/>$nexus/status/devices/{id}"]
  end

  subgraph CmdHandler["Command Handler"]
    CmdListen["Listen:<br/>$nexus/cmd/+/write<br/>$nexus/cmd/+/+/set"]
    RateLimiter["Rate Limiter<br/><i>Semaphore + bounded queue</i>"]
    CmdExec["Execute Write"]
    CmdResp["Respond:<br/>$nexus/cmd/response/{req_id}"]
  end

  subgraph Drivers["Protocol Drivers"]
    OPCUA["OPC UA Driver<br/><i>gopcua: read/write/browse<br/>subscriptions, certificates</i>"]
    Modbus["Modbus Driver<br/><i>go-modbus: TCP/RTU<br/>holding/input/coil/discrete</i>"]
    S7["S7 Driver<br/><i>gos7: S7-1200/1500<br/>DB/M/I/Q addressing</i>"]
  end

  subgraph Outputs["MQTT Publishing"]
    DataPub["Data Publish<br/><i>{unsPrefix}/{topicSuffix}</i><br/>UNS namespace"]
    StatusOut["Status Publish<br/><i>$nexus/status/devices/{id}</i>"]
    CmdRespOut["Command Response<br/><i>$nexus/cmd/response/{id}</i>"]
  end

  subgraph Devices["🏭 Field Devices"]
    PLCs["PLCs · RTUs · Sensors"]
  end

  %% Config flow
  MQTT_In --> ConfigListen --> WireConvert --> DevStore
  SyncReq -.-> MQTT_In
  DevStore --> Callbacks
  Callbacks --> Polling
  Callbacks --> CmdHandler

  %% Polling flow
  Polling --> WorkerPool --> PollLoop
  PollLoop --> Drivers
  PollLoop --> Backpressure
  Drivers --> PLCs
  PLCs --> Drivers
  Drivers --> DataPub
  PollLoop --> StatusPub --> StatusOut

  %% Command flow
  MQTT_In --> CmdListen --> RateLimiter --> CmdExec --> Drivers
  CmdExec --> CmdResp --> CmdRespOut

  %% REST
  REST_In --> Drivers

  classDef driver fill:#1a2e2e,stroke:#06b6d4,stroke-width:2px,color:#e2e8f0
  classDef mqtt fill:#2a1a2e,stroke:#a855f7,stroke-width:1px,color:#e2e8f0
  classDef core fill:#1e3a5f,stroke:#3b82f6,stroke-width:1px,color:#e2e8f0

  class OPCUA,Modbus,S7 driver
  class DataPub,StatusOut,CmdRespOut,ConfigListen,CmdListen,SyncReq mqtt
  class WorkerPool,PollLoop,RateLimiter,CmdExec,WireConvert,DevStore core
```

---

## 7. Data Ingestion Pipeline

```mermaid
graph LR
  subgraph MQTT["📨 EMQX Broker"]
    Topics["UNS Data Topics<br/><i>ghent/prd/line1/temp<br/>ghent/prd/line1/switch<br/>...</i>"]
  end

  subgraph Subscriber["MQTT Subscriber"]
    SharedSub["Shared Subscription<br/><i>$share/ingestion/#</i><br/>Load-balanced across replicas"]
    Parse["Parse Message<br/><i>Extract topic, value, quality</i>"]
  end

  subgraph Buffer["In-Memory Buffer"]
    Ring["Bounded Buffer<br/><i>capacity: 10,000 msgs</i>"]
    Trigger["Flush Trigger<br/><i>batch_size=1000 OR<br/>flush_interval=5s</i>"]
  end

  subgraph Writers["Parallel Writers"]
    W1["Writer 1"]
    W2["Writer 2"]
    W3["Writer 3"]
    W4["Writer 4"]
  end

  subgraph TSDB["🗄️ TimescaleDB"]
    Copy["pgx COPY Protocol<br/><i>3-5x faster than INSERT</i>"]
    Metrics["metrics hypertable<br/><i>1-day chunks</i>"]
    Agg1["metrics_1min<br/><i>continuous aggregate</i>"]
    Agg2["metrics_1hour<br/><i>continuous aggregate</i>"]
  end

  subgraph Query["HTTP Query Handler"]
    HistAPI["GET /api/history<br/><i>?topic=...&from=...&to=...&limit=...</i>"]
    Stats["Compute stats<br/><i>count, avg, min, max, latest</i>"]
  end

  Topics --> SharedSub --> Parse --> Ring
  Ring --> Trigger
  Trigger --> W1 & W2 & W3 & W4
  W1 & W2 & W3 & W4 --> Copy --> Metrics
  Metrics --> Agg1 & Agg2

  HistAPI --> Metrics
  HistAPI --> Stats

  classDef tsdb fill:#1a2e1a,stroke:#22c55e,stroke-width:2px,color:#e2e8f0
  classDef buf fill:#2e2a1a,stroke:#eab308,stroke-width:1px,color:#e2e8f0
  classDef mqtt fill:#2a1a2e,stroke:#a855f7,stroke-width:1px,color:#e2e8f0

  class Metrics,Agg1,Agg2,Copy tsdb
  class Ring,Trigger buf
  class SharedSub,Topics mqtt
```

---

## 8. MQTT Topic Hierarchy (Unified Namespace)

```mermaid
graph TD
  ROOT["MQTT Topic Root"]

  subgraph UNS["📊 UNS Data Topics<br/><i>Published by Protocol Gateway<br/>Consumed by Data Ingestion + WebSocket Bridge</i>"]
    ENT["{enterprise}"]
    SITE["{site}"]
    AREA["{area}"]
    LINE["{line}"]
    TAG["{tag_name}"]
    Example1["ghent/prd/line1/temp"]
    Example2["ghent/prd/line1/switch"]
  end

  subgraph System["🔧 $nexus System Topics"]
    subgraph Config["Config (gateway-core → protocol-gateway)"]
      CfgDev["$nexus/config/devices/{id}"]
      CfgTag["$nexus/config/tags/{deviceId}/{tagId}"]
      CfgSync["$nexus/config/sync/request"]
    end
    subgraph Status["Status (protocol-gateway → gateway-core)"]
      StatusDev["$nexus/status/devices/{id}<br/><i>{ status, metrics, lastSeen }</i>"]
    end
    subgraph Commands["Commands (external → protocol-gateway)"]
      CmdWrite["$nexus/cmd/{deviceId}/write"]
      CmdSet["$nexus/cmd/{deviceId}/{tagId}/set"]
      CmdResp["$nexus/cmd/response/{requestId}"]
    end
  end

  ROOT --> ENT --> SITE --> AREA --> LINE --> TAG
  TAG --> Example1
  TAG --> Example2

  ROOT --> Config & Status & Commands

  classDef uns fill:#1e3a5f,stroke:#3b82f6,stroke-width:1px,color:#e2e8f0
  classDef sys fill:#2e2a1a,stroke:#eab308,stroke-width:1px,color:#e2e8f0
  classDef cmd fill:#2e1a1a,stroke:#ef4444,stroke-width:1px,color:#e2e8f0

  class ENT,SITE,AREA,LINE,TAG,Example1,Example2 uns
  class CfgDev,CfgTag,CfgSync,StatusDev sys
  class CmdWrite,CmdSet,CmdResp cmd
```

---

## 9. Database Schemas

```mermaid
erDiagram
  DEVICES ||--o{ TAGS : "has many"
  DEVICES ||--o{ AUDIT_LOG : "referenced by"

  DEVICES {
    uuid id PK
    text name UK
    enum protocol "modbus|opcua|s7|mqtt|bacnet|ethernetip"
    boolean enabled
    text host
    integer port
    jsonb protocol_config
    text uns_prefix "UNS topic prefix"
    integer poll_interval_ms
    integer config_version "incremented on change"
    enum status "online|offline|error|unknown"
    text last_error
    enum setup_status "created|connected|configured|active"
    text location
    jsonb metadata
    timestamptz created_at
    timestamptz updated_at
  }

  TAGS {
    uuid id PK
    uuid device_id FK
    text name
    text address "protocol-specific"
    enum data_type "bool|int16|uint16|int32|uint32|int64|uint64|float32|float64|string"
    enum access_mode "read|write|readwrite"
    boolean enabled
    float scale_factor
    float scale_offset
    float clamp_min
    float clamp_max
    text engineering_units "°C, PSI, bar"
    enum deadband_type "none|absolute|percent"
    float deadband_value
    text topic_suffix "MQTT topic suffix"
    integer priority
    text opc_node_id "OPC UA specific"
    text s7_address "S7 specific: DB1.DBD0"
    enum register_type "Modbus: holding|input|coil|discrete"
    enum byte_order "big_endian|little_endian"
    jsonb metadata
    timestamptz created_at
    timestamptz updated_at
  }

  AUDIT_LOG {
    uuid id PK
    text user_sub "OIDC subject"
    text username
    text action "create|update|delete|toggle"
    text resource_type "device|tag"
    uuid resource_id
    jsonb details "before/after snapshots"
    timestamptz timestamp
  }

  METRICS {
    timestamptz time PK "hypertable partition key"
    text topic "MQTT topic"
    double_precision value "numeric value"
    text value_str "string value"
    smallint quality "OPC UA quality: 192=Good"
    jsonb metadata
  }

  METRICS_1MIN {
    timestamptz bucket
    text topic
    double avg_value
    double min_value
    double max_value
    bigint count
  }

  METRICS_1HOUR {
    timestamptz bucket
    text topic
    double avg_value
    double min_value
    double max_value
    bigint count
  }

  METRICS ||--|| METRICS_1MIN : "continuous aggregate"
  METRICS ||--|| METRICS_1HOUR : "continuous aggregate"
```

---

## 10. Network & Port Map

```mermaid
graph TB
  subgraph HostPorts["🖥️ Host Machine (localhost)"]
    H80["Port 80/443<br/>Nginx"]
    H8080["Port 8080<br/>Web UI direct"]
    H3001["Port 3001<br/>Gateway Core API"]
    H8085["Port 8085<br/>Protocol GW API"]
    H7000["Port 7000<br/>Data Ingestion"]
    H1884["Port 1884<br/>MQTT TCP"]
    H8083["Port 8083<br/>MQTT WebSocket"]
    H18083["Port 18083<br/>EMQX Dashboard"]
    H5432["Port 5432<br/>TimescaleDB"]
    H5433["Port 5433<br/>PostgreSQL"]
    H9090["Port 9090<br/>Prometheus"]
    H3000["Port 3000<br/>Grafana"]
  end

  subgraph DockerNet["🐳 nexus-internal (172.28.0.0/16)"]
    C_Nginx["nginx:80"]
    C_WebUI["web-ui:80"]
    C_GC["gateway-core:3001"]
    C_PG["protocol-gateway:8080"]
    C_DI["data-ingestion:8080/8081"]
    C_EMQX["emqx:1883/8083/18083"]
    C_PSQL["postgres:5432"]
    C_TSDB["timescaledb:5432"]
    C_Prom["prometheus:9090"]
    C_Graf["grafana:3000"]
  end

  H80 --> C_Nginx
  H8080 --> C_WebUI
  H3001 --> C_GC
  H8085 --> C_PG
  H7000 --> C_DI
  H1884 --> C_EMQX
  H8083 --> C_EMQX
  H18083 --> C_EMQX
  H5432 --> C_TSDB
  H5433 --> C_PSQL
  H9090 --> C_Prom
  H3000 --> C_Graf

  classDef host fill:#2e1a1a,stroke:#ef4444,stroke-width:1px,color:#e2e8f0
  classDef container fill:#1a2e1a,stroke:#22c55e,stroke-width:1px,color:#e2e8f0

  class H80,H8080,H3001,H8085,H7000,H1884,H8083,H18083,H5432,H5433,H9090,H3000 host
  class C_Nginx,C_WebUI,C_GC,C_PG,C_DI,C_EMQX,C_PSQL,C_TSDB,C_Prom,C_Graf container
```

---

## 11. Deployment & Scaling Strategy

```mermaid
graph TB
  subgraph K8s["Kubernetes Cluster"]
    subgraph Stateless["Deployment (Horizontally Scalable)"]
      GC1["gateway-core (1)"]
      GC2["gateway-core (2)"]
      GCN["gateway-core (N)"]
      DI1["data-ingestion (1)"]
      DI2["data-ingestion (2)"]
      DIN["data-ingestion (N)"]
      WUI1["web-ui (1)"]
      WUI2["web-ui (N)"]
    end

    subgraph Stateful["StatefulSet (Singleton / Limited)"]
      PGW["protocol-gateway (1)<br/><i>⚠️ Cannot scale<br/>Long-lived PLC connections<br/>In-memory device state</i>"]
      EMQX1["emqx (1)"]
      EMQX2["emqx (2)"]
      EMQX3["emqx (3)"]
      PSQL["postgres (1)<br/><i>Primary only</i>"]
      TSDB["timescaledb (1)<br/><i>Primary only</i>"]
    end

    LB["Ingress / Load Balancer"]
    LB --> GC1 & GC2 & GCN
    LB --> WUI1 & WUI2

    SharedSub["EMQX Shared Subscriptions<br/><i>$share/ingestion/#<br/>Auto load-balance</i>"]
    SharedSub --> DI1 & DI2 & DIN
  end

  classDef scalable fill:#1a2e1a,stroke:#22c55e,stroke-width:2px,color:#e2e8f0
  classDef singleton fill:#2e1a1a,stroke:#ef4444,stroke-width:2px,color:#e2e8f0

  class GC1,GC2,GCN,DI1,DI2,DIN,WUI1,WUI2 scalable
  class PGW,PSQL,TSDB singleton
```

---

## 12. Full Request Lifecycle (Browser → Device → Historian → Chart)

```mermaid
sequenceDiagram
  autonumber
  participant User as 👤 User (Browser)
  participant Nginx as 🚪 Nginx :80
  participant SPA as 🖥️ Web UI SPA
  participant GC as 🔌 Gateway Core
  participant DB as 🗄️ PostgreSQL
  participant EMQX as 📨 EMQX
  participant PG as ⚙️ Protocol Gateway
  participant PLC as 🏭 PLC (OPC UA)
  participant DI as 📥 Data Ingestion
  participant TSDB as 🗄️ TimescaleDB

  Note over User,TSDB: === PHASE 1: Configure Device & Tags ===

  User->>Nginx: GET http://localhost/
  Nginx->>SPA: Serve React SPA
  SPA-->>User: Render Dashboard

  User->>Nginx: POST /api/devices { name:"PLC-001", protocol:"opcua", ... }
  Nginx->>GC: Forward /api/devices
  GC->>DB: INSERT INTO devices (...)
  GC->>EMQX: PUBLISH $nexus/config/devices/{id}
  EMQX->>PG: DELIVER config (ConfigSubscriber)
  PG->>PG: AddDevice → PollingService + CommandHandler
  GC-->>Nginx: 201 Created
  Nginx-->>User: Device created

  User->>Nginx: POST /api/tags { deviceId, name:"temp", address:"ns=2;s=Temp", ... }
  Nginx->>GC: Forward /api/tags
  GC->>DB: INSERT INTO tags (...)
  GC->>EMQX: PUBLISH $nexus/config/tags/{deviceId}/{tagId}
  EMQX->>PG: DELIVER tag config
  PG->>PG: AddTag → include in next poll cycle
  GC-->>User: Tag created

  Note over User,TSDB: === PHASE 2: Data Flows Automatically ===

  loop Every pollIntervalMs (e.g., 10s)
    PG->>PLC: OPC UA ReadRequest [ns=2;s=Temp]
    PLC-->>PG: Value: 21.5, Quality: Good (192)
    PG->>PG: Apply scale/clamp/deadband
    PG->>EMQX: PUBLISH ghent/prd/line1/temp → { value: 21.5, quality: 192 }
    EMQX->>DI: DELIVER ($share/ingestion/#)
    DI->>DI: Buffer → batch
    DI->>TSDB: COPY INTO metrics (time, topic, value, quality)
  end

  Note over User,TSDB: === PHASE 3: User Views Tag History ===

  User->>Nginx: Navigate to /tags/{id} (TagDetailPage)
  SPA->>Nginx: GET /api/tags/{id}
  Nginx->>GC: Forward
  GC->>DB: SELECT * FROM tags WHERE id = ...
  GC-->>SPA: Tag details (name, address, dataType, topicSuffix)

  SPA->>Nginx: GET /api/devices/{deviceId}
  Nginx->>GC: Forward
  GC->>DB: SELECT * FROM devices WHERE id = ...
  GC-->>SPA: Device details (unsPrefix: "ghent/prd/line1")

  SPA->>SPA: Compute topic = unsPrefix + "/" + topicSuffix

  SPA->>Nginx: GET /api/historian/history?topic=ghent/prd/line1/temp&from=...&to=...
  Nginx->>GC: Forward /api/historian/history
  GC->>DI: HTTP proxy → /api/history?topic=...
  DI->>TSDB: SELECT time, value, quality ... + stats (avg/min/max)
  TSDB-->>DI: Rows + aggregates
  DI-->>GC: { topic, stats, points[] }
  GC-->>Nginx: Forward
  Nginx-->>SPA: History data
  SPA->>SPA: Render recharts LineChart + stats table
  SPA-->>User: 📈 Tag detail page with live chart
```
