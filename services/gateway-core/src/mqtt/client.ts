import mqtt, { IClientOptions, MqttClient } from 'mqtt';
import { env } from '../config/env.js';
import type { Device, Tag } from '../db/schema.js';
import { logger } from '../lib/logger.js';

// Topic prefix for configuration changes
const CONFIG_TOPIC_PREFIX = '$nexus/config';

export type ConfigAction = 'create' | 'update' | 'delete';

export interface ConfigNotification<T> {
  action: ConfigAction;
  timestamp: string;
  data: T;
}

class MqttService {
  private client: MqttClient | null = null;
  private connected = false;

  async connect(): Promise<void> {
    const options: IClientOptions = {
      clientId: `${env.MQTT_CLIENT_ID}-${Date.now()}`,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 30000,
    };

    if (env.MQTT_USERNAME) {
      options.username = env.MQTT_USERNAME;
      options.password = env.MQTT_PASSWORD;
    }

    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(env.MQTT_BROKER_URL, options);

      this.client.on('connect', () => {
        this.connected = true;
        logger.info({ broker: env.MQTT_BROKER_URL }, 'Connected to MQTT broker');
        resolve();
      });

      this.client.on('error', (error) => {
        logger.error({ error }, 'MQTT connection error');
        if (!this.connected) {
          reject(error);
        }
      });

      this.client.on('reconnect', () => {
        logger.debug('Reconnecting to MQTT broker...');
      });

      this.client.on('close', () => {
        this.connected = false;
        logger.warn('MQTT connection closed');
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      return new Promise((resolve) => {
        this.client!.end(false, {}, () => {
          this.connected = false;
          logger.info('Disconnected from MQTT broker');
          resolve();
        });
      });
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  // =========================================================================
  // Device Configuration Notifications
  // =========================================================================

  /**
   * Notify protocol gateways about device configuration changes
   * Topic: $nexus/config/devices/{deviceId}
   */
  async notifyDeviceChange(action: ConfigAction, device: Device): Promise<void> {
    const topic = `${CONFIG_TOPIC_PREFIX}/devices/${device.id}`;
    const payload: ConfigNotification<Device> = {
      action,
      timestamp: new Date().toISOString(),
      data: device,
    };

    await this.publish(topic, payload);
    logger.info({ action, deviceId: device.id, deviceName: device.name }, 'Device config notification sent');
  }

  /**
   * Notify about bulk device changes (e.g., initial load)
   * Topic: $nexus/config/devices/bulk
   */
  async notifyDevicesBulk(devices: Device[]): Promise<void> {
    const topic = `${CONFIG_TOPIC_PREFIX}/devices/bulk`;
    const payload = {
      action: 'bulk' as const,
      timestamp: new Date().toISOString(),
      data: devices,
    };

    await this.publish(topic, payload);
    logger.info({ count: devices.length }, 'Bulk device config notification sent');
  }

  // =========================================================================
  // Tag Configuration Notifications
  // =========================================================================

  /**
   * Notify protocol gateways about tag configuration changes
   * Topic: $nexus/config/tags/{deviceId}/{tagId}
   */
  async notifyTagChange(action: ConfigAction, tag: Tag): Promise<void> {
    const topic = `${CONFIG_TOPIC_PREFIX}/tags/${tag.deviceId}/${tag.id}`;
    const payload: ConfigNotification<Tag> = {
      action,
      timestamp: new Date().toISOString(),
      data: tag,
    };

    await this.publish(topic, payload);
    logger.info({ action, tagId: tag.id, tagName: tag.name }, 'Tag config notification sent');
  }

  // =========================================================================
  // Status Updates (from UI or internal)
  // =========================================================================

  /**
   * Request device status refresh from protocol gateway
   * Topic: $nexus/config/devices/{deviceId}/status/request
   */
  async requestDeviceStatus(deviceId: string): Promise<void> {
    const topic = `${CONFIG_TOPIC_PREFIX}/devices/${deviceId}/status/request`;
    await this.publish(topic, { timestamp: new Date().toISOString() });
  }

  // =========================================================================
  // Internal Publishing
  // =========================================================================

  private async publish(topic: string, payload: unknown): Promise<void> {
    if (!this.client || !this.connected) {
      logger.warn({ topic }, 'MQTT not connected, skipping publish');
      return;
    }

    return new Promise((resolve, reject) => {
      this.client!.publish(
        topic,
        JSON.stringify(payload),
        { qos: 1, retain: false },
        (error) => {
          if (error) {
            logger.error({ error, topic }, 'Failed to publish MQTT message');
            reject(error);
          } else {
            logger.debug({ topic }, 'MQTT message published');
            resolve();
          }
        }
      );
    });
  }
}

// Singleton instance
export const mqttService = new MqttService();

