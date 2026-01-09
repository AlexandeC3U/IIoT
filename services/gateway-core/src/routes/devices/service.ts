import { and, count, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { devices, tags, type Device, type NewDevice } from '../../db/schema.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { mqttService } from '../../mqtt/client.js';
import type { CreateDeviceInput, DeviceQuery, UpdateDeviceInput } from './schema.js';

export interface DeviceWithTags extends Device {
  tags: typeof tags.$inferSelect[];
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export class DeviceService {
  /**
   * Get all devices with optional filtering and pagination
   */
  async list(query: DeviceQuery): Promise<PaginatedResult<Device>> {
    const conditions = [];

    if (query.protocol) {
      conditions.push(eq(devices.protocol, query.protocol));
    }

    if (query.status) {
      conditions.push(eq(devices.status, query.status));
    }

    if (query.enabled !== undefined) {
      conditions.push(eq(devices.enabled, query.enabled));
    }

    if (query.search) {
      conditions.push(
        or(
          ilike(devices.name, `%${query.search}%`),
          ilike(devices.description, `%${query.search}%`),
          ilike(devices.location, `%${query.search}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(devices)
        .where(whereClause)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(devices.name),
      db
        .select({ count: count() })
        .from(devices)
        .where(whereClause),
    ]);

    return {
      data,
      total: totalResult[0]?.count ?? 0,
      limit: query.limit,
      offset: query.offset,
    };
  }

  /**
   * Get a single device by ID with optional tag inclusion
   */
  async getById(id: string, includeTags = false): Promise<Device | DeviceWithTags> {
    if (includeTags) {
      const result = await db.query.devices.findFirst({
        where: eq(devices.id, id),
        with: {
          tags: true,
        },
      });

      if (!result) {
        throw new NotFoundError('Device', id);
      }

      return result as DeviceWithTags;
    }

    const result = await db.select().from(devices).where(eq(devices.id, id)).limit(1);

    if (result.length === 0) {
      throw new NotFoundError('Device', id);
    }

    return result[0];
  }

  /**
   * Create a new device
   */
  async create(input: CreateDeviceInput): Promise<Device> {
    // Check for duplicate name
    const existing = await db
      .select({ id: devices.id })
      .from(devices)
      .where(eq(devices.name, input.name))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictError(`Device with name '${input.name}' already exists`);
    }

    const newDevice: NewDevice = {
      name: input.name,
      description: input.description,
      protocol: input.protocol,
      enabled: input.enabled,
      host: input.host,
      port: input.port,
      protocolConfig: input.protocolConfig ?? {},
      pollIntervalMs: input.pollIntervalMs,
      location: input.location,
      metadata: input.metadata ?? {},
    };

    const result = await db.insert(devices).values(newDevice).returning();
    const device = result[0];

    // Notify protocol gateways about new device
    await mqttService.notifyDeviceChange('create', device);

    return device;
  }

  /**
   * Update an existing device
   */
  async update(id: string, input: UpdateDeviceInput): Promise<Device> {
    // Check device exists
    await this.getById(id);

    // Check for duplicate name if name is being changed
    if (input.name) {
      const existing = await db
        .select({ id: devices.id })
        .from(devices)
        .where(and(eq(devices.name, input.name), sql`${devices.id} != ${id}`))
        .limit(1);

      if (existing.length > 0) {
        throw new ConflictError(`Device with name '${input.name}' already exists`);
      }
    }

    const result = await db
      .update(devices)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(devices.id, id))
      .returning();

    const device = result[0];

    // Notify protocol gateways about device update
    await mqttService.notifyDeviceChange('update', device);

    return device;
  }

  /**
   * Delete a device and all its tags
   */
  async delete(id: string): Promise<void> {
    const device = await this.getById(id);

    await db.delete(devices).where(eq(devices.id, id));

    // Notify protocol gateways about device deletion
    await mqttService.notifyDeviceChange('delete', device);
  }

  /**
   * Update device status (called internally based on MQTT status updates)
   */
  async updateStatus(
    id: string,
    status: 'online' | 'offline' | 'error' | 'unknown',
    lastError?: string
  ): Promise<void> {
    await db
      .update(devices)
      .set({
        status,
        lastSeen: status === 'online' ? new Date() : undefined,
        lastError: lastError ?? null,
        updatedAt: new Date(),
      })
      .where(eq(devices.id, id));
  }

  /**
   * Toggle device enabled state
   */
  async toggleEnabled(id: string): Promise<Device> {
    const device = await this.getById(id);

    return this.update(id, { enabled: !device.enabled });
  }
}

// Singleton instance
export const deviceService = new DeviceService();

