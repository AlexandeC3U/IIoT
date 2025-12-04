package mqtt

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	paho "github.com/eclipse/paho.mqtt.golang"
	"github.com/nexus-edge/data-ingestion/internal/domain"
	"github.com/nexus-edge/data-ingestion/internal/metrics"
	"github.com/rs/zerolog"
)

// SubscriberConfig contains MQTT subscriber configuration
type SubscriberConfig struct {
	BrokerURL      string
	ClientID       string
	Username       string
	Password       string
	Topics         []string
	QoS            byte
	KeepAlive      time.Duration
	CleanSession   bool
	ReconnectDelay time.Duration
}

// MessageHandler is called for each received MQTT message
type MessageHandler func(topic string, payload []byte, receivedAt time.Time)

// Subscriber handles MQTT subscription and message delivery
type Subscriber struct {
	config  SubscriberConfig
	client  paho.Client
	logger  zerolog.Logger
	metrics *metrics.Registry

	handler     MessageHandler
	handlerMu   sync.RWMutex
	isConnected atomic.Bool

	messagesReceived atomic.Uint64
	parseErrors      atomic.Uint64
}

// NewSubscriber creates a new MQTT subscriber
func NewSubscriber(config SubscriberConfig, logger zerolog.Logger, metricsReg *metrics.Registry) (*Subscriber, error) {
	s := &Subscriber{
		config:  config,
		logger:  logger.With().Str("component", "mqtt-subscriber").Logger(),
		metrics: metricsReg,
	}

	opts := paho.NewClientOptions().
		AddBroker(config.BrokerURL).
		SetClientID(config.ClientID).
		SetKeepAlive(config.KeepAlive).
		SetCleanSession(config.CleanSession).
		SetAutoReconnect(true).
		SetConnectRetry(true).
		SetConnectRetryInterval(config.ReconnectDelay).
		SetConnectionLostHandler(s.onConnectionLost).
		SetOnConnectHandler(s.onConnect).
		SetDefaultPublishHandler(s.onMessage)

	if config.Username != "" {
		opts.SetUsername(config.Username)
	}
	if config.Password != "" {
		opts.SetPassword(config.Password)
	}

	s.client = paho.NewClient(opts)

	return s, nil
}

// Connect establishes connection to the MQTT broker
func (s *Subscriber) Connect(ctx context.Context) error {
	s.logger.Info().
		Str("broker", s.config.BrokerURL).
		Str("client_id", s.config.ClientID).
		Msg("Connecting to MQTT broker")

	token := s.client.Connect()
	if !token.WaitTimeout(30 * time.Second) {
		return fmt.Errorf("connection timeout")
	}
	if token.Error() != nil {
		return fmt.Errorf("connection failed: %w", token.Error())
	}

	return nil
}

// SetHandler sets the message handler callback
func (s *Subscriber) SetHandler(handler MessageHandler) {
	s.handlerMu.Lock()
	s.handler = handler
	s.handlerMu.Unlock()
}

// Subscribe subscribes to the configured topics
func (s *Subscriber) Subscribe() error {
	filters := make(map[string]byte)
	for _, topic := range s.config.Topics {
		filters[topic] = s.config.QoS
	}

	token := s.client.SubscribeMultiple(filters, nil)
	if !token.WaitTimeout(10 * time.Second) {
		return fmt.Errorf("subscribe timeout")
	}
	if token.Error() != nil {
		return fmt.Errorf("subscribe failed: %w", token.Error())
	}

	s.logger.Info().
		Strs("topics", s.config.Topics).
		Msg("Subscribed to topics")

	return nil
}

// Disconnect cleanly disconnects from the broker
func (s *Subscriber) Disconnect() {
	s.client.Disconnect(5000)
	s.isConnected.Store(false)
	s.logger.Info().Msg("Disconnected from MQTT broker")
}

// IsConnected returns current connection status
func (s *Subscriber) IsConnected() bool {
	return s.isConnected.Load() && s.client.IsConnected()
}

// Stats returns subscriber statistics
func (s *Subscriber) Stats() map[string]interface{} {
	return map[string]interface{}{
		"connected":          s.IsConnected(),
		"broker":             s.config.BrokerURL,
		"client_id":          s.config.ClientID,
		"topics":             s.config.Topics,
		"messages_received":  s.messagesReceived.Load(),
		"parse_errors":       s.parseErrors.Load(),
	}
}

// onConnect is called when connection is established
func (s *Subscriber) onConnect(client paho.Client) {
	s.isConnected.Store(true)
	s.logger.Info().Msg("Connected to MQTT broker")

	// Resubscribe on reconnection
	if err := s.Subscribe(); err != nil {
		s.logger.Error().Err(err).Msg("Failed to resubscribe after reconnection")
	}
}

// onConnectionLost is called when connection is lost
func (s *Subscriber) onConnectionLost(client paho.Client, err error) {
	s.isConnected.Store(false)
	s.logger.Warn().Err(err).Msg("Connection lost to MQTT broker")
}

// onMessage handles incoming MQTT messages
func (s *Subscriber) onMessage(client paho.Client, msg paho.Message) {
	receivedAt := time.Now()
	s.messagesReceived.Add(1)

	s.handlerMu.RLock()
	handler := s.handler
	s.handlerMu.RUnlock()

	if handler != nil {
		handler(msg.Topic(), msg.Payload(), receivedAt)
	}
}

// ParseMessage parses an MQTT message into a DataPoint
func (s *Subscriber) ParseMessage(topic string, payload []byte, receivedAt time.Time) (*domain.DataPoint, error) {
	dp, err := domain.ParsePayload(topic, payload, receivedAt)
	if err != nil {
		s.parseErrors.Add(1)
		s.metrics.IncParseErrors()
		return nil, err
	}
	return dp, nil
}

