// Package service provides the core polling service that orchestrates
// reading data from devices and publishing to MQTT.
package service

import (
	"sync"
	"time"

	"github.com/nexus-edge/protocol-gateway/internal/domain"
)

// DeviceRateLimiter manages rate limiting for a single device.
// It uses a token bucket algorithm for flexible rate limiting.
type DeviceRateLimiter struct {
	config     domain.RateLimitConfig
	mu         sync.Mutex
	lastOp     time.Time
	tokens     float64
	maxTokens  float64
	refillRate float64 // tokens per nanosecond
}

// NewDeviceRateLimiter creates a rate limiter for a device.
func NewDeviceRateLimiter(config domain.RateLimitConfig) *DeviceRateLimiter {
	rl := &DeviceRateLimiter{
		config:    config,
		lastOp:    time.Time{}, // Allow first request immediately
		maxTokens: 1,
		tokens:    1, // Start with one token to allow first request
	}

	// Configure based on rate limit settings
	if config.BurstSize > 0 {
		rl.maxTokens = float64(config.BurstSize)
		rl.tokens = rl.maxTokens
	}

	// Calculate refill rate
	if config.MaxRequestsPerSecond > 0 {
		// tokens per nanosecond
		rl.refillRate = config.MaxRequestsPerSecond / float64(time.Second)
	} else if config.MinInterval > 0 {
		// If using MinInterval, calculate equivalent rate
		// 1 request per MinInterval
		rl.refillRate = 1.0 / float64(config.MinInterval)
	}

	return rl
}

// Allow checks if an operation is allowed under the rate limit.
// Returns:
//   - allowed: true if the operation can proceed
//   - waitTime: if not allowed and SkipOnLimit is false, how long to wait
func (rl *DeviceRateLimiter) Allow() (allowed bool, waitTime time.Duration) {
	if !rl.config.Enabled {
		return true, 0
	}

	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()

	// Refill tokens based on elapsed time
	if !rl.lastOp.IsZero() {
		elapsed := now.Sub(rl.lastOp)
		rl.tokens += float64(elapsed) * rl.refillRate
		if rl.tokens > rl.maxTokens {
			rl.tokens = rl.maxTokens
		}
	}

	// Check if we have enough tokens
	if rl.tokens >= 1.0 {
		rl.tokens -= 1.0
		rl.lastOp = now
		return true, 0
	}

	// Not enough tokens - calculate wait time
	tokensNeeded := 1.0 - rl.tokens
	if rl.refillRate > 0 {
		waitTime = time.Duration(tokensNeeded / rl.refillRate)
	} else {
		// Fallback to MinInterval
		waitTime = rl.config.MinInterval
	}

	return false, waitTime
}

// Wait blocks until an operation is allowed, or returns immediately if SkipOnLimit is true.
// Returns true if the operation should proceed, false if it should be skipped.
func (rl *DeviceRateLimiter) Wait() bool {
	allowed, waitTime := rl.Allow()
	if allowed {
		return true
	}

	if rl.config.SkipOnLimit {
		return false
	}

	// Wait for the required time
	time.Sleep(waitTime)

	// After waiting, we should be allowed
	rl.mu.Lock()
	rl.tokens = 0 // We're using our token now
	rl.lastOp = time.Now()
	rl.mu.Unlock()

	return true
}

// Record records that an operation was performed.
// Use this when you need to track operations without checking limits
// (e.g., for write operations that bypass the rate limiter but should still be counted).
func (rl *DeviceRateLimiter) Record() {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	rl.lastOp = time.Now()
}

// Reset resets the rate limiter state.
func (rl *DeviceRateLimiter) Reset() {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	rl.tokens = rl.maxTokens
	rl.lastOp = time.Time{}
}

// Stats returns current rate limiter statistics.
func (rl *DeviceRateLimiter) Stats() RateLimiterStats {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	return RateLimiterStats{
		Enabled:     rl.config.Enabled,
		Tokens:      rl.tokens,
		MaxTokens:   rl.maxTokens,
		LastOp:      rl.lastOp,
		SkipOnLimit: rl.config.SkipOnLimit,
	}
}

// RateLimiterStats contains rate limiter state for monitoring.
type RateLimiterStats struct {
	Enabled     bool
	Tokens      float64
	MaxTokens   float64
	LastOp      time.Time
	SkipOnLimit bool
}

// RateLimiterManager manages rate limiters for multiple devices.
type RateLimiterManager struct {
	limiters map[string]*DeviceRateLimiter
	mu       sync.RWMutex
}

// NewRateLimiterManager creates a new rate limiter manager.
func NewRateLimiterManager() *RateLimiterManager {
	return &RateLimiterManager{
		limiters: make(map[string]*DeviceRateLimiter),
	}
}

// GetOrCreate gets or creates a rate limiter for a device.
func (m *RateLimiterManager) GetOrCreate(deviceID string, config domain.RateLimitConfig) *DeviceRateLimiter {
	m.mu.Lock()
	defer m.mu.Unlock()

	if rl, exists := m.limiters[deviceID]; exists {
		return rl
	}

	rl := NewDeviceRateLimiter(config)
	m.limiters[deviceID] = rl
	return rl
}

// Get returns the rate limiter for a device, or nil if not found.
func (m *RateLimiterManager) Get(deviceID string) *DeviceRateLimiter {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.limiters[deviceID]
}

// Remove removes the rate limiter for a device.
func (m *RateLimiterManager) Remove(deviceID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.limiters, deviceID)
}

// UpdateConfig updates the rate limiter config for a device.
func (m *RateLimiterManager) UpdateConfig(deviceID string, config domain.RateLimitConfig) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Create new limiter with updated config
	m.limiters[deviceID] = NewDeviceRateLimiter(config)
}

// AllStats returns stats for all rate limiters.
func (m *RateLimiterManager) AllStats() map[string]RateLimiterStats {
	m.mu.RLock()
	defer m.mu.RUnlock()

	stats := make(map[string]RateLimiterStats, len(m.limiters))
	for id, rl := range m.limiters {
		stats[id] = rl.Stats()
	}
	return stats
}
