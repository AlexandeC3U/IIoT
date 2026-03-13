package timescaledb

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nexus-edge/data-ingestion/internal/domain"
	"github.com/nexus-edge/data-ingestion/internal/metrics"
	"github.com/rs/zerolog"
	"github.com/sony/gobreaker/v2"
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
	WriteTimeout    time.Duration // Per-operation DB deadline (default: 30s)
	ConnectTimeout  time.Duration // Pool connection dial deadline (default: 10s)
}

// Writer handles batch writing to TimescaleDB
type Writer struct {
	pool    *pgxpool.Pool
	config  WriterConfig
	logger  zerolog.Logger
	metrics *metrics.Registry
	breaker *gobreaker.CircuitBreaker[any]

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
	if config.WriteTimeout <= 0 {
		config.WriteTimeout = 30 * time.Second
	}
	if config.ConnectTimeout <= 0 {
		config.ConnectTimeout = 10 * time.Second
	}

	// Build a key-value DSN so that passwords with special characters
	// (e.g. @, #, %) are never URL-encoded or URL-decoded incorrectly.
	// Using an explicit DSN also ensures non-default ports are respected
	// (ParseConfig("") ignores programmatic Port overrides in some pgx versions).
	dsn := fmt.Sprintf(
		"host=%s port=%d dbname=%s user=%s password=%s connect_timeout=%d",
		config.Host, config.Port, config.Database, config.User, config.Password,
		int(config.ConnectTimeout.Seconds()),
	)
	poolConfig, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to create pool config: %w", err)
	}
	poolConfig.MaxConns = int32(config.PoolSize)
	poolConfig.MaxConnIdleTime = config.MaxIdleTime

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

	w.breaker = gobreaker.NewCircuitBreaker[any](gobreaker.Settings{
		Name:        "timescaledb-writer",
		MaxRequests: 2,                // half-open: allow 2 test batches
		Interval:    30 * time.Second, // reset failure count every 30s
		Timeout:     10 * time.Second, // stay open for 10s before half-open
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			return counts.ConsecutiveFailures >= 5
		},
		OnStateChange: func(name string, from, to gobreaker.State) {
			w.logger.Warn().
				Str("from", from.String()).
				Str("to", to.String()).
				Msg("Circuit breaker state change")
			w.metrics.SetCircuitBreakerState(to.String())
		},
	})

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

// WriteBatch writes a batch of data points to the database.
// The call is guarded by a circuit breaker: after 5 consecutive failures the
// breaker opens and subsequent calls return gobreaker.ErrOpenState immediately
// (no retry delay, no DB connection attempt) until the breaker transitions to
// half-open after its timeout.
func (w *Writer) WriteBatch(ctx context.Context, batch *domain.Batch) error {
	if batch.Size() == 0 {
		return nil
	}
	_, err := w.breaker.Execute(func() (any, error) {
		return nil, w.writeBatchWithRetry(ctx, batch)
	})
	return err
}

// writeBatchWithRetry contains the retry loop for database writes.
// It is called inside the circuit breaker.
func (w *Writer) writeBatchWithRetry(ctx context.Context, batch *domain.Batch) error {
	startTime := time.Now()
	var err error
	var lastErr error

	// Retry loop with exponential backoff
	for attempt := 0; attempt <= w.config.MaxRetries; attempt++ {
		if attempt > 0 {
			w.retriesTotal.Add(1)
			w.metrics.IncRetries()
			delay := w.calculateBackoff(attempt)
			w.logger.Debug().
				Int("attempt", attempt).
				Dur("delay", delay).
				Msg("Retrying database write")

			timer := time.NewTimer(delay)
			select {
			case <-ctx.Done():
				timer.Stop()
				return ctx.Err()
			case <-timer.C:
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

	// Use the last point's ReceivedAt as a representative lag sample.
	if len(batch.Points) > 0 {
		lag := time.Since(batch.Points[len(batch.Points)-1].ReceivedAt).Seconds()
		w.metrics.SetIngestionLag(lag)
	}

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

// isRetryableError checks if an error is transient and worth retrying.
// PostgreSQL errors are checked by SQLSTATE class code (authoritative).
// Non-PG errors fall back to string matching.
func (w *Writer) isRetryableError(err error) bool {
	if err == nil {
		return false
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		// SQLSTATE codes are always 5 chars; first 2 chars = class.
		switch pgErr.Code[:2] {
		case "08": // connection_exception
			return true
		case "40": // transaction_rollback (includes serialization failures)
			return true
		case "53": // insufficient_resources (e.g. too_many_connections)
			return true
		case "57": // operator_intervention (e.g. query_canceled, admin_shutdown)
			return true
		}
		// All other PG errors (constraint violations, syntax errors, etc.)
		// are not transient — retrying will not help.
		return false
	}

	// Non-PG errors: connection-level failures where no SQLSTATE is available.
	errLower := strings.ToLower(err.Error())
	for _, r := range []string{
		"connection refused",
		"connection reset",
		"timeout",
		"i/o timeout",
		"pool closed",
		"too many clients",
		"broken pipe",
	} {
		if strings.Contains(errLower, r) {
			return true
		}
	}
	return false
}

// writeBatchCopy uses the COPY protocol for maximum performance
func (w *Writer) writeBatchCopy(ctx context.Context, batch *domain.Batch) error {
	writeCtx, cancel := context.WithTimeout(ctx, w.config.WriteTimeout)
	defer cancel()

	columns := []string{"time", "topic", "value", "value_str", "quality", "metadata"}

	_, err := w.pool.CopyFrom(
		writeCtx,
		pgx.Identifier{"metrics"},
		columns,
		pgx.CopyFromSlice(len(batch.Points), func(i int) ([]any, error) {
			dp := batch.Points[i]

			// Build metadata JSON
			metadata := buildMetadataJSON(dp)

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

	writeCtx, cancel := context.WithTimeout(ctx, w.config.WriteTimeout)
	defer cancel()

	// Use pgx batch for efficient multi-insert
	pgxBatch := &pgx.Batch{}
	query := `INSERT INTO metrics (time, topic, value, value_str, quality, metadata) VALUES ($1, $2, $3, $4, $5, $6)`

	for _, dp := range batch.Points {
		metadata := buildMetadataJSON(dp)
		pgxBatch.Queue(query, dp.Timestamp, dp.Topic, dp.Value, dp.ValueStr, dp.Quality, metadata)
	}

	// Execute batch in a single round-trip
	results := w.pool.SendBatch(writeCtx, pgxBatch)
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

// buildMetadataJSON serializes metadata fields directly to JSON bytes,
// avoiding a map[string]interface{} allocation per data point.
// For 5000-point batches this eliminates 5000 map allocations + their
// internal bucket arrays, significantly reducing GC pressure.
func buildMetadataJSON(dp *domain.DataPoint) []byte {
	// Typical metadata is 80-120 bytes; pre-allocate to avoid growth.
	buf := make([]byte, 0, 128)
	buf = append(buf, '{')
	first := true

	if dp.DeviceID != "" {
		buf = appendJSONField(buf, first, "device_id", dp.DeviceID)
		first = false
	}
	if dp.TagID != "" {
		buf = appendJSONField(buf, first, "tag_id", dp.TagID)
		first = false
	}
	if dp.Unit != "" {
		buf = appendJSONField(buf, first, "unit", dp.Unit)
		first = false
	}
	if dp.SourceTimestamp != nil {
		buf = appendJSONField(buf, first, "source_ts", dp.SourceTimestamp.Format(time.RFC3339Nano))
		first = false
	}
	if dp.ServerTimestamp != nil {
		buf = appendJSONField(buf, first, "server_ts", dp.ServerTimestamp.Format(time.RFC3339Nano))
	}

	buf = append(buf, '}')
	return buf
}

// appendJSONField appends a "key":"value" pair to buf.
// Values are identifier-like strings (device IDs, tag IDs, units, RFC3339
// timestamps) that never contain characters requiring JSON escaping.
func appendJSONField(buf []byte, first bool, key, value string) []byte {
	if !first {
		buf = append(buf, ',')
	}
	buf = append(buf, '"')
	buf = append(buf, key...)
	buf = append(buf, '"', ':')
	buf = append(buf, '"')
	buf = append(buf, value...)
	buf = append(buf, '"')
	return buf
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

// Pool exposes the underlying connection pool for read-only query handlers.
func (w *Writer) Pool() *pgxpool.Pool {
	return w.pool
}
