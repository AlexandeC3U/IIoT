import type { FastifyPluginAsync } from 'fastify';
import { pool } from '../../db/index.js';
import { mqttService } from '../../mqtt/client.js';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    database: { status: 'ok' | 'error'; latencyMs?: number; error?: string };
    mqtt: { status: 'ok' | 'error'; connected: boolean };
  };
}

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  const startTime = Date.now();

  // =========================================================================
  // GET /health - Basic liveness check
  // =========================================================================
  fastify.get('/', {
    schema: {
      description: 'Basic liveness check',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
          },
        },
      },
    },
    handler: async (_request, reply) => {
      return reply.send({
        status: 'ok',
        timestamp: new Date().toISOString(),
      });
    },
  });

  // =========================================================================
  // GET /health/ready - Readiness check (includes dependencies)
  // =========================================================================
  fastify.get('/ready', {
    schema: {
      description: 'Readiness check including database and MQTT connectivity',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' },
            checks: {
              type: 'object',
              properties: {
                database: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    latencyMs: { type: 'number' },
                    error: { type: 'string' },
                  },
                  additionalProperties: true,
                },
                mqtt: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    connected: { type: 'boolean' },
                  },
                  additionalProperties: true,
                },
              },
              additionalProperties: true,
            },
          },
          additionalProperties: true,
        },
        503: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
    handler: async (_request, reply) => {
      const health: HealthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - startTime) / 1000),
        checks: {
          database: { status: 'ok' },
          mqtt: { status: 'ok', connected: mqttService.isConnected() },
        },
      };

      // Check database
      try {
        const dbStart = Date.now();
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        health.checks.database.latencyMs = Date.now() - dbStart;
      } catch (error) {
        health.checks.database.status = 'error';
        health.checks.database.error = error instanceof Error ? error.message : 'Unknown error';
        health.status = 'degraded';
      }

      // Check MQTT
      if (!mqttService.isConnected()) {
        health.checks.mqtt.status = 'error';
        health.status = health.status === 'degraded' ? 'unhealthy' : 'degraded';
      }

      const statusCode = health.status === 'healthy' ? 200 : 503;
      return reply.status(statusCode).send(health);
    },
  });

  // =========================================================================
  // GET /health/live - Kubernetes liveness probe
  // =========================================================================
  fastify.get('/live', {
    schema: {
      description: 'Kubernetes liveness probe',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
          },
        },
      },
    },
    handler: async (_request, reply) => {
      return reply.send({ status: 'ok' });
    },
  });
};
