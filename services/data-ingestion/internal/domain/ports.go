package domain

import (
	"context"
	"time"
)

// MessageHandler is called for each received MQTT message.
// Defined here so that both the mqtt adapter and its callers share a single type.
type MessageHandler func(topic string, payload []byte, receivedAt time.Time)

// MQTTSubscriber is the port that the ingestion service and health checker depend on.
// The concrete implementation is *mqtt.Subscriber.
type MQTTSubscriber interface {
	Connect(ctx context.Context) error
	Disconnect()
	SetHandler(handler MessageHandler)
	IsConnected() bool
	ParseMessage(topic string, payload []byte, receivedAt time.Time) (*DataPoint, error)
	Stats() map[string]interface{}
}

// BatchWriter is the port that the batcher, ingestion service, and health checker depend on.
// The concrete implementation is *timescaledb.Writer.
type BatchWriter interface {
	WriteBatch(ctx context.Context, batch *Batch) error
	IsHealthy(ctx context.Context) bool
	Close()
	Stats() map[string]interface{}
}
