package service

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

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
	subscriber domain.MQTTSubscriber
	writer     domain.BatchWriter
	logger     zerolog.Logger
	metrics    *metrics.Registry

	// Buffered channel for incoming data points
	pointsChan chan *domain.DataPoint

	// Batching
	batcher *Batcher

	// Stats
	pointsReceived      atomic.Uint64
	pointsDropped       atomic.Uint64
	droppedSinceLastLog atomic.Uint64
	startTime           time.Time

	// Lifecycle
	shutdownFlag atomic.Bool
	stopOnce     sync.Once
}

// NewIngestionService creates a new ingestion service
func NewIngestionService(
	config IngestionConfig,
	subscriber domain.MQTTSubscriber,
	writer domain.BatchWriter,
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

	// Batcher reads directly from s.pointsChan — no intermediate goroutine.
	s.batcher = NewBatcher(BatcherConfig{
		BatchSize:     s.config.BatchSize,
		FlushInterval: s.config.FlushInterval,
		WriterCount:   s.config.WriterCount,
	}, s.pointsChan, s.writer, s.logger, s.metrics)

	s.batcher.Start(ctx)

	// Rate-limited drop reporter: logs accumulated drop counts every 5s
	// instead of a per-message warn that would flood the log under backpressure.
	go s.dropReporter(ctx)

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

		// Phase 1: stop accepting new points from MQTT callbacks
		s.shutdownFlag.Store(true)

		// Phase 2: disconnect MQTT — stops broker delivery
		s.subscriber.Disconnect()

		// Phase 3: brief grace period for any in-flight onMessage callbacks
		// that passed the shutdownFlag check to finish their channel send.
		// Paho's Disconnect() waits for pending handlers, but this is belt-and-suspenders.
		time.Sleep(100 * time.Millisecond)

		// Phase 4: close the shared channel — accumulator exits via !ok
		close(s.pointsChan)

		// Phase 5: wait for batcher to flush all remaining data
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

// handleMessage is called for each incoming MQTT message.
//
// There is an inherent race between the shutdownFlag fast-path check and
// close(pointsChan) in Stop().  A Paho callback that passed the flag check
// can be suspended by the scheduler; if Stop() closes the channel before
// the goroutine resumes, the select/send panics (default only fires on a
// full channel, not a closed one).  The deferred recover() is the safety
// net that turns this into a silent discard rather than a process crash.
func (s *IngestionService) handleMessage(topic string, payload []byte, receivedAt time.Time) {
	defer func() {
		if r := recover(); r != nil {
			// Channel was closed during shutdown — discard the point.
			s.logger.Debug().
				Str("topic", topic).
				Msg("Message discarded: channel closed during shutdown")
		}
	}()

	// Fast path: reject messages after shutdown is initiated.
	if s.shutdownFlag.Load() {
		return
	}

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
		// Update buffer gauge on the successful path.
		// len() on a buffered channel is a cheap atomic read.
		s.metrics.SetBufferUsage(float64(len(s.pointsChan)) / float64(s.config.BufferSize))
	default:
		// Buffer full — accumulate the drop count; dropReporter logs in bulk.
		s.pointsDropped.Add(1)
		s.metrics.IncPointsDropped()
		s.droppedSinceLastLog.Add(1)
	}
}

// dropReporter batches drop-count log lines so a sustained backpressure
// episode produces one warn every 5 s instead of one per dropped message.
func (s *IngestionService) dropReporter(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			if dropped := s.droppedSinceLastLog.Swap(0); dropped > 0 {
				s.logger.Warn().
					Uint64("count", dropped).
					Msg("Data points dropped due to full buffer (last 5s)")
			}
		case <-ctx.Done():
			return
		}
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

