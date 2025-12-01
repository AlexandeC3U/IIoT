// Package service provides the core polling service that orchestrates
// reading data from devices and publishing to MQTT.
package service

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/nexus-edge/protocol-gateway/internal/domain"
	"github.com/nexus-edge/protocol-gateway/internal/metrics"
	"github.com/rs/zerolog"
)

// Publisher interface defines the methods needed for publishing data.
type Publisher interface {
	Publish(ctx context.Context, dataPoint *domain.DataPoint) error
	PublishBatch(ctx context.Context, dataPoints []*domain.DataPoint) error
}

// PollingService orchestrates reading data from devices and publishing to MQTT.
// It supports multiple protocols through the ProtocolManager.
type PollingService struct {
	config          PollingConfig
	protocolManager *domain.ProtocolManager
	publisher       Publisher
	logger          zerolog.Logger
	metrics         *metrics.Registry
	devices         map[string]*devicePoller
	mu              sync.RWMutex
	started         atomic.Bool
	ctx             context.Context
	cancel          context.CancelFunc
	wg              sync.WaitGroup
	workerPool      chan struct{}
	stats           *PollingStats
}

// PollingConfig holds configuration for the polling service.
type PollingConfig struct {
	WorkerCount     int
	BatchSize       int
	DefaultInterval time.Duration
	MaxRetries      int
	ShutdownTimeout time.Duration
}

// PollingStats tracks polling statistics.
type PollingStats struct {
	TotalPolls     atomic.Uint64
	SuccessPolls   atomic.Uint64
	FailedPolls    atomic.Uint64
	PointsRead     atomic.Uint64
	PointsPublished atomic.Uint64
}

// devicePoller manages polling for a single device.
type devicePoller struct {
	device     *domain.Device
	stopChan   chan struct{}
	running    atomic.Bool
	lastPoll   time.Time
	lastError  error
	stats      deviceStats
	mu         sync.RWMutex
}

// deviceStats tracks per-device statistics.
type deviceStats struct {
	pollCount    atomic.Uint64
	errorCount   atomic.Uint64
	pointsRead   atomic.Uint64
}

// NewPollingService creates a new polling service.
func NewPollingService(
	config PollingConfig,
	protocolManager *domain.ProtocolManager,
	publisher Publisher,
	logger zerolog.Logger,
	metricsReg *metrics.Registry,
) *PollingService {
	// Apply defaults
	if config.WorkerCount <= 0 {
		config.WorkerCount = 10
	}
	if config.BatchSize <= 0 {
		config.BatchSize = 50
	}
	if config.DefaultInterval <= 0 {
		config.DefaultInterval = 1 * time.Second
	}
	if config.ShutdownTimeout <= 0 {
		config.ShutdownTimeout = 30 * time.Second
	}

	return &PollingService{
		config:          config,
		protocolManager: protocolManager,
		publisher:       publisher,
		logger:          logger.With().Str("component", "polling-service").Logger(),
		metrics:         metricsReg,
		devices:         make(map[string]*devicePoller),
		workerPool:      make(chan struct{}, config.WorkerCount),
		stats:           &PollingStats{},
	}
}

// Start begins the polling service.
func (s *PollingService) Start(ctx context.Context) error {
	if s.started.Load() {
		return nil
	}

	s.ctx, s.cancel = context.WithCancel(ctx)
	s.started.Store(true)

	s.mu.RLock()
	deviceCount := len(s.devices)
	s.mu.RUnlock()

	s.logger.Info().
		Int("devices", deviceCount).
		Int("workers", s.config.WorkerCount).
		Msg("Starting polling service")

	// Start polling for all registered devices
	s.mu.RLock()
	for _, dp := range s.devices {
		s.startDevicePoller(dp)
	}
	s.mu.RUnlock()

	return nil
}

// Stop gracefully stops the polling service.
func (s *PollingService) Stop(ctx context.Context) error {
	if !s.started.Load() {
		return nil
	}

	s.logger.Info().Msg("Stopping polling service")

	// Cancel context to signal all pollers to stop
	s.cancel()

	// Wait for all pollers with timeout
	done := make(chan struct{})
	go func() {
		s.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		s.logger.Info().Msg("All pollers stopped")
	case <-ctx.Done():
		s.logger.Warn().Msg("Timeout waiting for pollers to stop")
	}

	s.started.Store(false)
	return nil
}

// RegisterDevice registers a device for polling.
func (s *PollingService) RegisterDevice(ctx context.Context, device *domain.Device) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.devices[device.ID]; exists {
		return domain.ErrDeviceExists
	}

	if !device.Enabled {
		s.logger.Debug().Str("device_id", device.ID).Msg("Skipping disabled device")
		return nil
	}

	dp := &devicePoller{
		device:   device,
		stopChan: make(chan struct{}),
	}

	s.devices[device.ID] = dp

	s.logger.Info().
		Str("device_id", device.ID).
		Str("device_name", device.Name).
		Int("tags", len(device.Tags)).
		Dur("poll_interval", device.PollInterval).
		Msg("Registered device for polling")

	// If service is already started, start polling this device
	if s.started.Load() {
		s.startDevicePoller(dp)
	}

	return nil
}

// UnregisterDevice stops polling and removes a device.
func (s *PollingService) UnregisterDevice(deviceID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	dp, exists := s.devices[deviceID]
	if !exists {
		return domain.ErrDeviceNotFound
	}

	// Stop the poller
	if dp.running.Load() {
		close(dp.stopChan)
	}

	delete(s.devices, deviceID)

	s.logger.Info().Str("device_id", deviceID).Msg("Unregistered device")
	return nil
}

// startDevicePoller starts the polling loop for a device.
func (s *PollingService) startDevicePoller(dp *devicePoller) {
	if dp.running.Load() {
		return
	}

	dp.running.Store(true)
	s.wg.Add(1)

	go func() {
		defer s.wg.Done()
		defer dp.running.Store(false)

		s.logger.Debug().
			Str("device_id", dp.device.ID).
			Dur("interval", dp.device.PollInterval).
			Msg("Starting device poller")

		ticker := time.NewTicker(dp.device.PollInterval)
		defer ticker.Stop()

		// Initial poll
		s.pollDevice(dp)

		for {
			select {
			case <-s.ctx.Done():
				return
			case <-dp.stopChan:
				return
			case <-ticker.C:
				s.pollDevice(dp)
			}
		}
	}()
}

// pollDevice performs a single poll cycle for a device.
func (s *PollingService) pollDevice(dp *devicePoller) {
	// Acquire worker from pool
	select {
	case s.workerPool <- struct{}{}:
		defer func() { <-s.workerPool }()
	case <-s.ctx.Done():
		return
	}

	s.stats.TotalPolls.Add(1)
	dp.stats.pollCount.Add(1)

	startTime := time.Now()

	// Get enabled tags
	tags := s.getEnabledTags(dp.device)
	if len(tags) == 0 {
		return
	}

	// Read all tags from the device using the appropriate protocol
	ctx, cancel := context.WithTimeout(s.ctx, dp.device.Connection.Timeout*2)
	defer cancel()

	dataPoints, err := s.protocolManager.ReadTags(ctx, dp.device, tags)
	if err != nil {
		s.stats.FailedPolls.Add(1)
		dp.stats.errorCount.Add(1)
		dp.mu.Lock()
		dp.lastError = err
		dp.mu.Unlock()

		s.logger.Error().
			Err(err).
			Str("device_id", dp.device.ID).
			Msg("Failed to read tags")
		return
	}

	s.stats.SuccessPolls.Add(1)
	dp.mu.Lock()
	dp.lastPoll = time.Now()
	dp.lastError = nil
	dp.mu.Unlock()

	// Set topics and filter good data points
	goodPoints := make([]*domain.DataPoint, 0, len(dataPoints))
	for i, point := range dataPoints {
		if point != nil {
			// Set the full topic
			point.Topic = fmt.Sprintf("%s/%s", dp.device.UNSPrefix, tags[i].TopicSuffix)

			if point.Quality == domain.QualityGood {
				goodPoints = append(goodPoints, point)
			}
		}
	}

	s.stats.PointsRead.Add(uint64(len(dataPoints)))
	dp.stats.pointsRead.Add(uint64(len(dataPoints)))

	// Publish good data points
	if len(goodPoints) > 0 {
		if err := s.publisher.PublishBatch(ctx, goodPoints); err != nil {
			s.logger.Warn().
				Err(err).
				Str("device_id", dp.device.ID).
				Int("points", len(goodPoints)).
				Msg("Failed to publish some data points")
		} else {
			s.stats.PointsPublished.Add(uint64(len(goodPoints)))
		}
	}

	// Log poll completion
	s.logger.Debug().
		Str("device_id", dp.device.ID).
		Int("tags_read", len(dataPoints)).
		Int("good_points", len(goodPoints)).
		Dur("duration", time.Since(startTime)).
		Msg("Poll cycle completed")
}

// getEnabledTags returns only the enabled tags for a device.
func (s *PollingService) getEnabledTags(device *domain.Device) []*domain.Tag {
	tags := make([]*domain.Tag, 0, len(device.Tags))
	for i := range device.Tags {
		if device.Tags[i].Enabled {
			tags = append(tags, &device.Tags[i])
		}
	}
	return tags
}

// GetDeviceStatus returns the status of a device.
func (s *PollingService) GetDeviceStatus(deviceID string) (*DeviceStatus, error) {
	s.mu.RLock()
	dp, exists := s.devices[deviceID]
	s.mu.RUnlock()

	if !exists {
		return nil, domain.ErrDeviceNotFound
	}

	dp.mu.RLock()
	defer dp.mu.RUnlock()

	status := &DeviceStatus{
		DeviceID:   deviceID,
		DeviceName: dp.device.Name,
		Running:    dp.running.Load(),
		LastPoll:   dp.lastPoll,
		LastError:  dp.lastError,
		PollCount:  dp.stats.pollCount.Load(),
		ErrorCount: dp.stats.errorCount.Load(),
		PointsRead: dp.stats.pointsRead.Load(),
	}

	if dp.lastError == nil && !dp.lastPoll.IsZero() {
		status.Status = domain.DeviceStatusOnline
	} else if dp.lastError != nil {
		status.Status = domain.DeviceStatusError
	} else {
		status.Status = domain.DeviceStatusUnknown
	}

	return status, nil
}

// DeviceStatus holds the current status of a polled device.
type DeviceStatus struct {
	DeviceID   string
	DeviceName string
	Status     domain.DeviceStatus
	Running    bool
	LastPoll   time.Time
	LastError  error
	PollCount  uint64
	ErrorCount uint64
	PointsRead uint64
}

// Stats returns the polling service statistics.
func (s *PollingService) Stats() PollingStats {
	return PollingStats{
		TotalPolls:      s.stats.TotalPolls,
		SuccessPolls:    s.stats.SuccessPolls,
		FailedPolls:     s.stats.FailedPolls,
		PointsRead:      s.stats.PointsRead,
		PointsPublished: s.stats.PointsPublished,
	}
}

