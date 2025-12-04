package health

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/nexus-edge/data-ingestion/internal/adapter/mqtt"
	"github.com/nexus-edge/data-ingestion/internal/adapter/timescaledb"
	"github.com/rs/zerolog"
)

// Checker provides health check endpoints
type Checker struct {
	subscriber *mqtt.Subscriber
	writer     *timescaledb.Writer
	logger     zerolog.Logger
}

// NewChecker creates a new health checker
func NewChecker(subscriber *mqtt.Subscriber, writer *timescaledb.Writer, logger zerolog.Logger) *Checker {
	return &Checker{
		subscriber: subscriber,
		writer:     writer,
		logger:     logger.With().Str("component", "health-checker").Logger(),
	}
}

// HealthResponse represents the health check response
type HealthResponse struct {
	Status     string            `json:"status"`
	Timestamp  string            `json:"timestamp"`
	Components map[string]string `json:"components"`
}

// HealthHandler returns the overall health status
func (c *Checker) HealthHandler(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	mqttStatus := "healthy"
	if !c.subscriber.IsConnected() {
		mqttStatus = "unhealthy"
	}

	dbStatus := "healthy"
	if !c.writer.IsHealthy(ctx) {
		dbStatus = "unhealthy"
	}

	overallStatus := "healthy"
	if mqttStatus != "healthy" || dbStatus != "healthy" {
		overallStatus = "degraded"
	}

	response := HealthResponse{
		Status:    overallStatus,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Components: map[string]string{
			"mqtt":        mqttStatus,
			"timescaledb": dbStatus,
		},
	}

	w.Header().Set("Content-Type", "application/json")

	if overallStatus != "healthy" {
		w.WriteHeader(http.StatusServiceUnavailable)
	}

	json.NewEncoder(w).Encode(response)
}

// LiveHandler returns 200 if the process is running
func (c *Checker) LiveHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status":    "alive",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

// ReadyHandler returns 200 if the service is ready to accept traffic
func (c *Checker) ReadyHandler(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	mqttReady := c.subscriber.IsConnected()
	dbReady := c.writer.IsHealthy(ctx)

	ready := mqttReady && dbReady

	w.Header().Set("Content-Type", "application/json")

	if !ready {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":    "not_ready",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
			"mqtt":      mqttReady,
			"database":  dbReady,
		})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status":    "ready",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

