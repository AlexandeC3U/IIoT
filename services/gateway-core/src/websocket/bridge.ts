import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';

import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { mqttService } from '../mqtt/client.js';

// ============================================================================
// Types
// ============================================================================

/** Client → Server messages */
interface SubscribeMessage {
  type: 'subscribe';
  topics: string[];
}

interface UnsubscribeMessage {
  type: 'unsubscribe';
  topics: string[];
}

type ClientMessage = SubscribeMessage | UnsubscribeMessage;

/** Server → Client messages */
interface DataMessage {
  type: 'data';
  topic: string;
  payload: unknown;
  timestamp: string;
}

interface ErrorMessage {
  type: 'error';
  message: string;
}

// ============================================================================
// Subscription Manager (reference-counted MQTT subscriptions)
// ============================================================================

/**
 * Manages shared MQTT subscriptions across all WebSocket clients.
 * Uses reference counting so a topic is only subscribed once on MQTT,
 * even if multiple WS clients want the same topic.
 */
class SubscriptionManager {
  /** topic → set of WebSocket clients listening */
  private topicClients = new Map<string, Set<WebSocket>>();

  /** MQTT message handler (registered once) */
  private mqttHandler = (topic: string, payload: Buffer) => {
    const clients = this.topicClients.get(topic);
    if (!clients || clients.size === 0) {
      // Check wildcard matches
      for (const [pattern, patternClients] of this.topicClients) {
        if (patternClients.size > 0 && this.topicMatchesPattern(topic, pattern)) {
          this.broadcast(patternClients, topic, payload);
        }
      }
      return;
    }
    this.broadcast(clients, topic, payload);
  };

  private started = false;

  start(): void {
    if (this.started) return;
    mqttService.onMessage(this.mqttHandler);
    this.started = true;
    logger.info('WebSocket bridge subscription manager started');
  }

  stop(): void {
    if (!this.started) return;
    mqttService.removeMessageHandler(this.mqttHandler);
    this.topicClients.clear();
    this.started = false;
    logger.info('WebSocket bridge subscription manager stopped');
  }

  async addSubscription(topic: string, client: WebSocket): Promise<void> {
    let clients = this.topicClients.get(topic);
    if (!clients) {
      clients = new Set();
      this.topicClients.set(topic, clients);
      // First client for this topic — subscribe on MQTT
      await mqttService.subscribe(topic, 0);
      logger.debug({ topic }, 'WS bridge: MQTT subscription added');
    }
    clients.add(client);
  }

  async removeSubscription(topic: string, client: WebSocket): Promise<void> {
    const clients = this.topicClients.get(topic);
    if (!clients) return;

    clients.delete(client);

    if (clients.size === 0) {
      this.topicClients.delete(topic);
      // Last client removed — unsubscribe from MQTT
      await mqttService.unsubscribe(topic).catch((err) => {
        logger.warn({ err, topic }, 'WS bridge: failed to unsubscribe');
      });
      logger.debug({ topic }, 'WS bridge: MQTT subscription removed');
    }
  }

  async removeClient(client: WebSocket): Promise<void> {
    // Collect topics first to avoid mutating the map during iteration
    const clientTopics: string[] = [];
    for (const [topic, clients] of this.topicClients) {
      if (clients.has(client)) {
        clientTopics.push(topic);
      }
    }
    for (const topic of clientTopics) {
      await this.removeSubscription(topic, client);
    }
  }

  get activeConnections(): number {
    const allClients = new Set<WebSocket>();
    for (const clients of this.topicClients.values()) {
      for (const c of clients) allClients.add(c);
    }
    return allClients.size;
  }

  get activeSubscriptions(): number {
    return this.topicClients.size;
  }

  private broadcast(clients: Set<WebSocket>, topic: string, payload: Buffer): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload.toString());
    } catch {
      parsed = payload.toString();
    }

    const message: DataMessage = {
      type: 'data',
      topic,
      payload: parsed,
      timestamp: new Date().toISOString(),
    };

    const serialized = JSON.stringify(message);

    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        client.send(serialized);
      }
    }
  }

  /**
   * Check if an MQTT topic matches a subscription pattern with wildcards.
   * + matches a single level, # matches remaining levels.
   */
  private topicMatchesPattern(topic: string, pattern: string): boolean {
    const topicParts = topic.split('/');
    const patternParts = pattern.split('/');

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] === '#') return true;
      if (patternParts[i] === '+') continue;
      if (i >= topicParts.length || patternParts[i] !== topicParts[i]) return false;
    }

    return topicParts.length === patternParts.length;
  }
}

// Singleton
const subscriptionManager = new SubscriptionManager();

// ============================================================================
// Topic Validation
// ============================================================================

/** Topics clients are allowed to subscribe to */
const ALLOWED_TOPIC_PREFIXES = [
  '$nexus/data/',      // Live tag values
  '$nexus/status/',    // Device status changes
];

function isTopicAllowed(topic: string): boolean {
  return ALLOWED_TOPIC_PREFIXES.some((prefix) => topic.startsWith(prefix));
}

// ============================================================================
// WebSocket Route Registration
// ============================================================================

export async function registerWebSocketBridge(app: FastifyInstance): Promise<void> {
  subscriptionManager.start();

  app.get('/ws', { websocket: true }, (socket: WebSocket, request) => {
    const clientId = request.id;
    let subscriptionCount = 0;
    const maxSubscriptions = env.WS_MAX_SUBSCRIPTIONS_PER_CLIENT;

    // Auth check: if auth is enabled, user must be authenticated
    if (env.AUTH_ENABLED && !request.user) {
      const err: ErrorMessage = { type: 'error', message: 'Authentication required' };
      socket.send(JSON.stringify(err));
      socket.close(4001, 'Unauthorized');
      return;
    }

    logger.info({ clientId, user: request.user?.username }, 'WebSocket client connected');

    // Heartbeat via ping/pong
    const pingInterval = setInterval(() => {
      if (socket.readyState === socket.OPEN) {
        socket.ping();
      }
    }, 30_000);

    socket.on('message', async (raw: WebSocket.RawData) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        sendError(socket, 'Invalid JSON');
        return;
      }

      if (msg.type === 'subscribe') {
        if (!Array.isArray(msg.topics) || msg.topics.length === 0) {
          sendError(socket, 'topics must be a non-empty array');
          return;
        }

        if (msg.topics.length > 50) {
          sendError(socket, 'Too many topics in one message (max 50)');
          return;
        }

        for (const topic of msg.topics) {
          if (typeof topic !== 'string') {
            sendError(socket, `Invalid topic: ${topic}`);
            continue;
          }

          if (!isTopicAllowed(topic)) {
            sendError(socket, `Topic not allowed: ${topic}`);
            continue;
          }

          if (subscriptionCount >= maxSubscriptions) {
            sendError(socket, `Max subscriptions (${maxSubscriptions}) reached`);
            break;
          }

          await subscriptionManager.addSubscription(topic, socket);
          subscriptionCount++;
        }

        logger.debug({ clientId, topics: msg.topics }, 'WS client subscribed');
      } else if (msg.type === 'unsubscribe') {
        if (!Array.isArray(msg.topics)) {
          sendError(socket, 'topics must be an array');
          return;
        }

        for (const topic of msg.topics) {
          await subscriptionManager.removeSubscription(topic, socket);
          subscriptionCount = Math.max(0, subscriptionCount - 1);
        }

        logger.debug({ clientId, topics: msg.topics }, 'WS client unsubscribed');
      } else {
        sendError(socket, `Unknown message type: ${(msg as { type: string }).type}`);
      }
    });

    socket.on('close', async () => {
      clearInterval(pingInterval);
      await subscriptionManager.removeClient(socket);
      logger.info({ clientId }, 'WebSocket client disconnected');
    });

    socket.on('error', (error: Error) => {
      logger.error({ error, clientId }, 'WebSocket error');
    });
  });

  logger.info('WebSocket bridge registered on /ws');
}

export function stopWebSocketBridge(): void {
  subscriptionManager.stop();
}

export function getWebSocketStats(): { connections: number; subscriptions: number } {
  return {
    connections: subscriptionManager.activeConnections,
    subscriptions: subscriptionManager.activeSubscriptions,
  };
}

function sendError(socket: WebSocket, message: string): void {
  if (socket.readyState === socket.OPEN) {
    const err: ErrorMessage = { type: 'error', message };
    socket.send(JSON.stringify(err));
  }
}
