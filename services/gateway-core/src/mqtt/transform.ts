import type { Device, Tag } from '../db/schema.js';

/**
 * Protocol-gateway compatible device format.
 * Maps DB rows to JSON that protocol-gateway's domain.Device can unmarshal.
 */
export interface PGDevice {
  id: string;
  name: string;
  description: string;
  protocol: string;
  enabled: boolean;
  connection: PGConnection;
  uns_prefix: string;
  poll_interval: string;
  tags: PGTag[];
  config_version: number;
}

export interface PGConnection {
  host: string;
  port: number;
  timeout: string;
  retry_count?: number;
  retry_delay?: string;
  // Modbus
  slave_id?: number;
  // OPC UA
  security_policy?: string;
  security_mode?: string;
  auth_mode?: string;
  username?: string;
  password?: string;
  endpoint_url?: string;
  use_subscriptions?: boolean;
  // S7
  rack?: number;
  slot?: number;
  pdu_size?: number;
}

export interface PGTag {
  id: string;
  name: string;
  description: string;
  address: string;
  data_type: string;
  enabled: boolean;
  // Transformation
  scale_factor: number;
  offset: number;
  clamp_min?: number;
  clamp_max?: number;
  unit: string;
  // Deadband
  deadband_type: string;
  deadband_value: number;
  // Protocol-specific
  access_mode: string;
  priority: number;
  byte_order: string;
  register_type: string;
  register_count?: number;
  opc_node_id: string;
  opc_namespace_uri: string;
  s7_address: string;
  // Topic
  topic_suffix: string;
}

/**
 * Transform a gateway-core DB device + tags into protocol-gateway format.
 */
export function deviceToProtocolGateway(device: Device, deviceTags: Tag[]): PGDevice {
  return {
    id: device.id,
    name: device.name,
    description: device.description ?? '',
    protocol: mapProtocol(device.protocol),
    enabled: device.enabled,
    connection: buildConnection(device),
    uns_prefix: device.unsPrefix ?? '',
    poll_interval: `${device.pollIntervalMs}ms`,
    tags: deviceTags.map(tagToProtocolGateway),
    config_version: device.configVersion,
  };
}

/**
 * Transform a gateway-core DB tag into protocol-gateway format.
 */
export function tagToProtocolGateway(tag: Tag): PGTag {
  return {
    id: tag.id,
    name: tag.name,
    description: tag.description ?? '',
    address: tag.address,
    data_type: tag.dataType,
    enabled: tag.enabled,
    scale_factor: tag.scaleFactor ?? 1,
    offset: tag.scaleOffset ?? 0,
    clamp_min: tag.clampMin ?? undefined,
    clamp_max: tag.clampMax ?? undefined,
    unit: tag.engineeringUnits ?? '',
    deadband_type: tag.deadbandType ?? 'none',
    deadband_value: tag.deadbandValue ?? 0,
    access_mode: tag.accessMode ?? 'read',
    priority: tag.priority ?? 0,
    byte_order: tag.byteOrder ?? 'big_endian',
    register_type: tag.registerType ?? '',
    register_count: tag.registerCount ?? undefined,
    opc_node_id: tag.opcNodeId ?? '',
    opc_namespace_uri: tag.opcNamespaceUri ?? '',
    s7_address: tag.s7Address ?? '',
    topic_suffix: tag.topicSuffix ?? tag.name,
  };
}

/**
 * Map gateway-core protocol enum to protocol-gateway protocol string.
 * Protocol-gateway uses more specific protocol names (e.g., modbus_tcp).
 */
function mapProtocol(protocol: string): string {
  switch (protocol) {
    case 'modbus':
      return 'modbus_tcp';
    case 'opcua':
      return 'opcua';
    case 's7':
      return 's7';
    case 'mqtt':
      return 'mqtt';
    case 'bacnet':
      return 'bacnet';
    case 'ethernetip':
      return 'ethernetip';
    default:
      return protocol;
  }
}

/**
 * Build protocol-gateway connection config from device fields + protocolConfig JSONB.
 */
function buildConnection(device: Device): PGConnection {
  const config = (device.protocolConfig ?? {}) as Record<string, unknown>;

  const connection: PGConnection = {
    host: device.host,
    port: device.port,
    timeout: typeof config.timeout === 'number' ? `${config.timeout}ms` : '10s',
  };

  if (typeof config.retryCount === 'number') {
    connection.retry_count = config.retryCount;
  }
  if (typeof config.retryDelay === 'number') {
    connection.retry_delay = `${config.retryDelay}ms`;
  }

  switch (device.protocol) {
    case 'modbus':
      if (typeof config.slaveId === 'number') connection.slave_id = config.slaveId;
      break;

    case 'opcua':
      if (typeof config.securityPolicy === 'string') connection.security_policy = config.securityPolicy;
      if (typeof config.securityMode === 'string') connection.security_mode = config.securityMode;
      if (typeof config.authMode === 'string') connection.auth_mode = config.authMode;
      if (typeof config.username === 'string') connection.username = config.username;
      if (typeof config.password === 'string') connection.password = config.password;
      if (typeof config.endpointUrl === 'string') connection.endpoint_url = config.endpointUrl;
      if (typeof config.useSubscriptions === 'boolean') connection.use_subscriptions = config.useSubscriptions;
      break;

    case 's7':
      if (typeof config.rack === 'number') connection.rack = config.rack;
      if (typeof config.slot === 'number') connection.slot = config.slot;
      if (typeof config.pduSize === 'number') connection.pdu_size = config.pduSize;
      break;
  }

  return connection;
}
