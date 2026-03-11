import { desc, eq, and, gte } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { env } from '../../config/env.js';
import { db, pool } from '../../db/index.js';
import { auditLog } from '../../db/schema.js';
import { requireMinRole } from '../../middleware/rbac.js';
import { mqttService } from '../../mqtt/client.js';
import { checkProtocolGatewayHealth, proxyGet } from '../../proxy/protocol-gateway.js';
import { getWebSocketStats } from '../../websocket/bridge.js';

/**
 * System management routes.
 * Level 1: aggregated health, container/log viewing (proxy to protocol-gateway).
 */
export const systemRoutes: FastifyPluginAsync = async (fastify) => {
  const startTime = Date.now();

  // GET /system/health - Aggregated health of all services
  fastify.get('/health', {
    schema: {
      description: 'Aggregated health of all platform services',
      tags: ['System'],
    },
    handler: async (_request, reply) => {
      // Check all components in parallel
      const [dbCheck, pgCheck, diCheck] = await Promise.all([
        checkDatabase(),
        checkProtocolGatewayHealth(),
        checkDataIngestion(),
      ]);

      const mqttCheck = {
        status: mqttService.isConnected() ? 'ok' as const : 'error' as const,
        connected: mqttService.isConnected(),
      };

      const wsStats = getWebSocketStats();
      const wsCheck = {
        status: 'ok' as const,
        connections: wsStats.connections,
        subscriptions: wsStats.subscriptions,
      };

      const components = {
        database: dbCheck,
        mqtt: mqttCheck,
        websocket: wsCheck,
        protocol_gateway: pgCheck,
        data_ingestion: diCheck,
      };

      // Overall status: healthy if all ok, degraded if some fail, unhealthy if critical fail
      const componentStatuses = Object.values(components).map((c) => c.status);
      let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (componentStatuses.includes('error')) {
        overallStatus = dbCheck.status === 'error' ? 'unhealthy' : 'degraded';
      }

      const statusCode = overallStatus === 'healthy' ? 200 : 503;
      return reply.status(statusCode).send({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - startTime) / 1000),
        components,
      });
    },
  });

  // GET /system/info - Service versions and uptime
  fastify.get('/info', {
    schema: {
      description: 'Service info: version, uptime, environment',
      tags: ['System'],
    },
    handler: async (_request, reply) => {
      const mem = process.memoryUsage();
      const wsStats = getWebSocketStats();

      return reply.send({
        service: 'gateway-core',
        version: '2.0.0',
        environment: env.NODE_ENV,
        uptime: Math.floor((Date.now() - startTime) / 1000),
        node: process.version,
        auth: env.AUTH_ENABLED,
        audit: env.AUDIT_ENABLED,
        websocket: wsStats,
        memory: {
          rss: Math.round(mem.rss / 1024 / 1024),
          heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
          unit: 'MB',
        },
      });
    },
  });

  // GET /system/containers - List running containers (proxy to protocol-gateway)
  fastify.get('/containers', {
    preHandler: requireMinRole('engineer'),
    schema: {
      description: 'List running containers (proxied to protocol-gateway)',
      tags: ['System'],
    },
    handler: async (request, reply) => {
      const result = await proxyGet('/api/logs/containers', undefined, {
        requestId: request.id,
      });
      return reply.send(result);
    },
  });

  // GET /system/logs - Container logs (proxy to protocol-gateway)
  fastify.get<{ Querystring: { container?: string; tail?: string } }>('/logs', {
    preHandler: requireMinRole('engineer'),
    schema: {
      description: 'View container logs (proxied to protocol-gateway)',
      tags: ['System'],
      querystring: {
        type: 'object',
        properties: {
          container: { type: 'string' },
          tail: { type: 'string', default: '100' },
        },
      },
    },
    handler: async (request, reply) => {
      const query: Record<string, string> = {};
      if (request.query.container) query.container = request.query.container;
      if (request.query.tail) query.tail = request.query.tail;

      const result = await proxyGet('/api/logs', query, {
        requestId: request.id,
      });
      return reply.send(result);
    },
  });

  // GET /system/audit - Query audit log
  fastify.get<{
    Querystring: {
      username?: string;
      action?: string;
      resourceType?: string;
      since?: string;
      limit?: string;
      offset?: string;
    };
  }>('/audit', {
    preHandler: requireMinRole('admin'),
    schema: {
      description: 'Query audit log entries (admin only)',
      tags: ['System'],
      querystring: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          action: { type: 'string' },
          resourceType: { type: 'string' },
          since: { type: 'string', description: 'ISO 8601 datetime' },
          limit: { type: 'string', default: '50' },
          offset: { type: 'string', default: '0' },
        },
      },
    },
    handler: async (request, reply) => {
      const {
        username,
        action,
        resourceType,
        since,
        limit: limitStr = '50',
        offset: offsetStr = '0',
      } = request.query;

      const conditions = [];
      if (username) conditions.push(eq(auditLog.username, username));
      if (action) conditions.push(eq(auditLog.action, action));
      if (resourceType) conditions.push(eq(auditLog.resourceType, resourceType));
      if (since) conditions.push(gte(auditLog.createdAt, new Date(since)));

      const limit = Math.min(parseInt(limitStr, 10) || 50, 200);
      const offset = parseInt(offsetStr, 10) || 0;

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const entries = await db
        .select()
        .from(auditLog)
        .where(whereClause)
        .orderBy(desc(auditLog.createdAt))
        .limit(limit)
        .offset(offset);

      return reply.send({
        data: entries,
        limit,
        offset,
      });
    },
  });

  // GET /system/topics - Active MQTT topics (proxy to protocol-gateway)
  fastify.get('/topics', {
    preHandler: requireMinRole('engineer'),
    schema: {
      description: 'Active MQTT topics overview (proxied to protocol-gateway)',
      tags: ['System'],
    },
    handler: async (request, reply) => {
      const result = await proxyGet('/api/topics', undefined, {
        requestId: request.id,
      });
      return reply.send(result);
    },
  });
};

async function checkDatabase(): Promise<{
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      latencyMs: Date.now() - start,
    };
  }
}

async function checkDataIngestion(): Promise<{
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const url = new URL('/health/live', env.DATA_INGESTION_URL);
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok) {
      return { status: 'ok', latencyMs: Date.now() - start };
    }
    return { status: 'error', error: `HTTP ${response.status}`, latencyMs: Date.now() - start };
  } catch {
    return { status: 'error', error: 'Data ingestion unreachable', latencyMs: Date.now() - start };
  }
}
