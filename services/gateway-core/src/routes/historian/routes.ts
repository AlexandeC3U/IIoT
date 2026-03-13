import type { FastifyInstance } from 'fastify';
import { proxyGetDataIngestion } from '../../proxy/data-ingestion.js';

/**
 * Historian routes — proxied to data-ingestion service.
 */
export async function historianRoutes(app: FastifyInstance) {
  /**
   * GET /api/historian/history?topic=...&from=...&to=...&limit=...
   *
   * Returns time-series data points and stats for a given MQTT topic.
   */
  app.get('/history', {
    schema: {
      tags: ['Historian'],
      summary: 'Query tag history',
      description:
        'Returns time-series data points and aggregate stats (avg, min, max) for a topic.',
      querystring: {
        type: 'object',
        required: ['topic'],
        properties: {
          topic: { type: 'string', description: 'MQTT topic (e.g. site/area/line/tag)' },
          from: {
            type: 'string',
            description: 'Start time as Unix milliseconds (default: 10 min ago)',
          },
          to: { type: 'string', description: 'End time as Unix milliseconds (default: now)' },
          limit: {
            type: 'string',
            description: 'Max data points to return (default: 500, max: 5000)',
          },
        },
      },
    },
    handler: async (request, reply) => {
      const query = request.query as Record<string, string>;
      const result = await proxyGetDataIngestion('/api/history', query);
      return reply.send(result);
    },
  });
}
