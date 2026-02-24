# NEXUS Edge - Kubernetes Deployment

This directory contains Kubernetes manifests for deploying the NEXUS Edge platform.

## Directory Structure

```
infrastructure/k8s/
├── base/                          # Shared base configuration
│   ├── namespace.yaml             # nexus namespace
│   ├── configmap.yaml             # Shared ConfigMaps
│   ├── secrets.yaml               # Shared Secrets (base64 encoded)
│   └── kustomization.yaml
│
├── services/                      # Per-service manifests
│   ├── protocol-gateway/          # Industrial protocol conversion
│   │   ├── statefulset.yaml       # StatefulSet (not Deployment - see note below)
│   │   ├── service.yaml
│   │   ├── pdb.yaml               # Pod Disruption Budget
│   │   ├── serviceaccount.yaml
│   │   ├── devices-configmap.yaml # Device configuration
│   │   └── kustomization.yaml
│   │
│   ├── data-ingestion/            # MQTT → TimescaleDB ingestion
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── hpa.yaml
│   │   ├── serviceaccount.yaml
│   │   └── kustomization.yaml
│   │
│   ├── emqx/                      # MQTT Broker (clustered)
│   │   ├── statefulset.yaml
│   │   ├── service.yaml
│   │   ├── serviceaccount.yaml
│   │   └── kustomization.yaml
│   │
│   └── timescaledb/               # Time-series database
│       ├── statefulset.yaml
│       ├── service.yaml
│       ├── init-configmap.yaml
│       ├── serviceaccount.yaml
│       └── kustomization.yaml
│
└── overlays/                      # Environment-specific configs
    ├── dev/                       # Development (low resources)
    │   └── kustomization.yaml
    └── prod/                      # Production (HA, more resources)
        ├── kustomization.yaml
        └── secrets-patch.yaml     # Production secrets template
```

## Quick Start

### Prerequisites

- Kubernetes cluster (K3s, minikube, kind, or cloud-managed)
- `kubectl` configured to access your cluster
- `kustomize` (built into kubectl v1.14+)

### Deploy to Development

```bash
# Create namespace and deploy all services
kubectl apply -k infrastructure/k8s/overlays/dev

# Watch pods come up
kubectl get pods -n nexus -w

# Check all services
kubectl get all -n nexus
```

### Deploy to Production

```bash
# First, update secrets with real values
# Edit infrastructure/k8s/overlays/prod/secrets-patch.yaml

# Deploy
kubectl apply -k infrastructure/k8s/overlays/prod

# Verify
kubectl get pods -n nexus
kubectl get pvc -n nexus
```

## Service Endpoints (Internal)

| Service | DNS Name | Port |
|---------|----------|------|
| EMQX MQTT | `emqx.nexus.svc.cluster.local` | 1883 |
| EMQX Dashboard | `emqx.nexus.svc.cluster.local` | 18083 |
| TimescaleDB | `timescaledb.nexus.svc.cluster.local` | 5432 |
| Protocol Gateway | `protocol-gateway.nexus.svc.cluster.local` | 8080 |
| Data Ingestion | `data-ingestion.nexus.svc.cluster.local` | 8080 |

## Accessing Services

### Port Forwarding (Development)

```bash
# EMQX Dashboard
kubectl port-forward -n nexus svc/emqx 18083:18083

# TimescaleDB
kubectl port-forward -n nexus svc/timescaledb 5432:5432

# Protocol Gateway (API, health, metrics all on same port)
kubectl port-forward -n nexus svc/protocol-gateway 8080:8080

# Then access:
# - API:     http://localhost:8080/api/devices
# - Health:  http://localhost:8080/health
# - Metrics: http://localhost:8080/metrics
```

### Ingress (Production)

For production, create an Ingress resource or use a LoadBalancer service.
See `services/emqx/service.yaml` for an example LoadBalancer configuration.

## Scaling

### Protocol Gateway (StatefulSet - Single Replica)

**⚠️ Important:** The protocol-gateway uses a StatefulSet with `replicas: 1` and **cannot** be horizontally scaled. This is by design because:

- **Long-lived TCP connections**: OPC UA sessions, Modbus/S7 sockets are persistent
- **Duplicate connections**: Multiple replicas would open duplicate connections to each PLC
- **Session limits**: OPC UA servers have MaxSessions limits (2 pods = 2x sessions)
- **Duplicate data**: Multiple replicas would publish duplicate data to MQTT
- **PKI state**: Trust store must be consistent (PersistentVolume)

**This is the industry standard** - Kepware, Ignition, and similar protocol gateways all run as singletons.

### Data Ingestion (Deployment - Scalable)

Data-ingestion is stateless and can be horizontally scaled:

```bash
# Scale data-ingestion to 3 replicas
kubectl scale deployment data-ingestion -n nexus --replicas=3
```

### Automatic Scaling (HPA)

Only data-ingestion has HPA configured (protocol-gateway does not support HPA):

```bash
# View HPA status
kubectl get hpa -n nexus

# Describe HPA details
kubectl describe hpa data-ingestion -n nexus
```

## Monitoring

All services expose Prometheus metrics on port 8080:

```bash
# Protocol Gateway metrics
kubectl port-forward -n nexus svc/protocol-gateway 8080:8080
curl http://localhost:8080/metrics

# Data Ingestion metrics  
kubectl port-forward -n nexus svc/data-ingestion 8080:8080
curl http://localhost:8080/metrics
```

See `docs/PLATFORM_ARCHITECTURE.md` for the complete architecture diagram and data flows.

## Troubleshooting

### Check Pod Logs

```bash
# Protocol Gateway logs
kubectl logs -n nexus -l app.kubernetes.io/name=protocol-gateway -f

# Data Ingestion logs
kubectl logs -n nexus -l app.kubernetes.io/name=data-ingestion -f

# EMQX logs
kubectl logs -n nexus emqx-0 -f
```

### Check Pod Status

```bash
# Describe pod for events
kubectl describe pod -n nexus <pod-name>

# Get pod events
kubectl get events -n nexus --sort-by='.lastTimestamp'
```

### EMQX Cluster Status

```bash
# Check cluster nodes
kubectl exec -n nexus emqx-0 -- emqx_ctl cluster status

# Check MQTT clients
kubectl exec -n nexus emqx-0 -- emqx_ctl clients list
```

### TimescaleDB

```bash
# Connect to database
kubectl exec -it -n nexus timescaledb-0 -- psql -U postgres -d nexus_historian

# Check hypertable info
SELECT * FROM timescaledb_information.hypertables;

# Check compression status
SELECT * FROM timescaledb_information.compressed_hypertable_stats;
```

## K3s-Specific Notes

K3s is a lightweight Kubernetes distribution ideal for edge deployments:

```bash
# Install K3s (single node)
curl -sfL https://get.k3s.io | sh -

# Copy kubeconfig
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $(id -u):$(id -g) ~/.kube/config

# Verify
kubectl get nodes

# Deploy NEXUS
kubectl apply -k infrastructure/k8s/overlays/dev
```

For multi-node K3s clusters, see: https://docs.k3s.io/quick-start

