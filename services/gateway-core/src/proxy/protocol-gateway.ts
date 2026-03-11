import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const PG_BASE_URL = () => env.PROTOCOL_GATEWAY_URL;
const DEFAULT_TIMEOUT = 30_000;

interface ProxyOptions {
  timeout?: number;
  requestId?: string;
  /** Skip circuit breaker check (used by health probes) */
  skipCircuitBreaker?: boolean;
}

// ============================================================================
// Circuit Breaker
// ============================================================================

/**
 * Simple circuit breaker to avoid hammering a failed protocol-gateway.
 *
 * States:
 * - CLOSED:    normal operation, requests pass through
 * - OPEN:      failures exceeded threshold, requests fail immediately
 * - HALF_OPEN: cooldown expired, next request is a probe
 *
 * Transitions:
 * - CLOSED → OPEN:      after `FAILURE_THRESHOLD` consecutive failures
 * - OPEN → HALF_OPEN:   after `COOLDOWN_MS` has passed
 * - HALF_OPEN → CLOSED: on successful probe
 * - HALF_OPEN → OPEN:   on failed probe (resets cooldown)
 */
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

const FAILURE_THRESHOLD = 5;
const COOLDOWN_MS = 30_000; // 30 seconds

let circuitState: CircuitState = 'CLOSED';
let consecutiveFailures = 0;
let lastFailureTime = 0;

function checkCircuitBreaker(): void {
  if (circuitState === 'CLOSED') return;

  if (circuitState === 'OPEN') {
    if (Date.now() - lastFailureTime >= COOLDOWN_MS) {
      circuitState = 'HALF_OPEN';
      logger.info('Circuit breaker: OPEN → HALF_OPEN (cooldown expired, allowing probe)');
      return; // Allow the probe request
    }
    throw new AppError(
      'Protocol gateway circuit breaker is open — service temporarily unavailable',
      503,
      'CIRCUIT_BREAKER_OPEN'
    );
  }

  // HALF_OPEN: allow the request (it's the probe)
}

function recordSuccess(): void {
  if (circuitState === 'HALF_OPEN') {
    logger.info('Circuit breaker: HALF_OPEN → CLOSED (probe succeeded)');
  }
  circuitState = 'CLOSED';
  consecutiveFailures = 0;
}

function recordFailure(): void {
  consecutiveFailures++;
  lastFailureTime = Date.now();

  if (circuitState === 'HALF_OPEN') {
    circuitState = 'OPEN';
    logger.warn('Circuit breaker: HALF_OPEN → OPEN (probe failed)');
    return;
  }

  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    circuitState = 'OPEN';
    logger.warn(
      { consecutiveFailures, cooldownMs: COOLDOWN_MS },
      'Circuit breaker: CLOSED → OPEN (failure threshold reached)'
    );
  }
}

/** Exposed for health check reporting */
export function getCircuitBreakerState(): { state: CircuitState; failures: number } {
  // Check if open circuit should transition to half-open
  if (circuitState === 'OPEN' && Date.now() - lastFailureTime >= COOLDOWN_MS) {
    return { state: 'HALF_OPEN', failures: consecutiveFailures };
  }
  return { state: circuitState, failures: consecutiveFailures };
}

// ============================================================================
// HTTP Proxy Client
// ============================================================================

/**
 * HTTP proxy client for protocol-gateway.
 * All runtime operations (test-connection, browse, status, certs, topics, logs)
 * are forwarded to protocol-gateway via this client.
 *
 * Includes circuit breaker protection: after 5 consecutive failures,
 * requests fail immediately with 503 for 30 seconds before retrying.
 */

export async function proxyGet(
  path: string,
  query?: Record<string, string>,
  options?: ProxyOptions
): Promise<unknown> {
  if (!options?.skipCircuitBreaker) checkCircuitBreaker();

  const url = new URL(path, PG_BASE_URL());
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options?.requestId) {
    headers['X-Request-ID'] = options.requestId;
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(options?.timeout ?? DEFAULT_TIMEOUT),
    });

    if (!response.ok) {
      const body = await response.text();
      // 4xx from upstream is not a connectivity failure — don't trip breaker
      if (response.status >= 500) recordFailure();
      else recordSuccess();
      throw new AppError(
        `Protocol gateway error: ${body}`,
        response.status >= 500 ? 502 : response.status,
        'PROXY_ERROR'
      );
    }

    recordSuccess();
    return response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    recordFailure();
    throw proxyErrorFromCause(error, path);
  }
}

export async function proxyPost(
  path: string,
  body?: unknown,
  options?: ProxyOptions
): Promise<unknown> {
  if (!options?.skipCircuitBreaker) checkCircuitBreaker();

  const url = new URL(path, PG_BASE_URL());

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options?.requestId) {
    headers['X-Request-ID'] = options.requestId;
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(options?.timeout ?? DEFAULT_TIMEOUT),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      if (response.status >= 500) recordFailure();
      else recordSuccess();
      throw new AppError(
        `Protocol gateway error: ${responseBody}`,
        response.status >= 500 ? 502 : response.status,
        'PROXY_ERROR'
      );
    }

    recordSuccess();
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return response.json();
    }
    return response.text();
  } catch (error) {
    if (error instanceof AppError) throw error;
    recordFailure();
    throw proxyErrorFromCause(error, path);
  }
}

export async function proxyDelete(
  path: string,
  query?: Record<string, string>,
  options?: ProxyOptions
): Promise<unknown> {
  if (!options?.skipCircuitBreaker) checkCircuitBreaker();

  const url = new URL(path, PG_BASE_URL());
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options?.requestId) {
    headers['X-Request-ID'] = options.requestId;
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'DELETE',
      headers,
      signal: AbortSignal.timeout(options?.timeout ?? DEFAULT_TIMEOUT),
    });

    if (!response.ok) {
      const body = await response.text();
      if (response.status >= 500) recordFailure();
      else recordSuccess();
      throw new AppError(
        `Protocol gateway error: ${body}`,
        response.status >= 500 ? 502 : response.status,
        'PROXY_ERROR'
      );
    }

    recordSuccess();
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return response.json();
    }
    return null;
  } catch (error) {
    if (error instanceof AppError) throw error;
    recordFailure();
    throw proxyErrorFromCause(error, path);
  }
}

/**
 * Classify proxy errors for better diagnostics.
 */
function proxyErrorFromCause(error: unknown, path: string): AppError {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error({ error: err, path }, 'Protocol gateway proxy request failed');

  if (err.name === 'TimeoutError' || err.message.includes('timed out') || err.message.includes('abort')) {
    return new AppError('Protocol gateway request timed out', 504, 'PROXY_TIMEOUT');
  }

  const msg = err.message.toLowerCase();
  if (msg.includes('econnrefused') || msg.includes('connect')) {
    return new AppError('Protocol gateway connection refused', 502, 'PROXY_CONNECTION_REFUSED');
  }
  if (msg.includes('enotfound') || msg.includes('getaddrinfo')) {
    return new AppError('Protocol gateway host not found', 502, 'PROXY_DNS_ERROR');
  }

  return new AppError('Protocol gateway unreachable', 502, 'PROXY_UNREACHABLE');
}

/**
 * Check if protocol-gateway is reachable (for aggregated health).
 */
export async function checkProtocolGatewayHealth(): Promise<{
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
  circuitBreaker?: string;
}> {
  const start = Date.now();
  const cb = getCircuitBreakerState();
  try {
    await proxyGet('/health/live', undefined, { timeout: 2000, skipCircuitBreaker: true });
    return { status: 'ok', latencyMs: Date.now() - start, circuitBreaker: cb.state };
  } catch {
    return {
      status: 'error',
      error: 'Protocol gateway unreachable',
      latencyMs: Date.now() - start,
      circuitBreaker: cb.state,
    };
  }
}
