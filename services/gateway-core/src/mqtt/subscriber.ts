import { logger } from '../lib/logger.js';
import { deviceService } from '../routes/devices/service.js';
import { mqttService } from './client.js';

// Topic pattern: $nexus/status/devices/{deviceId}
const STATUS_TOPIC = '$nexus/status/devices/+';

// Topic for config sync requests from protocol-gateway
const SYNC_REQUEST_TOPIC = '$nexus/config/sync/request';

interface DeviceStatusPayload {
  status: 'online' | 'offline' | 'error' | 'unknown' | 'connecting';
  last_seen?: string;
  last_error?: string;
  stats?: {
    total_polls: number;
    success_polls: number;
    failed_polls: number;
  };
}

/**
 * Subscribe to device status updates from protocol-gateway.
 * Updates device status in PostgreSQL so the web UI sees live status
 * without polling protocol-gateway directly.
 */
export async function startStatusSubscriber(): Promise<void> {
  mqttService.onMessage((topic, payload) => {
    if (!topic.startsWith('$nexus/status/devices/')) return;

    const deviceId = topic.split('/').pop();
    if (!deviceId) return;

    try {
      const data = JSON.parse(payload.toString()) as DeviceStatusPayload;
      handleStatusUpdate(deviceId, data).catch((error) => {
        logger.error({ error, deviceId }, 'Failed to handle device status update');
      });
    } catch (error) {
      logger.error({ error, topic }, 'Failed to parse MQTT status payload');
    }
  });

  await mqttService.subscribe(STATUS_TOPIC);
  logger.info({ topic: STATUS_TOPIC }, 'Status subscriber started');
}

/**
 * Subscribe to config sync requests from protocol-gateway.
 * When protocol-gateway starts (or reconnects), it publishes a sync request.
 * We respond with a bulk publish of all device configs so it can reconcile.
 */
export async function startConfigSyncSubscriber(): Promise<void> {
  mqttService.onMessage((topic, _payload) => {
    if (topic !== SYNC_REQUEST_TOPIC) return;

    logger.info('Received config sync request from protocol-gateway');
    handleSyncRequest().catch((error) => {
      logger.error({ error }, 'Failed to handle config sync request');
    });
  });

  await mqttService.subscribe(SYNC_REQUEST_TOPIC);
  logger.info({ topic: SYNC_REQUEST_TOPIC }, 'Config sync subscriber started');
}

async function handleSyncRequest(): Promise<void> {
  // Fetch all enabled devices with their tags
  const { data: allDevices } = await deviceService.list({ limit: 1000, offset: 0 });

  const devicesWithTags = await Promise.all(
    allDevices.map(async (device) => {
      const tags = await deviceService.getDeviceTags(device.id);
      return { device, tags };
    })
  );

  await mqttService.notifyDevicesBulk(devicesWithTags);
  logger.info({ count: devicesWithTags.length }, 'Config sync response sent');
}

async function handleStatusUpdate(deviceId: string, data: DeviceStatusPayload): Promise<void> {
  await deviceService.updateStatus(deviceId, data.status, data.last_error);

  // If device goes online, and its setupStatus is 'created', promote to 'connected'
  if (data.status === 'online') {
    try {
      const device = await deviceService.getById(deviceId);
      if (device.setupStatus === 'created') {
        await deviceService.updateSetupStatus(deviceId, 'connected');
      }
    } catch {
      // Device might not exist yet — ignore
    }
  }

  logger.debug(
    { deviceId, status: data.status },
    'Device status updated from MQTT'
  );
}
