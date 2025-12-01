// Package service provides the command handler for processing write commands via MQTT.
package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/nexus-edge/protocol-gateway/internal/domain"
	"github.com/rs/zerolog"
)

// ProtocolWriter is the interface for protocol-specific write operations.
type ProtocolWriter interface {
	WriteTag(ctx context.Context, device *domain.Device, tag *domain.Tag, value interface{}) error
}

// CommandHandler handles write commands received via MQTT.
// It subscribes to command topics and routes write requests to the appropriate protocol driver.
type CommandHandler struct {
	mqttClient   mqtt.Client
	modbusWriter ProtocolWriter
	opcuaWriter  ProtocolWriter
	devices      map[string]*domain.Device
	devicesMu    sync.RWMutex
	logger       zerolog.Logger
	config       CommandConfig
	stats        *CommandStats
	running      atomic.Bool
	ctx          context.Context
	cancel       context.CancelFunc
	wg           sync.WaitGroup
}

// CommandConfig holds configuration for the command handler.
type CommandConfig struct {
	// CommandTopicPrefix is the MQTT topic prefix for commands
	// Default: "$nexus/cmd"
	CommandTopicPrefix string

	// ResponseTopicPrefix is the MQTT topic prefix for responses
	// Default: "$nexus/cmd/response"
	ResponseTopicPrefix string

	// WriteTimeout is the timeout for write operations
	WriteTimeout time.Duration

	// QoS is the MQTT QoS level for command messages
	QoS byte

	// EnableAcknowledgement determines if responses should be published
	EnableAcknowledgement bool

	// MaxConcurrentWrites limits concurrent write operations
	MaxConcurrentWrites int
}

// DefaultCommandConfig returns sensible defaults for command handling.
func DefaultCommandConfig() CommandConfig {
	return CommandConfig{
		CommandTopicPrefix:    "$nexus/cmd",
		ResponseTopicPrefix:   "$nexus/cmd/response",
		WriteTimeout:          10 * time.Second,
		QoS:                   1,
		EnableAcknowledgement: true,
		MaxConcurrentWrites:   50,
	}
}

// CommandStats tracks command handling statistics.
type CommandStats struct {
	CommandsReceived  atomic.Uint64
	CommandsSucceeded atomic.Uint64
	CommandsFailed    atomic.Uint64
	CommandsRejected  atomic.Uint64
}

// WriteCommand represents a write command received via MQTT.
type WriteCommand struct {
	// RequestID is a unique identifier for the command (for correlation)
	RequestID string `json:"request_id,omitempty"`

	// DeviceID is the target device ID
	DeviceID string `json:"device_id"`

	// TagID is the target tag ID
	TagID string `json:"tag_id"`

	// Value is the value to write
	Value interface{} `json:"value"`

	// Timestamp is when the command was issued
	Timestamp time.Time `json:"timestamp,omitempty"`

	// Priority affects processing order (optional)
	Priority int `json:"priority,omitempty"`
}

// WriteResponse represents the response to a write command.
type WriteResponse struct {
	// RequestID correlates with the original command
	RequestID string `json:"request_id,omitempty"`

	// DeviceID is the target device ID
	DeviceID string `json:"device_id"`

	// TagID is the target tag ID
	TagID string `json:"tag_id"`

	// Success indicates whether the write succeeded
	Success bool `json:"success"`

	// Error contains the error message if the write failed
	Error string `json:"error,omitempty"`

	// Timestamp is when the response was generated
	Timestamp time.Time `json:"timestamp"`

	// Duration is how long the write took
	Duration time.Duration `json:"duration_ms"`
}

// NewCommandHandler creates a new command handler.
func NewCommandHandler(
	mqttClient mqtt.Client,
	modbusWriter ProtocolWriter,
	opcuaWriter ProtocolWriter,
	devices []*domain.Device,
	config CommandConfig,
	logger zerolog.Logger,
) *CommandHandler {
	ctx, cancel := context.WithCancel(context.Background())

	h := &CommandHandler{
		mqttClient:   mqttClient,
		modbusWriter: modbusWriter,
		opcuaWriter:  opcuaWriter,
		devices:      make(map[string]*domain.Device),
		logger:       logger.With().Str("component", "command-handler").Logger(),
		config:       config,
		stats:        &CommandStats{},
		ctx:          ctx,
		cancel:       cancel,
	}

	// Index devices by ID
	for _, device := range devices {
		h.devices[device.ID] = device
	}

	return h
}

// Start starts the command handler and subscribes to command topics.
func (h *CommandHandler) Start() error {
	if h.running.Load() {
		return nil
	}

	h.logger.Info().
		Str("topic_prefix", h.config.CommandTopicPrefix).
		Msg("Starting command handler")

	// Subscribe to write command topic
	// Topic pattern: $nexus/cmd/{device_id}/write
	// Or wildcard: $nexus/cmd/+/write
	writeTopic := fmt.Sprintf("%s/+/write", h.config.CommandTopicPrefix)
	token := h.mqttClient.Subscribe(writeTopic, h.config.QoS, h.handleWriteCommand)
	if token.Wait() && token.Error() != nil {
		return fmt.Errorf("%w: %v", domain.ErrMQTTSubscribeFailed, token.Error())
	}

	// Also subscribe to tag-specific commands: $nexus/cmd/{device_id}/{tag_id}/set
	tagWriteTopic := fmt.Sprintf("%s/+/+/set", h.config.CommandTopicPrefix)
	token = h.mqttClient.Subscribe(tagWriteTopic, h.config.QoS, h.handleTagWriteCommand)
	if token.Wait() && token.Error() != nil {
		return fmt.Errorf("%w: %v", domain.ErrMQTTSubscribeFailed, token.Error())
	}

	h.running.Store(true)
	h.logger.Info().Msg("Command handler started")

	return nil
}

// Stop stops the command handler and unsubscribes from topics.
func (h *CommandHandler) Stop() error {
	if !h.running.Load() {
		return nil
	}

	h.cancel()

	// Unsubscribe from topics
	writeTopic := fmt.Sprintf("%s/+/write", h.config.CommandTopicPrefix)
	h.mqttClient.Unsubscribe(writeTopic)

	tagWriteTopic := fmt.Sprintf("%s/+/+/set", h.config.CommandTopicPrefix)
	h.mqttClient.Unsubscribe(tagWriteTopic)

	h.wg.Wait()
	h.running.Store(false)

	h.logger.Info().Msg("Command handler stopped")
	return nil
}

// handleWriteCommand handles JSON write commands.
// Topic: $nexus/cmd/{device_id}/write
// Payload: {"tag_id": "...", "value": ...}
func (h *CommandHandler) handleWriteCommand(client mqtt.Client, msg mqtt.Message) {
	h.stats.CommandsReceived.Add(1)

	// Parse topic to extract device ID
	// Topic format: $nexus/cmd/{device_id}/write
	parts := strings.Split(msg.Topic(), "/")
	if len(parts) < 3 {
		h.logger.Warn().
			Str("topic", msg.Topic()).
			Msg("Invalid command topic format")
		h.stats.CommandsRejected.Add(1)
		return
	}

	deviceID := parts[len(parts)-2]

	// Parse command
	var cmd WriteCommand
	if err := json.Unmarshal(msg.Payload(), &cmd); err != nil {
		h.logger.Warn().
			Err(err).
			Str("topic", msg.Topic()).
			Msg("Failed to parse write command")
		h.stats.CommandsRejected.Add(1)
		return
	}

	cmd.DeviceID = deviceID
	if cmd.Timestamp.IsZero() {
		cmd.Timestamp = time.Now()
	}

	// Process command
	h.wg.Add(1)
	go func() {
		defer h.wg.Done()
		h.processWriteCommand(cmd)
	}()
}

// handleTagWriteCommand handles simple tag write commands.
// Topic: $nexus/cmd/{device_id}/{tag_id}/set
// Payload: raw value (JSON)
func (h *CommandHandler) handleTagWriteCommand(client mqtt.Client, msg mqtt.Message) {
	h.stats.CommandsReceived.Add(1)

	// Parse topic to extract device ID and tag ID
	// Topic format: $nexus/cmd/{device_id}/{tag_id}/set
	parts := strings.Split(msg.Topic(), "/")
	if len(parts) < 4 {
		h.logger.Warn().
			Str("topic", msg.Topic()).
			Msg("Invalid tag command topic format")
		h.stats.CommandsRejected.Add(1)
		return
	}

	deviceID := parts[len(parts)-3]
	tagID := parts[len(parts)-2]

	// Parse value
	var value interface{}
	if err := json.Unmarshal(msg.Payload(), &value); err != nil {
		// Try as raw string
		value = string(msg.Payload())
	}

	cmd := WriteCommand{
		DeviceID:  deviceID,
		TagID:     tagID,
		Value:     value,
		Timestamp: time.Now(),
	}

	// Process command
	h.wg.Add(1)
	go func() {
		defer h.wg.Done()
		h.processWriteCommand(cmd)
	}()
}

// processWriteCommand processes a write command.
func (h *CommandHandler) processWriteCommand(cmd WriteCommand) {
	startTime := time.Now()

	// Get device
	h.devicesMu.RLock()
	device, exists := h.devices[cmd.DeviceID]
	h.devicesMu.RUnlock()

	if !exists {
		h.sendResponse(cmd, false, "device not found", time.Since(startTime))
		h.stats.CommandsFailed.Add(1)
		return
	}

	// Find tag
	var tag *domain.Tag
	for i := range device.Tags {
		if device.Tags[i].ID == cmd.TagID {
			tag = &device.Tags[i]
			break
		}
	}

	if tag == nil {
		h.sendResponse(cmd, false, "tag not found", time.Since(startTime))
		h.stats.CommandsFailed.Add(1)
		return
	}

	// Check if tag is writable
	if !tag.IsWritable() {
		h.sendResponse(cmd, false, "tag is not writable", time.Since(startTime))
		h.stats.CommandsFailed.Add(1)
		return
	}

	// Execute write based on protocol
	ctx, cancel := context.WithTimeout(h.ctx, h.config.WriteTimeout)
	defer cancel()

	var err error
	switch device.Protocol {
	case domain.ProtocolModbusTCP, domain.ProtocolModbusRTU:
		if h.modbusWriter != nil {
			err = h.modbusWriter.WriteTag(ctx, device, tag, cmd.Value)
		} else {
			err = fmt.Errorf("modbus writer not available")
		}
	case domain.ProtocolOPCUA:
		if h.opcuaWriter != nil {
			err = h.opcuaWriter.WriteTag(ctx, device, tag, cmd.Value)
		} else {
			err = fmt.Errorf("opcua writer not available")
		}
	default:
		err = fmt.Errorf("unsupported protocol: %s", device.Protocol)
	}

	if err != nil {
		h.logger.Error().
			Err(err).
			Str("device_id", cmd.DeviceID).
			Str("tag_id", cmd.TagID).
			Interface("value", cmd.Value).
			Msg("Write command failed")
		h.sendResponse(cmd, false, err.Error(), time.Since(startTime))
		h.stats.CommandsFailed.Add(1)
		return
	}

	h.logger.Debug().
		Str("device_id", cmd.DeviceID).
		Str("tag_id", cmd.TagID).
		Interface("value", cmd.Value).
		Dur("duration", time.Since(startTime)).
		Msg("Write command succeeded")

	h.sendResponse(cmd, true, "", time.Since(startTime))
	h.stats.CommandsSucceeded.Add(1)
}

// sendResponse publishes a response to the command.
func (h *CommandHandler) sendResponse(cmd WriteCommand, success bool, errMsg string, duration time.Duration) {
	if !h.config.EnableAcknowledgement {
		return
	}

	response := WriteResponse{
		RequestID: cmd.RequestID,
		DeviceID:  cmd.DeviceID,
		TagID:     cmd.TagID,
		Success:   success,
		Error:     errMsg,
		Timestamp: time.Now(),
		Duration:  duration,
	}

	payload, err := json.Marshal(response)
	if err != nil {
		h.logger.Error().Err(err).Msg("Failed to marshal response")
		return
	}

	// Publish response
	// Topic: $nexus/cmd/response/{device_id}/{tag_id}
	topic := fmt.Sprintf("%s/%s/%s", h.config.ResponseTopicPrefix, cmd.DeviceID, cmd.TagID)
	token := h.mqttClient.Publish(topic, h.config.QoS, false, payload)
	if token.Wait() && token.Error() != nil {
		h.logger.Error().Err(token.Error()).Msg("Failed to publish response")
	}
}

// UpdateDevices updates the device list.
func (h *CommandHandler) UpdateDevices(devices []*domain.Device) {
	h.devicesMu.Lock()
	defer h.devicesMu.Unlock()

	h.devices = make(map[string]*domain.Device)
	for _, device := range devices {
		h.devices[device.ID] = device
	}

	h.logger.Info().Int("count", len(devices)).Msg("Updated device list")
}

// AddDevice adds a device to the handler.
func (h *CommandHandler) AddDevice(device *domain.Device) {
	h.devicesMu.Lock()
	defer h.devicesMu.Unlock()

	h.devices[device.ID] = device
	h.logger.Debug().Str("device_id", device.ID).Msg("Added device")
}

// RemoveDevice removes a device from the handler.
func (h *CommandHandler) RemoveDevice(deviceID string) {
	h.devicesMu.Lock()
	defer h.devicesMu.Unlock()

	delete(h.devices, deviceID)
	h.logger.Debug().Str("device_id", deviceID).Msg("Removed device")
}

// Stats returns command handling statistics.
func (h *CommandHandler) Stats() CommandStats {
	return CommandStats{
		CommandsReceived:  atomic.Uint64{},
		CommandsSucceeded: atomic.Uint64{},
		CommandsFailed:    atomic.Uint64{},
		CommandsRejected:  atomic.Uint64{},
	}
}

// GetStats returns the actual stats values.
func (h *CommandHandler) GetStats() map[string]uint64 {
	return map[string]uint64{
		"commands_received":  h.stats.CommandsReceived.Load(),
		"commands_succeeded": h.stats.CommandsSucceeded.Load(),
		"commands_failed":    h.stats.CommandsFailed.Load(),
		"commands_rejected":  h.stats.CommandsRejected.Load(),
	}
}

