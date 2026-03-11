import { z } from 'zod';

// ============================================================================
// Shared constants
// ============================================================================

export const DATA_TYPES = [
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
] as const;

export const ACCESS_MODES = ['read', 'write', 'readwrite'] as const;
export const DEADBAND_TYPES = ['none', 'absolute', 'percent'] as const;
export const BYTE_ORDERS = ['big_endian', 'little_endian'] as const;
export const REGISTER_TYPES = ['holding', 'input', 'coil', 'discrete'] as const;

// ============================================================================
// Tag schemas
// ============================================================================

export const createTagSchema = z.object({
  deviceId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  enabled: z.boolean().default(true),
  address: z.string().min(1).max(512),
  dataType: z.enum(DATA_TYPES),

  // Transformation
  scaleFactor: z.number().optional(),
  scaleOffset: z.number().optional(),
  clampMin: z.number().optional(),
  clampMax: z.number().optional(),
  engineeringUnits: z.string().max(50).optional(),

  // Deadband
  deadbandType: z.enum(DEADBAND_TYPES).optional(),
  deadbandValue: z.number().optional(),

  // Protocol alignment fields
  accessMode: z.enum(ACCESS_MODES).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  byteOrder: z.enum(BYTE_ORDERS).optional(),
  registerType: z.enum(REGISTER_TYPES).optional(),
  registerCount: z.number().int().min(1).max(125).optional(),
  opcNodeId: z.string().max(512).optional(),
  opcNamespaceUri: z.string().max(512).optional(),
  s7Address: z.string().max(255).optional(),

  // UNS topic
  topicSuffix: z.string().max(512).optional(),

  metadata: z.record(z.unknown()).optional(),
});

export const updateTagSchema = createTagSchema.partial().omit({ deviceId: true });

export const tagIdSchema = z.object({
  id: z.string().uuid(),
});

export const tagQuerySchema = z.object({
  deviceId: z.string().uuid().optional(),
  dataType: z.enum(DATA_TYPES).optional(),
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
      dataType: z.enum(DATA_TYPES),

      // Transformation
      scaleFactor: z.number().optional(),
      scaleOffset: z.number().optional(),
      clampMin: z.number().optional(),
      clampMax: z.number().optional(),
      engineeringUnits: z.string().max(50).optional(),

      // Deadband
      deadbandType: z.enum(DEADBAND_TYPES).optional(),
      deadbandValue: z.number().optional(),

      // Protocol alignment fields
      accessMode: z.enum(ACCESS_MODES).optional(),
      priority: z.number().int().min(0).max(100).optional(),
      byteOrder: z.enum(BYTE_ORDERS).optional(),
      registerType: z.enum(REGISTER_TYPES).optional(),
      registerCount: z.number().int().min(1).max(125).optional(),
      opcNodeId: z.string().max(512).optional(),
      opcNamespaceUri: z.string().max(512).optional(),
      s7Address: z.string().max(255).optional(),
      topicSuffix: z.string().max(512).optional(),

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
