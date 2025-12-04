package service

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/nexus-edge/data-ingestion/internal/adapter/mqtt"
	"github.com/nexus-edge/data-ingestion/internal/adapter/timescaledb"
	"github.com/nexus-edge/data-ingestion/internal/domain"
	"github.com/nexus-edge/data-ingestion/internal/metrics"
	"github.com/rs/zerolog"
)

// IngestionConfig contains ingestion service configuration
type IngestionConfig struct {
	BufferSize    int
	BatchSize     int
	FlushInterval time.Duration
	WriterCount   int
}

// IngestionService orchestrates data ingestion from MQTT to TimescaleDB
type IngestionService struct {
	config     IngestionConfig
	subscriber *mqtt.Subscriber
	writer     *timescaledb.Writer
	logger     zerolog.Logger
	metrics    *metrics.Registry

	// Buffered channel for incoming data points
	pointsChan chan *domain.DataPoint

	// Batching
	batcher *Batcher

	// Stats
	pointsReceived atomic.Uint64
	pointsDropped  atomic.Uint64
	startTime      time.Time

	// Lifecycle
	wg       sync.WaitGroup
	stopOnce sync.Once
}

// NewIngestionService creates a new ingestion service
func NewIngestionService(
	config IngestionConfig,
	subscriber *mqtt.Subscriber,
	writer *timescaledb.Writer,
	logger zerolog.Logger,
	metricsReg *metrics.Registry,
) *IngestionService {
	s := &IngestionService{
		config:     config,
		subscriber: subscriber,
		writer:     writer,
		logger:     logger.With().Str("component", "ingestion-service").Logger(),
		metrics:    metricsReg,
		pointsChan: make(chan *domain.DataPoint, config.BufferSize),
	}

	// Set up the MQTT message handler
	subscriber.SetHandler(s.handleMessage)

	return s
}

// Start begins the ingestion pipeline
func (s *IngestionService) Start(ctx context.Context) error {
	s.startTime = time.Now()

	// Connect to MQTT broker
	if err := s.subscriber.Connect(ctx); err != nil {
		return err
	}

	// Create batcher
	s.batcher = NewBatcher(BatcherConfig{
		BatchSize:     s.config.BatchSize,
		FlushInterval: s.config.FlushInterval,
		WriterCount:   s.config.WriterCount,
	}, s.writer, s.logger, s.metrics)

	// Start batcher workers
	s.batcher.Start(ctx)

	// Start point processor
	s.wg.Add(1)
	go s.processPoints(ctx)

	s.logger.Info().
		Int("buffer_size", s.config.BufferSize).
		Int("batch_size", s.config.BatchSize).
		Dur("flush_interval", s.config.FlushInterval).
		Int("writer_count", s.config.WriterCount).
		Msg("Ingestion service started")

	return nil
}

// Stop gracefully stops the ingestion service
func (s *IngestionService) Stop(ctx context.Context) error {
	var stopErr error

	s.stopOnce.Do(func() {
		s.logger.Info().Msg("Stopping ingestion service...")

		// Disconnect from MQTT (stops receiving new messages)
		s.subscriber.Disconnect()

		// Close the points channel to signal processor to stop
		close(s.pointsChan)

		// Wait for processor to finish
		done := make(chan struct{})
		go func() {
			s.wg.Wait()
			close(done)
		}()

		select {
		case <-done:
			s.logger.Info().Msg("Point processor stopped")
		case <-ctx.Done():
			s.logger.Warn().Msg("Point processor stop timeout")
		}

		// Stop batcher (flushes remaining batches)
		if err := s.batcher.Stop(ctx); err != nil {
			stopErr = err
		}

		s.logger.Info().
			Uint64("points_received", s.pointsReceived.Load()).
			Uint64("points_dropped", s.pointsDropped.Load()).
			Msg("Ingestion service stopped")
	})

	return stopErr
}

// handleMessage is called for each incoming MQTT message
func (s *IngestionService) handleMessage(topic string, payload []byte, receivedAt time.Time) {
	// Parse the message
	dp, err := s.subscriber.ParseMessage(topic, payload, receivedAt)
	if err != nil {
		s.logger.Warn().
			Err(err).
			Str("topic", topic).
			Msg("Failed to parse message")
		return
	}

	s.pointsReceived.Add(1)
	s.metrics.IncPointsReceived()

	// Try to send to channel (non-blocking)
	select {
	case s.pointsChan <- dp:
		// Successfully queued
	default:
		// Buffer full, drop the point
		s.pointsDropped.Add(1)
		s.metrics.IncPointsDropped()
		s.logger.Warn().
			Str("topic", topic).
			Msg("Buffer full, dropping data point")
	}
}

// processPoints reads from the channel and sends to batcher
func (s *IngestionService) processPoints(ctx context.Context) {
	defer s.wg.Done()

	for dp := range s.pointsChan {
		s.batcher.Add(dp)
	}
}

// StatusHandler returns current ingestion status
func (s *IngestionService) StatusHandler(w http.ResponseWriter, r *http.Request) {
	status := map[string]interface{}{
		"service":   "data-ingestion",
		"uptime":    time.Since(s.startTime).String(),
		"uptime_ms": time.Since(s.startTime).Milliseconds(),
		"ingestion": map[string]interface{}{
			"points_received":    s.pointsReceived.Load(),
			"points_dropped":     s.pointsDropped.Load(),
			"buffer_size":        s.config.BufferSize,
			"buffer_used":        len(s.pointsChan),
			"buffer_utilization": float64(len(s.pointsChan)) / float64(s.config.BufferSize) * 100,
		},
		"mqtt":     s.subscriber.Stats(),
		"database": s.writer.Stats(),
	}

	if s.batcher != nil {
		status["batcher"] = s.batcher.Stats()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

