// Package main is the entry point for the Protocol Gateway service.
// It initializes all components and manages the application lifecycle.
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/nexus-edge/protocol-gateway/internal/adapter/config"
	"github.com/nexus-edge/protocol-gateway/internal/adapter/modbus"
	"github.com/nexus-edge/protocol-gateway/internal/adapter/mqtt"
	"github.com/nexus-edge/protocol-gateway/internal/health"
	"github.com/nexus-edge/protocol-gateway/internal/metrics"
	"github.com/nexus-edge/protocol-gateway/internal/service"
	"github.com/nexus-edge/protocol-gateway/pkg/logging"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

const (
	serviceName    = "protocol-gateway"
	serviceVersion = "1.0.0"
)

func main() {
	// Initialize structured logger
	logger := logging.New(serviceName, serviceVersion)
	logger.Info().Msg("Starting Protocol Gateway")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		logger.Fatal().Err(err).Msg("Failed to load configuration")
	}
	logger.Info().Str("env", cfg.Environment).Msg("Configuration loaded")

	// Initialize metrics
	metricsRegistry := metrics.NewRegistry()

	// Create root context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initialize MQTT publisher
	mqttPublisher, err := mqtt.NewPublisher(mqtt.Config{
		BrokerURL:       cfg.MQTT.BrokerURL,
		ClientID:        cfg.MQTT.ClientID,
		Username:        cfg.MQTT.Username,
		Password:        cfg.MQTT.Password,
		CleanSession:    cfg.MQTT.CleanSession,
		QoS:             cfg.MQTT.QoS,
		KeepAlive:       cfg.MQTT.KeepAlive,
		ConnectTimeout:  cfg.MQTT.ConnectTimeout,
		ReconnectDelay:  cfg.MQTT.ReconnectDelay,
		MaxReconnect:    cfg.MQTT.MaxReconnect,
		TLSEnabled:      cfg.MQTT.TLSEnabled,
		TLSCertFile:     cfg.MQTT.TLSCertFile,
		TLSKeyFile:      cfg.MQTT.TLSKeyFile,
		TLSCAFile:       cfg.MQTT.TLSCAFile,
	}, logger, metricsRegistry)
	if err != nil {
		logger.Fatal().Err(err).Msg("Failed to create MQTT publisher")
	}

	// Connect to MQTT broker
	if err := mqttPublisher.Connect(ctx); err != nil {
		logger.Fatal().Err(err).Msg("Failed to connect to MQTT broker")
	}
	defer mqttPublisher.Disconnect()

	// Initialize Modbus connection pool
	modbusPool := modbus.NewConnectionPool(modbus.PoolConfig{
		MaxConnections:     cfg.Modbus.MaxConnections,
		IdleTimeout:        cfg.Modbus.IdleTimeout,
		HealthCheckPeriod:  cfg.Modbus.HealthCheckPeriod,
		ConnectionTimeout:  cfg.Modbus.ConnectionTimeout,
		RetryAttempts:      cfg.Modbus.RetryAttempts,
		RetryDelay:         cfg.Modbus.RetryDelay,
		CircuitBreakerName: "modbus-pool",
	}, logger, metricsRegistry)
	defer modbusPool.Close()

	// Initialize polling service
	pollingSvc := service.NewPollingService(service.PollingConfig{
		WorkerCount:      cfg.Polling.WorkerCount,
		BatchSize:        cfg.Polling.BatchSize,
		DefaultInterval:  cfg.Polling.DefaultInterval,
		MaxRetries:       cfg.Polling.MaxRetries,
		ShutdownTimeout:  cfg.Polling.ShutdownTimeout,
	}, modbusPool, mqttPublisher, logger, metricsRegistry)

	// Load device configurations and start polling
	devices, err := config.LoadDevices(cfg.DevicesConfigPath)
	if err != nil {
		logger.Fatal().Err(err).Msg("Failed to load device configurations")
	}
	logger.Info().Int("count", len(devices)).Msg("Loaded device configurations")

	// Register devices with polling service
	for _, device := range devices {
		if err := pollingSvc.RegisterDevice(ctx, device); err != nil {
			logger.Error().Err(err).Str("device", device.ID).Msg("Failed to register device")
		}
	}

	// Start polling service
	if err := pollingSvc.Start(ctx); err != nil {
		logger.Fatal().Err(err).Msg("Failed to start polling service")
	}

	// Initialize health checker
	healthChecker := health.NewChecker(health.Config{
		ServiceName:    serviceName,
		ServiceVersion: serviceVersion,
	})
	healthChecker.AddCheck("mqtt", mqttPublisher)
	healthChecker.AddCheck("modbus_pool", modbusPool)

	// Start HTTP server for health and metrics
	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthChecker.HealthHandler)
	mux.HandleFunc("/health/live", healthChecker.LivenessHandler)
	mux.HandleFunc("/health/ready", healthChecker.ReadinessHandler)
	mux.Handle("/metrics", promhttp.Handler())

	httpServer := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.HTTP.Port),
		Handler:      mux,
		ReadTimeout:  cfg.HTTP.ReadTimeout,
		WriteTimeout: cfg.HTTP.WriteTimeout,
		IdleTimeout:  cfg.HTTP.IdleTimeout,
	}

	// Start HTTP server in goroutine
	go func() {
		logger.Info().Int("port", cfg.HTTP.Port).Msg("Starting HTTP server")
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error().Err(err).Msg("HTTP server error")
		}
	}()

	// Wait for shutdown signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info().Msg("Shutdown signal received, initiating graceful shutdown...")

	// Create shutdown context with timeout
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	// Stop polling service first
	if err := pollingSvc.Stop(shutdownCtx); err != nil {
		logger.Error().Err(err).Msg("Error stopping polling service")
	}

	// Shutdown HTTP server
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		logger.Error().Err(err).Msg("Error shutting down HTTP server")
	}

	logger.Info().Msg("Protocol Gateway shutdown complete")
}

