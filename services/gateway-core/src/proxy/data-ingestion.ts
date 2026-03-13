import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const DI_BASE_URL = () => env.DATA_INGESTION_URL;
const DEFAULT_TIMEOUT = 15_000;

/**
 * Simple proxy for data-ingestion service.
 * Used for historian/history query endpoints.
 */
export async function proxyGetDataIngestion(
  path: string,
  query?: Record<string, string>,
): Promise<unknown> {
  const url = new URL(path, DI_BASE_URL());
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.warn({ status: response.status, body, path }, 'data-ingestion proxy error');
      return { error: body, status: response.status };
    }

    return response.json();
  } catch (error) {
    logger.error({ err: error, path }, 'data-ingestion proxy request failed');
    throw error;
  }
}
