import type { FastifyPluginAsync } from 'fastify';
import { ValidationError } from '../../lib/errors.js';
import { requireMinRole } from '../../middleware/rbac.js';
import {
    bulkCreateTagsSchema,
    createTagSchema,
    DATA_TYPES,
    tagIdSchema,
    tagQuerySchema,
    updateTagSchema,
} from './schema.js';
import { tagService } from './service.js';

// Shared swagger property definitions for tag fields
const tagBodyProperties = {
  name: { type: 'string', minLength: 1, maxLength: 255 },
  description: { type: 'string' },
  enabled: { type: 'boolean', default: true },
  address: { type: 'string', minLength: 1 },
  dataType: { type: 'string', enum: [...DATA_TYPES] },
  scaleFactor: { type: 'number' },
  scaleOffset: { type: 'number' },
  clampMin: { type: 'number' },
  clampMax: { type: 'number' },
  engineeringUnits: { type: 'string', maxLength: 50 },
  deadbandType: { type: 'string', enum: ['none', 'absolute', 'percent'] },
  deadbandValue: { type: 'number' },
  accessMode: { type: 'string', enum: ['read', 'write', 'readwrite'] },
  priority: { type: 'number' },
  byteOrder: { type: 'string', enum: ['big_endian', 'little_endian'] },
  registerType: { type: 'string', enum: ['holding', 'input', 'coil', 'discrete'] },
  registerCount: { type: 'number' },
  opcNodeId: { type: 'string' },
  opcNamespaceUri: { type: 'string' },
  s7Address: { type: 'string' },
  topicSuffix: { type: 'string' },
  metadata: { type: 'object' },
} as const;

export const tagRoutes: FastifyPluginAsync = async (fastify) => {
  // =========================================================================
  // GET /tags - List all tags
  // =========================================================================
  fastify.get('/', {
    schema: {
      description: 'List all tags with optional filtering',
      tags: ['Tags'],
      querystring: {
        type: 'object',
        properties: {
          deviceId: { type: 'string', format: 'uuid' },
          dataType: { type: 'string', enum: [...DATA_TYPES] },
          enabled: { type: 'string' },
          search: { type: 'string' },
          limit: { type: 'number', default: 100 },
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
      const parsed = tagQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.flatten());
      }

      const result = await tagService.list(parsed.data);
      return reply.send(result);
    },
  });

  // =========================================================================
  // GET /tags/:id - Get tag by ID
  // =========================================================================
  fastify.get<{ Params: { id: string } }>('/:id', {
    schema: {
      description: 'Get a single tag by ID',
      tags: ['Tags'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
    },
    handler: async (request, reply) => {
      const parsed = tagIdSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new ValidationError('Invalid tag ID', parsed.error.flatten());
      }

      const tag = await tagService.getById(parsed.data.id);
      return reply.send(tag);
    },
  });

  // =========================================================================
  // POST /tags - Create new tag
  // =========================================================================
  fastify.post('/', {
    preHandler: requireMinRole('engineer'),
    schema: {
      description: 'Create a new tag (Phase 2 of two-phase device setup)',
      tags: ['Tags'],
      body: {
        type: 'object',
        required: ['deviceId', 'name', 'address', 'dataType'],
        properties: {
          deviceId: { type: 'string', format: 'uuid' },
          ...tagBodyProperties,
        },
      },
      response: {
        201: {
          type: 'object',
        },
      },
    },
    handler: async (request, reply) => {
      const parsed = createTagSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid tag data', parsed.error.flatten());
      }

      const tag = await tagService.create(parsed.data);
      return reply.status(201).send(tag);
    },
  });

  // =========================================================================
  // POST /tags/bulk - Bulk create tags
  // =========================================================================
  fastify.post('/bulk', {
    preHandler: requireMinRole('engineer'),
    schema: {
      description: 'Bulk create tags for a device (from browse results or manual entry)',
      tags: ['Tags'],
      body: {
        type: 'object',
        required: ['deviceId', 'tags'],
        properties: {
          deviceId: { type: 'string', format: 'uuid' },
          tags: {
            type: 'array',
            minItems: 1,
            maxItems: 1000,
            items: {
              type: 'object',
              required: ['name', 'address', 'dataType'],
              properties: tagBodyProperties,
            },
          },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            created: { type: 'number' },
            tags: { type: 'array' },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const parsed = bulkCreateTagsSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid bulk tag data', parsed.error.flatten());
      }

      const result = await tagService.bulkCreate(parsed.data);
      return reply.status(201).send(result);
    },
  });

  // =========================================================================
  // PUT /tags/:id - Update tag
  // =========================================================================
  fastify.put<{ Params: { id: string } }>('/:id', {
    preHandler: requireMinRole('engineer'),
    schema: {
      description: 'Update an existing tag',
      tags: ['Tags'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: tagBodyProperties,
      },
    },
    handler: async (request, reply) => {
      const parsedParams = tagIdSchema.safeParse(request.params);
      if (!parsedParams.success) {
        throw new ValidationError('Invalid tag ID', parsedParams.error.flatten());
      }

      const parsedBody = updateTagSchema.safeParse(request.body);
      if (!parsedBody.success) {
        throw new ValidationError('Invalid tag data', parsedBody.error.flatten());
      }

      const tag = await tagService.update(parsedParams.data.id, parsedBody.data);
      return reply.send(tag);
    },
  });

  // =========================================================================
  // DELETE /tags/:id - Delete tag
  // =========================================================================
  fastify.delete<{ Params: { id: string } }>('/:id', {
    preHandler: requireMinRole('engineer'),
    schema: {
      description: 'Delete a tag',
      tags: ['Tags'],
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
      const parsed = tagIdSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new ValidationError('Invalid tag ID', parsed.error.flatten());
      }

      await tagService.delete(parsed.data.id);
      return reply.status(204).send();
    },
  });

  // =========================================================================
  // POST /tags/:id/toggle - Toggle tag enabled state
  // =========================================================================
  fastify.post<{ Params: { id: string } }>('/:id/toggle', {
    preHandler: requireMinRole('operator'),
    schema: {
      description: 'Toggle tag enabled/disabled state',
      tags: ['Tags'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
    },
    handler: async (request, reply) => {
      const parsed = tagIdSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new ValidationError('Invalid tag ID', parsed.error.flatten());
      }

      const tag = await tagService.toggleEnabled(parsed.data.id);
      return reply.send(tag);
    },
  });
};
