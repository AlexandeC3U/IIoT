import { relations } from 'drizzle-orm';
import {
    boolean,
    doublePrecision,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    smallint,
    text,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';

// ============================================================================
// Enums
// ============================================================================

export const protocolEnum = pgEnum('protocol', ['modbus', 'opcua', 's7', 'mqtt', 'bacnet', 'ethernetip']);
export const deviceStatusEnum = pgEnum('device_status', ['online', 'offline', 'error', 'unknown', 'connecting']);
export const setupStatusEnum = pgEnum('setup_status', ['created', 'connected', 'configured', 'active']);
export const tagDataTypeEnum = pgEnum('tag_data_type', [
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
]);

// ============================================================================
// Devices Table
// ============================================================================

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    protocol: protocolEnum('protocol').notNull(),
    enabled: boolean('enabled').notNull().default(true),

    // Connection settings (protocol-specific)
    host: varchar('host', { length: 255 }).notNull(),
    port: integer('port').notNull(),

    // Protocol-specific configuration stored as JSON
    // Modbus: { unitId, timeout }
    // OPC UA: { securityPolicy, securityMode, certificatePath }
    // S7: { rack, slot, pduSize }
    protocolConfig: jsonb('protocol_config').$type<Record<string, unknown>>().default({}),

    // UNS (Unified Namespace) prefix for this device's MQTT topic hierarchy
    // e.g., "acme/plant1/area2/line3"
    unsPrefix: varchar('uns_prefix', { length: 512 }),

    // Polling configuration
    pollIntervalMs: integer('poll_interval_ms').notNull().default(1000),

    // Config version — incremented on every device or tag change
    // Used by protocol-gateway to detect stale configs
    configVersion: integer('config_version').notNull().default(1),

    // Status (updated by protocol gateway via MQTT status ingest)
    status: deviceStatusEnum('status').notNull().default('unknown'),
    lastSeen: timestamp('last_seen', { withTimezone: true }),
    lastError: text('last_error'),

    // Two-phase setup tracking
    setupStatus: setupStatusEnum('setup_status').notNull().default('created'),

    // Metadata
    location: varchar('location', { length: 255 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: uniqueIndex('devices_name_idx').on(table.name),
    protocolIdx: index('devices_protocol_idx').on(table.protocol),
    statusIdx: index('devices_status_idx').on(table.status),
  })
);

// ============================================================================
// Tags Table
// ============================================================================

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    enabled: boolean('enabled').notNull().default(true),

    // Address (protocol-specific)
    // Modbus: "40001" (holding register), "10001" (input register), "00001" (coil)
    // OPC UA: "ns=2;s=Channel1.Device1.Tag1"
    // S7: "DB1.DBD0" (data block), "MW0" (memory word), "I0.0" (input bit)
    address: varchar('address', { length: 512 }).notNull(),
    dataType: tagDataTypeEnum('data_type').notNull(),

    // Transformation settings
    scaleFactor: doublePrecision('scale_factor'), // multiply raw value
    scaleOffset: doublePrecision('scale_offset'), // add after scaling
    clampMin: doublePrecision('clamp_min'), // minimum allowed value
    clampMax: doublePrecision('clamp_max'), // maximum allowed value
    engineeringUnits: varchar('engineering_units', { length: 50 }), // e.g., "°C", "bar", "rpm"

    // Deadband
    deadbandType: varchar('deadband_type', { length: 20 }).default('none'), // 'none' | 'absolute' | 'percent'
    deadbandValue: doublePrecision('deadband_value'),

    // Protocol-specific fields (aligned with protocol-gateway domain.Tag)
    accessMode: varchar('access_mode', { length: 20 }).default('read'), // 'read' | 'write' | 'readwrite'
    priority: smallint('priority').default(0),
    byteOrder: varchar('byte_order', { length: 20 }), // 'big_endian' | 'little_endian'
    registerType: varchar('register_type', { length: 30 }), // Modbus: 'holding' | 'input' | 'coil' | 'discrete'
    registerCount: smallint('register_count'), // Modbus: number of registers to read
    opcNodeId: varchar('opc_node_id', { length: 512 }), // OPC UA node identifier
    opcNamespaceUri: varchar('opc_namespace_uri', { length: 512 }), // OPC UA namespace
    s7Address: varchar('s7_address', { length: 255 }), // S7: "DB1.DBD0"

    // UNS topic suffix (appended to device's UNS prefix)
    // If not set, uses tag name as suffix
    topicSuffix: varchar('topic_suffix', { length: 512 }),

    // Metadata
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    deviceTagIdx: uniqueIndex('tags_device_tag_idx').on(table.deviceId, table.name),
    deviceIdx: index('tags_device_idx').on(table.deviceId),
  })
);

// ============================================================================
// Audit Log Table
// ============================================================================

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userSub: varchar('user_sub', { length: 255 }),
    username: varchar('username', { length: 255 }),
    action: varchar('action', { length: 50 }).notNull(),
    resourceType: varchar('resource_type', { length: 50 }),
    resourceId: uuid('resource_id'),
    details: jsonb('details').$type<Record<string, unknown>>(),
    ipAddress: varchar('ip_address', { length: 45 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('audit_log_user_idx').on(table.userSub),
    resourceIdx: index('audit_log_resource_idx').on(table.resourceType, table.resourceId),
    createdIdx: index('audit_log_created_idx').on(table.createdAt),
  })
);

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;

// ============================================================================
// Relations
// ============================================================================

export const devicesRelations = relations(devices, ({ many }) => ({
  tags: many(tags),
}));

export const tagsRelations = relations(tags, ({ one }) => ({
  device: one(devices, {
    fields: [tags.deviceId],
    references: [devices.id],
  }),
}));

// ============================================================================
// Type Exports
// ============================================================================

export type Device = typeof devices.$inferSelect;
export type NewDevice = typeof devices.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

// Protocol-specific config types for type safety
export interface ModbusConfig {
  slaveId: number;
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
}

export interface OpcUaConfig {
  securityPolicy?: 'None' | 'Basic128Rsa15' | 'Basic256' | 'Basic256Sha256';
  securityMode?: 'None' | 'Sign' | 'SignAndEncrypt';
  authMode?: 'anonymous' | 'username' | 'certificate';
  username?: string;
  password?: string;
  endpointUrl?: string;
  useSubscriptions?: boolean;
}

export interface S7Config {
  rack: number;
  slot: number;
  pduSize?: number;
  timeout?: number;
}

export interface MqttProtocolConfig {
  brokerUrl: string;
  clientId?: string;
  username?: string;
  password?: string;
  topicFilter?: string;
  qos?: 0 | 1 | 2;
}

