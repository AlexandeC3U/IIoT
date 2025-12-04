package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Registry holds all Prometheus metrics
type Registry struct {
	pointsReceived  prometheus.Counter
	pointsDropped   prometheus.Counter
	pointsWritten   prometheus.Counter
	parseErrors     prometheus.Counter
	writeErrors     prometheus.Counter
	batchesFlushed  prometheus.Counter
	batchDuration   prometheus.Histogram
	bufferUsage     prometheus.Gauge
	ingestionLag    prometheus.Gauge
}

// NewRegistry creates a new metrics registry
func NewRegistry() *Registry {
	return &Registry{
		pointsReceived: promauto.NewCounter(prometheus.CounterOpts{
			Name: "data_ingestion_points_received_total",
			Help: "Total number of data points received from MQTT",
		}),
		pointsDropped: promauto.NewCounter(prometheus.CounterOpts{
			Name: "data_ingestion_points_dropped_total",
			Help: "Total number of data points dropped due to buffer full",
		}),
		pointsWritten: promauto.NewCounter(prometheus.CounterOpts{
			Name: "data_ingestion_points_written_total",
			Help: "Total number of data points written to TimescaleDB",
		}),
		parseErrors: promauto.NewCounter(prometheus.CounterOpts{
			Name: "data_ingestion_parse_errors_total",
			Help: "Total number of message parse errors",
		}),
		writeErrors: promauto.NewCounter(prometheus.CounterOpts{
			Name: "data_ingestion_write_errors_total",
			Help: "Total number of database write errors",
		}),
		batchesFlushed: promauto.NewCounter(prometheus.CounterOpts{
			Name: "data_ingestion_batches_flushed_total",
			Help: "Total number of batches flushed",
		}),
		batchDuration: promauto.NewHistogram(prometheus.HistogramOpts{
			Name:    "data_ingestion_batch_duration_seconds",
			Help:    "Duration of batch write operations",
			Buckets: []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0},
		}),
		bufferUsage: promauto.NewGauge(prometheus.GaugeOpts{
			Name: "data_ingestion_buffer_usage",
			Help: "Current buffer usage (0-1)",
		}),
		ingestionLag: promauto.NewGauge(prometheus.GaugeOpts{
			Name: "data_ingestion_lag_seconds",
			Help: "Lag between data timestamp and write time",
		}),
	}
}

// IncPointsReceived increments the points received counter
func (r *Registry) IncPointsReceived() {
	r.pointsReceived.Inc()
}

// IncPointsDropped increments the points dropped counter
func (r *Registry) IncPointsDropped() {
	r.pointsDropped.Inc()
}

// AddPointsWritten adds to the points written counter
func (r *Registry) AddPointsWritten(count int64) {
	r.pointsWritten.Add(float64(count))
}

// IncParseErrors increments the parse errors counter
func (r *Registry) IncParseErrors() {
	r.parseErrors.Inc()
}

// IncWriteErrors increments the write errors counter
func (r *Registry) IncWriteErrors() {
	r.writeErrors.Inc()
}

// IncBatchesFlushed increments the batches flushed counter
func (r *Registry) IncBatchesFlushed() {
	r.batchesFlushed.Inc()
}

// ObserveBatchDuration records a batch write duration
func (r *Registry) ObserveBatchDuration(seconds float64) {
	r.batchDuration.Observe(seconds)
}

// SetBufferUsage sets the current buffer usage
func (r *Registry) SetBufferUsage(usage float64) {
	r.bufferUsage.Set(usage)
}

// SetIngestionLag sets the current ingestion lag
func (r *Registry) SetIngestionLag(seconds float64) {
	r.ingestionLag.Set(seconds)
}

