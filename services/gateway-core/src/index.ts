import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';

import { env } from './config/env.js';
import { closeDatabase } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import { AppError } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { registerMetrics } from './lib/metrics.js';
import { registerAudit } from './middleware/audit.js';
import { registerAuth } from './middleware/auth.js';
import { mqttService } from './mqtt/client.js';
import { startConfigSyncSubscriber, startStatusSubscriber } from './mqtt/subscriber.js';
import {
  deviceRoutes,
  healthRoutes,
  historianRoutes,
  opcuaRoutes,
  systemRoutes,
  tagRoutes,
} from './routes/index.js';
import { registerWebSocketBridge, stopWebSocketBridge } from './websocket/bridge.js';

// Create Fastify instance
const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    transport:
      env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  },
  bodyLimit: 1_048_576, // 1 MB — prevents oversized payloads
});

// ============================================================================
// Plugins
// ============================================================================

await app.register(cors, {
  origin: env.CORS_ORIGIN.split(','),
  credentials: true,
});

await app.register(helmet, {
  contentSecurityPolicy: false, // Disable for development
});

if (env.RATE_LIMIT_ENABLED) {
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    keyGenerator: (request) => request.user?.sub ?? request.ip,
    allowList: ['127.0.0.1', '::1'], // Allow localhost (health checks, internal)
    addHeadersOnExceeding: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'x-ratelimit-reset': true },
    addHeaders: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'x-ratelimit-reset': true, 'retry-after': true },
  });
}

await app.register(websocket);

// Swagger documentation
await app.register(swagger, {
  openapi: {
    info: {
      title: 'NEXUS Edge - Gateway Core API',
      description: 'Central API gateway and configuration owner for the NEXUS Edge platform',
      version: '2.0.0',
    },
    servers: [
      {
        url: `http://${env.HOST}:${env.PORT}`,
        description: 'Local development',
      },
    ],
    tags: [
      { name: 'Devices', description: 'Device management and runtime proxy endpoints' },
      { name: 'Tags', description: 'Tag configuration endpoints' },
      { name: 'OPC UA', description: 'OPC UA certificate management (proxied)' },
      { name: 'System', description: 'System management and health endpoints' },
      { name: 'Health', description: 'Health check endpoints' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token from Authentik OIDC provider',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
});

await app.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true,
  },
});

// ============================================================================
// Metrics, Authentication & Audit
// ============================================================================

await registerMetrics(app);
await registerAuth(app);
await registerAudit(app);

// ============================================================================
// Error Handler
// ============================================================================

app.setErrorHandler((error, request, reply) => {
  const { statusCode = 500, code, message, details } = error as AppError & { details?: unknown };

  // Log internal errors
  if (statusCode >= 500) {
    app.log.error(
      { err: error, requestId: request.id, request: { method: request.method, url: request.url } },
      message
    );
  } else {
    app.log.warn(
      { err: error, requestId: request.id, request: { method: request.method, url: request.url } },
      message
    );
  }

  return reply.status(statusCode).send({
    error: {
      code: code || 'INTERNAL_ERROR',
      message: statusCode >= 500 ? 'Internal server error' : message,
      requestId: request.id,
      details: env.NODE_ENV === 'development' ? details : undefined,
    },
  });
});

// ============================================================================
// Routes
// ============================================================================

await app.register(healthRoutes, { prefix: '/health' });
await app.register(deviceRoutes, { prefix: '/api/devices' });
await app.register(tagRoutes, { prefix: '/api/tags' });
await app.register(opcuaRoutes, { prefix: '/api/opcua' });
await app.register(systemRoutes, { prefix: '/api/system' });
await app.register(historianRoutes, { prefix: '/api/historian' });

// WebSocket bridge (MQTT → WS for browser real-time updates)
await registerWebSocketBridge(app);

// Root route
app.get('/', async () => {
  return {
    name: 'NEXUS Edge - Gateway Core',
    version: '2.0.0',
    docs: '/docs',
    health: '/health',
  };
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Received shutdown signal');

  try {
    stopWebSocketBridge();
    logger.info('WebSocket bridge stopped');

    await app.close();
    logger.info('HTTP server closed');

    await mqttService.disconnect();
    logger.info('MQTT disconnected');

    await closeDatabase();
    logger.info('Database connection closed');

    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ============================================================================
// Start Server
// ============================================================================

async function start() {
  try {
    // Run database migrations (blocks until complete)
    await runMigrations();

    // Connect to MQTT (non-blocking - will retry in background)
    mqttService
      .connect()
      .then(async () => {
        // Once connected, start subscribers
        await startStatusSubscriber();
        await startConfigSyncSubscriber();
      })
      .catch((error) => {
        logger.warn({ error }, 'Initial MQTT connection failed, will retry...');
      });

    // Start HTTP server
    await app.listen({ port: env.PORT, host: env.HOST });

    logger.info(
      {
        port: env.PORT,
        host: env.HOST,
        docs: `http://${env.HOST}:${env.PORT}/docs`,
      },
      'Gateway Core V2 started'
    );
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

start();
