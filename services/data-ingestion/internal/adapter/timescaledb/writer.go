package timescaledb

import (
	"context"
	"fmt"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nexus-edge/data-ingestion/internal/domain"
	"github.com/nexus-edge/data-ingestion/internal/metrics"
	"github.com/rs/zerolog"
)

// WriterConfig contains TimescaleDB writer configuration
type WriterConfig struct {
	Host            string
	Port            int
	Database        string
	User            string
	Password        string
	PoolSize        int
	MaxIdleTime     time.Duration
	UseCopyProtocol bool
	MaxRetries      int           // Max retries for failed writes (default: 3)
	RetryDelay      time.Duration // Base delay between retries (default: 100ms)
}

// Writer handles batch writing to TimescaleDB
type Writer struct {
	pool    *pgxpool.Pool
	config  WriterConfig
	logger  zerolog.Logger
	metrics *metrics.Registry

	batchesWritten atomic.Uint64
	pointsWritten  atomic.Uint64
	writeErrors    atomic.Uint64
	retriesTotal   atomic.Uint64
	totalWriteTime atomic.Int64
}

// NewWriter creates a new TimescaleDB writer
func NewWriter(ctx context.Context, config WriterConfig, logger zerolog.Logger, metricsReg *metrics.Registry) (*Writer, error) {
	// Apply defaults
	if config.MaxRetries <= 0 {
		config.MaxRetries = 3
	}
	if config.RetryDelay <= 0 {
		config.RetryDelay = 100 * time.Millisecond
	}

	connString := fmt.Sprintf(
		"postgres://%s:%s@%s:%d/%s?pool_max_conns=%d&pool_max_conn_idle_time=%s",
		config.User,
		config.Password,
		config.Host,
		config.Port,
		config.Database,
		config.PoolSize,
		config.MaxIdleTime.String(),
	)

	poolConfig, err := pgxpool.ParseConfig(connString)
	if err != nil {
		return nil, fmt.Errorf("failed to parse connection string: %w", err)
	}

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	// Test connection
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	w := &Writer{
		pool:    pool,
		config:  config,
		logger:  logger.With().Str("component", "timescaledb-writer").Logger(),
		metrics: metricsReg,
	}

	w.logger.Info().
		Str("host", config.Host).
		Int("port", config.Port).
		Str("database", config.Database).
		Int("pool_size", config.PoolSize).
		Bool("use_copy", config.UseCopyProtocol).
		Int("max_retries", config.MaxRetries).
		Msg("TimescaleDB writer initialized")

	return w, nil
}

// WriteBatch writes a batch of data points to the database with retry logic
func (w *Writer) WriteBatch(ctx context.Context, batch *domain.Batch) error {
	if batch.Size() == 0 {
		return nil
	}

	startTime := time.Now()
	var err error
	var lastErr error

	// Retry loop with exponential backoff
	for attempt := 0; attempt <= w.config.MaxRetries; attempt++ {
		if attempt > 0 {
			w.retriesTotal.Add(1)
			delay := w.calculateBackoff(attempt)
			w.logger.Debug().
				Int("attempt", attempt).
				Dur("delay", delay).
				Msg("Retrying database write")

			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(delay):
			}
		}

		if w.config.UseCopyProtocol {
			err = w.writeBatchCopy(ctx, batch)
		} else {
			err = w.writeBatchInsert(ctx, batch)
		}

		if err == nil {
			break
		}

		lastErr = err

		// Check if error is retryable (connection errors, timeouts)
		if !w.isRetryableError(err) {
			break
		}
	}

	duration := time.Since(startTime)
	w.totalWriteTime.Add(duration.Nanoseconds())

	if err != nil {
		w.writeErrors.Add(1)
		w.metrics.IncWriteErrors()
		w.logger.Error().
			Err(lastErr).
			Int("batch_size", batch.Size()).
			Dur("duration", duration).
			Int("attempts", w.config.MaxRetries+1).
			Msg("Failed to write batch after retries")
		return lastErr
	}

	w.batchesWritten.Add(1)
	w.pointsWritten.Add(uint64(batch.Size()))
	w.metrics.AddPointsWritten(int64(batch.Size()))
	w.metrics.ObserveBatchDuration(duration.Seconds())

	w.logger.Debug().
		Int("batch_size", batch.Size()).
		Dur("duration", duration).
		Msg("Batch written successfully")

	return nil
}

// calculateBackoff returns exponential backoff delay
func (w *Writer) calculateBackoff(attempt int) time.Duration {
	delay := w.config.RetryDelay * time.Duration(1<<uint(attempt-1))
	maxDelay := 5 * time.Second
	if delay > maxDelay {
		delay = maxDelay
	}
	return delay
}

// isRetryableError checks if an error is transient and worth retrying
func (w *Writer) isRetryableError(err error) bool {
	if err == nil {
		return false
	}
	// Retry on connection errors, timeouts, and pool exhaustion
	errStr := err.Error()
	retryable := []string{
		"connection refused",
		"connection reset",
		"timeout",
		"i/o timeout",
		"pool closed",
		"too many clients",
	}
	for _, r := range retryable {
		if contains(errStr, r) {
			return true
		}
	}
	return false
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsLower(s, substr))
}

func containsLower(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// writeBatchCopy uses the COPY protocol for maximum performance
func (w *Writer) writeBatchCopy(ctx context.Context, batch *domain.Batch) error {
	columns := []string{"time", "topic", "value", "value_str", "quality", "metadata"}

	_, err := w.pool.CopyFrom(
		ctx,
		pgx.Identifier{"metrics"},
		columns,
		pgx.CopyFromSlice(len(batch.Points), func(i int) ([]any, error) {
			dp := batch.Points[i]

			// Build metadata JSON
			metadata := buildMetadata(dp)

			return []any{
				dp.Timestamp,
				dp.Topic,
				dp.Value,    // Can be nil
				dp.ValueStr, // Can be nil
				dp.Quality,
				metadata,
			}, nil
		}),
	)

	return err
}

// writeBatchInsert uses optimized batch INSERT for compatibility
func (w *Writer) writeBatchInsert(ctx context.Context, batch *domain.Batch) error {
	if len(batch.Points) == 0 {
		return nil
	}

	// Use pgx batch for efficient multi-insert
	pgxBatch := &pgx.Batch{}
	query := `INSERT INTO metrics (time, topic, value, value_str, quality, metadata) VALUES ($1, $2, $3, $4, $5, $6)`

	for _, dp := range batch.Points {
		metadata := buildMetadata(dp)
		pgxBatch.Queue(query, dp.Timestamp, dp.Topic, dp.Value, dp.ValueStr, dp.Quality, metadata)
	}

	// Execute batch in a single round-trip
	results := w.pool.SendBatch(ctx, pgxBatch)
	defer results.Close()

	// Check all results for errors
	for i := 0; i < pgxBatch.Len(); i++ {
		_, err := results.Exec()
		if err != nil {
			return fmt.Errorf("failed to insert row %d: %w", i, err)
		}
	}

	return nil
}

// buildMetadata creates a JSONB metadata object
func buildMetadata(dp *domain.DataPoint) map[string]interface{} {
	metadata := make(map[string]interface{})

	if dp.DeviceID != "" {
		metadata["device_id"] = dp.DeviceID
	}
	if dp.TagID != "" {
		metadata["tag_id"] = dp.TagID
	}
	if dp.Unit != "" {
		metadata["unit"] = dp.Unit
	}
	if dp.SourceTimestamp != nil {
		metadata["source_ts"] = dp.SourceTimestamp.Format(time.RFC3339Nano)
	}
	if dp.ServerTimestamp != nil {
		metadata["server_ts"] = dp.ServerTimestamp.Format(time.RFC3339Nano)
	}

	return metadata
}

// IsHealthy checks if the database connection is healthy
func (w *Writer) IsHealthy(ctx context.Context) bool {
	return w.pool.Ping(ctx) == nil
}

// Stats returns writer statistics
func (w *Writer) Stats() map[string]interface{} {
	poolStats := w.pool.Stat()

	avgWriteTimeNs := int64(0)
	if w.batchesWritten.Load() > 0 {
		avgWriteTimeNs = w.totalWriteTime.Load() / int64(w.batchesWritten.Load())
	}

	return map[string]interface{}{
		"batches_written":   w.batchesWritten.Load(),
		"points_written":    w.pointsWritten.Load(),
		"write_errors":      w.writeErrors.Load(),
		"retries_total":     w.retriesTotal.Load(),
		"avg_write_time_ms": float64(avgWriteTimeNs) / 1e6,
		"pool_total_conns":  poolStats.TotalConns(),
		"pool_idle_conns":   poolStats.IdleConns(),
		"pool_acquired":     poolStats.AcquiredConns(),
	}
}

// Close closes the connection pool
func (w *Writer) Close() {
	w.pool.Close()
	w.logger.Info().Msg("TimescaleDB writer closed")
}

