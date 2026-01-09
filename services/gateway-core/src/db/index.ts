import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env.js';
import * as schema from './schema.js';

const { Pool } = pg;

// Create connection pool
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_SIZE,
});

// Create drizzle instance with schema
export const db = drizzle(pool, { schema });

// Export pool for health checks
export { pool };

// Graceful shutdown
export async function closeDatabase(): Promise<void> {
  await pool.end();
}

