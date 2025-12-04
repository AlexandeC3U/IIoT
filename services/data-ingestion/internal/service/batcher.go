package service

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/nexus-edge/data-ingestion/internal/adapter/timescaledb"
	"github.com/nexus-edge/data-ingestion/internal/domain"
	"github.com/nexus-edge/data-ingestion/internal/metrics"
	"github.com/rs/zerolog"
)

// BatcherConfig contains batcher configuration
type BatcherConfig struct {
	BatchSize     int
	FlushInterval time.Duration
	WriterCount   int
}

// Batcher accumulates data points into batches for efficient writing
type Batcher struct {
	config  BatcherConfig
	writer  *timescaledb.Writer
	logger  zerolog.Logger
	metrics *metrics.Registry

	// Channel for incoming points
	pointsChan chan *domain.DataPoint

	// Channel for completed batches
	batchChan chan *domain.Batch

	// Current batch being accumulated
	currentBatch *domain.Batch
	batchMu      sync.Mutex

	// Stats
	batchesFlushed atomic.Uint64
	pointsBatched  atomic.Uint64

	// Lifecycle
	ctx      context.Context
	cancel   context.CancelFunc
	wg       sync.WaitGroup
	stopOnce sync.Once
}

// NewBatcher creates a new batcher
func NewBatcher(
	config BatcherConfig,
	writer *timescaledb.Writer,
	logger zerolog.Logger,
	metricsReg *metrics.Registry,
) *Batcher {
	return &Batcher{
		config:     config,
		writer:     writer,
		logger:     logger.With().Str("component", "batcher").Logger(),
		metrics:    metricsReg,
		pointsChan: make(chan *domain.DataPoint, config.BatchSize*2),
		batchChan:  make(chan *domain.Batch, config.WriterCount*2),
	}
}

// Start begins the batching and writing goroutines
func (b *Batcher) Start(ctx context.Context) {
	b.ctx, b.cancel = context.WithCancel(ctx)
	b.currentBatch = domain.NewBatch(b.config.BatchSize)

	// Start batch accumulator
	b.wg.Add(1)
	go b.accumulatorLoop()

	// Start writer workers
	for i := 0; i < b.config.WriterCount; i++ {
		b.wg.Add(1)
		go b.writerLoop(i)
	}

	b.logger.Info().
		Int("batch_size", b.config.BatchSize).
		Dur("flush_interval", b.config.FlushInterval).
		Int("writers", b.config.WriterCount).
		Msg("Batcher started")
}

// Stop gracefully stops the batcher, flushing remaining data
func (b *Batcher) Stop(ctx context.Context) error {
	var stopErr error

	b.stopOnce.Do(func() {
		b.logger.Info().Msg("Stopping batcher...")

		// Signal accumulator to stop
		b.cancel()

		// Close points channel
		close(b.pointsChan)

		// Wait for everything to finish
		done := make(chan struct{})
		go func() {
			b.wg.Wait()
			close(done)
		}()

		select {
		case <-done:
			b.logger.Info().Msg("Batcher stopped")
		case <-ctx.Done():
			b.logger.Warn().Msg("Batcher stop timeout")
			stopErr = ctx.Err()
		}
	})

	return stopErr
}

// Add adds a data point to be batched
func (b *Batcher) Add(dp *domain.DataPoint) {
	select {
	case b.pointsChan <- dp:
		// Successfully added
	case <-b.ctx.Done():
		// Shutting down
	}
}

// accumulatorLoop accumulates points into batches
func (b *Batcher) accumulatorLoop() {
	defer b.wg.Done()
	defer b.flushAndClose()

	ticker := time.NewTicker(b.config.FlushInterval)
	defer ticker.Stop()

	for {
		select {
		case dp, ok := <-b.pointsChan:
			if !ok {
				// Channel closed, exit
				return
			}
			b.addToBatch(dp)

		case <-ticker.C:
			b.flushIfNotEmpty()

		case <-b.ctx.Done():
			// Drain remaining points
			for dp := range b.pointsChan {
				b.addToBatch(dp)
			}
			return
		}
	}
}

// addToBatch adds a point to the current batch, flushing if full
func (b *Batcher) addToBatch(dp *domain.DataPoint) {
	b.batchMu.Lock()
	defer b.batchMu.Unlock()

	b.currentBatch.Add(dp)
	b.pointsBatched.Add(1)

	if b.currentBatch.Size() >= b.config.BatchSize {
		b.flush()
	}
}

// flushIfNotEmpty flushes the current batch if it has any points
func (b *Batcher) flushIfNotEmpty() {
	b.batchMu.Lock()
	defer b.batchMu.Unlock()

	if b.currentBatch.Size() > 0 {
		b.flush()
	}
}

// flush sends the current batch to writers and creates a new one
// Must be called with batchMu held
func (b *Batcher) flush() {
	batch := b.currentBatch
	b.currentBatch = domain.NewBatch(b.config.BatchSize)

	b.batchesFlushed.Add(1)
	b.metrics.IncBatchesFlushed()

	select {
	case b.batchChan <- batch:
		// Successfully queued for writing
	case <-b.ctx.Done():
		// Shutting down, try to write directly
		if err := b.writer.WriteBatch(context.Background(), batch); err != nil {
			b.logger.Error().Err(err).Msg("Failed to write batch during shutdown")
		}
	}
}

// flushAndClose flushes any remaining data and closes the batch channel
func (b *Batcher) flushAndClose() {
	b.batchMu.Lock()
	if b.currentBatch.Size() > 0 {
		b.flush()
	}
	b.batchMu.Unlock()

	close(b.batchChan)
}

// writerLoop processes batches and writes to the database
func (b *Batcher) writerLoop(id int) {
	defer b.wg.Done()

	logger := b.logger.With().Int("writer_id", id).Logger()
	logger.Debug().Msg("Writer started")

	for batch := range b.batchChan {
		if err := b.writer.WriteBatch(b.ctx, batch); err != nil {
			logger.Error().
				Err(err).
				Int("batch_size", batch.Size()).
				Msg("Failed to write batch")
		}
	}

	logger.Debug().Msg("Writer stopped")
}

// Stats returns batcher statistics
func (b *Batcher) Stats() map[string]interface{} {
	b.batchMu.Lock()
	currentBatchSize := b.currentBatch.Size()
	currentBatchAge := b.currentBatch.Age().Milliseconds()
	b.batchMu.Unlock()

	return map[string]interface{}{
		"batches_flushed":    b.batchesFlushed.Load(),
		"points_batched":     b.pointsBatched.Load(),
		"current_batch_size": currentBatchSize,
		"current_batch_age":  currentBatchAge,
		"pending_batches":    len(b.batchChan),
	}
}

