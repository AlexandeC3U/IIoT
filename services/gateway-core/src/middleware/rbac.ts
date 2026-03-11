import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';

import { env } from '../config/env.js';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';
import type { Role } from './auth.js';

/**
 * Permission matrix — defines which roles can perform which actions.
 *
 * | Action                    | admin | engineer | operator | viewer |
 * |---------------------------|-------|----------|----------|--------|
 * | View devices/tags         | Y     | Y        | Y        | Y      |
 * | Create/edit devices/tags  | Y     | Y        | N        | N      |
 * | Delete devices/tags       | Y     | Y        | N        | N      |
 * | Test connection / browse  | Y     | Y        | Y        | N      |
 * | Toggle device enabled     | Y     | Y        | Y        | N      |
 * | Manage certificates       | Y     | Y        | N        | N      |
 * | View system logs          | Y     | Y        | N        | N      |
 * | View system health/info   | Y     | Y        | Y        | Y      |
 * | Restart/scale services    | Y     | N        | N        | N      |
 */

/** Role hierarchy — higher index = higher privilege */
const ROLE_LEVEL: Record<Role, number> = {
  viewer: 0,
  operator: 1,
  engineer: 2,
  admin: 3,
};

/**
 * Create a Fastify preHandler that requires the user to have one of the
 * specified roles.
 *
 * Usage in routes:
 * ```ts
 * fastify.post('/devices', {
 *   preHandler: requireRole('admin', 'engineer'),
 *   handler: async (request, reply) => { ... }
 * });
 * ```
 */
export function requireRole(...roles: Role[]): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    // Skip RBAC when auth is disabled
    if (!env.AUTH_ENABLED) return;

    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!roles.includes(request.user.role)) {
      throw new ForbiddenError(
        `Insufficient permissions. Required: ${roles.join(' or ')}. Current: ${request.user.role}`
      );
    }
  };
}

/**
 * Require at least a minimum role level.
 *
 * Usage:
 * ```ts
 * preHandler: requireMinRole('operator')  // allows operator, engineer, admin
 * ```
 */
export function requireMinRole(minRole: Role): preHandlerHookHandler {
  const minLevel = ROLE_LEVEL[minRole];

  return async (request: FastifyRequest, _reply: FastifyReply) => {
    // Skip RBAC when auth is disabled
    if (!env.AUTH_ENABLED) return;

    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const userLevel = ROLE_LEVEL[request.user.role];
    if (userLevel < minLevel) {
      throw new ForbiddenError(
        `Insufficient permissions. Minimum role required: ${minRole}. Current: ${request.user.role}`
      );
    }
  };
}
