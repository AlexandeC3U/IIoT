#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════════
# NEXUS EDGE - Initial Setup Script
# ═══════════════════════════════════════════════════════════════════════════════

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print with color
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Header
echo ""
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                         NEXUS EDGE - Setup Script                              "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""

# Check prerequisites
print_info "Checking prerequisites..."

# Check Docker
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi
print_success "Docker is installed: $(docker --version)"

# Check Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi
print_success "Docker Compose is available"

# Check if Docker is running
if ! docker info &> /dev/null; then
    print_error "Docker daemon is not running. Please start Docker."
    exit 1
fi
print_success "Docker daemon is running"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

print_info "Project root: $PROJECT_ROOT"

# Navigate to project root
cd "$PROJECT_ROOT"

# Create necessary directories
print_info "Creating directory structure..."
mkdir -p infrastructure/docker/config/nginx/ssl
mkdir -p config/emqx
mkdir -p config/nodered
mkdir -p config/grafana/provisioning/datasources
mkdir -p config/grafana/provisioning/dashboards
mkdir -p config/grafana/dashboards
mkdir -p logs
mkdir -p backups

print_success "Directory structure created"

# Create environment file if it doesn't exist
ENV_FILE="infrastructure/docker/.env"
if [ ! -f "$ENV_FILE" ]; then
    print_info "Creating environment file..."
    
    # Generate random secrets
    JWT_SECRET=$(openssl rand -base64 32)
    NODERED_SECRET=$(openssl rand -base64 24)
    HISTORIAN_PASS=$(openssl rand -base64 16)
    POSTGRES_PASS=$(openssl rand -base64 16)
    
    cp infrastructure/docker/env.template "$ENV_FILE"
    
    # Replace placeholders with generated secrets (works on both Linux and macOS)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|your-super-secret-jwt-key-change-in-production-min-32-chars|$JWT_SECRET|g" "$ENV_FILE"
        sed -i '' "s|your-node-red-credential-secret-change-me|$NODERED_SECRET|g" "$ENV_FILE"
        sed -i '' "s|change-this-historian-password-in-production|$HISTORIAN_PASS|g" "$ENV_FILE"
        sed -i '' "s|change-this-config-password-in-production|$POSTGRES_PASS|g" "$ENV_FILE"
    else
        sed -i "s|your-super-secret-jwt-key-change-in-production-min-32-chars|$JWT_SECRET|g" "$ENV_FILE"
        sed -i "s|your-node-red-credential-secret-change-me|$NODERED_SECRET|g" "$ENV_FILE"
        sed -i "s|change-this-historian-password-in-production|$HISTORIAN_PASS|g" "$ENV_FILE"
        sed -i "s|change-this-config-password-in-production|$POSTGRES_PASS|g" "$ENV_FILE"
    fi
    
    print_success "Environment file created with generated secrets"
    print_warning "Review and customize: $ENV_FILE"
else
    print_info "Environment file already exists, skipping..."
fi

# Create EMQX configuration if it doesn't exist
EMQX_CONF="config/emqx/emqx.conf"
if [ ! -f "$EMQX_CONF" ]; then
    print_info "Creating EMQX configuration..."
    cat > "$EMQX_CONF" << 'EOF'
## NEXUS Edge - EMQX Configuration

## Node name
node {
    name = "emqx@127.0.0.1"
    cookie = "nexus_secret_cookie"
}

## Dashboard
dashboard {
    listeners.http {
        bind = 18083
    }
}

## Listeners
listeners.tcp.default {
    bind = "0.0.0.0:1883"
    max_connections = 100000
}

listeners.ssl.default {
    bind = "0.0.0.0:8883"
    max_connections = 100000
    ssl_options {
        certfile = "/opt/emqx/etc/certs/cert.pem"
        keyfile = "/opt/emqx/etc/certs/key.pem"
    }
}

listeners.ws.default {
    bind = "0.0.0.0:8083"
    max_connections = 100000
}

## Authentication
authentication = [
    {
        mechanism = password_based
        backend = built_in_database
        password_hash_algorithm {
            name = sha256
            salt_position = prefix
        }
    }
]

## Authorization (ACL)
authorization {
    no_match = deny
    deny_action = disconnect
    sources = [
        {
            type = built_in_database
            enable = true
        }
    ]
}
EOF
    print_success "EMQX configuration created"
fi

# Create ACL configuration
ACL_CONF="config/emqx/acl.conf"
if [ ! -f "$ACL_CONF" ]; then
    print_info "Creating EMQX ACL configuration..."
    cat > "$ACL_CONF" << 'EOF'
%% NEXUS Edge - EMQX ACL Rules

%% Protocol Gateway - can publish device data
{allow, {user, "protocol-gateway"}, publish, ["#"]}.
{allow, {user, "protocol-gateway"}, subscribe, ["$SYS/#", "nexus/+/cmd/#"]}.

%% Historian - can subscribe to all data
{allow, {user, "historian"}, subscribe, ["#"]}.

%% Flow Engine - full access for automation
{allow, {user, "flow-engine"}, all, ["#"]}.

%% Alert Service - subscribe to data, publish alerts
{allow, {user, "alerts"}, subscribe, ["#"]}.
{allow, {user, "alerts"}, publish, ["nexus/alerts/#"]}.

%% Gateway - WebSocket proxy for frontend
{allow, {user, "gateway"}, subscribe, ["#"]}.
{allow, {user, "gateway"}, publish, ["nexus/cmd/#"]}.

%% Deny everything else by default
{deny, all}.
EOF
    print_success "EMQX ACL configuration created"
fi

# Generate self-signed SSL certificate for development
SSL_DIR="infrastructure/docker/config/nginx/ssl"
if [ ! -f "$SSL_DIR/nexus.crt" ]; then
    print_info "Generating self-signed SSL certificate for development..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$SSL_DIR/nexus.key" \
        -out "$SSL_DIR/nexus.crt" \
        -subj "/C=US/ST=State/L=City/O=NEXUS Edge/CN=localhost" \
        2>/dev/null
    print_success "SSL certificate generated"
    print_warning "This is a self-signed certificate for development only!"
fi

# Create nginx configuration
NGINX_CONF="infrastructure/docker/config/nginx/nginx.conf"
if [ ! -f "$NGINX_CONF" ]; then
    print_info "Creating Nginx configuration..."
    cat > "$NGINX_CONF" << 'EOF'
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=100r/s;

    # Upstream servers
    upstream frontend {
        server frontend:80;
    }

    upstream gateway {
        server gateway-core:3000;
    }

    # HTTP -> HTTPS redirect
    server {
        listen 80;
        server_name _;
        return 301 https://$host$request_uri;
    }

    # Main HTTPS server
    server {
        listen 443 ssl http2;
        listen 8443 ssl http2;
        server_name _;

        ssl_certificate /etc/nginx/ssl/nexus.crt;
        ssl_certificate_key /etc/nginx/ssl/nexus.key;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_prefer_server_ciphers on;

        # Frontend (React app)
        location / {
            proxy_pass http://frontend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # API Gateway
        location /api/ {
            limit_req zone=api burst=50 nodelay;
            proxy_pass http://gateway/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # WebSocket for real-time updates
        location /ws {
            proxy_pass http://gateway/ws;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_read_timeout 86400;
        }

        # Health check endpoint
        location /health {
            access_log off;
            return 200 "OK\n";
            add_header Content-Type text/plain;
        }
    }
}
EOF
    print_success "Nginx configuration created"
fi

# Pull Docker images
print_info "Pulling Docker images (this may take a few minutes)..."
cd infrastructure/docker
docker-compose pull --quiet emqx timescaledb postgres 2>/dev/null || true
print_success "Docker images pulled"

# Summary
echo ""
echo "═══════════════════════════════════════════════════════════════════════════════"
echo "                          Setup Complete!                                        "
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
print_success "NEXUS Edge is ready for development!"
echo ""
echo "Next steps:"
echo ""
echo "  1. Review the environment configuration:"
echo "     ${BLUE}$ENV_FILE${NC}"
echo ""
echo "  2. Start the platform:"
echo "     ${BLUE}cd infrastructure/docker && docker-compose up -d${NC}"
echo ""
echo "  3. Access the UI:"
echo "     ${BLUE}https://localhost:8443${NC}"
echo ""
echo "  4. Default credentials:"
echo "     Username: ${YELLOW}admin${NC}"
echo "     Password: ${YELLOW}nexus-admin-2024!${NC}"
echo ""
print_warning "Remember to change the default password after first login!"
echo ""
echo "For more information, see the documentation:"
echo "  - README.md"
echo "  - docs/ARCHITECTURE.md"
echo "  - docs/CONTRIBUTING.md"
echo ""

