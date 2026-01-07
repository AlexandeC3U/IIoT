# ============================================
# NEXUS Edge Platform - Root Makefile
# ============================================
# Unified build system for the entire platform
#
# Quick Start:
#   make help          - Show available commands
#   make install       - Install all dependencies
#   make build         - Build all services
#   make test          - Run all tests
#   make docker-build  - Build all Docker images
#   make dev           - Start development environment

.PHONY: all install build test lint clean docker-build docker-up docker-down help
.PHONY: go-build go-test go-lint go-fmt go-vet go-security go-vuln
.PHONY: frontend-build frontend-test frontend-lint
.PHONY: proto-gateway data-ingestion

# ============================================
# Variables
# ============================================
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME := $(shell date -u '+%Y-%m-%d_%H:%M:%S')
DOCKER_REGISTRY ?= nexus
GO := go
GOLINT := golangci-lint
GOTEST := $(GO) test
GOVET := $(GO) vet

# Service directories
SERVICES := services/protocol-gateway services/data-ingestion

# Colors for output
BLUE := \033[34m
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
NC := \033[0m # No Color

# ============================================
# Default target
# ============================================
all: lint test build

# ============================================
# Installation
# ============================================
install: install-go install-node install-tools ## Install all dependencies
	@echo "$(GREEN)✓ All dependencies installed$(NC)"

install-go: ## Install Go dependencies
	@echo "$(BLUE)→ Installing Go dependencies...$(NC)"
	@cd services/protocol-gateway && $(GO) mod download
	@cd services/data-ingestion && $(GO) mod download
	@echo "$(GREEN)✓ Go dependencies installed$(NC)"

install-node: ## Install Node.js dependencies
	@echo "$(BLUE)→ Installing Node.js dependencies...$(NC)"
	@pnpm install
	@echo "$(GREEN)✓ Node.js dependencies installed$(NC)"

install-tools: ## Install development tools
	@echo "$(BLUE)→ Installing development tools...$(NC)"
	@$(GO) install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	@$(GO) install github.com/cosmtrek/air@latest
	@$(GO) install github.com/securego/gosec/v2/cmd/gosec@latest
	@$(GO) install golang.org/x/vuln/cmd/govulncheck@latest
	@echo "$(GREEN)✓ Development tools installed$(NC)"

# ============================================
# Build
# ============================================
build: go-build ## Build all services
	@echo "$(GREEN)✓ All services built$(NC)"

go-build: proto-gateway data-ingestion ## Build all Go services
	@echo "$(GREEN)✓ Go services built$(NC)"

proto-gateway: ## Build Protocol Gateway
	@echo "$(BLUE)→ Building Protocol Gateway...$(NC)"
	@cd services/protocol-gateway && $(GO) build \
		-ldflags="-w -s -X main.version=$(VERSION) -X main.buildTime=$(BUILD_TIME)" \
		-o bin/protocol-gateway ./cmd/gateway
	@echo "$(GREEN)✓ Protocol Gateway built$(NC)"

data-ingestion: ## Build Data Ingestion Service
	@echo "$(BLUE)→ Building Data Ingestion Service...$(NC)"
	@cd services/data-ingestion && $(GO) build \
		-ldflags="-w -s -X main.version=$(VERSION) -X main.buildTime=$(BUILD_TIME)" \
		-o bin/data-ingestion ./cmd/ingestion
	@echo "$(GREEN)✓ Data Ingestion built$(NC)"

build-all-platforms: ## Build for all platforms (linux, darwin, windows)
	@echo "$(BLUE)→ Building for all platforms...$(NC)"
	@for svc in $(SERVICES); do \
		echo "Building $$svc..."; \
		cd $$svc && \
		GOOS=linux GOARCH=amd64 $(GO) build -ldflags="-w -s" -o bin/$$(basename $$svc)-linux-amd64 ./cmd/*/ && \
		GOOS=linux GOARCH=arm64 $(GO) build -ldflags="-w -s" -o bin/$$(basename $$svc)-linux-arm64 ./cmd/*/ && \
		GOOS=darwin GOARCH=amd64 $(GO) build -ldflags="-w -s" -o bin/$$(basename $$svc)-darwin-amd64 ./cmd/*/ && \
		GOOS=darwin GOARCH=arm64 $(GO) build -ldflags="-w -s" -o bin/$$(basename $$svc)-darwin-arm64 ./cmd/*/ && \
		cd ../..; \
	done
	@echo "$(GREEN)✓ Multi-platform builds complete$(NC)"

# ============================================
# Testing
# ============================================
test: go-test ## Run all tests
	@echo "$(GREEN)✓ All tests passed$(NC)"

go-test: ## Run Go tests
	@echo "$(BLUE)→ Running Go tests...$(NC)"
	@$(GO) test -v -race -short ./services/...
	@echo "$(GREEN)✓ Go tests passed$(NC)"

go-test-cover: ## Run Go tests with coverage
	@echo "$(BLUE)→ Running Go tests with coverage...$(NC)"
	@$(GO) test -v -race -coverprofile=coverage.out -covermode=atomic ./services/...
	@$(GO) tool cover -html=coverage.out -o coverage.html
	@echo "$(GREEN)✓ Coverage report: coverage.html$(NC)"

go-test-integration: ## Run Go integration tests
	@echo "$(BLUE)→ Running integration tests...$(NC)"
	@$(GO) test -v -race -tags=integration ./services/...

go-bench: ## Run Go benchmarks
	@echo "$(BLUE)→ Running benchmarks...$(NC)"
	@$(GO) test -bench=. -benchmem ./services/...

# ============================================
# Linting & Formatting
# ============================================
lint: go-lint ## Run all linters
	@echo "$(GREEN)✓ All linting passed$(NC)"

go-lint: ## Run Go linter
	@echo "$(BLUE)→ Running Go linter...$(NC)"
	@$(GOLINT) run ./services/...
	@echo "$(GREEN)✓ Go linting passed$(NC)"

go-fmt: ## Format Go code
	@echo "$(BLUE)→ Formatting Go code...$(NC)"
	@gofmt -s -w services/
	@echo "$(GREEN)✓ Go code formatted$(NC)"

go-vet: ## Run go vet
	@echo "$(BLUE)→ Running go vet...$(NC)"
	@$(GOVET) ./services/...
	@echo "$(GREEN)✓ go vet passed$(NC)"

fmt: go-fmt ## Format all code
	@pnpm format 2>/dev/null || true
	@echo "$(GREEN)✓ All code formatted$(NC)"

# ============================================
# Security
# ============================================
security: go-security go-vuln ## Run all security checks
	@echo "$(GREEN)✓ Security checks passed$(NC)"

go-security: ## Run gosec security scanner
	@echo "$(BLUE)→ Running security scan...$(NC)"
	@gosec -quiet ./services/...
	@echo "$(GREEN)✓ Security scan passed$(NC)"

go-vuln: ## Check for known vulnerabilities
	@echo "$(BLUE)→ Checking for vulnerabilities...$(NC)"
	@govulncheck ./services/...
	@echo "$(GREEN)✓ Vulnerability check passed$(NC)"

# ============================================
# Docker
# ============================================
docker-build: ## Build all Docker images
	@echo "$(BLUE)→ Building Docker images...$(NC)"
	@docker build -t $(DOCKER_REGISTRY)/protocol-gateway:$(VERSION) \
		-t $(DOCKER_REGISTRY)/protocol-gateway:latest \
		services/protocol-gateway
	@docker build -t $(DOCKER_REGISTRY)/data-ingestion:$(VERSION) \
		-t $(DOCKER_REGISTRY)/data-ingestion:latest \
		services/data-ingestion
	@echo "$(GREEN)✓ Docker images built$(NC)"

docker-build-nocache: ## Build Docker images without cache
	@echo "$(BLUE)→ Building Docker images (no cache)...$(NC)"
	@docker build --no-cache -t $(DOCKER_REGISTRY)/protocol-gateway:$(VERSION) services/protocol-gateway
	@docker build --no-cache -t $(DOCKER_REGISTRY)/data-ingestion:$(VERSION) services/data-ingestion
	@echo "$(GREEN)✓ Docker images built$(NC)"

docker-push: ## Push Docker images to registry
	@echo "$(BLUE)→ Pushing Docker images...$(NC)"
	@docker push $(DOCKER_REGISTRY)/protocol-gateway:$(VERSION)
	@docker push $(DOCKER_REGISTRY)/protocol-gateway:latest
	@docker push $(DOCKER_REGISTRY)/data-ingestion:$(VERSION)
	@docker push $(DOCKER_REGISTRY)/data-ingestion:latest
	@echo "$(GREEN)✓ Docker images pushed$(NC)"

docker-up: ## Start development environment
	@echo "$(BLUE)→ Starting development environment...$(NC)"
	@cd infrastructure/docker && docker-compose up -d
	@echo "$(GREEN)✓ Development environment started$(NC)"

docker-down: ## Stop development environment
	@echo "$(BLUE)→ Stopping development environment...$(NC)"
	@cd infrastructure/docker && docker-compose down
	@echo "$(GREEN)✓ Development environment stopped$(NC)"

docker-logs: ## View Docker logs
	@cd infrastructure/docker && docker-compose logs -f

docker-clean: ## Stop and remove volumes
	@echo "$(YELLOW)→ Cleaning up Docker environment...$(NC)"
	@cd infrastructure/docker && docker-compose down -v
	@echo "$(GREEN)✓ Docker environment cleaned$(NC)"

# ============================================
# Development
# ============================================
dev: docker-up ## Start full development environment
	@echo "$(GREEN)✓ Development environment ready!$(NC)"
	@echo ""
	@echo "Services:"
	@echo "  - EMQX Dashboard:    http://localhost:18083 (admin/public)"
	@echo "  - TimescaleDB:       localhost:5432"
	@echo "  - Protocol Gateway:  http://localhost:8080"
	@echo "  - Data Ingestion:    http://localhost:8081"
	@echo ""
	@echo "Commands:"
	@echo "  make docker-logs  - View logs"
	@echo "  make docker-down  - Stop services"

dev-gateway: ## Run Protocol Gateway with hot reload
	@cd services/protocol-gateway && air

dev-ingestion: ## Run Data Ingestion with hot reload
	@cd services/data-ingestion && air

# ============================================
# Dependencies
# ============================================
deps: ## Sync all dependencies
	@echo "$(BLUE)→ Syncing dependencies...$(NC)"
	@$(GO) work sync
	@cd services/protocol-gateway && $(GO) mod tidy
	@cd services/data-ingestion && $(GO) mod tidy
	@pnpm install
	@echo "$(GREEN)✓ Dependencies synced$(NC)"

deps-update: ## Update all dependencies
	@echo "$(BLUE)→ Updating dependencies...$(NC)"
	@cd services/protocol-gateway && $(GO) get -u ./... && $(GO) mod tidy
	@cd services/data-ingestion && $(GO) get -u ./... && $(GO) mod tidy
	@pnpm update
	@echo "$(GREEN)✓ Dependencies updated$(NC)"

deps-check: ## Check for outdated dependencies
	@echo "$(BLUE)→ Checking dependencies...$(NC)"
	@$(GO) list -u -m all 2>/dev/null | grep '\[' || echo "All Go dependencies up to date"

# ============================================
# Cleanup
# ============================================
clean: ## Clean all build artifacts
	@echo "$(BLUE)→ Cleaning build artifacts...$(NC)"
	@rm -rf services/protocol-gateway/bin
	@rm -rf services/data-ingestion/bin
	@rm -f coverage.out coverage.html
	@echo "$(GREEN)✓ Build artifacts cleaned$(NC)"

clean-all: clean ## Deep clean including node_modules
	@echo "$(BLUE)→ Deep cleaning...$(NC)"
	@rm -rf node_modules
	@rm -rf frontend/node_modules 2>/dev/null || true
	@docker system prune -f 2>/dev/null || true
	@echo "$(GREEN)✓ Deep clean complete$(NC)"

# ============================================
# Kubernetes
# ============================================
k8s-dev: ## Deploy to local Kubernetes (dev overlay)
	@echo "$(BLUE)→ Deploying to Kubernetes (dev)...$(NC)"
	@kubectl apply -k infrastructure/k8s/overlays/dev
	@echo "$(GREEN)✓ Deployed to Kubernetes$(NC)"

k8s-prod: ## Deploy to Kubernetes (prod overlay)
	@echo "$(BLUE)→ Deploying to Kubernetes (prod)...$(NC)"
	@kubectl apply -k infrastructure/k8s/overlays/prod
	@echo "$(GREEN)✓ Deployed to Kubernetes$(NC)"

k8s-status: ## Check Kubernetes deployment status
	@kubectl get pods -n nexus-system

k8s-logs: ## View Kubernetes logs
	@kubectl logs -f -n nexus-system -l app.kubernetes.io/part-of=nexus-edge

# ============================================
# CI/CD Simulation
# ============================================
ci: deps lint test build docker-build ## Run full CI pipeline locally
	@echo "$(GREEN)✓ CI pipeline complete$(NC)"

# ============================================
# Pre-commit hooks
# ============================================
pre-commit: fmt lint test ## Run pre-commit checks
	@echo "$(GREEN)✓ Pre-commit checks passed$(NC)"

# ============================================
# Help
# ============================================
help: ## Show this help
	@echo "NEXUS Edge Platform - Build System"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(BLUE)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "Quick Start:"
	@echo "  make install    # Install dependencies"
	@echo "  make dev        # Start development environment"
	@echo "  make ci         # Run full CI pipeline"

