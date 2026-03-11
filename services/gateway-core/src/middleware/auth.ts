import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { env } from '../config/env.js';
import { UnauthorizedError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

// ============================================================================
// Types
// ============================================================================

export const ROLES = ['admin', 'engineer', 'operator', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export interface AuthUser {
  /** Authentik subject ID */
  sub: string;
  /** Username from preferred_username claim */
  username: string;
  /** Highest role from token claims */
  role: Role;
}

// Extend Fastify request with user
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

// ============================================================================
// JWKS Setup
// ============================================================================

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/**
 * Build JWKS URL from the OIDC issuer.
 *
 * Uses standard OIDC discovery: {issuer}/.well-known/openid-configuration
 * contains the `jwks_uri`. However, jose's createRemoteJWKSet accepts
 * the JWKS endpoint directly, so we derive it:
 *
 * - Authentik: {issuer}/jwks/
 * - Keycloak:  {issuer}/protocol/openid-connect/certs
 * - Standard:  {issuer}/.well-known/jwks.json
 *
 * To support all providers, we allow explicit override via OIDC_JWKS_URL.
 * If not set, we fetch the discovery document once to get jwks_uri.
 */
async function resolveJWKSUrl(): Promise<URL> {
  if (env.OIDC_JWKS_URL) {
    return new URL(env.OIDC_JWKS_URL);
  }

  // Fetch OIDC discovery document to find jwks_uri
  const issuer = env.OIDC_ISSUER_URL!.replace(/\/$/, '');
  const discoveryUrl = `${issuer}/.well-known/openid-configuration`;

  try {
    const response = await fetch(discoveryUrl, {
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const config = (await response.json()) as { jwks_uri?: string };
      if (config.jwks_uri) {
        logger.info({ jwks_uri: config.jwks_uri }, 'Resolved JWKS URL from OIDC discovery');
        return new URL(config.jwks_uri);
      }
    }
  } catch (error) {
    logger.warn({ error, discoveryUrl }, 'OIDC discovery failed, falling back to standard path');
  }

  // Fallback: standard OIDC path
  return new URL(`${issuer}/jwks`);
}

function getJWKS(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    throw new Error('JWKS not initialized — call initJWKS() first');
  }
  return jwks;
}

async function initJWKS(): Promise<void> {
  const jwksUrl = await resolveJWKSUrl();
  // jose handles caching and key rotation automatically
  jwks = createRemoteJWKSet(jwksUrl);
  logger.info({ jwksUrl: jwksUrl.toString() }, 'JWKS initialized');
}

// ============================================================================
// Role Extraction
// ============================================================================

/**
 * Extract the highest-priority role from Authentik token claims.
 *
 * Authentik can put roles in several places depending on configuration:
 * - `realm_access.roles` (Keycloak-compatible mapper)
 * - `groups` (Authentik default — groups as roles)
 * - `resource_access.<client>.roles`
 *
 * We check all locations and pick the highest-privilege match.
 */
function extractRole(claims: Record<string, unknown>): Role {
  const candidates: string[] = [];

  // Authentik groups claim (most common)
  if (Array.isArray(claims.groups)) {
    candidates.push(...claims.groups);
  }

  // Keycloak-compatible realm_access.roles
  const realmAccess = claims.realm_access as { roles?: string[] } | undefined;
  if (realmAccess?.roles) {
    candidates.push(...realmAccess.roles);
  }

  // resource_access.<client>.roles
  const resourceAccess = claims.resource_access as Record<string, { roles?: string[] }> | undefined;
  if (resourceAccess) {
    for (const client of Object.values(resourceAccess)) {
      if (client.roles) {
        candidates.push(...client.roles);
      }
    }
  }

  // Normalize: lowercase, trim, check against known roles
  const normalized = candidates.map((r) => String(r).toLowerCase().trim());

  // Return highest-privilege match (admin > engineer > operator > viewer)
  for (const role of ROLES) {
    if (normalized.includes(role)) {
      return role;
    }
  }

  // Default to viewer if no recognized role found
  return 'viewer';
}

// ============================================================================
// Auth Hook
// ============================================================================

/** Paths that skip authentication */
const PUBLIC_PATHS = ['/health', '/docs', '/'];

function isPublicPath(url: string): boolean {
  // Strip query string before matching
  const path = url.split('?')[0];
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

async function authHook(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  // Skip auth for public paths
  if (isPublicPath(request.url)) {
    return;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header');
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: env.OIDC_ISSUER_URL,
      audience: env.OIDC_AUDIENCE || undefined,
    });

    request.user = {
      sub: payload.sub ?? 'unknown',
      username: (payload.preferred_username as string) ?? (payload.email as string) ?? 'unknown',
      role: extractRole(payload as Record<string, unknown>),
    };
  } catch (error) {
    logger.debug({ error }, 'JWT verification failed');

    if (error instanceof UnauthorizedError) throw error;

    const message =
      error instanceof Error && error.message.includes('expired')
        ? 'Token expired'
        : 'Invalid token';

    throw new UnauthorizedError(message);
  }
}

// ============================================================================
// Plugin Registration
// ============================================================================

export async function registerAuth(app: FastifyInstance): Promise<void> {
  if (!env.AUTH_ENABLED) {
    logger.info('Authentication disabled (AUTH_ENABLED=false)');
    return;
  }

  if (!env.OIDC_ISSUER_URL) {
    logger.error('AUTH_ENABLED=true but OIDC_ISSUER_URL is not set');
    throw new Error('OIDC_ISSUER_URL is required when AUTH_ENABLED=true');
  }

  logger.info({ issuer: env.OIDC_ISSUER_URL }, 'Authentication enabled');

  await initJWKS();

  app.addHook('onRequest', authHook);
}
