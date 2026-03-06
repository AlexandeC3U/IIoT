# Kubernetes Deployment Testing Guide

This document provides a comprehensive guide for testing the NEXUS Edge Kubernetes deployment, including installation, deployment verification, scaling tests, and failover scenarios.

---

## Table of Contents

1. [Prerequisites & Installation](#1-prerequisites--installation)
2. [Deploying to Kubernetes](#2-deploying-to-kubernetes)
3. [Verification Tests](#3-verification-tests)
4. [Scaling Tests](#4-scaling-tests)
5. [Failover & Resilience Tests](#5-failover--resilience-tests)
6. [Monitoring & Observability](#6-monitoring--observability)
7. [Troubleshooting](#troubleshooting)
8. [Test Checklist](#test-checklist)

---

## 1. Prerequisites & Installation

### Option A: K3s (Recommended for Edge/Local)

K3s is a lightweight Kubernetes distribution, perfect for edge deployments.

**Windows (WSL2):**
```bash
# In WSL2 terminal
curl -sfL https://get.k3s.io | sh -

# Copy kubeconfig
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $(id -u):$(id -g) ~/.kube/config

# Verify
kubectl get nodes
```

**Linux:**
```bash
curl -sfL https://get.k3s.io | sh -
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
kubectl get nodes
```

### Option B: Docker Desktop Kubernetes

1. Open Docker Desktop → Settings → Kubernetes
2. Check "Enable Kubernetes"
3. Click "Apply & Restart"
4. Wait for Kubernetes to start (green indicator)

**Verify:**
```powershell
kubectl get nodes
# Should show: docker-desktop   Ready   ...
```

### Option C: Minikube

```powershell
# Install minikube (via chocolatey)
choco install minikube

# Start cluster
minikube start --driver=docker --memory=4096 --cpus=2

# Verify
kubectl get nodes
```

### Verify Prerequisites

```powershell
# Check kubectl
kubectl version --client

# Check kustomize (built into kubectl 1.14+)
kubectl kustomize --help

# Check cluster connection
kubectl cluster-info
```

---

## 2. Deploying to Kubernetes

### Build Docker Images (if not using pre-built)

```powershell
# From project root
cd services/protocol-gateway
docker build -t nexus/protocol-gateway:latest .

cd ../data-ingestion
docker build -t nexus/data-ingestion:latest .
```

> **Note:** For minikube, use `eval $(minikube docker-env)` before building to use minikube's Docker daemon.

### Deploy Development Environment

```powershell
# Navigate to project root
cd C:\Users\ceulea\Projects\Connector

# Preview what will be deployed
kubectl kustomize infrastructure/k8s/overlays/dev

# Deploy everything
kubectl apply -k infrastructure/k8s/overlays/dev

# Watch pods come up (Ctrl+C to exit)
kubectl get pods -n nexus -w
```

**Expected Output (after ~1-2 minutes):**
```
NAME                                READY   STATUS    RESTARTS   AGE
emqx-0                              1/1     Running   0          90s
timescaledb-0                       1/1     Running   0          90s
protocol-gateway-6d8f9c7b4-xxxxx    1/1     Running   0          60s
data-ingestion-7b9f8c6d4-xxxxx      1/1     Running   0          60s
```

### Deploy Production Environment

```powershell
# First, update secrets with real passwords
# Edit: infrastructure/k8s/overlays/prod/secrets-patch.yaml

# Deploy
kubectl apply -k infrastructure/k8s/overlays/prod

# Watch pods
kubectl get pods -n nexus -w
```

**Production Differences:**
| Component | Dev | Prod |
|-----------|-----|------|
| EMQX replicas | 1 | 3 |
| Protocol Gateway replicas | 1 | 2 |
| Data Ingestion replicas | 1 | 2 |
| TimescaleDB storage | 5Gi | 50Gi |
| Resource limits | Low | High |

---

## 3. Verification Tests

### Phase 1: Pod Health Check

| Step | Command | Expected Result |
|------|---------|-----------------|
| 1 | `kubectl get pods -n nexus` | All pods Running, READY 1/1 |
| 2 | `kubectl get svc -n nexus` | All services created |
| 3 | `kubectl get pvc -n nexus` | PVCs Bound (for StatefulSets) |
| 4 | `kubectl get hpa -n nexus` | HPAs created (may show `<unknown>` until metrics available) |

```powershell
# Quick health check
kubectl get all -n nexus
```

### Phase 2: Service Connectivity

**Port Forward Services:**
```powershell
# Terminal 1: EMQX Dashboard
kubectl port-forward -n nexus svc/emqx 18083:18083

# Terminal 2: Protocol Gateway
kubectl port-forward -n nexus svc/protocol-gateway 8080:8080

# Terminal 3: Data Ingestion
kubectl port-forward -n nexus svc/data-ingestion 8081:8080

# Terminal 4: TimescaleDB
kubectl port-forward -n nexus svc/timescaledb 5432:5432
```

**Test Endpoints:**
```powershell
# Protocol Gateway health
Invoke-RestMethod http://localhost:8080/health
# Expected: {"status":"healthy"}

# Protocol Gateway status
Invoke-RestMethod http://localhost:8080/status

# Data Ingestion health
Invoke-RestMethod http://localhost:8081/health
# Expected: {"status":"healthy","components":{"mqtt":"healthy","timescaledb":"healthy"}}

# EMQX Dashboard
# Open: http://localhost:18083
# Default: admin / public
```

### Phase 3: EMQX Cluster Status (Production Only)

```powershell
# Check cluster nodes
kubectl exec -n nexus emqx-0 -- emqx_ctl cluster status

# Expected output (prod with 3 nodes):
# Cluster status: running
# emqx@emqx-0.emqx-headless.nexus.svc.cluster.local : running
# emqx@emqx-1.emqx-headless.nexus.svc.cluster.local : running
# emqx@emqx-2.emqx-headless.nexus.svc.cluster.local : running
```

### Phase 4: TimescaleDB Verification

```powershell
# Connect to TimescaleDB
kubectl exec -it -n nexus timescaledb-0 -- psql -U postgres -d nexus_historian

# In psql:
\dt                                    -- List tables
SELECT * FROM timescaledb_information.hypertables;  -- Check hypertable
SELECT COUNT(*) FROM metrics;          -- Count data points
\q                                     -- Exit
```

### Phase 5: End-to-End Data Flow

**Check if data is flowing:**

```powershell
# 1. Check Protocol Gateway is polling
kubectl logs -n nexus -l app.kubernetes.io/name=protocol-gateway --tail=50
# Look for: "Publishing data points"

# 2. Check Data Ingestion is receiving
kubectl logs -n nexus -l app.kubernetes.io/name=data-ingestion --tail=50
# Look for: "Batch written to database"

# 3. Check data in database
kubectl exec -it -n nexus timescaledb-0 -- psql -U postgres -d nexus_historian -c "SELECT time, topic, value FROM metrics ORDER BY time DESC LIMIT 10;"
```

---

## 4. Scaling Tests

### Manual Scaling Test

```powershell
# Scale protocol-gateway to 3 replicas
kubectl scale deployment protocol-gateway -n nexus --replicas=3

# Watch new pods come up
kubectl get pods -n nexus -l app.kubernetes.io/name=protocol-gateway -w

# Verify all replicas are ready
kubectl get deployment protocol-gateway -n nexus

# Scale back down
kubectl scale deployment protocol-gateway -n nexus --replicas=1
```

### HPA Scaling Test

**Check HPA Status:**
```powershell
kubectl get hpa -n nexus

# Example output:
# NAME               REFERENCE                     TARGETS   MINPODS   MAXPODS   REPLICAS
# protocol-gateway   Deployment/protocol-gateway   15%/70%   1         10        1
# data-ingestion     Deployment/data-ingestion     8%/70%    1         10        1
```

**Generate Load (to trigger autoscaling):**
```powershell
# Get pod name
$pod = kubectl get pods -n nexus -l app.kubernetes.io/name=protocol-gateway -o jsonpath='{.items[0].metadata.name}'

# Run stress test inside pod (if stress is available)
kubectl exec -n nexus $pod -- stress --cpu 2 --timeout 120s

# Or generate MQTT traffic to increase load
# Watch HPA react:
kubectl get hpa -n nexus -w
```

### EMQX Shared Subscription Distribution

Verify messages are distributed across Data Ingestion replicas:

```powershell
# Scale data-ingestion to 3 replicas
kubectl scale deployment data-ingestion -n nexus --replicas=3

# Wait for pods
kubectl get pods -n nexus -l app.kubernetes.io/name=data-ingestion

# Check logs from each pod - each should show receiving ~1/3 of messages
kubectl logs -n nexus -l app.kubernetes.io/name=data-ingestion --tail=20
```

---

## 5. Failover & Resilience Tests

### Test 1: Pod Crash Recovery

```powershell
# Kill a protocol-gateway pod
kubectl delete pod -n nexus -l app.kubernetes.io/name=protocol-gateway

# Watch Kubernetes recreate it
kubectl get pods -n nexus -w

# Verify data flow continues (slight gap is expected)
kubectl logs -n nexus -l app.kubernetes.io/name=data-ingestion --tail=10
```

**Expected Behavior:**
- Kubernetes recreates the pod within seconds
- Other replicas (if any) continue serving
- Data flow resumes after restart

### Test 2: EMQX Node Failure (Production)

```powershell
# Kill EMQX node 1 (in a 3-node cluster)
kubectl delete pod -n nexus emqx-1

# Check cluster status from remaining node
kubectl exec -n nexus emqx-0 -- emqx_ctl cluster status

# Watch pod recreate
kubectl get pods -n nexus -l app.kubernetes.io/name=emqx -w

# Verify clients reconnect
kubectl exec -n nexus emqx-0 -- emqx_ctl clients list
```

**Expected Behavior:**
- Cluster continues with 2 nodes
- Clients reconnect to remaining nodes
- StatefulSet recreates emqx-1
- New node joins cluster automatically

### Test 3: TimescaleDB Failure

```powershell
# Kill TimescaleDB pod
kubectl delete pod -n nexus timescaledb-0

# Watch Data Ingestion logs - should show retry attempts
kubectl logs -n nexus -l app.kubernetes.io/name=data-ingestion -f

# TimescaleDB will restart (PVC preserves data)
kubectl get pods -n nexus -l app.kubernetes.io/name=timescaledb -w

# Verify data is intact after restart
kubectl exec -it -n nexus timescaledb-0 -- psql -U postgres -d nexus_historian -c "SELECT COUNT(*) FROM metrics;"
```

**Expected Behavior:**
- Data Ingestion buffers messages while DB is down
- TimescaleDB restarts with PVC data intact
- Data Ingestion reconnects and flushes buffer

### Test 4: Rolling Update

```powershell
# Update Protocol Gateway image (simulates deployment)
kubectl set image deployment/protocol-gateway -n nexus \
  protocol-gateway=nexus/protocol-gateway:v1.0.1

# Watch rolling update
kubectl rollout status deployment/protocol-gateway -n nexus

# Verify PDB is respected (if multiple replicas)
kubectl describe pdb protocol-gateway -n nexus
```

**Expected Behavior:**
- Pods updated one at a time
- No downtime if multiple replicas
- PDB ensures minimum availability

### Test 5: Node Drain (K3s/Production)

```powershell
# Cordon node (prevent new pods)
kubectl cordon <node-name>

# Drain node (evict pods)
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data

# Watch pods reschedule
kubectl get pods -n nexus -o wide -w

# Uncordon when done
kubectl uncordon <node-name>
```

---

## 6. Monitoring & Observability

### Prometheus Metrics

```powershell
# Port forward to access metrics
kubectl port-forward -n nexus svc/protocol-gateway 8080:8080

# Fetch metrics
Invoke-WebRequest http://localhost:8080/metrics | Select-Object -Expand Content
```

**Key Metrics to Monitor:**

| Metric | Description |
|--------|-------------|
| `gateway_polling_polls_total` | Total poll operations |
| `gateway_polling_polls_skipped_total` | Polls skipped (back-pressure) |
| `gateway_polling_duration_seconds` | Poll latency histogram |
| `data_ingestion_points_received_total` | Points received |
| `data_ingestion_batch_duration_seconds` | DB write latency |

### Pod Resource Usage

```powershell
# Install metrics-server if not present (K3s has it by default)
kubectl top pods -n nexus

# Example output:
# NAME                                CPU(cores)   MEMORY(bytes)
# emqx-0                              45m          180Mi
# timescaledb-0                       12m          250Mi
# protocol-gateway-xxx                8m           42Mi
# data-ingestion-xxx                  5m           35Mi
```

### Logs Aggregation

```powershell
# All logs from a deployment
kubectl logs -n nexus -l app.kubernetes.io/name=protocol-gateway --all-containers

# Follow logs in real-time
kubectl logs -n nexus -l app.kubernetes.io/name=protocol-gateway -f

# Logs from last hour
kubectl logs -n nexus -l app.kubernetes.io/name=data-ingestion --since=1h

# Export logs to file
kubectl logs -n nexus -l app.kubernetes.io/name=protocol-gateway > gateway-logs.txt
```

---

## Troubleshooting

### Common Issues

| Problem | Check | Solution |
|---------|-------|----------|
| Pods stuck in `Pending` | `kubectl describe pod <name> -n nexus` | Check resources, node capacity |
| Pods in `CrashLoopBackOff` | `kubectl logs <pod> -n nexus --previous` | Check for startup errors |
| `ImagePullBackOff` | Image name/registry access | Verify image exists, check secrets |
| PVC stuck in `Pending` | `kubectl describe pvc -n nexus` | Check StorageClass exists |
| Service unreachable | `kubectl get endpoints -n nexus` | Verify selector matches pods |
| HPA shows `<unknown>` | metrics-server running? | Install or wait for metrics |

### Debug Commands

```powershell
# Describe pod for events
kubectl describe pod <pod-name> -n nexus

# Get recent events
kubectl get events -n nexus --sort-by='.lastTimestamp' | Select-Object -Last 20

# Execute into pod for debugging
kubectl exec -it <pod-name> -n nexus -- /bin/sh

# Check DNS resolution
kubectl run -n nexus --rm -it --image=busybox dns-test -- nslookup emqx.nexus.svc.cluster.local

# Check service endpoints
kubectl get endpoints -n nexus

# View pod YAML
kubectl get pod <pod-name> -n nexus -o yaml
```

### Reset Everything

```powershell
# Delete all NEXUS resources
kubectl delete namespace nexus

# Also delete PVCs (WARNING: deletes data!)
kubectl delete pvc -n nexus --all

# Redeploy fresh
kubectl apply -k infrastructure/k8s/overlays/dev
```

---

## Test Checklist

Use this checklist to track your testing progress:

### Prerequisites
- [ ] Kubernetes cluster running (K3s/minikube/Docker Desktop)
- [ ] kubectl configured and connected
- [ ] Docker images built or available

### Deployment
- [ ] `kubectl apply -k` succeeds
- [ ] All pods reach Running status
- [ ] All PVCs are Bound
- [ ] No errors in pod logs

### Connectivity (Phase 2-3)
- [ ] Protocol Gateway `/health` returns healthy
- [ ] Data Ingestion `/health` returns healthy
- [ ] EMQX Dashboard accessible (http://localhost:18083)
- [ ] TimescaleDB accepts connections
- [ ] EMQX cluster formed (prod only)

### Data Flow (Phase 5)
- [ ] Protocol Gateway polling devices
- [ ] Messages appearing in EMQX
- [ ] Data Ingestion receiving messages
- [ ] Data appearing in TimescaleDB

### Scaling (Phase 4)
- [ ] Manual scaling works
- [ ] Pods distribute across nodes (if multi-node)
- [ ] HPA shows current CPU/Memory %
- [ ] Shared subscriptions balance load

### Resilience (Phase 5)
- [ ] Pod crash → automatic restart
- [ ] EMQX node failure → cluster heals
- [ ] TimescaleDB restart → data preserved
- [ ] Rolling update → zero downtime

### Monitoring (Phase 6)
- [ ] Prometheus metrics accessible
- [ ] `kubectl top pods` shows resource usage
- [ ] Logs accessible via kubectl

---

## Performance Benchmarks

Expected resource usage in development:

| Component | CPU (idle) | CPU (load) | Memory |
|-----------|------------|------------|--------|
| EMQX | 20m | 200m | 150-300Mi |
| TimescaleDB | 10m | 500m | 200-500Mi |
| Protocol Gateway | 5m | 100m | 30-100Mi |
| Data Ingestion | 5m | 100m | 30-100Mi |

---

## Quick Reference Commands

```powershell
# Deploy dev
kubectl apply -k infrastructure/k8s/overlays/dev

# Check status
kubectl get all -n nexus

# Watch pods
kubectl get pods -n nexus -w

# View logs
kubectl logs -n nexus -l app.kubernetes.io/name=protocol-gateway -f

# Port forward EMQX
kubectl port-forward -n nexus svc/emqx 18083:18083

# Port forward services
kubectl port-forward -n nexus svc/protocol-gateway 8080:8080
kubectl port-forward -n nexus svc/data-ingestion 8081:8080
kubectl port-forward -n nexus svc/timescaledb 5432:5432

# Scale
kubectl scale deployment protocol-gateway -n nexus --replicas=3

# Check HPA
kubectl get hpa -n nexus

# Connect to database
kubectl exec -it -n nexus timescaledb-0 -- psql -U postgres -d nexus_historian

# Delete and redeploy
kubectl delete namespace nexus
kubectl apply -k infrastructure/k8s/overlays/dev
```

---

## Notes

_Add your testing notes, observations, and issues here:_

```
Date: _______________
Tester: _______________
Cluster Type: [ ] K3s  [ ] Docker Desktop  [ ] Minikube  [ ] Other: ______

Notes:
-
-
-
```


