import { relations } from 'drizzle-orm';
import {
    boolean,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';

// ============================================================================
// Enums
// ============================================================================

export const protocolEnum = pgEnum('protocol', ['modbus', 'opcua', 's7']);
export const deviceStatusEnum = pgEnum('device_status', ['online', 'offline', 'error', 'unknown']);
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

    // Polling configuration
    pollIntervalMs: integer('poll_interval_ms').notNull().default(1000),

    // Status (updated by protocol gateway)
    status: deviceStatusEnum('status').notNull().default('unknown'),
    lastSeen: timestamp('last_seen', { withTimezone: true }),
    lastError: text('last_error'),

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
    scaleFactor: integer('scale_factor'), // multiply raw value
    scaleOffset: integer('scale_offset'), // add after scaling
    clampMin: integer('clamp_min'), // minimum allowed value
    clampMax: integer('clamp_max'), // maximum allowed value
    engineeringUnits: varchar('engineering_units', { length: 50 }), // e.g., "°C", "bar", "rpm"

    // Deadband (for Phase 4)
    deadbandAbsolute: integer('deadband_absolute'),
    deadbandPercent: integer('deadband_percent'),

    // UNS topic customization (optional)
    // If not set, uses default: $nexus/data/{enterprise}/{site}/{area}/{line}/{device}/{tag}
    customTopic: varchar('custom_topic', { length: 512 }),

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
  unitId: number;
  timeout?: number;
  byteOrder?: 'big' | 'little';
}

export interface OpcUaConfig {
  securityPolicy?: 'None' | 'Basic128Rsa15' | 'Basic256' | 'Basic256Sha256';
  securityMode?: 'None' | 'Sign' | 'SignAndEncrypt';
  certificatePath?: string;
  privateKeyPath?: string;
}

export interface S7Config {
  rack: number;
  slot: number;
  pduSize?: number;
  timeout?: number;
}

