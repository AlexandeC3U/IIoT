.PHONY: build run test clean docker-build docker-up docker-down docker-logs

# Go parameters
GOCMD=go
GOBUILD=$(GOCMD) build
GOTEST=$(GOCMD) test
GOGET=$(GOCMD) get
GOMOD=$(GOCMD) mod
BINARY_NAME=data-ingestion
BINARY_PATH=./bin/$(BINARY_NAME)

# Build the binary
build:
	@echo "Building..."
	@mkdir -p bin
	$(GOBUILD) -o $(BINARY_PATH) -v ./cmd/ingestion

# Run locally (requires MQTT and TimescaleDB running)
run: build
	@echo "Running..."
	$(BINARY_PATH)

# Run tests
test:
	@echo "Running tests..."
	$(GOTEST) -v ./...

# Run tests with coverage
test-coverage:
	@echo "Running tests with coverage..."
	$(GOTEST) -v -coverprofile=coverage.out ./...
	$(GOCMD) tool cover -html=coverage.out -o coverage.html

# Download dependencies
deps:
	@echo "Downloading dependencies..."
	$(GOMOD) download
	$(GOMOD) tidy

# Clean build artifacts
clean:
	@echo "Cleaning..."
	@rm -rf bin/
	@rm -f coverage.out coverage.html

# Build Docker image
docker-build:
	@echo "Building Docker image..."
	docker build -t nexus/data-ingestion:latest .

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

# Run with race detector (development)
run-race:
	@echo "Running with race detector..."
	$(GOCMD) run -race ./cmd/ingestion

# Lint
lint:
	@echo "Running linter..."
	golangci-lint run ./...

# Format code
fmt:
	@echo "Formatting code..."
	$(GOCMD) fmt ./...

# Generate (placeholder for code generation)
generate:
	@echo "Running code generation..."
	$(GOCMD) generate ./...

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

help:
	@echo "Available targets:"
	@echo "  build          - Build the binary"
	@echo "  run            - Build and run locally"
	@echo "  test           - Run tests"
	@echo "  test-coverage  - Run tests with coverage"
	@echo "  deps           - Download dependencies"
	@echo "  clean          - Clean build artifacts"
	@echo "  docker-build   - Build Docker image"
	@echo "  docker-up      - Start development environment"
	@echo "  docker-down    - Stop development environment"
	@echo "  docker-clean   - Stop and remove volumes"
	@echo "  docker-logs    - View service logs"
	@echo "  docker-status  - Check service status"
	@echo "  docker-health  - Check health endpoint"
	@echo "  dev            - Full development setup"
	@echo "  lint           - Run linter"
	@echo "  fmt            - Format code"

