import { z } from 'zod';

// ============================================================================
// Protocol-specific config schemas
// ============================================================================

const modbusConfigSchema = z.object({
  slaveId: z.number().int().min(1).max(247),
  timeout: z.number().int().positive().optional(),
  retryCount: z.number().int().min(0).max(10).optional(),
  retryDelay: z.number().int().positive().optional(),
});

const opcuaConfigSchema = z.object({
  securityPolicy: z.enum(['None', 'Basic128Rsa15', 'Basic256', 'Basic256Sha256']).optional(),
  securityMode: z.enum(['None', 'Sign', 'SignAndEncrypt']).optional(),
  authMode: z.enum(['anonymous', 'username', 'certificate']).optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  endpointUrl: z.string().optional(),
  useSubscriptions: z.boolean().optional(),
});

const s7ConfigSchema = z.object({
  rack: z.number().int().min(0).max(7),
  slot: z.number().int().min(0).max(31),
  pduSize: z.number().int().positive().optional(),
  timeout: z.number().int().positive().optional(),
});

const mqttProtocolConfigSchema = z.object({
  brokerUrl: z.string().min(1),
  clientId: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  topicFilter: z.string().optional(),
  qos: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
});

// ============================================================================
// Shared constants
// ============================================================================

export const PROTOCOLS = ['modbus', 'opcua', 's7', 'mqtt', 'bacnet', 'ethernetip'] as const;
export const DEVICE_STATUSES = ['online', 'offline', 'error', 'unknown', 'connecting'] as const;
export const SETUP_STATUSES = ['created', 'connected', 'configured', 'active'] as const;

// ============================================================================
// Device schemas
// ============================================================================

// Base schema without refinement (for .partial() to work)
const deviceBaseSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  protocol: z.enum(PROTOCOLS),
  enabled: z.boolean().default(true),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  protocolConfig: z.record(z.unknown()).optional(),
  unsPrefix: z.string().max(512).optional(),
  pollIntervalMs: z.number().int().min(50).max(3600000).default(1000),
  location: z.string().max(255).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Create schema with protocol config validation
export const createDeviceSchema = deviceBaseSchema.superRefine((data, ctx) => {
  if (data.protocolConfig) {
    let result;
    switch (data.protocol) {
      case 'modbus':
        result = modbusConfigSchema.safeParse(data.protocolConfig);
        break;
      case 'opcua':
        result = opcuaConfigSchema.safeParse(data.protocolConfig);
        break;
      case 's7':
        result = s7ConfigSchema.safeParse(data.protocolConfig);
        break;
      case 'mqtt':
        result = mqttProtocolConfigSchema.safeParse(data.protocolConfig);
        break;
      // bacnet, ethernetip: no config validation yet (future protocols)
    }
    if (result && !result.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid ${data.protocol} configuration: ${result.error.message}`,
        path: ['protocolConfig'],
      });
    }
  }
});

// Update schema - partial fields, protocol cannot be changed
export const updateDeviceSchema = deviceBaseSchema.partial().omit({ protocol: true });

export const deviceIdSchema = z.object({
  id: z.string().uuid(),
});

export const deviceQuerySchema = z.object({
  protocol: z.enum(PROTOCOLS).optional(),
  status: z.enum(DEVICE_STATUSES).optional(),
  setupStatus: z.enum(SETUP_STATUSES).optional(),
  enabled: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ============================================================================
// Type exports
// ============================================================================

export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;
export type DeviceQuery = z.infer<typeof deviceQuerySchema>;
