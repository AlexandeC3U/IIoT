import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import client from 'prom-client';

import { logger } from './logger.js';

// ============================================================================
// Registry & Default Metrics
// ============================================================================

const register = new client.Registry();

// Collect Node.js default metrics (CPU, memory, event loop, GC)
client.collectDefaultMetrics({ register, prefix: 'gateway_core_' });

// ============================================================================
// HTTP Metrics
// ============================================================================

const httpRequestsTotal = new client.Counter({
  name: 'gateway_core_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'gateway_core_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// ============================================================================
// WebSocket Metrics
// ============================================================================

export const wsConnectionsGauge = new client.Gauge({
  name: 'gateway_core_ws_connections_active',
  help: 'Active WebSocket connections',
  registers: [register],
});

export const wsSubscriptionsGauge = new client.Gauge({
  name: 'gateway_core_ws_subscriptions_active',
  help: 'Active WebSocket topic subscriptions',
  registers: [register],
});

// ============================================================================
// MQTT Metrics
// ============================================================================

export const mqttMessagesReceived = new client.Counter({
  name: 'gateway_core_mqtt_messages_received_total',
  help: 'Total MQTT messages received',
  labelNames: ['topic_prefix'] as const,
  registers: [register],
});

export const mqttConnectionGauge = new client.Gauge({
  name: 'gateway_core_mqtt_connected',
  help: 'MQTT broker connection status (1=connected, 0=disconnected)',
  registers: [register],
});

// ============================================================================
// Proxy Metrics
// ============================================================================

export const proxyRequestsTotal = new client.Counter({
  name: 'gateway_core_proxy_requests_total',
  help: 'Total proxy requests to protocol-gateway',
  labelNames: ['method', 'status'] as const,
  registers: [register],
});

export const proxyRequestDuration = new client.Histogram({
  name: 'gateway_core_proxy_request_duration_seconds',
  help: 'Proxy request duration in seconds',
  labelNames: ['method'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [register],
});

// ============================================================================
// Hooks & Route Registration
// ============================================================================

/**
 * Normalize route URL for metric labels.
 * Replaces UUIDs and numeric IDs with `:id` to avoid cardinality explosion.
 */
function normalizeRoute(url: string): string {
  return url
    .split('?')[0] // Strip query string
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+/g, '/:id');
}

export async function registerMetrics(app: FastifyInstance): Promise<void> {
  // Request timing hook
  app.addHook('onRequest', async (request: FastifyRequest) => {
    (request as unknown as { _metricsStart: bigint })._metricsStart = process.hrtime.bigint();
  });

  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const start = (request as unknown as { _metricsStart?: bigint })._metricsStart;
    if (!start) return;

    const durationNs = Number(process.hrtime.bigint() - start);
    const durationSec = durationNs / 1e9;

    const route = normalizeRoute(request.url);
    const labels = {
      method: request.method,
      route,
      status: String(reply.statusCode),
    };

    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, durationSec);
  });

  // GET /metrics endpoint (not behind auth — scraped by Prometheus)
  app.get('/metrics', {
    schema: { hide: true }, // Hide from Swagger
    handler: async (_request, reply) => {
      try {
        const metrics = await register.metrics();
        return reply.type(register.contentType).send(metrics);
      } catch (error) {
        logger.error({ error }, 'Failed to collect metrics');
        return reply.status(500).send('Failed to collect metrics');
      }
    },
  });

  logger.info('Prometheus metrics registered on /metrics');
}
