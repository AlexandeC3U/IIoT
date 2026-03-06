# Build stage
FROM golang:1.24.3-alpine3.20 AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /build

# Copy go mod files first for better caching
COPY go.mod go.sum ./
RUN go mod download && go mod verify

# Copy source code
COPY . .

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s -X main.version=$(git describe --tags --always --dirty 2>/dev/null || echo 'dev')" \
    -o /build/data-ingestion \
    ./cmd/ingestion

# Runtime stage
FROM alpine:3.20

# Install runtime dependencies
RUN apk add --no-cache ca-certificates tzdata

# Create non-root user
RUN addgroup -g 1000 nexus && \
    adduser -u 1000 -G nexus -s /bin/sh -D nexus

WORKDIR /app

# Copy binary from builder
COPY --from=builder /build/data-ingestion /app/data-ingestion

# Copy default configuration
COPY --from=builder /build/config /app/config

# Set ownership
RUN chown -R nexus:nexus /app

# Switch to non-root user
USER nexus

# Expose HTTP ports (8080 = health probes, 8081 = metrics/status/pprof)
EXPOSE 8080 8081

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health/live || exit 1

# Run the service
ENTRYPOINT ["/app/data-ingestion"]

