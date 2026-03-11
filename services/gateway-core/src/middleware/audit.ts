import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { env } from '../config/env.js';
import { db } from '../db/index.js';
import { auditLog } from '../db/schema.js';
import { logger } from '../lib/logger.js';

// ============================================================================
// Route → Action Mapping
// ============================================================================

/**
 * Derive audit action from HTTP method + route URL.
 * Returns null for non-mutation routes (GET, OPTIONS, HEAD) to skip logging.
 */
function deriveAction(method: string, url: string): { action: string; resourceType: string } | null {
  // Only audit mutations
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    return null;
  }

  // Parse resource type from URL: /api/devices/:id -> 'device'
  const segments = url.replace(/^\/api\//, '').split('/').filter(Boolean);
  if (segments.length === 0) return null;

  const resource = segments[0];

  // Map resource plural to singular
  const resourceMap: Record<string, string> = {
    devices: 'device',
    tags: 'tag',
    opcua: 'certificate',
    system: 'system',
  };

  const resourceType = resourceMap[resource] ?? resource;

  // Determine sub-action from method + trailing segment
  const lastSegment = segments[segments.length - 1];
  let verb: string;

  if (method === 'DELETE') {
    verb = 'delete';
  } else if (method === 'PUT' || method === 'PATCH') {
    verb = 'update';
  } else if (lastSegment === 'toggle') {
    verb = 'toggle';
  } else if (lastSegment === 'test') {
    verb = 'test';
  } else if (lastSegment === 'browse') {
    verb = 'browse';
  } else if (lastSegment === 'trust') {
    verb = 'trust';
  } else if (lastSegment === 'bulk') {
    verb = 'bulk_create';
  } else {
    verb = 'create';
  }

  return { action: `${resourceType}.${verb}`, resourceType };
}

/**
 * Extract resource ID from the URL path.
 * Looks for UUID-shaped segments.
 */
function extractResourceId(url: string): string | undefined {
  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const match = url.match(uuidPattern);
  return match?.[0];
}

// ============================================================================
// Audit Hook
// ============================================================================

async function auditHook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const actionInfo = deriveAction(request.method, request.url);
  if (!actionInfo) return;

  // Only log successful mutations (2xx status)
  const status = reply.statusCode;
  if (status < 200 || status >= 300) return;

  const resourceId = extractResourceId(request.url);

  try {
    await db.insert(auditLog).values({
      userSub: request.user?.sub ?? null,
      username: request.user?.username ?? 'anonymous',
      action: actionInfo.action,
      resourceType: actionInfo.resourceType,
      resourceId: resourceId ?? null,
      details: {
        method: request.method,
        url: request.url,
        statusCode: status,
      },
      ipAddress: request.ip,
    });
  } catch (error) {
    // Audit logging should never break the request
    logger.error({ error, action: actionInfo.action }, 'Failed to write audit log');
  }
}

// ============================================================================
// Plugin Registration
// ============================================================================

export async function registerAudit(app: FastifyInstance): Promise<void> {
  if (!env.AUDIT_ENABLED) {
    logger.info('Audit logging disabled (AUDIT_ENABLED=false)');
    return;
  }

  logger.info('Audit logging enabled');
  app.addHook('onResponse', auditHook);
}
