import { z } from 'zod';

// ============================================================================
// Tag schemas
// ============================================================================

export const createTagSchema = z.object({
  deviceId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  enabled: z.boolean().default(true),
  address: z.string().min(1).max(512),
  dataType: z.enum([
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
  ]),
  scaleFactor: z.number().optional(),
  scaleOffset: z.number().optional(),
  clampMin: z.number().optional(),
  clampMax: z.number().optional(),
  engineeringUnits: z.string().max(50).optional(),
  deadbandAbsolute: z.number().optional(),
  deadbandPercent: z.number().min(0).max(100).optional(),
  customTopic: z.string().max(512).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateTagSchema = createTagSchema.partial().omit({ deviceId: true });

export const tagIdSchema = z.object({
  id: z.string().uuid(),
});

export const tagQuerySchema = z.object({
  deviceId: z.string().uuid().optional(),
  dataType: z
    .enum([
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
    ])
    .optional(),
  enabled: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const bulkCreateTagsSchema = z.object({
  deviceId: z.string().uuid(),
  tags: z.array(
    z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      enabled: z.boolean().default(true),
      address: z.string().min(1).max(512),
      dataType: z.enum([
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
      ]),
      scaleFactor: z.number().optional(),
      scaleOffset: z.number().optional(),
      engineeringUnits: z.string().max(50).optional(),
      metadata: z.record(z.unknown()).optional(),
    })
  ).min(1).max(1000),
});

// ============================================================================
// Type exports
// ============================================================================

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
export type TagQuery = z.infer<typeof tagQuerySchema>;
export type BulkCreateTagsInput = z.infer<typeof bulkCreateTagsSchema>;

