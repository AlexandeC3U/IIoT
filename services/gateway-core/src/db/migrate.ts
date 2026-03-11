import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { logger } from '../lib/logger.js';
import { db, pool } from './index.js';

/**
 * Run database migrations on startup
 * This ensures the schema is always up-to-date
 */
export async function runMigrations(): Promise<void> {
  logger.info('Checking database connection...');

  // Wait for database to be ready (with retries)
  let retries = 5;
  while (retries > 0) {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      logger.info('Database connection successful');
      break;
    } catch (error) {
      retries--;
      if (retries === 0) {
        throw new Error(`Database connection failed after 5 attempts: ${error}`);
      }
      logger.warn({ retriesLeft: retries }, 'Database not ready, retrying in 2s...');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  // Check if migrations directory exists, if so run Drizzle migrations
  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    logger.info('Drizzle migrations completed');
  } catch (error) {
    // If no migrations folder, run inline schema creation
    logger.info('No migrations folder found, running inline schema setup...');
    await setupSchema();
  }
}

/**
 * Inline schema setup (fallback if no migrations folder)
 * Creates tables if they don't exist
 */
async function setupSchema(): Promise<void> {
  logger.info('Setting up database schema...');

  // Create enums if they don't exist
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE protocol AS ENUM ('modbus', 'opcua', 's7', 'mqtt', 'bacnet', 'ethernetip');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE device_status AS ENUM ('online', 'offline', 'error', 'unknown', 'connecting');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE setup_status AS ENUM ('created', 'connected', 'configured', 'active');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE tag_data_type AS ENUM (
        'bool', 'int16', 'int32', 'int64',
        'uint16', 'uint32', 'uint64',
        'float32', 'float64', 'string'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create devices table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS devices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      protocol protocol NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      host VARCHAR(255) NOT NULL,
      port INTEGER NOT NULL,
      protocol_config JSONB DEFAULT '{}'::jsonb,
      uns_prefix VARCHAR(512),
      poll_interval_ms INTEGER NOT NULL DEFAULT 1000,
      config_version INTEGER NOT NULL DEFAULT 1,
      status device_status NOT NULL DEFAULT 'unknown',
      last_seen TIMESTAMPTZ,
      last_error TEXT,
      setup_status setup_status NOT NULL DEFAULT 'created',
      location VARCHAR(255),
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Create tags table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tags (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      enabled BOOLEAN NOT NULL DEFAULT true,
      address VARCHAR(512) NOT NULL,
      data_type tag_data_type NOT NULL,
      scale_factor DOUBLE PRECISION,
      scale_offset DOUBLE PRECISION,
      clamp_min DOUBLE PRECISION,
      clamp_max DOUBLE PRECISION,
      engineering_units VARCHAR(50),
      deadband_type VARCHAR(20) DEFAULT 'none',
      deadband_value DOUBLE PRECISION,
      access_mode VARCHAR(20) DEFAULT 'read',
      priority SMALLINT DEFAULT 0,
      byte_order VARCHAR(20),
      register_type VARCHAR(30),
      register_count SMALLINT,
      opc_node_id VARCHAR(512),
      opc_namespace_uri VARCHAR(512),
      s7_address VARCHAR(255),
      topic_suffix VARCHAR(512),
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Create audit_log table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_sub VARCHAR(255),
      username VARCHAR(255),
      action VARCHAR(50) NOT NULL,
      resource_type VARCHAR(50),
      resource_id UUID,
      details JSONB,
      ip_address VARCHAR(45),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Create indexes
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS devices_name_idx ON devices(name);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS devices_protocol_idx ON devices(protocol);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS devices_status_idx ON devices(status);
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS tags_device_tag_idx ON tags(device_id, name);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS tags_device_idx ON tags(device_id);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS audit_log_user_idx ON audit_log(user_sub);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS audit_log_resource_idx ON audit_log(resource_type, resource_id);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log(created_at DESC);
  `);

  logger.info('Database schema setup complete');
}
