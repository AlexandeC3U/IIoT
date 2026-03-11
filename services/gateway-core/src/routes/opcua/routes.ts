import type { FastifyPluginAsync } from 'fastify';
import { requireMinRole } from '../../middleware/rbac.js';
import { proxyDelete, proxyGet, proxyPost } from '../../proxy/protocol-gateway.js';

/**
 * OPC UA certificate management routes.
 * Pure pass-through proxy to protocol-gateway.
 */
export const opcuaRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /opcua/certificates/trusted
  fastify.get('/certificates/trusted', {
    preHandler: requireMinRole('engineer'),
    schema: {
      description: 'List trusted OPC UA certificates',
      tags: ['OPC UA'],
    },
    handler: async (request, reply) => {
      const result = await proxyGet('/api/opcua/certificates/trusted', undefined, {
        requestId: request.id,
      });
      return reply.send(result);
    },
  });

  // GET /opcua/certificates/rejected
  fastify.get('/certificates/rejected', {
    preHandler: requireMinRole('engineer'),
    schema: {
      description: 'List rejected OPC UA certificates',
      tags: ['OPC UA'],
    },
    handler: async (request, reply) => {
      const result = await proxyGet('/api/opcua/certificates/rejected', undefined, {
        requestId: request.id,
      });
      return reply.send(result);
    },
  });

  // POST /opcua/certificates/trust
  fastify.post<{ Body: { fingerprint: string } }>('/certificates/trust', {
    preHandler: requireMinRole('engineer'),
    schema: {
      description: 'Promote a rejected OPC UA certificate to trusted',
      tags: ['OPC UA'],
      body: {
        type: 'object',
        required: ['fingerprint'],
        properties: {
          fingerprint: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const result = await proxyPost('/api/opcua/certificates/trust', request.body, {
        requestId: request.id,
      });
      return reply.send(result);
    },
  });

  // DELETE /opcua/certificates/trusted/:fingerprint
  fastify.delete<{ Params: { fingerprint: string } }>('/certificates/trusted/:fingerprint', {
    preHandler: requireMinRole('engineer'),
    schema: {
      description: 'Remove a trusted OPC UA certificate',
      tags: ['OPC UA'],
      params: {
        type: 'object',
        properties: {
          fingerprint: { type: 'string' },
        },
        required: ['fingerprint'],
      },
    },
    handler: async (request, reply) => {
      const result = await proxyDelete('/api/opcua/certificates/trusted', {
        fingerprint: request.params.fingerprint,
      }, { requestId: request.id });
      return reply.status(204).send(result);
    },
  });
};
