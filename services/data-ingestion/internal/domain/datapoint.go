package domain

import (
	"fmt"
	"sync"
	"time"

	json "github.com/goccy/go-json"
)

const (
	MaxTopicLength   = 1024
	MaxPayloadSize   = 65536 // 64 KB
	MaxValueStrLen   = 4096
	MaxTimestampSkew = 1 * time.Hour
)

// DefaultBatchCapacity is the fallback pre-allocation size for pooled batches.
// Callers that know their configured BatchSize should use AcquireBatchWithCap
// instead so the pool matches the actual workload.
const DefaultBatchCapacity = 5000

// Object pools to reduce GC pressure in high-throughput scenarios
var (
	dataPointPool = sync.Pool{
		New: func() interface{} { return &DataPoint{} },
	}
	batchPool = sync.Pool{
		New: func() interface{} { return &Batch{Points: make([]*DataPoint, 0, DefaultBatchCapacity)} },
	}
)

// DataPoint represents a single measurement from a device
type DataPoint struct {
	// Topic is the MQTT topic this point was received on
	Topic string `json:"topic"`

	// DeviceID identifies the source device
	DeviceID string `json:"device_id"`

	// TagID identifies the specific tag/measurement
	TagID string `json:"tag_id"`

	// Value is the numeric value (nil if string value)
	Value *float64 `json:"value,omitempty"`

	// ValueStr is the string value (nil if numeric value)
	ValueStr *string `json:"value_str,omitempty"`

	// Quality indicates the data quality (OPC UA quality codes)
	Quality int16 `json:"quality"`

	// Unit is the engineering unit
	Unit string `json:"unit,omitempty"`

	// Timestamp is when the measurement was taken
	Timestamp time.Time `json:"timestamp"`

	// SourceTimestamp is the device's timestamp (if available)
	SourceTimestamp *time.Time `json:"source_timestamp,omitempty"`

	// ServerTimestamp is the gateway's timestamp
	ServerTimestamp *time.Time `json:"server_timestamp,omitempty"`

	// ReceivedAt is when this service received the message
	ReceivedAt time.Time `json:"-"`
}

// MQTTPayload represents the JSON structure from Protocol Gateway
// Uses compact field names to match the gateway's output format
type MQTTPayload struct {
	Value           interface{} `json:"v"`           // Compact: "v" for value
	Quality         string      `json:"q"`           // Compact: "q" for quality (string like "good", "bad")
	Unit            string      `json:"u,omitempty"` // Compact: "u" for unit
	Timestamp       int64       `json:"ts"`          // Compact: "ts" for timestamp (unix milliseconds)
	SourceTimestamp int64       `json:"source_ts,omitempty"`
	DeviceID        string      `json:"device_id,omitempty"`
	TagID           string      `json:"tag_id,omitempty"`
}

// ParsePayload parses an MQTT message payload into a DataPoint
func ParsePayload(topic string, payload []byte, receivedAt time.Time) (*DataPoint, error) {
	// Pre-acquisition guards — nothing to release on failure yet.
	if len(payload) > MaxPayloadSize {
		return nil, fmt.Errorf("payload too large: %d bytes (max %d)", len(payload), MaxPayloadSize)
	}
	if len(topic) > MaxTopicLength {
		return nil, fmt.Errorf("topic too long: %d chars (max %d)", len(topic), MaxTopicLength)
	}

	var p MQTTPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return nil, err
	}

	dp := AcquireDataPoint()
	dp.Topic = topic
	dp.DeviceID = p.DeviceID
	dp.TagID = p.TagID
	dp.Unit = p.Unit
	dp.ReceivedAt = receivedAt

	// Parse value - can be numeric, string, or bool.
	// json.Unmarshal always decodes JSON numbers as float64, so int/int64 cases
	// are unreachable and have been removed.
	switch v := p.Value.(type) {
	case float64:
		dp.Value = &v
	case string:
		dp.ValueStr = &v
	case bool:
		var f float64
		if v {
			f = 1
		}
		dp.Value = &f
	}

	// Post-acquisition validation — must release dp before returning an error.
	if dp.Value == nil && dp.ValueStr == nil {
		ReleaseDataPoint(dp)
		return nil, fmt.Errorf("neither value nor value_str present")
	}
	if dp.ValueStr != nil && len(*dp.ValueStr) > MaxValueStrLen {
		n := len(*dp.ValueStr)
		ReleaseDataPoint(dp)
		return nil, fmt.Errorf("value_str too long: %d chars (max %d)", n, MaxValueStrLen)
	}

	// Parse quality string to OPC UA quality code
	dp.Quality = qualityStringToCode(p.Quality)

	// Parse timestamp from unix milliseconds, validate skew.
	if p.Timestamp > 0 {
		dp.Timestamp = time.UnixMilli(p.Timestamp)
		if dp.Timestamp.After(receivedAt.Add(MaxTimestampSkew)) {
			ReleaseDataPoint(dp)
			return nil, fmt.Errorf("timestamp too far in future: %v", dp.Timestamp)
		}
		if dp.Timestamp.Before(receivedAt.Add(-30 * 24 * time.Hour)) {
			ReleaseDataPoint(dp)
			return nil, fmt.Errorf("timestamp too old: %v", dp.Timestamp)
		}
	} else {
		dp.Timestamp = receivedAt
	}

	// Parse source timestamp from unix milliseconds
	if p.SourceTimestamp > 0 {
		ts := time.UnixMilli(p.SourceTimestamp)
		dp.SourceTimestamp = &ts
	}

	return dp, nil
}

// qualityStringToCode converts a quality string to OPC UA quality code
func qualityStringToCode(q string) int16 {
	switch q {
	case "good":
		return 192 // OPC UA Good (0xC0)
	case "bad":
		return 0 // OPC UA Bad
	case "uncertain":
		return 64 // OPC UA Uncertain (0x40)
	case "not_connected", "config_error", "device_failure", "timeout":
		return 0 // OPC UA Bad
	default:
		return 192 // Default to Good
	}
}

// Batch represents a collection of data points to be written together
type Batch struct {
	Points    []*DataPoint
	CreatedAt time.Time
}

// NewBatch creates a new batch with the given capacity
func NewBatch(capacity int) *Batch {
	return &Batch{
		Points:    make([]*DataPoint, 0, capacity),
		CreatedAt: time.Now(),
	}
}

// AcquireBatch gets a Batch from the pool with the default capacity.
// Prefer AcquireBatchWithCap when the configured BatchSize is known.
func AcquireBatch() *Batch {
	return AcquireBatchWithCap(0)
}

// AcquireBatchWithCap gets a Batch from the pool and ensures it has at
// least the given capacity.  If cap is 0, the pool's default is used.
// This avoids wasting memory when BatchSize is small, and avoids extra
// allocations when BatchSize exceeds the pool's default.
func AcquireBatchWithCap(capacity int) *Batch {
	b := batchPool.Get().(*Batch)
	b.Points = b.Points[:0]
	if capacity > 0 && cap(b.Points) < capacity {
		b.Points = make([]*DataPoint, 0, capacity)
	}
	b.CreatedAt = time.Now()
	return b
}

// ReleaseBatch returns a Batch to the pool for reuse.
// After calling this, the Batch should not be used anymore.
func ReleaseBatch(b *Batch) {
	if b == nil {
		return
	}
	// Return each DataPoint to its pool, then nil the slot so the batch
	// slice does not prevent the underlying memory from being reused.
	for i := range b.Points {
		ReleaseDataPoint(b.Points[i])
		b.Points[i] = nil
	}
	b.Points = b.Points[:0]
	batchPool.Put(b)
}

// Add appends a data point to the batch
func (b *Batch) Add(dp *DataPoint) {
	b.Points = append(b.Points, dp)
}

// Size returns the number of points in the batch
func (b *Batch) Size() int {
	return len(b.Points)
}

// Age returns how long since the batch was created
func (b *Batch) Age() time.Duration {
	return time.Since(b.CreatedAt)
}

// Clear resets the batch for reuse
// Unused, but could be helpful if we want to reuse batches without returning them to the pool.
// func (b *Batch) Clear() {
// 	for i := range b.Points {
// 		b.Points[i] = nil
// 	}
// 	b.Points = b.Points[:0]
// 	b.CreatedAt = time.Now()
// }

// AcquireDataPoint gets a DataPoint from the pool and initializes it.
func AcquireDataPoint() *DataPoint {
	return dataPointPool.Get().(*DataPoint)
}

// ReleaseDataPoint returns a DataPoint to the pool for reuse.
func ReleaseDataPoint(dp *DataPoint) {
	if dp == nil {
		return
	}
	// Clear all fields
	dp.Topic = ""
	dp.DeviceID = ""
	dp.TagID = ""
	dp.Value = nil
	dp.ValueStr = nil
	dp.Quality = 0
	dp.Unit = ""
	dp.Timestamp = time.Time{}
	dp.SourceTimestamp = nil
	dp.ServerTimestamp = nil
	dp.ReceivedAt = time.Time{}
	dataPointPool.Put(dp)
}
