import mqtt, { type IClientOptions, type MqttClient } from 'mqtt';
import { env } from '../config/env.js';
import type { Device, Tag } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { deviceToProtocolGateway, tagToProtocolGateway, type PGDevice, type PGTag } from './transform.js';

// Topic prefix for configuration changes
const CONFIG_TOPIC_PREFIX = '$nexus/config';

export type ConfigAction = 'create' | 'update' | 'delete';

export interface ConfigNotification<T> {
  action: ConfigAction;
  timestamp: string;
  data: T;
}

type MessageHandler = (topic: string, payload: Buffer) => void;

class MqttService {
  private client: MqttClient | null = null;
  private connected = false;
  private messageHandlers: MessageHandler[] = [];

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

      this.client.on('message', (topic, payload) => {
        for (const handler of this.messageHandlers) {
          try {
            handler(topic, payload);
          } catch (error) {
            logger.error({ error, topic }, 'Error in MQTT message handler');
          }
        }
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

  /**
   * Subscribe to an MQTT topic.
   */
  async subscribe(topic: string, qos: 0 | 1 | 2 = 1): Promise<void> {
    if (!this.client || !this.connected) {
      logger.warn({ topic }, 'MQTT not connected, skipping subscribe');
      return;
    }

    return new Promise((resolve, reject) => {
      this.client!.subscribe(topic, { qos }, (error) => {
        if (error) {
          logger.error({ error, topic }, 'Failed to subscribe to MQTT topic');
          reject(error);
        } else {
          logger.info({ topic }, 'Subscribed to MQTT topic');
          resolve();
        }
      });
    });
  }

  /**
   * Unsubscribe from an MQTT topic.
   */
  async unsubscribe(topic: string): Promise<void> {
    if (!this.client || !this.connected) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.client!.unsubscribe(topic, (error) => {
        if (error) {
          logger.error({ error, topic }, 'Failed to unsubscribe from MQTT topic');
          reject(error);
        } else {
          logger.debug({ topic }, 'Unsubscribed from MQTT topic');
          resolve();
        }
      });
    });
  }

  /**
   * Register a message handler. All handlers receive all messages.
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Remove a previously registered message handler.
   */
  removeMessageHandler(handler: MessageHandler): void {
    const idx = this.messageHandlers.indexOf(handler);
    if (idx !== -1) {
      this.messageHandlers.splice(idx, 1);
    }
  }

  // =========================================================================
  // Device Configuration Notifications
  // =========================================================================

  /**
   * Notify protocol gateways about device configuration changes.
   * Payload is transformed to protocol-gateway's domain format.
   * Topic: $nexus/config/devices/{deviceId}
   */
  async notifyDeviceChange(action: ConfigAction, device: Device, deviceTags?: Tag[]): Promise<void> {
    const topic = `${CONFIG_TOPIC_PREFIX}/devices/${device.id}`;
    const pgDevice = deviceToProtocolGateway(device, deviceTags ?? []);
    const payload: ConfigNotification<PGDevice> = {
      action,
      timestamp: new Date().toISOString(),
      data: pgDevice,
    };

    await this.publish(topic, payload);
    logger.info({ action, deviceId: device.id, deviceName: device.name }, 'Device config notification sent');
  }

  /**
   * Notify about bulk device changes (e.g., initial sync).
   * Topic: $nexus/config/devices/bulk
   */
  async notifyDevicesBulk(devicesWithTags: Array<{ device: Device; tags: Tag[] }>): Promise<void> {
    const topic = `${CONFIG_TOPIC_PREFIX}/devices/bulk`;
    const pgDevices = devicesWithTags.map(({ device, tags }) =>
      deviceToProtocolGateway(device, tags)
    );
    const payload = {
      action: 'bulk' as const,
      timestamp: new Date().toISOString(),
      data: pgDevices,
    };

    await this.publish(topic, payload);
    logger.info({ count: pgDevices.length }, 'Bulk device config notification sent');
  }

  // =========================================================================
  // Tag Configuration Notifications
  // =========================================================================

  /**
   * Notify protocol gateways about tag configuration changes.
   * Payload is transformed to protocol-gateway's domain format.
   * Topic: $nexus/config/tags/{deviceId}/{tagId}
   */
  async notifyTagChange(action: ConfigAction, tag: Tag): Promise<void> {
    const topic = `${CONFIG_TOPIC_PREFIX}/tags/${tag.deviceId}/${tag.id}`;
    const pgTag = tagToProtocolGateway(tag);
    const payload: ConfigNotification<PGTag> = {
      action,
      timestamp: new Date().toISOString(),
      data: pgTag,
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
