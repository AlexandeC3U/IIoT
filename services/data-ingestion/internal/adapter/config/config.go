package config

import (
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// expandEnvBraces expands only ${VAR} and ${VAR:default} patterns
// This preserves $share prefixes used in MQTT shared subscriptions
func expandEnvBraces(s string) string {
	// Match ${VAR} or ${VAR:default}
	re := regexp.MustCompile(`\$\{([^}:]+)(?::([^}]*))?\}`)
	return re.ReplaceAllStringFunc(s, func(match string) string {
		// Extract variable name and default value
		parts := re.FindStringSubmatch(match)
		if len(parts) < 2 {
			return match
		}
		varName := parts[1]
		defaultVal := ""
		if len(parts) >= 3 {
			defaultVal = parts[2]
		}

		// Get env var value or use default
		if val := os.Getenv(varName); val != "" {
			return val
		}
		return defaultVal
	})
}

// Config represents the complete service configuration
type Config struct {
	Service   ServiceConfig   `yaml:"service"`
	HTTP      HTTPConfig      `yaml:"http"`
	MQTT      MQTTConfig      `yaml:"mqtt"`
	Database  DatabaseConfig  `yaml:"database"`
	Ingestion IngestionConfig `yaml:"ingestion"`
	Logging   LoggingConfig   `yaml:"logging"`
}

// ServiceConfig contains service identification
type ServiceConfig struct {
	Name        string `yaml:"name"`
	Environment string `yaml:"environment"`
}

// HTTPConfig contains HTTP server settings
type HTTPConfig struct {
	Port         int           `yaml:"port"`
	ReadTimeout  time.Duration `yaml:"read_timeout"`
	WriteTimeout time.Duration `yaml:"write_timeout"`
	IdleTimeout  time.Duration `yaml:"idle_timeout"`
}

// MQTTConfig contains MQTT connection settings
type MQTTConfig struct {
	BrokerURL      string        `yaml:"broker_url"`
	ClientID       string        `yaml:"client_id"`
	Username       string        `yaml:"username"`
	Password       string        `yaml:"password"`
	Topics         []string      `yaml:"topics"`
	QoS            byte          `yaml:"qos"`
	KeepAlive      time.Duration `yaml:"keep_alive"`
	CleanSession   bool          `yaml:"clean_session"`
	ReconnectDelay time.Duration `yaml:"reconnect_delay"`
}

// DatabaseConfig contains TimescaleDB connection settings
type DatabaseConfig struct {
	Host        string        `yaml:"host"`
	Port        int           `yaml:"port"`
	Database    string        `yaml:"database"`
	User        string        `yaml:"user"`
	Password    string        `yaml:"password"`
	PoolSize    int           `yaml:"pool_size"`
	MaxIdleTime time.Duration `yaml:"max_idle_time"`
}

// IngestionConfig contains ingestion pipeline settings
type IngestionConfig struct {
	BufferSize      int           `yaml:"buffer_size"`
	BatchSize       int           `yaml:"batch_size"`
	FlushInterval   time.Duration `yaml:"flush_interval"`
	WriterCount     int           `yaml:"writer_count"`
	UseCopyProtocol bool          `yaml:"use_copy_protocol"`
}

// LoggingConfig contains logging settings
type LoggingConfig struct {
	Level  string `yaml:"level"`
	Format string `yaml:"format"`
}

// Load reads and parses the configuration file
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	// Expand environment variables (only ${VAR} syntax, not $VAR)
	// This preserves $share prefixes used in MQTT shared subscriptions
	expanded := expandEnvBraces(string(data))

	var cfg Config
	if err := yaml.Unmarshal([]byte(expanded), &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}

	// Apply defaults
	applyDefaults(&cfg)

	// Override with environment variables
	applyEnvOverrides(&cfg)

	// Validate configuration
	if err := validate(&cfg); err != nil {
		return nil, fmt.Errorf("invalid configuration: %w", err)
	}

	return &cfg, nil
}

func applyDefaults(cfg *Config) {
	if cfg.Service.Name == "" {
		cfg.Service.Name = "data-ingestion"
	}
	if cfg.Service.Environment == "" {
		cfg.Service.Environment = "development"
	}

	if cfg.HTTP.Port == 0 {
		cfg.HTTP.Port = 8080
	}
	if cfg.HTTP.ReadTimeout == 0 {
		cfg.HTTP.ReadTimeout = 10 * time.Second
	}
	if cfg.HTTP.WriteTimeout == 0 {
		cfg.HTTP.WriteTimeout = 10 * time.Second
	}
	if cfg.HTTP.IdleTimeout == 0 {
		cfg.HTTP.IdleTimeout = 60 * time.Second
	}

	if cfg.MQTT.BrokerURL == "" {
		cfg.MQTT.BrokerURL = "tcp://localhost:1883"
	}
	if cfg.MQTT.ClientID == "" {
		hostname, _ := os.Hostname()
		cfg.MQTT.ClientID = fmt.Sprintf("data-ingestion-%s", hostname)
	}
	if len(cfg.MQTT.Topics) == 0 {
		cfg.MQTT.Topics = []string{"$share/ingestion/dev/#", "$share/ingestion/uns/#"}
	}
	if cfg.MQTT.QoS == 0 {
		cfg.MQTT.QoS = 1
	}
	if cfg.MQTT.KeepAlive == 0 {
		cfg.MQTT.KeepAlive = 30 * time.Second
	}
	if cfg.MQTT.ReconnectDelay == 0 {
		cfg.MQTT.ReconnectDelay = 5 * time.Second
	}

	if cfg.Database.Host == "" {
		cfg.Database.Host = "localhost"
	}
	if cfg.Database.Port == 0 {
		cfg.Database.Port = 5432
	}
	if cfg.Database.Database == "" {
		cfg.Database.Database = "nexus_historian"
	}
	if cfg.Database.User == "" {
		cfg.Database.User = "nexus_ingestion"
	}
	if cfg.Database.PoolSize == 0 {
		cfg.Database.PoolSize = 10
	}
	if cfg.Database.MaxIdleTime == 0 {
		cfg.Database.MaxIdleTime = 5 * time.Minute
	}

	if cfg.Ingestion.BufferSize == 0 {
		cfg.Ingestion.BufferSize = 50000
	}
	if cfg.Ingestion.BatchSize == 0 {
		cfg.Ingestion.BatchSize = 5000
	}
	if cfg.Ingestion.FlushInterval == 0 {
		cfg.Ingestion.FlushInterval = 100 * time.Millisecond
	}
	if cfg.Ingestion.WriterCount == 0 {
		cfg.Ingestion.WriterCount = 4
	}

	if cfg.Logging.Level == "" {
		cfg.Logging.Level = "info"
	}
	if cfg.Logging.Format == "" {
		cfg.Logging.Format = "json"
	}
}

func applyEnvOverrides(cfg *Config) {
	if v := os.Getenv("INGESTION_HTTP_PORT"); v != "" {
		fmt.Sscanf(v, "%d", &cfg.HTTP.Port)
	}
	if v := os.Getenv("INGESTION_MQTT_BROKER_URL"); v != "" {
		cfg.MQTT.BrokerURL = v
	}
	if v := os.Getenv("INGESTION_MQTT_CLIENT_ID"); v != "" {
		cfg.MQTT.ClientID = v
	}
	if v := os.Getenv("MQTT_USERNAME"); v != "" {
		cfg.MQTT.Username = v
	}
	if v := os.Getenv("MQTT_PASSWORD"); v != "" {
		cfg.MQTT.Password = v
	}
	if v := os.Getenv("INGESTION_MQTT_TOPICS"); v != "" {
		cfg.MQTT.Topics = strings.Split(v, ",")
	}
	if v := os.Getenv("INGESTION_DB_HOST"); v != "" {
		cfg.Database.Host = v
	}
	if v := os.Getenv("INGESTION_DB_PORT"); v != "" {
		fmt.Sscanf(v, "%d", &cfg.Database.Port)
	}
	if v := os.Getenv("INGESTION_DB_NAME"); v != "" {
		cfg.Database.Database = v
	}
	if v := os.Getenv("INGESTION_DB_USER"); v != "" {
		cfg.Database.User = v
	}
	if v := os.Getenv("INGESTION_DB_PASSWORD"); v != "" {
		cfg.Database.Password = v
	}
	if v := os.Getenv("INGESTION_LOGGING_LEVEL"); v != "" {
		cfg.Logging.Level = v
	}
}

func validate(cfg *Config) error {
	if cfg.Database.Password == "" && cfg.Service.Environment == "production" {
		return fmt.Errorf("database password is required in production")
	}
	if cfg.Ingestion.BatchSize > cfg.Ingestion.BufferSize {
		return fmt.Errorf("batch_size cannot be larger than buffer_size")
	}
	if cfg.Ingestion.WriterCount < 1 {
		return fmt.Errorf("writer_count must be at least 1")
	}
	return nil
}

