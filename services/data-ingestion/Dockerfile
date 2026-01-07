# Build stage
FROM golang:1.22-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /build

# Copy go mod files first for better caching
COPY go.mod go.sum* ./
RUN go mod tidy && go mod download

# Copy source code
COPY . .

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s -X main.version=$(git describe --tags --always --dirty 2>/dev/null || echo 'dev')" \
    -o /build/data-ingestion \
    ./cmd/ingestion

# Runtime stage
FROM alpine:3.23

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

# Expose HTTP port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health/live || exit 1

# Run the service
ENTRYPOINT ["/app/data-ingestion"]

