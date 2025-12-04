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
	totalWriteTime atomic.Int64
}

// NewWriter creates a new TimescaleDB writer
func NewWriter(ctx context.Context, config WriterConfig, logger zerolog.Logger, metricsReg *metrics.Registry) (*Writer, error) {
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
		Msg("TimescaleDB writer initialized")

	return w, nil
}

// WriteBatch writes a batch of data points to the database
func (w *Writer) WriteBatch(ctx context.Context, batch *domain.Batch) error {
	if batch.Size() == 0 {
		return nil
	}

	startTime := time.Now()
	var err error

	if w.config.UseCopyProtocol {
		err = w.writeBatchCopy(ctx, batch)
	} else {
		err = w.writeBatchInsert(ctx, batch)
	}

	duration := time.Since(startTime)
	w.totalWriteTime.Add(duration.Nanoseconds())

	if err != nil {
		w.writeErrors.Add(1)
		w.metrics.IncWriteErrors()
		w.logger.Error().
			Err(err).
			Int("batch_size", batch.Size()).
			Dur("duration", duration).
			Msg("Failed to write batch")
		return err
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

// writeBatchInsert uses standard INSERT for compatibility
func (w *Writer) writeBatchInsert(ctx context.Context, batch *domain.Batch) error {
	// Build batch insert query
	query := `
		INSERT INTO metrics (time, topic, value, value_str, quality, metadata)
		VALUES ($1, $2, $3, $4, $5, $6)
	`

	// Use a transaction for the batch
	tx, err := w.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	for _, dp := range batch.Points {
		metadata := buildMetadata(dp)

		_, err := tx.Exec(ctx, query,
			dp.Timestamp,
			dp.Topic,
			dp.Value,
			dp.ValueStr,
			dp.Quality,
			metadata,
		)
		if err != nil {
			return fmt.Errorf("failed to insert row: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
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

