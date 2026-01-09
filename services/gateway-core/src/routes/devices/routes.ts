import type { FastifyPluginAsync } from 'fastify';
import { ValidationError } from '../../lib/errors.js';
import {
    createDeviceSchema,
    deviceIdSchema,
    deviceQuerySchema,
    updateDeviceSchema,
} from './schema.js';
import { deviceService } from './service.js';

export const deviceRoutes: FastifyPluginAsync = async (fastify) => {
  // =========================================================================
  // GET /devices - List all devices
  // =========================================================================
  fastify.get('/', {
    schema: {
      description: 'List all devices with optional filtering',
      tags: ['Devices'],
      querystring: {
        type: 'object',
        properties: {
          protocol: { type: 'string', enum: ['modbus', 'opcua', 's7'] },
          status: { type: 'string', enum: ['online', 'offline', 'error', 'unknown'] },
          enabled: { type: 'string' },
          search: { type: 'string' },
          limit: { type: 'number', default: 50 },
          offset: { type: 'number', default: 0 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'array' },
            total: { type: 'number' },
            limit: { type: 'number' },
            offset: { type: 'number' },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const parsed = deviceQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.flatten());
      }

      const result = await deviceService.list(parsed.data);
      return reply.send(result);
    },
  });

  // =========================================================================
  // GET /devices/:id - Get device by ID
  // =========================================================================
  fastify.get<{ Params: { id: string }; Querystring: { includeTags?: string } }>('/:id', {
    schema: {
      description: 'Get a single device by ID',
      tags: ['Devices'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      querystring: {
        type: 'object',
        properties: {
          includeTags: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const parsed = deviceIdSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new ValidationError('Invalid device ID', parsed.error.flatten());
      }

      const includeTags = request.query.includeTags === 'true';
      const device = await deviceService.getById(parsed.data.id, includeTags);
      return reply.send(device);
    },
  });

  // =========================================================================
  // POST /devices - Create new device
  // =========================================================================
  fastify.post('/', {
    schema: {
      description: 'Create a new device',
      tags: ['Devices'],
      body: {
        type: 'object',
        required: ['name', 'protocol', 'host', 'port'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          description: { type: 'string' },
          protocol: { type: 'string', enum: ['modbus', 'opcua', 's7'] },
          enabled: { type: 'boolean', default: true },
          host: { type: 'string', minLength: 1 },
          port: { type: 'number', minimum: 1, maximum: 65535 },
          protocolConfig: { type: 'object' },
          pollIntervalMs: { type: 'number', default: 1000 },
          location: { type: 'string' },
          metadata: { type: 'object' },
        },
      },
      response: {
        201: {
          type: 'object',
        },
      },
    },
    handler: async (request, reply) => {
      const parsed = createDeviceSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid device data', parsed.error.flatten());
      }

      const device = await deviceService.create(parsed.data);
      return reply.status(201).send(device);
    },
  });

  // =========================================================================
  // PUT /devices/:id - Update device
  // =========================================================================
  fastify.put<{ Params: { id: string } }>('/:id', {
    schema: {
      description: 'Update an existing device',
      tags: ['Devices'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          enabled: { type: 'boolean' },
          host: { type: 'string' },
          port: { type: 'number' },
          protocolConfig: { type: 'object' },
          pollIntervalMs: { type: 'number' },
          location: { type: 'string' },
          metadata: { type: 'object' },
        },
      },
    },
    handler: async (request, reply) => {
      const parsedParams = deviceIdSchema.safeParse(request.params);
      if (!parsedParams.success) {
        throw new ValidationError('Invalid device ID', parsedParams.error.flatten());
      }

      const parsedBody = updateDeviceSchema.safeParse(request.body);
      if (!parsedBody.success) {
        throw new ValidationError('Invalid device data', parsedBody.error.flatten());
      }

      const device = await deviceService.update(parsedParams.data.id, parsedBody.data);
      return reply.send(device);
    },
  });

  // =========================================================================
  // DELETE /devices/:id - Delete device
  // =========================================================================
  fastify.delete<{ Params: { id: string } }>('/:id', {
    schema: {
      description: 'Delete a device and all its tags',
      tags: ['Devices'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      response: {
        204: {
          type: 'null',
        },
      },
    },
    handler: async (request, reply) => {
      const parsed = deviceIdSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new ValidationError('Invalid device ID', parsed.error.flatten());
      }

      await deviceService.delete(parsed.data.id);
      return reply.status(204).send();
    },
  });

  // =========================================================================
  // POST /devices/:id/toggle - Toggle device enabled state
  // =========================================================================
  fastify.post<{ Params: { id: string } }>('/:id/toggle', {
    schema: {
      description: 'Toggle device enabled/disabled state',
      tags: ['Devices'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
    },
    handler: async (request, reply) => {
      const parsed = deviceIdSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new ValidationError('Invalid device ID', parsed.error.flatten());
      }

      const device = await deviceService.toggleEnabled(parsed.data.id);
      return reply.send(device);
    },
  });
};

