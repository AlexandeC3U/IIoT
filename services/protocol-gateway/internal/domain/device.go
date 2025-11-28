// Package domain contains the core business entities and interfaces.
// These are protocol-agnostic and represent the core concepts of the system.
package domain

import (
	"time"
)

// DeviceStatus represents the current operational status of a device.
type DeviceStatus string

const (
	DeviceStatusOnline      DeviceStatus = "online"
	DeviceStatusOffline     DeviceStatus = "offline"
	DeviceStatusConnecting  DeviceStatus = "connecting"
	DeviceStatusError       DeviceStatus = "error"
	DeviceStatusUnknown     DeviceStatus = "unknown"
)

// Protocol represents the communication protocol type.
type Protocol string

const (
	ProtocolModbusTCP Protocol = "modbus-tcp"
	ProtocolModbusRTU Protocol = "modbus-rtu"
	ProtocolOPCUA     Protocol = "opcua"
	ProtocolS7        Protocol = "s7"
	ProtocolMQTT      Protocol = "mqtt"
)

// Device represents a connected industrial device.
type Device struct {
	// ID is the unique identifier for this device
	ID string `json:"id" yaml:"id"`

	// Name is a human-readable name for the device
	Name string `json:"name" yaml:"name"`

	// Description provides additional context about the device
	Description string `json:"description,omitempty" yaml:"description,omitempty"`

	// Protocol specifies the communication protocol
	Protocol Protocol `json:"protocol" yaml:"protocol"`

	// Connection holds protocol-specific connection parameters
	Connection ConnectionConfig `json:"connection" yaml:"connection"`

	// Tags defines the data points to be collected from this device
	Tags []Tag `json:"tags" yaml:"tags"`

	// PollInterval is the default polling interval for all tags (can be overridden per tag)
	PollInterval time.Duration `json:"poll_interval" yaml:"poll_interval"`

	// Enabled indicates whether this device should be actively polled
	Enabled bool `json:"enabled" yaml:"enabled"`

	// UNSPrefix is the Unified Namespace prefix for this device's topics
	// e.g., "plant1/area2/line3/device1"
	UNSPrefix string `json:"uns_prefix" yaml:"uns_prefix"`

	// Metadata contains additional key-value pairs for this device
	Metadata map[string]string `json:"metadata,omitempty" yaml:"metadata,omitempty"`

	// CreatedAt is when this device configuration was created
	CreatedAt time.Time `json:"created_at" yaml:"created_at"`

	// UpdatedAt is when this device configuration was last modified
	UpdatedAt time.Time `json:"updated_at" yaml:"updated_at"`
}

// ConnectionConfig holds protocol-specific connection parameters.
type ConnectionConfig struct {
	// Host is the IP address or hostname of the device
	Host string `json:"host,omitempty" yaml:"host,omitempty"`

	// Port is the TCP port number
	Port int `json:"port,omitempty" yaml:"port,omitempty"`

	// SlaveID is the Modbus slave/unit ID (1-247)
	SlaveID uint8 `json:"slave_id,omitempty" yaml:"slave_id,omitempty"`

	// SerialPort is the serial port path for RTU connections (e.g., "/dev/ttyUSB0")
	SerialPort string `json:"serial_port,omitempty" yaml:"serial_port,omitempty"`

	// BaudRate is the serial baud rate for RTU connections
	BaudRate int `json:"baud_rate,omitempty" yaml:"baud_rate,omitempty"`

	// DataBits is the number of data bits for RTU connections (5, 6, 7, or 8)
	DataBits int `json:"data_bits,omitempty" yaml:"data_bits,omitempty"`

	// Parity is the parity setting for RTU connections ("N", "E", "O")
	Parity string `json:"parity,omitempty" yaml:"parity,omitempty"`

	// StopBits is the number of stop bits for RTU connections (1 or 2)
	StopBits int `json:"stop_bits,omitempty" yaml:"stop_bits,omitempty"`

	// Timeout is the connection/response timeout
	Timeout time.Duration `json:"timeout,omitempty" yaml:"timeout,omitempty"`

	// RetryCount is the number of retry attempts on failure
	RetryCount int `json:"retry_count,omitempty" yaml:"retry_count,omitempty"`

	// RetryDelay is the delay between retry attempts
	RetryDelay time.Duration `json:"retry_delay,omitempty" yaml:"retry_delay,omitempty"`
}

// Validate performs validation on the device configuration.
func (d *Device) Validate() error {
	if d.ID == "" {
		return ErrDeviceIDRequired
	}
	if d.Name == "" {
		return ErrDeviceNameRequired
	}
	if d.Protocol == "" {
		return ErrProtocolRequired
	}
	if len(d.Tags) == 0 {
		return ErrNoTagsDefined
	}
	if d.PollInterval < time.Millisecond*100 {
		return ErrPollIntervalTooShort
	}
	if d.UNSPrefix == "" {
		return ErrUNSPrefixRequired
	}
	return nil
}

// GetAddress returns the full address string for this device.
func (d *Device) GetAddress() string {
	if d.Connection.Host != "" {
		return d.Connection.Host
	}
	return d.Connection.SerialPort
}

