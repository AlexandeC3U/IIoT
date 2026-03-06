# Data Ingestion Service Makefile
# Production-grade build, test, and development commands

.PHONY: all build run test test-unit test-race test-cover test-coverage-html test-integration test-fuzz fuzz test-e2e e2e bench clean lint fmt vet deps deps-update generate docker-build docker-up docker-down docker-clean docker-logs docker-logs-all docker-status docker-health docker-metrics run-race dev help

# Variables
BINARY_NAME=data-ingestion
VERSION=$(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME=$(shell date -u '+%Y-%m-%d_%H:%M:%S')
LDFLAGS=-ldflags "-w -s -X main.version=$(VERSION) -X main.buildTime=$(BUILD_TIME)"
GO=go
GOTEST=$(GO) test
GOVET=$(GO) vet
GOFMT=gofmt
GOLINT=golangci-lint

# Default target
all: lint test build

# Build the binary
build:
	@echo "Building $(BINARY_NAME)..."
	@mkdir -p bin
	CGO_ENABLED=0 $(GO) build $(LDFLAGS) -o bin/$(BINARY_NAME) -v ./cmd/ingestion

# Run locally (requires MQTT and TimescaleDB running)
run: build
	@echo "Running..."
	./bin/$(BINARY_NAME)

# Run with race detector (development)
run-race:
	@echo "Running with race detector..."
	CGO_ENABLED=1 $(GO) run -race ./cmd/ingestion

# =============================================================================
# Testing
# =============================================================================

# Run all tests (short mode)
test:
	@echo "Running tests..."
	$(GOTEST) -v -short ./...

# Run unit tests only (from testing/unit/)
test-unit:
	@echo "Running unit tests..."
	$(GOTEST) -v ./testing/unit/...

# Run tests with race detection (requires CGO_ENABLED=1)
test-race:
	@echo "Running tests with race detection..."
	CGO_ENABLED=1 $(GOTEST) -v -race ./testing/unit/...

# Run tests with coverage
test-cover:
	@echo "Running tests with coverage..."
	$(GOTEST) -v -coverprofile=coverage.out -covermode=atomic ./...
	$(GO) tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report: coverage.html"

# Generate HTML coverage report
test-coverage-html: test-cover

# Run tests for a specific package (usage: make test-pkg PKG=testing/unit/domain)
test-pkg:
	@echo "Running tests for package: $(PKG)"
	$(GOTEST) -v ./$(PKG)/...

# Run all tests with verbose output
test-verbose:
	@echo "Running all tests (verbose)..."
	$(GOTEST) -v -count=1 ./...

# Run integration tests (needs TimescaleDB + MQTT broker)
test-integration:
	@echo "Running integration tests..."
	$(GOTEST) -v -tags=integration ./testing/integration/...

# Run TimescaleDB integration tests
test-integration-db:
	@echo "Running TimescaleDB integration tests..."
	$(GOTEST) -v -tags=integration ./testing/integration/timescaledb/...

# Run MQTT integration tests
test-integration-mqtt:
	@echo "Running MQTT integration tests..."
	$(GOTEST) -v -tags=integration ./testing/integration/mqtt/...

# Run fuzz tests (seed corpus validation)
test-fuzz:
	@echo "Running fuzz tests (seed corpus validation)..."
	$(GOTEST) -v -tags=fuzz ./testing/fuzz/...

# Alias for fuzz tests
fuzz: test-fuzz

# Run a specific fuzz target for 30s (usage: make fuzz-target TARGET=FuzzParsePayload)
fuzz-target:
	@echo "Running fuzz target $(TARGET) for 30s..."
	$(GOTEST) -tags=fuzz -fuzz=$(TARGET) -fuzztime=30s ./testing/fuzz/...

# Run end-to-end tests
test-e2e:
	@echo "Running end-to-end tests..."
	$(GOTEST) -v -tags=e2e -timeout 5m ./testing/e2e/...

# Alias for e2e tests
e2e: test-e2e

# Run full test suite (unit + integration)
test-all: test-env-up test test-integration test-env-down
	@echo "Full test suite completed!"

# =============================================================================
# Benchmarks
# =============================================================================

# Run all benchmarks
bench:
	@echo "Running benchmarks..."
	$(GOTEST) -bench=. -benchmem ./testing/benchmark/...

# Run benchmarks with comparison output
bench-compare:
	@echo "Running benchmarks with comparison..."
	$(GOTEST) -bench=. -benchmem -count=5 ./testing/benchmark/... | tee bench.txt

# Run domain benchmarks (ParsePayload, pool operations)
bench-domain:
	@echo "Running domain benchmarks..."
	$(GOTEST) -bench=. -benchmem ./testing/benchmark/domain/...

# =============================================================================
# Test Environment Management
# =============================================================================

# Start test dependencies (TimescaleDB + MQTT broker)
test-env-up:
	@echo "Starting test environment..."
	docker-compose -f docker-compose.test.yaml up -d
	@echo "Waiting for services to be ready..."
	@sleep 5
	@echo "Test environment ready!"

# Stop test dependencies
test-env-down:
	@echo "Stopping test environment..."
	docker-compose -f docker-compose.test.yaml down

# View test environment logs
test-env-logs:
	docker-compose -f docker-compose.test.yaml logs -f

# Check test environment health
test-env-health:
	@echo "Checking test environment health..."
	docker-compose -f docker-compose.test.yaml ps

# =============================================================================
# Code Quality
# =============================================================================

# Lint the code
lint:
	@echo "Linting..."
	$(GOLINT) run ./...

# Format code
fmt:
	@echo "Formatting..."
	$(GOFMT) -s -w .

# Run go vet
vet:
	@echo "Vetting..."
	$(GOVET) ./...

# Security scan (requires gosec)
security:
	@echo "Running security scan..."
	gosec -quiet ./...

# Check for vulnerabilities (requires govulncheck)
vuln:
	@echo "Checking for vulnerabilities..."
	govulncheck ./...

# =============================================================================
# Dependencies
# =============================================================================

# Download dependencies
deps:
	@echo "Downloading dependencies..."
	$(GO) mod download
	$(GO) mod tidy

# Update dependencies
deps-update:
	@echo "Updating dependencies..."
	$(GO) get -u ./...
	$(GO) mod tidy

# Generate (placeholder for code generation)
generate:
	@echo "Running code generation..."
	$(GO) generate ./...

# =============================================================================
# Docker
# =============================================================================

# Build Docker image
docker-build:
	@echo "Building Docker image..."
	docker build -t nexus/data-ingestion:$(VERSION) -t nexus/data-ingestion:latest .

# Start development environment
docker-up:
	@echo "Starting development environment..."
	docker-compose -f docker-compose.dev.yaml up -d

# Stop development environment
docker-down:
	@echo "Stopping development environment..."
	docker-compose -f docker-compose.dev.yaml down

# Stop and remove volumes
docker-clean:
	@echo "Stopping and cleaning development environment..."
	docker-compose -f docker-compose.dev.yaml down -v

# View logs
docker-logs:
	docker-compose -f docker-compose.dev.yaml logs -f data-ingestion

# View all service logs
docker-logs-all:
	docker-compose -f docker-compose.dev.yaml logs -f

# Check service status
docker-status:
	@echo "Service Status:"
	@curl -s http://localhost:8081/status | jq . || echo "Service not running"

# Check health
docker-health:
	@echo "Health Check:"
	@curl -s http://localhost:8081/health | jq . || echo "Service not running"

# Check metrics
docker-metrics:
	@echo "Metrics:"
	@curl -s http://localhost:8081/metrics

# All-in-one development setup
dev: docker-up
	@echo "Waiting for services to be ready..."
	@sleep 10
	@echo "Development environment is ready!"
	@echo ""
	@echo "Endpoints:"
	@echo "  - Data Ingestion: http://localhost:8081"
	@echo "  - TimescaleDB:    localhost:5432"
	@echo "  - EMQX Dashboard: http://localhost:18083 (admin/public)"
	@echo ""
	@echo "Commands:"
	@echo "  make docker-logs    - View ingestion logs"
	@echo "  make docker-status  - Check service status"
	@echo "  make docker-down    - Stop services"

# =============================================================================
# Help
# =============================================================================

help:
	@echo "Data Ingestion Service - Available commands:"
	@echo ""
	@echo "Build & Run:"
	@echo "  make build              - Build the binary"
	@echo "  make run                - Build and run locally"
	@echo "  make run-race           - Run with race detector"
	@echo "  make dev                - Full development setup (Docker)"
	@echo ""
	@echo "Testing:"
	@echo "  make test               - Run all tests (short mode)"
	@echo "  make test-unit          - Run unit tests only"
	@echo "  make test-race          - Run tests with race detector"
	@echo "  make test-cover         - Run tests with coverage report"
	@echo "  make test-verbose       - Run all tests (verbose, no cache)"
	@echo "  make test-pkg PKG=path  - Run tests for specific package"
	@echo "  make test-integration   - Run integration tests"
	@echo "  make test-integration-db   - Run TimescaleDB integration tests"
	@echo "  make test-integration-mqtt - Run MQTT integration tests"
	@echo "  make test-e2e           - Run end-to-end tests"
	@echo "  make test-fuzz          - Run fuzz tests (seed corpus)"
	@echo "  make fuzz-target TARGET=Name - Fuzz specific target for 30s"
	@echo "  make test-all           - Run full test suite (unit + integration)"
	@echo ""
	@echo "Benchmarks:"
	@echo "  make bench              - Run all benchmarks"
	@echo "  make bench-compare      - Run benchmarks (5x for comparison)"
	@echo "  make bench-domain       - Run domain benchmarks"
	@echo ""
	@echo "Test Environment:"
	@echo "  make test-env-up        - Start test dependencies"
	@echo "  make test-env-down      - Stop test dependencies"
	@echo "  make test-env-logs      - View test environment logs"
	@echo "  make test-env-health    - Check test environment health"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint               - Lint the code"
	@echo "  make fmt                - Format the code"
	@echo "  make vet                - Run go vet"
	@echo "  make security           - Run security scan"
	@echo "  make vuln               - Check for vulnerabilities"
	@echo ""
	@echo "Dependencies:"
	@echo "  make deps               - Download dependencies"
	@echo "  make deps-update        - Update dependencies"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-build       - Build Docker image"
	@echo "  make docker-up          - Start development environment"
	@echo "  make docker-down        - Stop development environment"
	@echo "  make docker-clean       - Stop and remove volumes"
	@echo "  make docker-logs        - View service logs"
	@echo "  make docker-status      - Check service status"
	@echo "  make docker-health      - Check health endpoint"
	@echo "  make clean              - Clean build artifacts"
