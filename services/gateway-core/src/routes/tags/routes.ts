import type { FastifyPluginAsync } from 'fastify';
import { ValidationError } from '../../lib/errors.js';
import {
    bulkCreateTagsSchema,
    createTagSchema,
    tagIdSchema,
    tagQuerySchema,
    updateTagSchema,
} from './schema.js';
import { tagService } from './service.js';

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
          dataType: {
            type: 'string',
            enum: [
              'bool',
              'int16',
              'int32',
              'int64',
              'uint16',
              'uint32',
              'uint64',
              'float32',
              'float64',
              'string',
            ],
          },
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
    schema: {
      description: 'Create a new tag',
      tags: ['Tags'],
      body: {
        type: 'object',
        required: ['deviceId', 'name', 'address', 'dataType'],
        properties: {
          deviceId: { type: 'string', format: 'uuid' },
          name: { type: 'string', minLength: 1, maxLength: 255 },
          description: { type: 'string' },
          enabled: { type: 'boolean', default: true },
          address: { type: 'string', minLength: 1 },
          dataType: {
            type: 'string',
            enum: [
              'bool',
              'int16',
              'int32',
              'int64',
              'uint16',
              'uint32',
              'uint64',
              'float32',
              'float64',
              'string',
            ],
          },
          scaleFactor: { type: 'number' },
          scaleOffset: { type: 'number' },
          clampMin: { type: 'number' },
          clampMax: { type: 'number' },
          engineeringUnits: { type: 'string', maxLength: 50 },
          deadbandAbsolute: { type: 'number' },
          deadbandPercent: { type: 'number' },
          customTopic: { type: 'string' },
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
    schema: {
      description: 'Bulk create tags for a device',
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
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                enabled: { type: 'boolean' },
                address: { type: 'string' },
                dataType: { type: 'string' },
                scaleFactor: { type: 'number' },
                scaleOffset: { type: 'number' },
                engineeringUnits: { type: 'string' },
                metadata: { type: 'object' },
              },
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
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          enabled: { type: 'boolean' },
          address: { type: 'string' },
          dataType: { type: 'string' },
          scaleFactor: { type: 'number' },
          scaleOffset: { type: 'number' },
          clampMin: { type: 'number' },
          clampMax: { type: 'number' },
          engineeringUnits: { type: 'string' },
          deadbandAbsolute: { type: 'number' },
          deadbandPercent: { type: 'number' },
          customTopic: { type: 'string' },
          metadata: { type: 'object' },
        },
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

