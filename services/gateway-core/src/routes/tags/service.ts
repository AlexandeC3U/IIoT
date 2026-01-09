import { and, count, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { devices, tags, type NewTag, type Tag } from '../../db/schema.js';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { mqttService } from '../../mqtt/client.js';
import type { BulkCreateTagsInput, CreateTagInput, TagQuery, UpdateTagInput } from './schema.js';

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
          ilike(tags.name, `%${query.search}%`),
          ilike(tags.description, `%${query.search}%`),
          ilike(tags.address, `%${query.search}%`)
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
    // Verify device exists
    const device = await db
      .select({ id: devices.id })
      .from(devices)
      .where(eq(devices.id, input.deviceId))
      .limit(1);

    if (device.length === 0) {
      throw new ValidationError(`Device with id '${input.deviceId}' not found`);
    }

    // Check for duplicate tag name within device
    const existing = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.deviceId, input.deviceId), eq(tags.name, input.name)))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictError(
        `Tag with name '${input.name}' already exists for device '${input.deviceId}'`
      );
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
      deadbandAbsolute: input.deadbandAbsolute,
      deadbandPercent: input.deadbandPercent,
      customTopic: input.customTopic,
      metadata: input.metadata ?? {},
    };

    const result = await db.insert(tags).values(newTag).returning();
    const tag = result[0];

    // Notify protocol gateways about new tag
    await mqttService.notifyTagChange('create', tag);

    return tag;
  }

  /**
   * Bulk create tags for a device
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

    // Check for duplicates
    const tagNames = input.tags.map((t) => t.name);
    const existing = await db
      .select({ name: tags.name })
      .from(tags)
      .where(and(eq(tags.deviceId, input.deviceId), sql`${tags.name} = ANY(${tagNames})`));

    if (existing.length > 0) {
      const existingNames = existing.map((e) => e.name).join(', ');
      throw new ConflictError(`Tags already exist: ${existingNames}`);
    }

    // Insert all tags
    const newTags: NewTag[] = input.tags.map((t) => ({
      deviceId: input.deviceId,
      name: t.name,
      description: t.description,
      enabled: t.enabled,
      address: t.address,
      dataType: t.dataType,
      scaleFactor: t.scaleFactor,
      scaleOffset: t.scaleOffset,
      engineeringUnits: t.engineeringUnits,
      metadata: t.metadata ?? {},
    }));

    const result = await db.insert(tags).values(newTags).returning();

    // Notify about each created tag
    for (const tag of result) {
      await mqttService.notifyTagChange('create', tag);
    }

    return { created: result.length, tags: result };
  }

  /**
   * Update an existing tag
   */
  async update(id: string, input: UpdateTagInput): Promise<Tag> {
    const existingTag = await this.getById(id);

    // Check for duplicate name if name is being changed
    if (input.name && input.name !== existingTag.name) {
      const duplicate = await db
        .select({ id: tags.id })
        .from(tags)
        .where(
          and(eq(tags.deviceId, existingTag.deviceId), eq(tags.name, input.name), sql`${tags.id} != ${id}`)
        )
        .limit(1);

      if (duplicate.length > 0) {
        throw new ConflictError(`Tag with name '${input.name}' already exists for this device`);
      }
    }

    const result = await db
      .update(tags)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(tags.id, id))
      .returning();

    const tag = result[0];

    // Notify protocol gateways about tag update
    await mqttService.notifyTagChange('update', tag);

    return tag;
  }

  /**
   * Delete a tag
   */
  async delete(id: string): Promise<void> {
    const tag = await this.getById(id);

    await db.delete(tags).where(eq(tags.id, id));

    // Notify protocol gateways about tag deletion
    await mqttService.notifyTagChange('delete', tag);
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

