import { count, eq, ilike, or, sql, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { devices, tags, type Device, type NewDevice, type Tag } from '../../db/schema.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { mqttService } from '../../mqtt/client.js';
import type { CreateDeviceInput, DeviceQuery, UpdateDeviceInput } from './schema.js';

/** PostgreSQL unique_violation error code */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === '23505';
}

/** Escape LIKE/ILIKE wildcards to prevent injection */
function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

export interface DeviceWithTags extends Device {
  tags: Tag[];
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

    if (query.setupStatus) {
      conditions.push(eq(devices.setupStatus, query.setupStatus));
    }

    if (query.enabled !== undefined) {
      conditions.push(eq(devices.enabled, query.enabled));
    }

    if (query.search) {
      conditions.push(
        or(
          ilike(devices.name, `%${escapeLike(query.search)}%`),
          ilike(devices.description, `%${escapeLike(query.search)}%`),
          ilike(devices.location, `%${escapeLike(query.search)}%`)
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
   * Get tags for a device (used by MQTT notifications)
   */
  async getDeviceTags(deviceId: string): Promise<Tag[]> {
    return db.select().from(tags).where(eq(tags.deviceId, deviceId));
  }

  /**
   * Create a new device (two-phase: device first, tags later)
   */
  async create(input: CreateDeviceInput): Promise<Device> {
    const newDevice: NewDevice = {
      name: input.name,
      description: input.description,
      protocol: input.protocol,
      enabled: input.enabled,
      host: input.host,
      port: input.port,
      protocolConfig: input.protocolConfig ?? {},
      unsPrefix: input.unsPrefix,
      pollIntervalMs: input.pollIntervalMs,
      location: input.location,
      metadata: input.metadata ?? {},
    };

    let device: Device;
    try {
      const result = await db.insert(devices).values(newDevice).returning();
      device = result[0];
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(`Device with name '${input.name}' already exists`);
      }
      throw error;
    }

    // Notify protocol gateways (best-effort — don't fail HTTP on MQTT error)
    mqttService.notifyDeviceChange('create', device).catch((err) => {
      logger.error({ err, deviceId: device.id }, 'Failed to send MQTT device create notification');
    });

    return device;
  }

  /**
   * Update an existing device
   */
  async update(id: string, input: UpdateDeviceInput): Promise<Device> {
    // Check device exists
    await this.getById(id);

    let device: Device;
    try {
      // Increment config version on every update
      const result = await db
        .update(devices)
        .set({
          ...input,
          configVersion: sql`${devices.configVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(devices.id, id))
        .returning();

      device = result[0];
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(`Device with name '${input.name}' already exists`);
      }
      throw error;
    }

    // Notify protocol gateways with tags (best-effort)
    this.getDeviceTags(device.id).then((deviceTags) => {
      mqttService.notifyDeviceChange('update', device, deviceTags).catch((err) => {
        logger.error({ err, deviceId: device.id }, 'Failed to send MQTT device update notification');
      });
    }).catch((err) => {
      logger.error({ err, deviceId: device.id }, 'Failed to fetch tags for MQTT notification');
    });

    return device;
  }

  /**
   * Delete a device and all its tags
   */
  async delete(id: string): Promise<void> {
    const device = await this.getById(id);

    await db.delete(devices).where(eq(devices.id, id));

    // Notify protocol gateways (best-effort)
    mqttService.notifyDeviceChange('delete', device).catch((err) => {
      logger.error({ err, deviceId: device.id }, 'Failed to send MQTT device delete notification');
    });
  }

  /**
   * Update device status (called by MQTT status subscriber)
   */
  async updateStatus(
    id: string,
    status: 'online' | 'offline' | 'error' | 'unknown' | 'connecting',
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
   * Update device setup status (tracks two-phase setup progress)
   */
  async updateSetupStatus(
    id: string,
    setupStatus: 'created' | 'connected' | 'configured' | 'active'
  ): Promise<void> {
    await db
      .update(devices)
      .set({
        setupStatus,
        updatedAt: new Date(),
      })
      .where(eq(devices.id, id));
  }

  /**
   * Increment config version for a device (called when its tags change)
   */
  async incrementConfigVersion(id: string): Promise<void> {
    await db
      .update(devices)
      .set({
        configVersion: sql`${devices.configVersion} + 1`,
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
