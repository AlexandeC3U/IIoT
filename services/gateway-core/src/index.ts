import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';

import { env } from './config/env.js';
import { closeDatabase } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import { AppError } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { mqttService } from './mqtt/client.js';
import { deviceRoutes, healthRoutes, tagRoutes } from './routes/index.js';

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

await app.register(websocket);

// Swagger documentation
await app.register(swagger, {
  openapi: {
    info: {
      title: 'NEXUS Edge - Gateway Core API',
      description: 'Central management API for device and tag configuration',
      version: '0.1.0',
    },
    servers: [
      {
        url: `http://${env.HOST}:${env.PORT}`,
        description: 'Local development',
      },
    ],
    tags: [
      { name: 'Devices', description: 'Device management endpoints' },
      { name: 'Tags', description: 'Tag configuration endpoints' },
      { name: 'Health', description: 'Health check endpoints' },
    ],
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
// Error Handler
// ============================================================================

app.setErrorHandler((error, request, reply) => {
  const { statusCode = 500, code, message, details } = error as AppError & { details?: unknown };

  // Log internal errors
  if (statusCode >= 500) {
    app.log.error({ err: error, request: { method: request.method, url: request.url } }, message);
  } else {
    app.log.warn({ err: error, request: { method: request.method, url: request.url } }, message);
  }

  return reply.status(statusCode).send({
    error: {
      code: code || 'INTERNAL_ERROR',
      message: statusCode >= 500 ? 'Internal server error' : message,
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

// Root route
app.get('/', async () => {
  return {
    name: 'NEXUS Edge - Gateway Core',
    version: '0.1.0',
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
    mqttService.connect().catch((error) => {
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
      '🚀 Gateway Core started'
    );
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

start();
