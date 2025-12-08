package domain

import (
	"encoding/json"
	"sync"
	"time"
)

// Object pools to reduce GC pressure in high-throughput scenarios
var (
	dataPointPool = sync.Pool{
		New: func() interface{} { return &DataPoint{} },
	}
	batchPool = sync.Pool{
		New: func() interface{} { return &Batch{Points: make([]*DataPoint, 0, 5000)} },
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
type MQTTPayload struct {
	Value           interface{} `json:"value"`
	Quality         int16       `json:"quality"`
	Unit            string      `json:"unit,omitempty"`
	Timestamp       string      `json:"timestamp"`
	SourceTimestamp string      `json:"source_timestamp,omitempty"`
	ServerTimestamp string      `json:"server_timestamp,omitempty"`
	DeviceID        string      `json:"device_id,omitempty"`
	TagID           string      `json:"tag_id,omitempty"`
}

// ParsePayload parses an MQTT message payload into a DataPoint
func ParsePayload(topic string, payload []byte, receivedAt time.Time) (*DataPoint, error) {
	var p MQTTPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return nil, err
	}

	dp := &DataPoint{
		Topic:      topic,
		DeviceID:   p.DeviceID,
		TagID:      p.TagID,
		Quality:    p.Quality,
		Unit:       p.Unit,
		ReceivedAt: receivedAt,
	}

	// Parse value - can be numeric or string
	switch v := p.Value.(type) {
	case float64:
		dp.Value = &v
	case int:
		f := float64(v)
		dp.Value = &f
	case int64:
		f := float64(v)
		dp.Value = &f
	case string:
		dp.ValueStr = &v
	case bool:
		if v {
			f := float64(1)
			dp.Value = &f
		} else {
			f := float64(0)
			dp.Value = &f
		}
	}

	// Parse timestamps
	if p.Timestamp != "" {
		if ts, err := time.Parse(time.RFC3339Nano, p.Timestamp); err == nil {
			dp.Timestamp = ts
		} else if ts, err := time.Parse(time.RFC3339, p.Timestamp); err == nil {
			dp.Timestamp = ts
		} else {
			dp.Timestamp = receivedAt
		}
	} else {
		dp.Timestamp = receivedAt
	}

	if p.SourceTimestamp != "" {
		if ts, err := time.Parse(time.RFC3339Nano, p.SourceTimestamp); err == nil {
			dp.SourceTimestamp = &ts
		}
	}

	if p.ServerTimestamp != "" {
		if ts, err := time.Parse(time.RFC3339Nano, p.ServerTimestamp); err == nil {
			dp.ServerTimestamp = &ts
		}
	}

	// Set default quality if not provided
	if dp.Quality == 0 {
		dp.Quality = 192 // OPC UA Good quality
	}

	return dp, nil
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

// AcquireBatch gets a Batch from the pool and initializes it.
// This reduces GC pressure in high-throughput scenarios.
// Remember to call ReleaseBatch() when done.
func AcquireBatch(capacity int) *Batch {
	b := batchPool.Get().(*Batch)
	b.Points = b.Points[:0] // Reset length but keep capacity
	b.CreatedAt = time.Now()
	return b
}

// ReleaseBatch returns a Batch to the pool for reuse.
// After calling this, the Batch should not be used anymore.
func ReleaseBatch(b *Batch) {
	if b == nil {
		return
	}
	// Clear references to allow GC of DataPoint objects
	for i := range b.Points {
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
func (b *Batch) Clear() {
	for i := range b.Points {
		b.Points[i] = nil
	}
	b.Points = b.Points[:0]
	b.CreatedAt = time.Now()
}

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

