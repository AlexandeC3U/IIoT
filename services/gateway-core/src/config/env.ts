import { config } from 'dotenv';
import { z } from 'zod';

// Load .env file
config();

// z.coerce.boolean() treats any non-empty string as true (incl. "false").
// This helper correctly parses env var strings like "false", "0", "no" as false.
const booleanEnv = z
  .union([z.boolean(), z.string()])
  .transform((val) => {
    if (typeof val === 'boolean') return val;
    return !['false', '0', 'no', ''].includes(val.toLowerCase());
  })
  .default(false);

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Database
  DATABASE_URL: z
    .string()
    .default('postgresql://nexus:nexus_config_secret@localhost:5433/nexus_config'),
  DATABASE_POOL_SIZE: z.coerce.number().default(10),

  // MQTT
  MQTT_BROKER_URL: z.string().default('mqtt://localhost:1883'),
  MQTT_CLIENT_ID: z.string().default('gateway-core'),
  MQTT_USERNAME: z.string().optional(),
  MQTT_PASSWORD: z.string().optional(),

  // Protocol-gateway proxy
  PROTOCOL_GATEWAY_URL: z.string().default('http://localhost:8080'),

  // Data-ingestion (for aggregated health checks)
  DATA_INGESTION_URL: z.string().default('http://localhost:8081'),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Auth (Authentik OIDC)
  AUTH_ENABLED: booleanEnv,
  OIDC_ISSUER_URL: z.string().optional(),
  OIDC_JWKS_URL: z.string().optional(), // Override JWKS endpoint (auto-discovered if not set)
  OIDC_AUDIENCE: z.string().optional(),

  // Audit logging (independent of auth — can audit anonymous actions too)
  AUDIT_ENABLED: booleanEnv,

  // WebSocket bridge
  WS_MAX_SUBSCRIPTIONS_PER_CLIENT: z.coerce.number().default(100),

  // Rate limiting
  RATE_LIMIT_ENABLED: booleanEnv,
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Invalid environment variables:');
    console.error(JSON.stringify(parsed.error.format(), null, 2));
    process.exit(1);
  }

  return parsed.data;
}

export const env = validateEnv();
