// Package modbus provides connection pooling for Modbus clients.
package modbus

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/nexus-edge/protocol-gateway/internal/domain"
	"github.com/nexus-edge/protocol-gateway/internal/metrics"
	"github.com/rs/zerolog"
	"github.com/sony/gobreaker"
)

// ConnectionPool manages a pool of Modbus client connections.
type ConnectionPool struct {
	config  PoolConfig
	clients map[string]*pooledClient
	mu      sync.RWMutex
	logger  zerolog.Logger
	metrics *metrics.Registry
	closed  bool
	wg      sync.WaitGroup
}

// pooledClient wraps a Client with pool-specific metadata and per-device circuit breaker.
// Per-device circuit breakers isolate failures - one misbehaving device won't affect others.
type pooledClient struct {
	client    *Client
	device    *domain.Device
	breaker   *gobreaker.CircuitBreaker // Per-device circuit breaker for isolation
	inUse     bool
	lastError error
	mu        sync.Mutex
}

// PoolConfig holds configuration for the connection pool.
type PoolConfig struct {
	// MaxConnections is the maximum number of concurrent connections
	MaxConnections int

	// IdleTimeout is how long to keep idle connections open
	IdleTimeout time.Duration

	// HealthCheckPeriod is how often to check connection health
	HealthCheckPeriod time.Duration

	// ConnectionTimeout is the timeout for establishing new connections
	ConnectionTimeout time.Duration

	// RetryAttempts is the number of retry attempts for failed operations
	RetryAttempts int

	// RetryDelay is the base delay between retries
	RetryDelay time.Duration

	// CircuitBreakerName is the name for the circuit breaker
	CircuitBreakerName string
}

// DefaultPoolConfig returns a PoolConfig with sensible defaults.
// MaxConnections defaults to 500 to support industrial-scale deployments (100-1000 devices).
func DefaultPoolConfig() PoolConfig {
	return PoolConfig{
		MaxConnections:     500,
		IdleTimeout:        5 * time.Minute,
		HealthCheckPeriod:  30 * time.Second,
		ConnectionTimeout:  10 * time.Second,
		RetryAttempts:      3,
		RetryDelay:         100 * time.Millisecond,
		CircuitBreakerName: "modbus-pool",
	}
}

// NewConnectionPool creates a new connection pool.
func NewConnectionPool(config PoolConfig, logger zerolog.Logger, metricsReg *metrics.Registry) *ConnectionPool {
	// Apply defaults - 500 to support industrial-scale deployments
	if config.MaxConnections == 0 {
		config.MaxConnections = 500
	}
	if config.IdleTimeout == 0 {
		config.IdleTimeout = 5 * time.Minute
	}
	if config.HealthCheckPeriod == 0 {
		config.HealthCheckPeriod = 30 * time.Second
	}
	if config.ConnectionTimeout == 0 {
		config.ConnectionTimeout = 10 * time.Second
	}

	pool := &ConnectionPool{
		config:  config,
		clients: make(map[string]*pooledClient),
		logger:  logger.With().Str("component", "modbus-pool").Logger(),
		metrics: metricsReg,
	}

	// Start background health checker
	pool.wg.Add(1)
	go pool.healthCheckLoop()

	// Start idle connection reaper
	pool.wg.Add(1)
	go pool.idleReaperLoop()

	return pool
}

// createCircuitBreaker creates a per-device circuit breaker.
// Per-device breakers ensure one failing device doesn't affect others.
func (p *ConnectionPool) createCircuitBreaker(deviceID string) *gobreaker.CircuitBreaker {
	return gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        fmt.Sprintf("modbus-%s", deviceID),
		MaxRequests: 3,
		Interval:    10 * time.Second,
		Timeout:     30 * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
			return counts.Requests >= 10 && failureRatio >= 0.6
		},
		OnStateChange: func(name string, from gobreaker.State, to gobreaker.State) {
			p.logger.Info().
				Str("device", name).
				Str("from", from.String()).
				Str("to", to.String()).
				Msg("Modbus circuit breaker state changed")
		},
	})
}

// getOrCreatePooledClient gets or creates a pooledClient with its per-device circuit breaker.
func (p *ConnectionPool) getOrCreatePooledClient(ctx context.Context, device *domain.Device) (*pooledClient, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.closed {
		return nil, domain.ErrServiceStopped
	}

	// Check if we already have a pooledClient for this device
	if pc, exists := p.clients[device.ID]; exists {
		return pc, nil
	}

	// Check pool capacity
	if len(p.clients) >= p.config.MaxConnections {
		return nil, domain.ErrPoolExhausted
	}

	// Create new client
	client, err := p.createClient(ctx, device)
	if err != nil {
		return nil, err
	}

	pc := &pooledClient{
		client:  client,
		device:  device,
		breaker: p.createCircuitBreaker(device.ID),
	}
	p.clients[device.ID] = pc

	p.logger.Info().
		Str("device_id", device.ID).
		Int("pool_size", len(p.clients)).
		Msg("Created new Modbus client with per-device circuit breaker")

	return pc, nil
}

// GetClient retrieves or creates a client for the given device.
// Uses getOrCreatePooledClient internally to ensure consistent circuit breaker setup.
func (p *ConnectionPool) GetClient(ctx context.Context, device *domain.Device) (*Client, error) {
	pc, err := p.getOrCreatePooledClient(ctx, device)
	if err != nil {
		return nil, err
	}

	pc.mu.Lock()
	defer pc.mu.Unlock()

	// Ensure client is connected
	if !pc.client.IsConnected() {
		if err := pc.client.Connect(ctx); err != nil {
			pc.lastError = err
			return nil, err
		}
	}

	return pc.client, nil
}

// createClient creates a new Modbus client for the device.
func (p *ConnectionPool) createClient(ctx context.Context, device *domain.Device) (*Client, error) {
	address := fmt.Sprintf("%s:%d", device.Connection.Host, device.Connection.Port)

	clientConfig := ClientConfig{
		Address:     address,
		SlaveID:     device.Connection.SlaveID,
		Timeout:     device.Connection.Timeout,
		IdleTimeout: p.config.IdleTimeout,
		MaxRetries:  device.Connection.RetryCount,
		RetryDelay:  device.Connection.RetryDelay,
		Protocol:    device.Protocol,
	}

	// Apply defaults
	if clientConfig.Timeout == 0 {
		clientConfig.Timeout = 5 * time.Second
	}
	if clientConfig.MaxRetries == 0 {
		clientConfig.MaxRetries = p.config.RetryAttempts
	}
	if clientConfig.RetryDelay == 0 {
		clientConfig.RetryDelay = p.config.RetryDelay
	}

	client, err := NewClient(device.ID, clientConfig, p.logger)
	if err != nil {
		return nil, err
	}

	// Connect with timeout
	connectCtx, cancel := context.WithTimeout(ctx, p.config.ConnectionTimeout)
	defer cancel()

	if err := client.Connect(connectCtx); err != nil {
		return nil, err
	}

	return client, nil
}

// ReadTags reads multiple tags from a device using the pooled connection.
// Uses per-device circuit breaker for fault isolation.
func (p *ConnectionPool) ReadTags(ctx context.Context, device *domain.Device, tags []*domain.Tag) ([]*domain.DataPoint, error) {
	// Get or create pooled client with per-device circuit breaker
	pc, err := p.getOrCreatePooledClient(ctx, device)
	if err != nil {
		return nil, err
	}

	// Use per-device circuit breaker
	result, err := pc.breaker.Execute(func() (interface{}, error) {
		pc.mu.Lock()
		defer pc.mu.Unlock()

		// Ensure client is connected
		if !pc.client.IsConnected() {
			if err := pc.client.Connect(ctx); err != nil {
				pc.lastError = err
				return nil, err
			}
		}
		return pc.client.ReadTags(ctx, tags)
	})
	if err != nil {
		if err == gobreaker.ErrOpenState {
			return nil, domain.ErrCircuitBreakerOpen
		}
		return nil, err
	}

	return result.([]*domain.DataPoint), nil
}

// ReadTag reads a single tag from a device.
// Uses per-device circuit breaker for fault isolation.
func (p *ConnectionPool) ReadTag(ctx context.Context, device *domain.Device, tag *domain.Tag) (*domain.DataPoint, error) {
	// Get or create pooled client with per-device circuit breaker
	pc, err := p.getOrCreatePooledClient(ctx, device)
	if err != nil {
		return nil, err
	}

	// Use per-device circuit breaker
	result, err := pc.breaker.Execute(func() (interface{}, error) {
		pc.mu.Lock()
		defer pc.mu.Unlock()

		// Ensure client is connected
		if !pc.client.IsConnected() {
			if err := pc.client.Connect(ctx); err != nil {
				pc.lastError = err
				return nil, err
			}
		}
		return pc.client.ReadTag(ctx, tag)
	})
	if err != nil {
		if err == gobreaker.ErrOpenState {
			return nil, domain.ErrCircuitBreakerOpen
		}
		return nil, err
	}

	return result.(*domain.DataPoint), nil
}

// WriteTag writes a value to a tag on the device.
// Uses per-device circuit breaker for fault isolation.
func (p *ConnectionPool) WriteTag(ctx context.Context, device *domain.Device, tag *domain.Tag, value interface{}) error {
	// Get or create pooled client with per-device circuit breaker
	pc, err := p.getOrCreatePooledClient(ctx, device)
	if err != nil {
		return err
	}

	// Use per-device circuit breaker
	_, err = pc.breaker.Execute(func() (interface{}, error) {
		pc.mu.Lock()
		defer pc.mu.Unlock()

		// Ensure client is connected
		if !pc.client.IsConnected() {
			if err := pc.client.Connect(ctx); err != nil {
				pc.lastError = err
				return nil, err
			}
		}
		return nil, pc.client.WriteTag(ctx, tag, value)
	})
	if err != nil {
		if err == gobreaker.ErrOpenState {
			return domain.ErrCircuitBreakerOpen
		}
		return err
	}

	return nil
}

// WriteSingleCoil writes a boolean value to a coil at the specified address.
// Uses per-device circuit breaker for fault isolation.
func (p *ConnectionPool) WriteSingleCoil(ctx context.Context, device *domain.Device, address uint16, value bool) error {
	// Get or create pooled client with per-device circuit breaker
	pc, err := p.getOrCreatePooledClient(ctx, device)
	if err != nil {
		return err
	}

	// Use per-device circuit breaker
	_, err = pc.breaker.Execute(func() (interface{}, error) {
		pc.mu.Lock()
		defer pc.mu.Unlock()

		// Ensure client is connected
		if !pc.client.IsConnected() {
			if err := pc.client.Connect(ctx); err != nil {
				pc.lastError = err
				return nil, err
			}
		}
		return nil, pc.client.WriteSingleCoil(ctx, address, value)
	})
	if err != nil {
		if err == gobreaker.ErrOpenState {
			return domain.ErrCircuitBreakerOpen
		}
		return err
	}

	return nil
}

// WriteSingleRegister writes a 16-bit value to a holding register.
// Uses per-device circuit breaker for fault isolation.
func (p *ConnectionPool) WriteSingleRegister(ctx context.Context, device *domain.Device, address uint16, value uint16) error {
	// Get or create pooled client with per-device circuit breaker
	pc, err := p.getOrCreatePooledClient(ctx, device)
	if err != nil {
		return err
	}

	// Use per-device circuit breaker
	_, err = pc.breaker.Execute(func() (interface{}, error) {
		pc.mu.Lock()
		defer pc.mu.Unlock()

		// Ensure client is connected
		if !pc.client.IsConnected() {
			if err := pc.client.Connect(ctx); err != nil {
				pc.lastError = err
				return nil, err
			}
		}
		return nil, pc.client.WriteSingleRegister(ctx, address, value)
	})
	if err != nil {
		if err == gobreaker.ErrOpenState {
			return domain.ErrCircuitBreakerOpen
		}
		return err
	}

	return nil
}

// WriteMultipleRegisters writes multiple 16-bit values to consecutive holding registers.
// Uses per-device circuit breaker for fault isolation.
func (p *ConnectionPool) WriteMultipleRegisters(ctx context.Context, device *domain.Device, address uint16, values []uint16) error {
	// Get or create pooled client with per-device circuit breaker
	pc, err := p.getOrCreatePooledClient(ctx, device)
	if err != nil {
		return err
	}

	// Use per-device circuit breaker
	_, err = pc.breaker.Execute(func() (interface{}, error) {
		pc.mu.Lock()
		defer pc.mu.Unlock()

		// Ensure client is connected
		if !pc.client.IsConnected() {
			if err := pc.client.Connect(ctx); err != nil {
				pc.lastError = err
				return nil, err
			}
		}
		return nil, pc.client.WriteMultipleRegisters(ctx, address, values)
	})
	if err != nil {
		if err == gobreaker.ErrOpenState {
			return domain.ErrCircuitBreakerOpen
		}
		return err
	}

	return nil
}

// WriteMultipleCoils writes multiple boolean values to consecutive coils.
// Uses per-device circuit breaker for fault isolation.
func (p *ConnectionPool) WriteMultipleCoils(ctx context.Context, device *domain.Device, address uint16, values []bool) error {
	// Get or create pooled client with per-device circuit breaker
	pc, err := p.getOrCreatePooledClient(ctx, device)
	if err != nil {
		return err
	}

	// Use per-device circuit breaker
	_, err = pc.breaker.Execute(func() (interface{}, error) {
		pc.mu.Lock()
		defer pc.mu.Unlock()

		// Ensure client is connected
		if !pc.client.IsConnected() {
			if err := pc.client.Connect(ctx); err != nil {
				pc.lastError = err
				return nil, err
			}
		}
		return nil, pc.client.WriteMultipleCoils(ctx, address, values)
	})
	if err != nil {
		if err == gobreaker.ErrOpenState {
			return domain.ErrCircuitBreakerOpen
		}
		return err
	}

	return nil
}

// RemoveClient removes a client from the pool and closes its connection.
func (p *ConnectionPool) RemoveClient(deviceID string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	pc, exists := p.clients[deviceID]
	if !exists {
		return domain.ErrDeviceNotFound
	}

	pc.mu.Lock()
	defer pc.mu.Unlock()

	if err := pc.client.Disconnect(); err != nil {
		p.logger.Warn().Err(err).Str("device_id", deviceID).Msg("Error disconnecting client")
	}

	delete(p.clients, deviceID)
	p.logger.Info().Str("device_id", deviceID).Msg("Removed client from pool")

	return nil
}

// Close closes all connections and stops the pool.
func (p *ConnectionPool) Close() error {
	p.mu.Lock()
	p.closed = true
	p.mu.Unlock()

	// Wait for background goroutines to stop
	p.wg.Wait()

	p.mu.Lock()
	defer p.mu.Unlock()

	var lastErr error
	for deviceID, pc := range p.clients {
		pc.mu.Lock()
		if err := pc.client.Disconnect(); err != nil {
			lastErr = err
			p.logger.Warn().Err(err).Str("device_id", deviceID).Msg("Error closing client")
		}
		pc.mu.Unlock()
	}

	p.clients = make(map[string]*pooledClient)
	p.logger.Info().Msg("Connection pool closed")

	return lastErr
}

// healthCheckLoop periodically checks the health of all connections.
func (p *ConnectionPool) healthCheckLoop() {
	defer p.wg.Done()

	ticker := time.NewTicker(p.config.HealthCheckPeriod)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			p.mu.RLock()
			if p.closed {
				p.mu.RUnlock()
				return
			}

			// Copy device IDs to avoid holding lock during health checks
			deviceIDs := make([]string, 0, len(p.clients))
			for id := range p.clients {
				deviceIDs = append(deviceIDs, id)
			}
			p.mu.RUnlock()

			for _, deviceID := range deviceIDs {
				p.checkClientHealth(deviceID)
			}
		}
	}
}

// checkClientHealth checks and potentially reconnects a client.
func (p *ConnectionPool) checkClientHealth(deviceID string) {
	p.mu.RLock()
	pc, exists := p.clients[deviceID]
	p.mu.RUnlock()

	if !exists {
		return
	}

	pc.mu.Lock()
	defer pc.mu.Unlock()

	if !pc.client.IsConnected() {
		p.logger.Debug().Str("device_id", deviceID).Msg("Client disconnected, attempting reconnect")

		ctx, cancel := context.WithTimeout(context.Background(), p.config.ConnectionTimeout)
		defer cancel()

		if err := pc.client.Connect(ctx); err != nil {
			pc.lastError = err
			p.logger.Warn().Err(err).Str("device_id", deviceID).Msg("Failed to reconnect client")
		} else {
			p.logger.Info().Str("device_id", deviceID).Msg("Client reconnected")
		}
	}
}

// idleReaperLoop removes idle connections that haven't been used.
func (p *ConnectionPool) idleReaperLoop() {
	defer p.wg.Done()

	ticker := time.NewTicker(p.config.IdleTimeout / 2)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			p.mu.RLock()
			if p.closed {
				p.mu.RUnlock()
				return
			}
			p.mu.RUnlock()

			p.reapIdleConnections()
		}
	}
}

// reapIdleConnections closes connections that have been idle too long.
func (p *ConnectionPool) reapIdleConnections() {
	p.mu.Lock()
	defer p.mu.Unlock()

	now := time.Now()
	for deviceID, pc := range p.clients {
		pc.mu.Lock()
		if now.Sub(pc.client.LastUsed()) > p.config.IdleTimeout {
			p.logger.Debug().Str("device_id", deviceID).Msg("Closing idle connection")
			pc.client.Disconnect()
			delete(p.clients, deviceID)
		}
		pc.mu.Unlock()
	}
}

// Stats returns pool statistics.
func (p *ConnectionPool) Stats() PoolStats {
	p.mu.RLock()
	defer p.mu.RUnlock()

	stats := PoolStats{
		TotalConnections: len(p.clients),
		MaxConnections:   p.config.MaxConnections,
	}

	for _, pc := range p.clients {
		pc.mu.Lock()
		if pc.client.IsConnected() {
			stats.ActiveConnections++
		}
		if pc.inUse {
			stats.InUseConnections++
		}
		pc.mu.Unlock()
	}

	return stats
}

// PoolStats contains pool statistics.
type PoolStats struct {
	TotalConnections  int
	ActiveConnections int
	InUseConnections  int
	MaxConnections    int
}

// HealthCheck implements the health.Checker interface.
// With per-device circuit breakers, the pool is considered healthy
// as long as the pool itself is operational (not all devices need to be healthy).
func (p *ConnectionPool) HealthCheck(ctx context.Context) error {
	p.mu.RLock()
	defer p.mu.RUnlock()

	if p.closed {
		return domain.ErrServiceStopped
	}

	// Pool is healthy if operational, even if some devices have open circuit breakers.
	// Individual device health is tracked separately via GetDeviceHealth.
	return nil
}

// GetDeviceHealth returns health information for a specific device.
func (p *ConnectionPool) GetDeviceHealth(deviceID string) (DeviceHealth, bool) {
	p.mu.RLock()
	pc, exists := p.clients[deviceID]
	p.mu.RUnlock()

	if !exists {
		return DeviceHealth{}, false
	}

	pc.mu.Lock()
	defer pc.mu.Unlock()

	return DeviceHealth{
		DeviceID:           deviceID,
		Connected:          pc.client.IsConnected(),
		CircuitBreakerOpen: pc.breaker.State() == gobreaker.StateOpen,
		LastError:          pc.lastError,
	}, true
}

// DeviceHealth contains health information for a single device.
type DeviceHealth struct {
	DeviceID           string
	Connected          bool
	CircuitBreakerOpen bool
	LastError          error
}
