import { and, count, eq, ilike, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { devices, tags, type NewTag, type Tag } from '../../db/schema.js';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { mqttService } from '../../mqtt/client.js';
import { deviceService } from '../devices/service.js';
import type { BulkCreateTagsInput, CreateTagInput, TagQuery, UpdateTagInput } from './schema.js';

/** PostgreSQL unique_violation error code */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === '23505';
}

/** Escape LIKE/ILIKE wildcards to prevent injection */
function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export class TagService {
  /**
   * Get all tags with optional filtering and pagination
   */
  async list(query: TagQuery): Promise<PaginatedResult<Tag>> {
    const conditions = [];

    if (query.deviceId) {
      conditions.push(eq(tags.deviceId, query.deviceId));
    }

    if (query.dataType) {
      conditions.push(eq(tags.dataType, query.dataType));
    }

    if (query.enabled !== undefined) {
      conditions.push(eq(tags.enabled, query.enabled));
    }

    if (query.search) {
      conditions.push(
        or(
          ilike(tags.name, `%${escapeLike(query.search)}%`),
          ilike(tags.description, `%${escapeLike(query.search)}%`),
          ilike(tags.address, `%${escapeLike(query.search)}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(tags)
        .where(whereClause)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(tags.name),
      db.select({ count: count() }).from(tags).where(whereClause),
    ]);

    return {
      data,
      total: totalResult[0]?.count ?? 0,
      limit: query.limit,
      offset: query.offset,
    };
  }

  /**
   * Get a single tag by ID
   */
  async getById(id: string): Promise<Tag> {
    const result = await db.select().from(tags).where(eq(tags.id, id)).limit(1);

    if (result.length === 0) {
      throw new NotFoundError('Tag', id);
    }

    return result[0];
  }

  /**
   * Get all tags for a specific device
   */
  async getByDeviceId(deviceId: string): Promise<Tag[]> {
    return db.select().from(tags).where(eq(tags.deviceId, deviceId)).orderBy(tags.name);
  }

  /**
   * Create a new tag
   */
  async create(input: CreateTagInput): Promise<Tag> {
    // Verify device exists (FK will also catch this, but gives a better error message)
    const device = await db
      .select({ id: devices.id })
      .from(devices)
      .where(eq(devices.id, input.deviceId))
      .limit(1);

    if (device.length === 0) {
      throw new ValidationError(`Device with id '${input.deviceId}' not found`);
    }

    const newTag: NewTag = {
      deviceId: input.deviceId,
      name: input.name,
      description: input.description,
      enabled: input.enabled,
      address: input.address,
      dataType: input.dataType,
      scaleFactor: input.scaleFactor,
      scaleOffset: input.scaleOffset,
      clampMin: input.clampMin,
      clampMax: input.clampMax,
      engineeringUnits: input.engineeringUnits,
      deadbandType: input.deadbandType,
      deadbandValue: input.deadbandValue,
      accessMode: input.accessMode,
      priority: input.priority,
      byteOrder: input.byteOrder,
      registerType: input.registerType,
      registerCount: input.registerCount,
      opcNodeId: input.opcNodeId,
      opcNamespaceUri: input.opcNamespaceUri,
      s7Address: input.s7Address,
      topicSuffix: input.topicSuffix,
      metadata: input.metadata ?? {},
    };

    let tag: Tag;
    try {
      const result = await db.insert(tags).values(newTag).returning();
      tag = result[0];
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          `Tag with name '${input.name}' already exists for device '${input.deviceId}'`
        );
      }
      throw error;
    }

    // Increment parent device config version
    await deviceService.incrementConfigVersion(input.deviceId);

    // Update setup status to 'configured' if this is the first tag
    const tagCount = await db
      .select({ count: count() })
      .from(tags)
      .where(eq(tags.deviceId, input.deviceId));
    if (tagCount[0]?.count === 1) {
      await deviceService.updateSetupStatus(input.deviceId, 'configured');
    }

    // Notify protocol gateways (best-effort — don't fail HTTP on MQTT error)
    mqttService.notifyTagChange('create', tag).catch((err) => {
      logger.error({ err, tagId: tag.id }, 'Failed to send MQTT tag create notification');
    });

    return tag;
  }

  /**
   * Bulk create tags for a device (Phase 2 of two-phase setup)
   */
  async bulkCreate(input: BulkCreateTagsInput): Promise<{ created: number; tags: Tag[] }> {
    // Verify device exists
    const device = await db
      .select({ id: devices.id })
      .from(devices)
      .where(eq(devices.id, input.deviceId))
      .limit(1);

    if (device.length === 0) {
      throw new ValidationError(`Device with id '${input.deviceId}' not found`);
    }

    // Check if device had tags before (for setup status tracking)
    const existingTagCount = await db
      .select({ count: count() })
      .from(tags)
      .where(eq(tags.deviceId, input.deviceId));
    const hadTagsBefore = (existingTagCount[0]?.count ?? 0) > 0;

    // Insert all tags — rely on DB unique constraint to catch duplicates
    const newTags: NewTag[] = input.tags.map((t) => ({
      deviceId: input.deviceId,
      name: t.name,
      description: t.description,
      enabled: t.enabled,
      address: t.address,
      dataType: t.dataType,
      scaleFactor: t.scaleFactor,
      scaleOffset: t.scaleOffset,
      clampMin: t.clampMin,
      clampMax: t.clampMax,
      engineeringUnits: t.engineeringUnits,
      deadbandType: t.deadbandType,
      deadbandValue: t.deadbandValue,
      accessMode: t.accessMode,
      priority: t.priority,
      byteOrder: t.byteOrder,
      registerType: t.registerType,
      registerCount: t.registerCount,
      opcNodeId: t.opcNodeId,
      opcNamespaceUri: t.opcNamespaceUri,
      s7Address: t.s7Address,
      topicSuffix: t.topicSuffix,
      metadata: t.metadata ?? {},
    }));

    let result: Tag[];
    try {
      result = await db.insert(tags).values(newTags).returning();
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('One or more tag names already exist for this device');
      }
      throw error;
    }

    // Increment parent device config version
    await deviceService.incrementConfigVersion(input.deviceId);

    // Update setup status if this is the first batch of tags
    if (!hadTagsBefore) {
      await deviceService.updateSetupStatus(input.deviceId, 'configured');
    }

    // Notify about each created tag (best-effort)
    for (const tag of result) {
      mqttService.notifyTagChange('create', tag).catch((err) => {
        logger.error({ err, tagId: tag.id }, 'Failed to send MQTT tag create notification');
      });
    }

    return { created: result.length, tags: result };
  }

  /**
   * Update an existing tag
   */
  async update(id: string, input: UpdateTagInput): Promise<Tag> {
    const existingTag = await this.getById(id);

    let tag: Tag;
    try {
      const result = await db
        .update(tags)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(tags.id, id))
        .returning();

      tag = result[0];
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(`Tag with name '${input.name}' already exists for this device`);
      }
      throw error;
    }

    // Increment parent device config version
    await deviceService.incrementConfigVersion(existingTag.deviceId);

    // Notify protocol gateways (best-effort)
    mqttService.notifyTagChange('update', tag).catch((err) => {
      logger.error({ err, tagId: tag.id }, 'Failed to send MQTT tag update notification');
    });

    return tag;
  }

  /**
   * Delete a tag
   */
  async delete(id: string): Promise<void> {
    const tag = await this.getById(id);

    await db.delete(tags).where(eq(tags.id, id));

    // Increment parent device config version
    await deviceService.incrementConfigVersion(tag.deviceId);

    // Notify protocol gateways (best-effort)
    mqttService.notifyTagChange('delete', tag).catch((err) => {
      logger.error({ err, tagId: tag.id }, 'Failed to send MQTT tag delete notification');
    });
  }

  /**
   * Toggle tag enabled state
   */
  async toggleEnabled(id: string): Promise<Tag> {
    const tag = await this.getById(id);
    return this.update(id, { enabled: !tag.enabled });
  }
}

// Singleton instance
export const tagService = new TagService();
