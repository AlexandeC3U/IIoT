# =============================================================================
# NEXUS Edge - Web UI
# Multi-stage build for production-optimized React application
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.12.0 --activate

# Copy source code (including package.json)
COPY . .

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Build arguments for API URLs
ARG VITE_API_URL=/api
ARG VITE_WS_URL=/ws

# Build the application
RUN pnpm build

# -----------------------------------------------------------------------------
# Stage 2: Production (Nginx)
# -----------------------------------------------------------------------------
FROM nginx:alpine AS production

# Add labels
LABEL org.opencontainers.image.source="https://github.com/nexus-edge/nexus-edge"
LABEL org.opencontainers.image.description="NEXUS Edge Web UI - React Frontend"
LABEL org.opencontainers.image.licenses="Apache-2.0"

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

