// API Client for Gateway Core

const API_BASE = '/api';

export interface Device {
  id: string;
  name: string;
  description: string | null;
  protocol: 'modbus' | 'opcua' | 's7';
  enabled: boolean;
  host: string;
  port: number;
  protocolConfig: Record<string, unknown>;
  pollIntervalMs: number;
  status: 'online' | 'offline' | 'error' | 'unknown';
  lastSeen: string | null;
  lastError: string | null;
  location: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  deviceId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  address: string;
  dataType: string;
  scaleFactor: number | null;
  scaleOffset: number | null;
  clampMin: number | null;
  clampMax: number | null;
  engineeringUnits: string | null;
  deadbandAbsolute: number | null;
  deadbandPercent: number | null;
  customTopic: string | null;
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
  protocol?: 'modbus' | 'opcua' | 's7';
  status?: 'online' | 'offline' | 'error' | 'unknown';
  enabled?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CreateDeviceInput {
  name: string;
  description?: string;
  protocol: 'modbus' | 'opcua' | 's7';
  enabled?: boolean;
  host: string;
  port: number;
  protocolConfig?: Record<string, unknown>;
  pollIntervalMs?: number;
  location?: string;
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
  metadata?: Record<string, unknown>;
}

class ApiError extends Error {
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

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new ApiError(
      response.status,
      error.error?.code || 'UNKNOWN',
      error.error?.message || 'Request failed'
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// Device API
export const deviceApi = {
  list: (query: DeviceQuery = {}): Promise<PaginatedResponse<Device>> => {
    const params = new URLSearchParams();
    if (query.protocol) params.set('protocol', query.protocol);
    if (query.status) params.set('status', query.status);
    if (query.enabled !== undefined) params.set('enabled', String(query.enabled));
    if (query.search) params.set('search', query.search);
    if (query.limit) params.set('limit', String(query.limit));
    if (query.offset) params.set('offset', String(query.offset));

    const queryString = params.toString();
    return request(`/devices${queryString ? `?${queryString}` : ''}`);
  },

  get: (id: string, includeTags = false): Promise<Device & { tags?: Tag[] }> => {
    return request(`/devices/${id}${includeTags ? '?includeTags=true' : ''}`);
  },

  create: (input: CreateDeviceInput): Promise<Device> => {
    return request('/devices', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  update: (id: string, input: UpdateDeviceInput): Promise<Device> => {
    return request(`/devices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  delete: (id: string): Promise<void> => {
    return request(`/devices/${id}`, { method: 'DELETE' });
  },

  toggle: (id: string): Promise<Device> => {
    return request(`/devices/${id}/toggle`, { method: 'POST' });
  },
};

// Tag API
export const tagApi = {
  list: (deviceId?: string): Promise<PaginatedResponse<Tag>> => {
    const params = deviceId ? `?deviceId=${deviceId}` : '';
    return request(`/tags${params}`);
  },

  get: (id: string): Promise<Tag> => {
    return request(`/tags/${id}`);
  },

  create: (input: Omit<Tag, 'id' | 'createdAt' | 'updatedAt'>): Promise<Tag> => {
    return request('/tags', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  update: (id: string, input: Partial<Tag>): Promise<Tag> => {
    return request(`/tags/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  delete: (id: string): Promise<void> => {
    return request(`/tags/${id}`, { method: 'DELETE' });
  },
};

// Health API (no /api prefix - health endpoints are at root)
export const healthApi = {
  check: (): Promise<{ status: string; timestamp: string }> => {
    return fetch('/health').then((r) => r.json());
  },

  ready: (): Promise<{
    status: string;
    timestamp: string;
    uptime: number;
    checks: {
      database: { status: string; latencyMs?: number };
      mqtt: { status: string; connected: boolean };
    };
  }> => {
    return fetch('/health/ready').then((r) => {
      if (!r.ok) throw new Error('Health check failed');
      return r.json();
    });
  },
};
