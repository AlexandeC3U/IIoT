// Package opcua provides subscription management for OPC UA monitored items.
package opcua

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gopcua/opcua"
	"github.com/gopcua/opcua/monitor"
	"github.com/gopcua/opcua/ua"
	"github.com/nexus-edge/protocol-gateway/internal/domain"
	"github.com/rs/zerolog"
)

// SubscriptionManager manages OPC UA subscriptions for monitored items.
// Unlike Modbus polling, OPC UA supports server-side subscriptions where
// the server pushes data changes to the client (Report-by-Exception).
type SubscriptionManager struct {
	client          *Client
	nodeMonitor     *monitor.NodeMonitor
	subscriptions   map[string]*Subscription
	mu              sync.RWMutex
	logger          zerolog.Logger
	dataHandler     DataHandler
	publishInterval time.Duration
	queueSize       uint32
	running         atomic.Bool
	ctx             context.Context
	cancel          context.CancelFunc
	wg              sync.WaitGroup
}

// Subscription represents an OPC UA subscription with its monitored items.
type Subscription struct {
	ID              uint32
	Device          *domain.Device
	Tags            map[string]*domain.Tag
	MonitoredItems  map[string]uint32 // tag ID -> monitored item ID
	LastValues      map[string]*domain.DataPoint
	mu              sync.RWMutex
	publishInterval time.Duration
	active          atomic.Bool
}

// DataHandler is called when new data is received from subscriptions.
type DataHandler func(dataPoint *domain.DataPoint)

// SubscriptionConfig holds configuration for subscriptions.
type SubscriptionConfig struct {
	// PublishInterval is how often the server should send notifications
	PublishInterval time.Duration

	// SamplingInterval is how often the server should sample values
	SamplingInterval time.Duration

	// QueueSize is the number of values to queue on the server
	QueueSize uint32

	// DiscardOldest determines whether to discard oldest or newest when queue is full
	DiscardOldest bool

	// DeadbandType is the deadband filter type (Absolute, Percent, None)
	DeadbandType string

	// DeadbandValue is the deadband threshold
	DeadbandValue float64
}

// DefaultSubscriptionConfig returns sensible defaults for subscriptions.
func DefaultSubscriptionConfig() SubscriptionConfig {
	return SubscriptionConfig{
		PublishInterval:  1 * time.Second,
		SamplingInterval: 500 * time.Millisecond,
		QueueSize:        10,
		DiscardOldest:    true,
		DeadbandType:     "None",
		DeadbandValue:    0,
	}
}

// NewSubscriptionManager creates a new subscription manager for an OPC UA client.
func NewSubscriptionManager(client *Client, handler DataHandler, logger zerolog.Logger) (*SubscriptionManager, error) {
	ctx, cancel := context.WithCancel(context.Background())

	sm := &SubscriptionManager{
		client:          client,
		subscriptions:   make(map[string]*Subscription),
		logger:          logger.With().Str("component", "opcua-subscription").Logger(),
		dataHandler:     handler,
		publishInterval: 1 * time.Second,
		queueSize:       10,
		ctx:             ctx,
		cancel:          cancel,
	}

	return sm, nil
}

// Start starts the subscription manager.
func (sm *SubscriptionManager) Start() error {
	if sm.running.Load() {
		return nil
	}

	if !sm.client.IsConnected() {
		return domain.ErrConnectionClosed
	}

	sm.running.Store(true)
	sm.logger.Info().Msg("Subscription manager started")

	return nil
}

// Stop stops the subscription manager and unsubscribes from all items.
func (sm *SubscriptionManager) Stop() error {
	if !sm.running.Load() {
		return nil
	}

	sm.cancel()
	sm.running.Store(false)

	// Unsubscribe from all
	sm.mu.Lock()
	for deviceID := range sm.subscriptions {
		sm.unsubscribeDevice(deviceID)
	}
	sm.subscriptions = make(map[string]*Subscription)
	sm.mu.Unlock()

	sm.wg.Wait()
	sm.logger.Info().Msg("Subscription manager stopped")

	return nil
}

// Subscribe creates a subscription for a device and its tags.
func (sm *SubscriptionManager) Subscribe(device *domain.Device, tags []*domain.Tag, config SubscriptionConfig) error {
	if !sm.running.Load() {
		return domain.ErrServiceNotStarted
	}

	sm.mu.Lock()
	defer sm.mu.Unlock()

	// Check if subscription already exists
	if _, exists := sm.subscriptions[device.ID]; exists {
		// Update existing subscription
		return sm.updateSubscription(device, tags, config)
	}

	// Create new subscription
	sub := &Subscription{
		Device:         device,
		Tags:           make(map[string]*domain.Tag),
		MonitoredItems: make(map[string]uint32),
		LastValues:     make(map[string]*domain.DataPoint),
		publishInterval: config.PublishInterval,
	}

	for _, tag := range tags {
		sub.Tags[tag.ID] = tag
	}

	sm.subscriptions[device.ID] = sub

	// Create OPC UA subscription
	if err := sm.createOPCSubscription(sub, config); err != nil {
		delete(sm.subscriptions, device.ID)
		return err
	}

	sub.active.Store(true)
	sm.logger.Info().
		Str("device_id", device.ID).
		Int("tags", len(tags)).
		Dur("publish_interval", config.PublishInterval).
		Msg("Created subscription")

	return nil
}

// Unsubscribe removes a subscription for a device.
func (sm *SubscriptionManager) Unsubscribe(deviceID string) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	return sm.unsubscribeDevice(deviceID)
}

// unsubscribeDevice removes a subscription (must hold lock).
func (sm *SubscriptionManager) unsubscribeDevice(deviceID string) error {
	sub, exists := sm.subscriptions[deviceID]
	if !exists {
		return domain.ErrDeviceNotFound
	}

	sub.active.Store(false)

	// Note: The OPC UA client library handles cleanup when the client disconnects
	// For now, we just mark the subscription as inactive

	delete(sm.subscriptions, deviceID)
	sm.logger.Info().Str("device_id", deviceID).Msg("Removed subscription")

	return nil
}

// createOPCSubscription creates the actual OPC UA subscription.
func (sm *SubscriptionManager) createOPCSubscription(sub *Subscription, config SubscriptionConfig) error {
	if !sm.client.IsConnected() {
		return domain.ErrConnectionClosed
	}

	sm.client.mu.RLock()
	client := sm.client.client
	sm.client.mu.RUnlock()

	if client == nil {
		return domain.ErrConnectionClosed
	}

	// Build monitored item requests
	itemsToCreate := make([]*ua.MonitoredItemCreateRequest, 0, len(sub.Tags))

	for _, tag := range sub.Tags {
		nodeID, err := sm.client.getNodeID(tag.OPCNodeID)
		if err != nil {
			sm.logger.Warn().
				Err(err).
				Str("tag_id", tag.ID).
				Str("node_id", tag.OPCNodeID).
				Msg("Failed to parse node ID, skipping tag")
			continue
		}

		// Build monitored item request
		req := &ua.MonitoredItemCreateRequest{
			ItemToMonitor: &ua.ReadValueID{
				NodeID:       nodeID,
				AttributeID:  ua.AttributeIDValue,
				DataEncoding: &ua.QualifiedName{},
			},
			MonitoringMode: ua.MonitoringModeReporting,
			RequestedParameters: &ua.MonitoringParameters{
				ClientHandle:     uint32(len(itemsToCreate)),
				SamplingInterval: float64(config.SamplingInterval.Milliseconds()),
				QueueSize:        config.QueueSize,
				DiscardOldest:    config.DiscardOldest,
			},
		}

		// Add deadband filter if specified
		if config.DeadbandType != "None" && config.DeadbandValue > 0 {
			req.RequestedParameters.Filter = sm.createDeadbandFilter(config)
		}

		itemsToCreate = append(itemsToCreate, req)
	}

	if len(itemsToCreate) == 0 {
		return fmt.Errorf("no valid tags to monitor")
	}

	// Create subscription on server
	notifyCh := make(chan *opcua.PublishNotificationData, 100)

	subReq := &ua.CreateSubscriptionRequest{
		RequestedPublishingInterval: float64(config.PublishInterval.Milliseconds()),
		RequestedLifetimeCount:      60,
		RequestedMaxKeepAliveCount:  20,
		MaxNotificationsPerPublish:  1000,
		PublishingEnabled:           true,
		Priority:                    0,
	}

	subResp, err := client.Subscribe(sm.ctx, subReq, notifyCh)
	if err != nil {
		return fmt.Errorf("%w: failed to create subscription: %v", domain.ErrOPCUASubscriptionFailed, err)
	}

	sub.ID = subResp.SubscriptionID

	// Create monitored items
	monItemReq := &ua.CreateMonitoredItemsRequest{
		SubscriptionID:     sub.ID,
		TimestampsToReturn: ua.TimestampsToReturnBoth,
		ItemsToCreate:      itemsToCreate,
	}

	monItemResp, err := client.CreateMonitoredItems(sm.ctx, monItemReq)
	if err != nil {
		// Clean up subscription
		client.DeleteSubscriptions(sm.ctx, &ua.DeleteSubscriptionsRequest{
			SubscriptionIDs: []uint32{sub.ID},
		})
		return fmt.Errorf("%w: failed to create monitored items: %v", domain.ErrOPCUASubscriptionFailed, err)
	}

	// Map monitored items to tags
	tagList := make([]*domain.Tag, 0, len(sub.Tags))
	for _, tag := range sub.Tags {
		tagList = append(tagList, tag)
	}

	for i, result := range monItemResp.Results {
		if result.StatusCode == ua.StatusOK && i < len(tagList) {
			sub.mu.Lock()
			sub.MonitoredItems[tagList[i].ID] = result.MonitoredItemID
			sub.mu.Unlock()
		} else if i < len(tagList) {
			sm.logger.Warn().
				Str("tag_id", tagList[i].ID).
				Uint32("status", uint32(result.StatusCode)).
				Msg("Failed to create monitored item")
		}
	}

	// Start notification handler
	sm.wg.Add(1)
	go sm.handleNotifications(sub, notifyCh, tagList)

	return nil
}

// handleNotifications processes incoming notifications from the subscription.
func (sm *SubscriptionManager) handleNotifications(sub *Subscription, notifyCh <-chan *opcua.PublishNotificationData, tags []*domain.Tag) {
	defer sm.wg.Done()

	sm.logger.Debug().
		Str("device_id", sub.Device.ID).
		Uint32("subscription_id", sub.ID).
		Msg("Starting notification handler")

	for {
		select {
		case <-sm.ctx.Done():
			return
		case notif, ok := <-notifyCh:
			if !ok {
				sm.logger.Debug().
					Str("device_id", sub.Device.ID).
					Msg("Notification channel closed")
				return
			}

			if !sub.active.Load() {
				continue
			}

			sm.processNotification(sub, notif, tags)
		}
	}
}

// processNotification processes a single notification.
func (sm *SubscriptionManager) processNotification(sub *Subscription, notif *opcua.PublishNotificationData, tags []*domain.Tag) {
	if notif == nil || notif.Value == nil {
		return
	}

	// Process data change notifications
	switch n := notif.Value.(type) {
	case *ua.DataChangeNotification:
		for _, item := range n.MonitoredItems {
			sm.processDataChange(sub, item, tags)
		}
	case *ua.EventNotificationList:
		// Handle events if needed in the future
		sm.logger.Debug().Msg("Received event notification (not processed)")
	}
}

// processDataChange processes a single data change.
func (sm *SubscriptionManager) processDataChange(sub *Subscription, item *ua.MonitoredItemNotification, tags []*domain.Tag) {
	// Find the tag for this monitored item
	var tag *domain.Tag
	sub.mu.RLock()
	for _, t := range tags {
		if mid, exists := sub.MonitoredItems[t.ID]; exists && mid == item.ClientHandle {
			tag = t
			break
		}
	}
	sub.mu.RUnlock()

	if tag == nil {
		// Try to find by client handle index
		if int(item.ClientHandle) < len(tags) {
			tag = tags[item.ClientHandle]
		}
	}

	if tag == nil {
		sm.logger.Warn().
			Uint32("client_handle", item.ClientHandle).
			Msg("Received notification for unknown tag")
		return
	}

	// Convert to data point
	dp := sm.client.processReadResult(item.Value, tag)
	dp.Topic = fmt.Sprintf("%s/%s", sub.Device.UNSPrefix, tag.TopicSuffix)

	// Update last value
	sub.mu.Lock()
	sub.LastValues[tag.ID] = dp
	sub.mu.Unlock()

	// Notify handler
	if sm.dataHandler != nil {
		sm.dataHandler(dp)
	}

	sm.client.stats.NotificationCount.Add(1)
}

// updateSubscription updates an existing subscription with new tags.
func (sm *SubscriptionManager) updateSubscription(device *domain.Device, tags []*domain.Tag, config SubscriptionConfig) error {
	sub := sm.subscriptions[device.ID]

	// Find new and removed tags
	newTags := make([]*domain.Tag, 0)
	existingTagIDs := make(map[string]bool)

	for _, tag := range tags {
		existingTagIDs[tag.ID] = true
		if _, exists := sub.Tags[tag.ID]; !exists {
			newTags = append(newTags, tag)
		}
	}

	// Note: For simplicity, we recreate the subscription
	// A more optimized implementation would add/remove individual monitored items
	sm.unsubscribeDevice(device.ID)
	return sm.Subscribe(device, tags, config)
}

// createDeadbandFilter creates an OPC UA deadband filter.
func (sm *SubscriptionManager) createDeadbandFilter(config SubscriptionConfig) *ua.ExtensionObject {
	var deadbandType uint32
	switch config.DeadbandType {
	case "Absolute":
		deadbandType = 1 // AbsoluteDeadband
	case "Percent":
		deadbandType = 2 // PercentDeadband
	default:
		return nil
	}

	filter := &ua.DataChangeFilter{
		Trigger:       ua.DataChangeTriggerStatusValue,
		DeadbandType:  deadbandType,
		DeadbandValue: config.DeadbandValue,
	}

	return &ua.ExtensionObject{
		TypeID: &ua.ExpandedNodeID{
			NodeID: ua.NewNumericNodeID(0, uint32(ua.DataChangeFilterType_Encoding_DefaultBinary)),
		},
		Value: filter,
	}
}

// GetSubscription returns a subscription by device ID.
func (sm *SubscriptionManager) GetSubscription(deviceID string) (*Subscription, bool) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	sub, exists := sm.subscriptions[deviceID]
	return sub, exists
}

// GetLastValue returns the last received value for a tag.
func (sm *SubscriptionManager) GetLastValue(deviceID, tagID string) (*domain.DataPoint, bool) {
	sm.mu.RLock()
	sub, exists := sm.subscriptions[deviceID]
	sm.mu.RUnlock()

	if !exists {
		return nil, false
	}

	sub.mu.RLock()
	defer sub.mu.RUnlock()

	dp, exists := sub.LastValues[tagID]
	return dp, exists
}

// Stats returns subscription statistics.
func (sm *SubscriptionManager) Stats() SubscriptionStats {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	stats := SubscriptionStats{
		TotalSubscriptions: len(sm.subscriptions),
	}

	for _, sub := range sm.subscriptions {
		sub.mu.RLock()
		stats.TotalMonitoredItems += len(sub.MonitoredItems)
		if sub.active.Load() {
			stats.ActiveSubscriptions++
		}
		sub.mu.RUnlock()
	}

	return stats
}

// SubscriptionStats contains subscription statistics.
type SubscriptionStats struct {
	TotalSubscriptions  int
	ActiveSubscriptions int
	TotalMonitoredItems int
}

