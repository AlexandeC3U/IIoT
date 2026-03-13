// Package service provides the config subscriber for receiving device/tag
// configuration changes from gateway-core via MQTT.
package service

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/nexus-edge/protocol-gateway/internal/adapter/config"
	"github.com/nexus-edge/protocol-gateway/internal/domain"
	"github.com/rs/zerolog"
)

// ConfigSubscriber listens for device and tag configuration changes published
// by gateway-core on MQTT. It translates the wire format into domain objects
// and drives the polling service through DeviceManager callbacks.
type ConfigSubscriber struct {
	mqttClient mqtt.Client
	dm         DeviceRegistrar
	logger     zerolog.Logger
	config     ConfigSubscriberConfig
	running    atomic.Bool
	stats      configStats
}

// configStats tracks subscriber activity for observability.
type configStats struct {
	devicesReceived atomic.Int64
	tagsReceived    atomic.Int64
	errorsTotal     atomic.Int64
	lastSyncAt      atomic.Value // time.Time
}

// DeviceRegistrar is the interface the subscriber uses to mutate device state.
// Satisfied by api.DeviceManager.
type DeviceRegistrar interface {
	GetDevice(id string) (*domain.Device, bool)
	GetDevices() []*domain.Device
	AddDeviceFromConfig(device *domain.Device) error
	UpdateDeviceFromConfig(device *domain.Device) error
	DeleteDeviceByID(id string) error
}

// ConfigSubscriberConfig holds configuration for the subscriber.
type ConfigSubscriberConfig struct {
	// TopicPrefix is the MQTT topic prefix for config changes.
	// Default: "$nexus/config"
	TopicPrefix string

	// SyncRequestTopic is the topic to publish sync requests on.
	// Default: "$nexus/config/sync/request"
	SyncRequestTopic string

	// QoS is the MQTT QoS level for config messages.
	QoS byte

	// SyncRequestDelay is the delay after subscribing before requesting
	// a full sync. Allows retained messages to arrive first.
	SyncRequestDelay time.Duration
}

// DefaultConfigSubscriberConfig returns sensible defaults.
func DefaultConfigSubscriberConfig() ConfigSubscriberConfig {
	return ConfigSubscriberConfig{
		TopicPrefix:      "$nexus/config",
		SyncRequestTopic: "$nexus/config/sync/request",
		QoS:              1,
		SyncRequestDelay: 2 * time.Second,
	}
}

// NewConfigSubscriber creates a new config subscriber.
func NewConfigSubscriber(
	mqttClient mqtt.Client,
	dm DeviceRegistrar,
	config ConfigSubscriberConfig,
	logger zerolog.Logger,
) *ConfigSubscriber {
	return &ConfigSubscriber{
		mqttClient: mqttClient,
		dm:         dm,
		logger:     logger.With().Str("component", "config-subscriber").Logger(),
		config:     config,
	}
}

// Start subscribes to config topics and requests an initial sync.
func (cs *ConfigSubscriber) Start() error {
	if cs.running.Load() {
		return fmt.Errorf("config subscriber already running")
	}

	// $nexus/config/devices/+ covers both individual device IDs and "bulk"
	deviceTopic := fmt.Sprintf("%s/devices/+", cs.config.TopicPrefix)
	tagTopic := fmt.Sprintf("%s/tags/+/+", cs.config.TopicPrefix)

	filters := map[string]byte{
		deviceTopic: cs.config.QoS,
		tagTopic:    cs.config.QoS,
	}

	token := cs.mqttClient.SubscribeMultiple(filters, cs.handleMessage)
	if !token.WaitTimeout(10 * time.Second) {
		return fmt.Errorf("timeout subscribing to config topics")
	}
	if err := token.Error(); err != nil {
		return fmt.Errorf("failed to subscribe to config topics: %w", err)
	}

	cs.running.Store(true)
	cs.logger.Info().
		Str("device_topic", deviceTopic).
		Str("tag_topic", tagTopic).
		Msg("Config subscriber started")

	// Request initial sync after a short delay to let any retained messages arrive first.
	go cs.requestSync()

	return nil
}

// Stop unsubscribes from config topics.
func (cs *ConfigSubscriber) Stop() error {
	if !cs.running.Load() {
		return nil
	}

	deviceTopic := fmt.Sprintf("%s/devices/+", cs.config.TopicPrefix)
	tagTopic := fmt.Sprintf("%s/tags/+/+", cs.config.TopicPrefix)

	token := cs.mqttClient.Unsubscribe(deviceTopic, tagTopic)
	token.WaitTimeout(5 * time.Second)

	cs.running.Store(false)
	cs.logger.Info().Msg("Config subscriber stopped")
	return nil
}

// Stats returns a snapshot of subscriber statistics.
func (cs *ConfigSubscriber) Stats() map[string]interface{} {
	lastSync, _ := cs.stats.lastSyncAt.Load().(time.Time)
	return map[string]interface{}{
		"devices_received": cs.stats.devicesReceived.Load(),
		"tags_received":    cs.stats.tagsReceived.Load(),
		"errors_total":     cs.stats.errorsTotal.Load(),
		"last_sync_at":     lastSync,
	}
}

// requestSync publishes a sync request so gateway-core sends all device configs.
func (cs *ConfigSubscriber) requestSync() {
	time.Sleep(cs.config.SyncRequestDelay)

	payload, _ := json.Marshal(map[string]string{
		"source":    "protocol-gateway",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})

	token := cs.mqttClient.Publish(cs.config.SyncRequestTopic, cs.config.QoS, false, payload)
	if !token.WaitTimeout(5 * time.Second) {
		cs.logger.Error().Msg("Timeout publishing config sync request")
		return
	}
	if err := token.Error(); err != nil {
		cs.logger.Error().Err(err).Msg("Failed to publish config sync request")
		return
	}

	cs.logger.Info().Msg("Config sync request published")
}

// handleMessage routes incoming MQTT messages to the appropriate handler.
func (cs *ConfigSubscriber) handleMessage(_ mqtt.Client, msg mqtt.Message) {
	topic := msg.Topic()
	payload := msg.Payload()

	// Ignore empty payloads (MQTT delete-retained convention)
	if len(payload) == 0 {
		return
	}

	prefix := cs.config.TopicPrefix

	switch {
	case topic == fmt.Sprintf("%s/devices/bulk", prefix):
		cs.handleBulkDevices(payload)

	case strings.HasPrefix(topic, prefix+"/devices/"):
		cs.handleDeviceChange(topic, payload)

	case strings.HasPrefix(topic, prefix+"/tags/"):
		cs.handleTagChange(topic, payload)

	default:
		cs.logger.Warn().Str("topic", topic).Msg("Unrecognized config topic")
	}
}

// =========================================================================
// Wire format types — match gateway-core's MQTT transform output
// =========================================================================

type configNotification[T any] struct {
	Action    string `json:"action"`
	Timestamp string `json:"timestamp"`
	Data      T      `json:"data"`
}

// WireDevice is the gateway-core JSON wire format for a device.
// Exported so the API handlers (test-connection) can also decode this format.
type WireDevice struct {
	ID            string         `json:"id"`
	Name          string         `json:"name"`
	Description   string         `json:"description"`
	Protocol      string         `json:"protocol"`
	Enabled       bool           `json:"enabled"`
	Connection    WireConnection `json:"connection"`
	UNSPrefix     string         `json:"uns_prefix"`
	PollInterval  string         `json:"poll_interval"`
	Tags          []WireTag      `json:"tags"`
	ConfigVersion uint32         `json:"config_version"`
}

type WireConnection struct {
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Timeout    string `json:"timeout"`
	RetryCount *int   `json:"retry_count,omitempty"`
	RetryDelay string `json:"retry_delay,omitempty"`
	// Modbus
	SlaveID *int `json:"slave_id,omitempty"`
	// OPC UA
	SecurityPolicy   string `json:"security_policy,omitempty"`
	SecurityMode     string `json:"security_mode,omitempty"`
	AuthMode         string `json:"auth_mode,omitempty"`
	Username         string `json:"username,omitempty"`
	Password         string `json:"password,omitempty"`
	EndpointURL      string `json:"endpoint_url,omitempty"`
	UseSubscriptions *bool  `json:"use_subscriptions,omitempty"`
	// S7
	Rack    *int `json:"rack,omitempty"`
	Slot    *int `json:"slot,omitempty"`
	PDUSize *int `json:"pdu_size,omitempty"`
}

type WireTag struct {
	ID              string  `json:"id"`
	Name            string  `json:"name"`
	Description     string  `json:"description"`
	Address         string  `json:"address"`
	DataType        string  `json:"data_type"`
	Enabled         bool    `json:"enabled"`
	ScaleFactor     float64 `json:"scale_factor"`
	Offset          float64 `json:"offset"`
	ClampMin        *float64 `json:"clamp_min,omitempty"`
	ClampMax        *float64 `json:"clamp_max,omitempty"`
	Unit            string  `json:"unit"`
	DeadbandType    string  `json:"deadband_type"`
	DeadbandValue   float64 `json:"deadband_value"`
	AccessMode      string  `json:"access_mode"`
	Priority        uint8   `json:"priority"`
	ByteOrder       string  `json:"byte_order"`
	RegisterType    string  `json:"register_type"`
	RegisterCount   *uint16 `json:"register_count,omitempty"`
	OPCNodeID       string  `json:"opc_node_id"`
	OPCNamespaceURI string  `json:"opc_namespace_uri"`
	S7Address       string  `json:"s7_address"`
	TopicSuffix     string  `json:"topic_suffix"`
}

// =========================================================================
// Handlers
// =========================================================================

func (cs *ConfigSubscriber) handleDeviceChange(topic string, payload []byte) {
	var notification configNotification[WireDevice]
	if err := json.Unmarshal(payload, &notification); err != nil {
		cs.stats.errorsTotal.Add(1)
		cs.logger.Error().Err(err).Str("topic", topic).Msg("Failed to unmarshal device notification")
		return
	}

	cs.stats.devicesReceived.Add(1)

	switch notification.Action {
	case "create":
		cs.applyDeviceCreate(notification.Data)
	case "update":
		cs.applyDeviceUpdate(notification.Data)
	case "delete":
		cs.applyDeviceDelete(notification.Data.ID)
	default:
		cs.logger.Warn().Str("action", notification.Action).Msg("Unknown device config action")
	}
}

func (cs *ConfigSubscriber) handleBulkDevices(payload []byte) {
	var notification struct {
		Action    string       `json:"action"`
		Timestamp string       `json:"timestamp"`
		Data      []WireDevice `json:"data"`
	}
	if err := json.Unmarshal(payload, &notification); err != nil {
		cs.stats.errorsTotal.Add(1)
		cs.logger.Error().Err(err).Msg("Failed to unmarshal bulk device notification")
		return
	}

	cs.stats.lastSyncAt.Store(time.Now())
	cs.logger.Info().Int("count", len(notification.Data)).Msg("Received bulk device sync")

	// Reconcile: add new devices, update existing, remove stale.
	incoming := make(map[string]struct{}, len(notification.Data))
	for _, wd := range notification.Data {
		incoming[wd.ID] = struct{}{}
		cs.stats.devicesReceived.Add(1)

		if _, exists := cs.dm.GetDevice(wd.ID); exists {
			cs.applyDeviceUpdate(wd)
		} else {
			cs.applyDeviceCreate(wd)
		}
	}

	// Remove devices that exist locally but weren't in the bulk sync.
	for _, existing := range cs.dm.GetDevices() {
		if _, ok := incoming[existing.ID]; !ok {
			cs.applyDeviceDelete(existing.ID)
		}
	}
}

func (cs *ConfigSubscriber) handleTagChange(topic string, payload []byte) {
	// Topic: $nexus/config/tags/{deviceId}/{tagId}
	parts := strings.Split(topic, "/")
	if len(parts) < 5 {
		cs.logger.Error().Str("topic", topic).Msg("Invalid tag config topic")
		return
	}
	deviceID := parts[len(parts)-2]

	var notification configNotification[WireTag]
	if err := json.Unmarshal(payload, &notification); err != nil {
		cs.stats.errorsTotal.Add(1)
		cs.logger.Error().Err(err).Str("topic", topic).Msg("Failed to unmarshal tag notification")
		return
	}

	cs.stats.tagsReceived.Add(1)

	device, exists := cs.dm.GetDevice(deviceID)
	if !exists {
		cs.logger.Warn().
			Str("device_id", deviceID).
			Str("tag_id", notification.Data.ID).
			Msg("Received tag config for unknown device, ignoring")
		return
	}

	// Clone device to avoid mutating the live pointer
	updated := cloneDevice(device)
	tag := WireTagToDomain(notification.Data)

	switch notification.Action {
	case "create":
		// Append tag if not already present
		found := false
		for i := range updated.Tags {
			if updated.Tags[i].ID == tag.ID {
				updated.Tags[i] = tag
				found = true
				break
			}
		}
		if !found {
			updated.Tags = append(updated.Tags, tag)
		}
	case "update":
		found := false
		for i := range updated.Tags {
			if updated.Tags[i].ID == tag.ID {
				updated.Tags[i] = tag
				found = true
				break
			}
		}
		if !found {
			updated.Tags = append(updated.Tags, tag)
		}
	case "delete":
		filtered := updated.Tags[:0]
		for _, t := range updated.Tags {
			if t.ID != tag.ID {
				filtered = append(filtered, t)
			}
		}
		updated.Tags = filtered
	}

	updated.UpdatedAt = time.Now()
	if err := cs.dm.UpdateDeviceFromConfig(updated); err != nil {
		cs.stats.errorsTotal.Add(1)
		cs.logger.Error().Err(err).
			Str("device_id", deviceID).
			Str("tag_id", tag.ID).
			Str("action", notification.Action).
			Msg("Failed to apply tag config change")
	} else {
		cs.logger.Info().
			Str("device_id", deviceID).
			Str("tag_id", tag.ID).
			Str("tag_name", tag.Name).
			Str("action", notification.Action).
			Msg("Tag config applied")
	}
}

// =========================================================================
// Apply helpers
// =========================================================================

func (cs *ConfigSubscriber) applyDeviceCreate(wd WireDevice) {
	device := WireDeviceToDomain(wd)

	if err := cs.dm.AddDeviceFromConfig(device); err != nil {
		cs.stats.errorsTotal.Add(1)
		cs.logger.Error().Err(err).
			Str("device_id", device.ID).
			Str("device_name", device.Name).
			Msg("Failed to add device from config")
		return
	}

	cs.logger.Info().
		Str("device_id", device.ID).
		Str("device_name", device.Name).
		Str("protocol", string(device.Protocol)).
		Int("tags", len(device.Tags)).
		Msg("Device added from gateway-core config")
}

func (cs *ConfigSubscriber) applyDeviceUpdate(wd WireDevice) {
	device := WireDeviceToDomain(wd)

	if err := cs.dm.UpdateDeviceFromConfig(device); err != nil {
		cs.stats.errorsTotal.Add(1)
		cs.logger.Error().Err(err).
			Str("device_id", device.ID).
			Msg("Failed to update device from config")
		return
	}

	cs.logger.Info().
		Str("device_id", device.ID).
		Str("device_name", device.Name).
		Int("tags", len(device.Tags)).
		Msg("Device updated from gateway-core config")
}

func (cs *ConfigSubscriber) applyDeviceDelete(deviceID string) {
	if err := cs.dm.DeleteDeviceByID(deviceID); err != nil {
		cs.stats.errorsTotal.Add(1)
		cs.logger.Error().Err(err).
			Str("device_id", deviceID).
			Msg("Failed to delete device from config")
		return
	}

	cs.logger.Info().
		Str("device_id", deviceID).
		Msg("Device deleted from gateway-core config")
}

// =========================================================================
// Wire → Domain conversion
// =========================================================================

// WireDeviceToDomain converts the gateway-core wire format to a domain.Device.
func WireDeviceToDomain(wd WireDevice) *domain.Device {
	d := &domain.Device{
		ID:            wd.ID,
		Name:          wd.Name,
		Description:   wd.Description,
		Protocol:      mapWireProtocol(wd.Protocol),
		Enabled:       wd.Enabled,
		UNSPrefix:     wd.UNSPrefix,
		PollInterval:  parseDuration(wd.PollInterval, time.Second),
		ConfigVersion: wd.ConfigVersion,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	// Connection
	d.Connection = WireConnectionToDomain(wd.Connection, d.Protocol)

	// Tags
	d.Tags = make([]domain.Tag, 0, len(wd.Tags))
	for _, wt := range wd.Tags {
		d.Tags = append(d.Tags, WireTagToDomain(wt))
	}

	return d
}

func WireConnectionToDomain(wc WireConnection, protocol domain.Protocol) domain.ConnectionConfig {
	cc := domain.ConnectionConfig{
		Host:    wc.Host,
		Port:    wc.Port,
		Timeout: parseDuration(wc.Timeout, 10*time.Second),
	}

	if wc.RetryCount != nil {
		cc.RetryCount = *wc.RetryCount
	}
	if wc.RetryDelay != "" {
		cc.RetryDelay = parseDuration(wc.RetryDelay, 0)
	}

	switch protocol {
	case domain.ProtocolModbusTCP, domain.ProtocolModbusRTU:
		if wc.SlaveID != nil {
			cc.SlaveID = uint8(*wc.SlaveID)
		}
	case domain.ProtocolOPCUA:
		cc.OPCSecurityPolicy = wc.SecurityPolicy
		cc.OPCSecurityMode = wc.SecurityMode
		cc.OPCAuthMode = wc.AuthMode
		cc.OPCUsername = wc.Username
		cc.OPCPassword = wc.Password
		cc.OPCEndpointURL = wc.EndpointURL
		if wc.UseSubscriptions != nil {
			cc.OPCUseSubscriptions = *wc.UseSubscriptions
		}
	case domain.ProtocolS7:
		if wc.Rack != nil {
			cc.S7Rack = *wc.Rack
		}
		if wc.Slot != nil {
			cc.S7Slot = *wc.Slot
		}
		if wc.PDUSize != nil {
			cc.S7PDUSize = *wc.PDUSize
		}
	}

	return cc
}

func WireTagToDomain(wt WireTag) domain.Tag {
	t := domain.Tag{
		ID:              wt.ID,
		Name:            wt.Name,
		Description:     wt.Description,
		DataType:        domain.DataType(wt.DataType),
		Enabled:         wt.Enabled,
		ScaleFactor:     wt.ScaleFactor,
		Offset:          wt.Offset,
		Unit:            wt.Unit,
		DeadbandType:    domain.DeadbandType(wt.DeadbandType),
		DeadbandValue:   wt.DeadbandValue,
		AccessMode:      domain.AccessMode(wt.AccessMode),
		Priority:        wt.Priority,
		ByteOrder:       domain.ByteOrder(wt.ByteOrder),
		RegisterType:    domain.RegisterType(wt.RegisterType),
		OPCNodeID:       wt.OPCNodeID,
		OPCNamespaceURI: wt.OPCNamespaceURI,
		S7Address:       wt.S7Address,
		TopicSuffix:     wt.TopicSuffix,
	}

	// Parse address from string to uint16
	if wt.Address != "" {
		if addr, err := strconv.ParseUint(wt.Address, 10, 16); err == nil {
			t.Address = uint16(addr)
		}
	}

	if wt.RegisterCount != nil {
		t.RegisterCount = *wt.RegisterCount
	}

	return t
}

// mapWireProtocol maps gateway-core protocol strings to domain.Protocol constants.
func mapWireProtocol(protocol string) domain.Protocol {
	switch protocol {
	case "modbus_tcp":
		return domain.ProtocolModbusTCP
	case "modbus_rtu":
		return domain.ProtocolModbusRTU
	case "opcua":
		return domain.ProtocolOPCUA
	case "s7":
		return domain.ProtocolS7
	case "mqtt":
		return domain.ProtocolMQTT
	default:
		return domain.Protocol(protocol)
	}
}

// parseDuration parses a duration string like "1000ms", "10s", "5m".
// Returns fallback on parse failure.
func parseDuration(s string, fallback time.Duration) time.Duration {
	if s == "" {
		return fallback
	}
	d, err := time.ParseDuration(s)
	if err != nil {
		return fallback
	}
	return d
}

// cloneDevice creates a shallow copy of a device with a new tag slice.
func cloneDevice(d *domain.Device) *domain.Device {
	clone := *d
	clone.Tags = make([]domain.Tag, len(d.Tags))
	copy(clone.Tags, d.Tags)
	return &clone
}

// =========================================================================
// Thread-safe device registry with YAML cache for restart resilience
// =========================================================================

// MQTTDeviceManager stores devices in-memory with optional YAML persistence
// as a cache. On startup it loads cached devices from YAML so polling can
// resume immediately even if gateway-core is temporarily unavailable.
// The MQTT sync then reconciles to the authoritative state.
type MQTTDeviceManager struct {
	devices    map[string]*domain.Device
	mu         sync.RWMutex
	logger     zerolog.Logger
	cachePath  string // YAML cache file path (empty = no persistence)
	onAdd      func(*domain.Device) error
	onEdit     func(*domain.Device) error
	onDelete   func(string) error
}

// NewMQTTDeviceManager creates a new device manager with optional YAML cache.
// If cachePath is non-empty, devices are persisted to YAML on every change
// and loaded on startup for restart resilience.
func NewMQTTDeviceManager(logger zerolog.Logger, cachePath string) *MQTTDeviceManager {
	return &MQTTDeviceManager{
		devices:   make(map[string]*domain.Device),
		cachePath: cachePath,
		logger:    logger.With().Str("component", "mqtt-device-manager").Logger(),
	}
}

// LoadCache loads cached device configurations from YAML.
// Called at startup before MQTT sync to resume polling immediately.
// Returns the number of devices loaded (0 if cache doesn't exist).
func (m *MQTTDeviceManager) LoadCache() int {
	if m.cachePath == "" {
		return 0
	}

	devices, err := config.LoadDevices(m.cachePath)
	if err != nil {
		m.logger.Debug().Err(err).Msg("No device cache to load (this is normal on first run)")
		return 0
	}

	m.mu.Lock()
	for _, d := range devices {
		m.devices[d.ID] = d
	}
	m.mu.Unlock()

	m.logger.Info().Int("count", len(devices)).Msg("Loaded cached device configurations")
	return len(devices)
}

// persistCache writes the current device state to YAML (best-effort).
func (m *MQTTDeviceManager) persistCache() {
	if m.cachePath == "" {
		return
	}

	m.mu.RLock()
	devices := make([]*domain.Device, 0, len(m.devices))
	for _, d := range m.devices {
		devices = append(devices, d)
	}
	m.mu.RUnlock()

	if err := config.SaveDevices(m.cachePath, devices); err != nil {
		m.logger.Warn().Err(err).Msg("Failed to persist device cache")
	}
}

// SetCallbacks sets the lifecycle callbacks for device changes.
func (m *MQTTDeviceManager) SetCallbacks(
	onAdd func(*domain.Device) error,
	onEdit func(*domain.Device) error,
	onDelete func(string) error,
) {
	m.onAdd = onAdd
	m.onEdit = onEdit
	m.onDelete = onDelete
}

// GetDevice returns a device by ID.
func (m *MQTTDeviceManager) GetDevice(id string) (*domain.Device, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	d, ok := m.devices[id]
	return d, ok
}

// GetDevices returns all devices.
func (m *MQTTDeviceManager) GetDevices() []*domain.Device {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make([]*domain.Device, 0, len(m.devices))
	for _, d := range m.devices {
		result = append(result, d)
	}
	return result
}

// AddDeviceFromConfig adds a device received from gateway-core config.
func (m *MQTTDeviceManager) AddDeviceFromConfig(device *domain.Device) error {
	m.mu.Lock()
	if _, exists := m.devices[device.ID]; exists {
		m.mu.Unlock()
		// Already exists — treat as update instead of failing
		return m.UpdateDeviceFromConfig(device)
	}
	m.devices[device.ID] = device
	m.mu.Unlock()

	if m.onAdd != nil {
		if err := m.onAdd(device); err != nil {
			m.logger.Error().Err(err).
				Str("device_id", device.ID).
				Msg("onAdd callback failed")
			// Remove from map to keep consistent state
			m.mu.Lock()
			delete(m.devices, device.ID)
			m.mu.Unlock()
			return err
		}
	}

	go m.persistCache()
	return nil
}

// UpdateDeviceFromConfig updates a device received from gateway-core config.
func (m *MQTTDeviceManager) UpdateDeviceFromConfig(device *domain.Device) error {
	m.mu.Lock()
	_, exists := m.devices[device.ID]
	m.devices[device.ID] = device
	m.mu.Unlock()

	if !exists {
		// Device doesn't exist yet — treat as add
		if m.onAdd != nil {
			if err := m.onAdd(device); err != nil {
				m.mu.Lock()
				delete(m.devices, device.ID)
				m.mu.Unlock()
				return err
			}
		}
		go m.persistCache()
		return nil
	}

	if m.onEdit != nil {
		if err := m.onEdit(device); err != nil {
			m.logger.Error().Err(err).
				Str("device_id", device.ID).
				Msg("onEdit callback failed")
			return err
		}
	}

	go m.persistCache()
	return nil
}

// DeleteDeviceByID deletes a device by ID.
func (m *MQTTDeviceManager) DeleteDeviceByID(id string) error {
	m.mu.Lock()
	_, exists := m.devices[id]
	if !exists {
		m.mu.Unlock()
		return nil // Already gone — idempotent
	}
	delete(m.devices, id)
	m.mu.Unlock()

	if m.onDelete != nil {
		if err := m.onDelete(id); err != nil {
			return err
		}
	}

	go m.persistCache()
	return nil
}

// DeviceCount returns the number of registered devices.
func (m *MQTTDeviceManager) DeviceCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.devices)
}
