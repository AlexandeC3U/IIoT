import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env.js';
import * as schema from './schema.js';

const { Pool } = pg;

// Create connection pool
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_SIZE,
  statement_timeout: 30_000,   // 30s — kill runaway queries
  idle_in_transaction_session_timeout: 60_000, // 60s — release stuck transactions
});

// Create drizzle instance with schema
export const db = drizzle(pool, { schema });

// Export pool for health checks
export { pool };

// Graceful shutdown
export async function closeDatabase(): Promise<void> {
  await pool.end();
}

