// API Client for Gateway Core V2

const API_BASE = '/api';

// ============================================================================
// Types
// ============================================================================

export type Protocol = 'modbus' | 'opcua' | 's7' | 'mqtt' | 'bacnet' | 'ethernetip';
export type DeviceStatus = 'online' | 'offline' | 'error' | 'unknown';
export type SetupStatus = 'created' | 'connected' | 'configured' | 'active';

// ============================================================================
// Protocol-Specific Config Types
// ============================================================================

export interface ModbusDeviceConfig {
  slaveId: number;
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
}

export interface OpcuaDeviceConfig {
  securityPolicy?: 'None' | 'Basic128Rsa15' | 'Basic256' | 'Basic256Sha256';
  securityMode?: 'None' | 'Sign' | 'SignAndEncrypt';
  authMode?: 'anonymous' | 'username' | 'certificate';
  username?: string;
  password?: string;
  endpointUrl?: string;
  useSubscriptions?: boolean;
  publishInterval?: number;
  samplingInterval?: number;
}

export interface S7DeviceConfig {
  rack: number;
  slot: number;
  pduSize?: number;
  timeout?: number;
}

export interface MqttDeviceConfig {
  brokerUrl?: string;
  clientId?: string;
  username?: string;
  password?: string;
  topicFilter?: string;
  qos?: 0 | 1 | 2;
}

export interface BacnetDeviceConfig {
  deviceInstance?: number;
}

export interface EthernetipDeviceConfig {
  slot?: number;
}

export type ProtocolConfig =
  | ModbusDeviceConfig
  | OpcuaDeviceConfig
  | S7DeviceConfig
  | MqttDeviceConfig
  | BacnetDeviceConfig
  | EthernetipDeviceConfig
  | Record<string, unknown>;

// Tag data types shared by all protocols
export const DATA_TYPES = [
  'bool',
  'int16',
  'uint16',
  'int32',
  'uint32',
  'int64',
  'uint64',
  'float32',
  'float64',
  'string',
] as const;
export type DataType = (typeof DATA_TYPES)[number];

// Modbus-specific tag fields
export const MODBUS_REGISTER_TYPES = ['holding', 'input', 'coil', 'discrete'] as const;
export type ModbusRegisterType = (typeof MODBUS_REGISTER_TYPES)[number];
export const BYTE_ORDERS = ['big_endian', 'little_endian'] as const;
export type ByteOrder = (typeof BYTE_ORDERS)[number];

export interface Device {
  id: string;
  name: string;
  description: string | null;
  protocol: Protocol;
  enabled: boolean;
  host: string;
  port: number;
  protocolConfig: Record<string, unknown>;
  pollIntervalMs: number;
  status: DeviceStatus;
  setupStatus: SetupStatus;
  lastSeen: string | null;
  lastError: string | null;
  location: string | null;
  unsPrefix: string | null;
  configVersion: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  tags?: Tag[];
}

export interface Tag {
  id: string;
  deviceId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  address: string;
  dataType: string;
  accessMode: 'read' | 'write' | 'readwrite';
  scaleFactor: number | null;
  scaleOffset: number | null;
  clampMin: number | null;
  clampMax: number | null;
  engineeringUnits: string | null;
  deadbandAbsolute: number | null;
  deadbandPercent: number | null;
  deadbandType: 'none' | 'absolute' | 'percent';
  topicSuffix: string | null;
  priority: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface DeviceQuery {
  protocol?: Protocol;
  status?: DeviceStatus;
  enabled?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CreateDeviceInput {
  name: string;
  description?: string;
  protocol: Protocol;
  enabled?: boolean;
  host: string;
  port: number;
  protocolConfig?: Record<string, unknown>;
  pollIntervalMs?: number;
  location?: string;
  unsPrefix?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateDeviceInput {
  name?: string;
  description?: string;
  enabled?: boolean;
  host?: string;
  port?: number;
  protocolConfig?: Record<string, unknown>;
  pollIntervalMs?: number;
  location?: string;
  unsPrefix?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateTagInput {
  deviceId: string;
  name: string;
  description?: string;
  enabled?: boolean;
  address: string;
  dataType: string;
  accessMode?: 'read' | 'write' | 'readwrite';
  scaleFactor?: number;
  scaleOffset?: number;
  clampMin?: number;
  clampMax?: number;
  engineeringUnits?: string;
  deadbandAbsolute?: number;
  deadbandPercent?: number;
  deadbandType?: 'none' | 'absolute' | 'percent';
  topicSuffix?: string;
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateTagInput {
  name?: string;
  description?: string;
  enabled?: boolean;
  address?: string;
  dataType?: string;
  accessMode?: 'read' | 'write' | 'readwrite';
  scaleFactor?: number;
  scaleOffset?: number;
  clampMin?: number;
  clampMax?: number;
  engineeringUnits?: string;
  deadbandAbsolute?: number;
  deadbandPercent?: number;
  deadbandType?: 'none' | 'absolute' | 'percent';
  topicSuffix?: string;
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface HealthReadyResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    database: { status: string; latencyMs?: number };
    mqtt: { status: string; connected: boolean };
  };
}

export interface SystemHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    'gateway-core': { status: string; uptime?: number };
    'protocol-gateway': { status: string; uptime?: number; error?: string };
    'data-ingestion': { status: string; uptime?: number; error?: string };
    database: { status: string; latencyMs?: number };
    mqtt: { status: string; connected: boolean };
  };
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  latencyMs?: number;
}

export interface BrowseResult {
  nodeId: string;
  name: string;
  dataType?: string;
  children?: BrowseResult[];
}

// ============================================================================
// HTTP Client
// ============================================================================

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new ApiError(
      response.status,
      error.error?.code || 'UNKNOWN',
      error.error?.message || 'Request failed'
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// ============================================================================
// Device API
// ============================================================================

export const deviceApi = {
  list: (query: DeviceQuery = {}): Promise<PaginatedResponse<Device>> => {
    const params = new URLSearchParams();
    if (query.protocol) params.set('protocol', query.protocol);
    if (query.status) params.set('status', query.status);
    if (query.enabled !== undefined) params.set('enabled', String(query.enabled));
    if (query.search) params.set('search', query.search);
    if (query.limit) params.set('limit', String(query.limit));
    if (query.offset) params.set('offset', String(query.offset));

    const qs = params.toString();
    return request(`/devices${qs ? `?${qs}` : ''}`);
  },

  get: (id: string, includeTags = false): Promise<Device> => {
    return request(`/devices/${id}${includeTags ? '?includeTags=true' : ''}`);
  },

  create: (input: CreateDeviceInput): Promise<Device> => {
    return request('/devices', { method: 'POST', body: JSON.stringify(input) });
  },

  update: (id: string, input: UpdateDeviceInput): Promise<Device> => {
    return request(`/devices/${id}`, { method: 'PUT', body: JSON.stringify(input) });
  },

  delete: (id: string): Promise<void> => {
    return request(`/devices/${id}`, { method: 'DELETE' });
  },

  toggle: (id: string): Promise<Device> => {
    return request(`/devices/${id}/toggle`, { method: 'POST' });
  },

  testConnection: (id: string): Promise<TestConnectionResult> => {
    return request(`/devices/${id}/test`, { method: 'POST' });
  },

  browse: (id: string): Promise<BrowseResult[]> => {
    return request(`/devices/${id}/browse`);
  },
};

// ============================================================================
// Tag API
// ============================================================================

export const tagApi = {
  list: (
    query: { deviceId?: string; search?: string; limit?: number; offset?: number } = {}
  ): Promise<PaginatedResponse<Tag>> => {
    const params = new URLSearchParams();
    if (query.deviceId) params.set('deviceId', query.deviceId);
    if (query.search) params.set('search', query.search);
    if (query.limit) params.set('limit', String(query.limit));
    if (query.offset) params.set('offset', String(query.offset));

    const qs = params.toString();
    return request(`/tags${qs ? `?${qs}` : ''}`);
  },

  get: (id: string): Promise<Tag> => {
    return request(`/tags/${id}`);
  },

  create: (input: CreateTagInput): Promise<Tag> => {
    return request('/tags', { method: 'POST', body: JSON.stringify(input) });
  },

  bulkCreate: (input: CreateTagInput[]): Promise<Tag[]> => {
    return request('/tags/bulk', { method: 'POST', body: JSON.stringify({ tags: input }) });
  },

  update: (id: string, input: UpdateTagInput): Promise<Tag> => {
    return request(`/tags/${id}`, { method: 'PUT', body: JSON.stringify(input) });
  },

  delete: (id: string): Promise<void> => {
    return request(`/tags/${id}`, { method: 'DELETE' });
  },

  toggle: (id: string): Promise<Tag> => {
    return request(`/tags/${id}/toggle`, { method: 'POST' });
  },
};

// ============================================================================
// Historian API
// ============================================================================

export interface HistoryPoint {
  time: string;
  value: number | null;
  value_str: string | null;
  quality: number;
}

export interface HistoryStats {
  count: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  latest: number | null;
  latest_str: string | null;
}

export interface HistoryResponse {
  topic: string;
  stats: HistoryStats;
  points: HistoryPoint[];
}

export const historianApi = {
  query: (
    topic: string,
    opts: { from?: string; to?: string; limit?: number } = {}
  ): Promise<HistoryResponse> => {
    const params = new URLSearchParams();
    params.set('topic', topic);
    if (opts.from) params.set('from', opts.from);
    if (opts.to) params.set('to', opts.to);
    if (opts.limit) params.set('limit', String(opts.limit));
    return request(`/historian/history?${params.toString()}`);
  },
};

// ============================================================================
// Health API (no /api prefix)
// ============================================================================

export const healthApi = {
  check: (): Promise<{ status: string; timestamp: string }> => {
    return fetch('/health').then((r) => r.json());
  },

  ready: (): Promise<HealthReadyResponse> => {
    return fetch('/health/ready').then((r) => {
      if (!r.ok) throw new Error('Health check failed');
      return r.json();
    });
  },
};

// ============================================================================
// System API
// ============================================================================

export const systemApi = {
  health: (): Promise<SystemHealthResponse> => {
    return request('/system/health');
  },

  info: (): Promise<Record<string, unknown>> => {
    return request('/system/info');
  },
};
