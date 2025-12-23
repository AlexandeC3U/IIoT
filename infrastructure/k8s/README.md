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
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── hpa.yaml               # Horizontal Pod Autoscaler
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

# Protocol Gateway Health
kubectl port-forward -n nexus svc/protocol-gateway 8081:8081
```

### Ingress (Production)

For production, create an Ingress resource or use a LoadBalancer service.
See `services/emqx/service.yaml` for an example LoadBalancer configuration.

## Scaling

### Manual Scaling

```bash
# Scale protocol-gateway to 5 replicas
kubectl scale deployment protocol-gateway -n nexus --replicas=5

# Scale data-ingestion to 3 replicas
kubectl scale deployment data-ingestion -n nexus --replicas=3
```

### Automatic Scaling (HPA)

Both protocol-gateway and data-ingestion have HPA configured:

```bash
# View HPA status
kubectl get hpa -n nexus

# Describe HPA details
kubectl describe hpa protocol-gateway -n nexus
```

## Monitoring

All services expose Prometheus metrics:

```bash
# Protocol Gateway metrics
kubectl port-forward -n nexus svc/protocol-gateway 8081:8081
curl http://localhost:8081/metrics

# Data Ingestion metrics
kubectl port-forward -n nexus svc/data-ingestion 8081:8081
curl http://localhost:8081/metrics
```

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

