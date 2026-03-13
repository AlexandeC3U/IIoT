package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "net/http/pprof" // registers pprof handlers on http.DefaultServeMux

	"github.com/nexus-edge/data-ingestion/internal/adapter/config"
	queryhttp "github.com/nexus-edge/data-ingestion/internal/adapter/http"
	"github.com/nexus-edge/data-ingestion/internal/adapter/mqtt"
	"github.com/nexus-edge/data-ingestion/internal/adapter/timescaledb"
	"github.com/nexus-edge/data-ingestion/internal/health"
	"github.com/nexus-edge/data-ingestion/internal/metrics"
	"github.com/nexus-edge/data-ingestion/internal/service"
	"github.com/nexus-edge/data-ingestion/pkg/logging"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var version = "dev"

func main() {
	// Initialize logger
	logger := logging.NewLogger("info", "json")
	logger.Info().
		Str("version", version).
		Str("service", "data-ingestion").
		Msg("Starting Data Ingestion Service")

	// Load configuration
	configPath := os.Getenv("CONFIG_PATH")
	if configPath == "" {
		configPath = "./config/config.yaml"
	}

	cfg, err := config.Load(configPath)
	if err != nil {
		logger.Fatal().Err(err).Msg("Failed to load configuration")
	}

	// Update logger level from config
	logger = logging.NewLogger(cfg.Logging.Level, cfg.Logging.Format)

	// Create context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initialize metrics registry
	metricsRegistry := metrics.NewRegistry()

	// Initialize TimescaleDB writer
	dbWriter, err := timescaledb.NewWriter(ctx, timescaledb.WriterConfig{
		Host:            cfg.Database.Host,
		Port:            cfg.Database.Port,
		Database:        cfg.Database.Database,
		User:            cfg.Database.User,
		Password:        cfg.Database.Password,
		PoolSize:        cfg.Database.PoolSize,
		MaxIdleTime:     cfg.Database.MaxIdleTime,
		ConnectTimeout:  cfg.Database.ConnectTimeout,
		UseCopyProtocol: cfg.Ingestion.UseCopyProtocol,
		MaxRetries:      cfg.Ingestion.MaxRetries,
		RetryDelay:      cfg.Ingestion.RetryDelay,
		WriteTimeout:    cfg.Ingestion.WriteTimeout,
	}, logger, metricsRegistry)
	if err != nil {
		logger.Fatal().Err(err).Msg("Failed to initialize TimescaleDB writer")
	}
	defer dbWriter.Close()

	// Initialize MQTT subscriber
	subscriber, err := mqtt.NewSubscriber(mqtt.SubscriberConfig{
		BrokerURL:      cfg.MQTT.BrokerURL,
		ClientID:       cfg.MQTT.ClientID,
		Username:       cfg.MQTT.Username,
		Password:       cfg.MQTT.Password,
		Topics:         cfg.MQTT.Topics,
		QoS:            *cfg.MQTT.QoS,
		KeepAlive:      cfg.MQTT.KeepAlive,
		CleanSession:   cfg.MQTT.CleanSession,
		ReconnectDelay: cfg.MQTT.ReconnectDelay,
		ConnectTimeout: cfg.MQTT.ConnectTimeout,
	}, logger, metricsRegistry)
	if err != nil {
		logger.Fatal().Err(err).Msg("Failed to initialize MQTT subscriber")
	}

	// Initialize ingestion service
	ingestionService := service.NewIngestionService(service.IngestionConfig{
		BufferSize:    cfg.Ingestion.BufferSize,
		BatchSize:     cfg.Ingestion.BatchSize,
		FlushInterval: cfg.Ingestion.FlushInterval,
		WriterCount:   cfg.Ingestion.WriterCount,
	}, subscriber, dbWriter, logger, metricsRegistry)

	// Initialize health checker
	healthChecker := health.NewChecker(subscriber, dbWriter, logger)

	// Public server (port 8080): health probes only — exposed to K8s kubelet
	publicMux := http.NewServeMux()
	publicMux.HandleFunc("/health", healthChecker.HealthHandler)
	publicMux.HandleFunc("/health/live", healthChecker.LiveHandler)
	publicMux.HandleFunc("/health/ready", healthChecker.ReadyHandler)

	// History query endpoints
	historyHandler := queryhttp.NewHistoryHandler(dbWriter.Pool(), logger)
	historyHandler.Register(publicMux)

	server := &http.Server{
		Addr:           fmt.Sprintf(":%d", cfg.HTTP.Port),
		Handler:        publicMux,
		ReadTimeout:    cfg.HTTP.ReadTimeout,
		WriteTimeout:   cfg.HTTP.WriteTimeout,
		IdleTimeout:    cfg.HTTP.IdleTimeout,
		MaxHeaderBytes: 1 << 20, // 1 MB
	}

	go func() {
		logger.Info().Int("port", cfg.HTTP.Port).Msg("Public HTTP server starting")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error().Err(err).Msg("Public HTTP server error")
		}
	}()

	// Internal server (port 8081): metrics, status, optional pprof — cluster-internal only
	internalMux := http.NewServeMux()
	internalMux.HandleFunc("/status", ingestionService.StatusHandler)
	internalMux.Handle("/metrics", promhttp.Handler())
	if cfg.HTTP.EnablePprof {
		// Mount pprof routes registered on DefaultServeMux by the blank import
		internalMux.Handle("/debug/pprof/", http.DefaultServeMux)
	}

	internalServer := &http.Server{
		Addr:    fmt.Sprintf(":%d", cfg.HTTP.InternalPort),
		Handler: internalMux,
	}

	go func() {
		logger.Info().Int("port", cfg.HTTP.InternalPort).Msg("Internal HTTP server starting")
		if err := internalServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error().Err(err).Msg("Internal HTTP server error")
		}
	}()

	// Start ingestion service
	if err := ingestionService.Start(ctx); err != nil {
		logger.Fatal().Err(err).Msg("Failed to start ingestion service")
	}

	logger.Info().Msg("Data Ingestion Service started successfully")

	// Wait for shutdown signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	logger.Info().Msg("Shutdown signal received, stopping services...")

	// Graceful shutdown
	cancel()

	// Stop ingestion service (flushes remaining data)
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	if err := ingestionService.Stop(shutdownCtx); err != nil {
		logger.Error().Err(err).Msg("Error stopping ingestion service")
	}

	// Stop HTTP servers
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error().Err(err).Msg("Error stopping public HTTP server")
	}
	if err := internalServer.Shutdown(shutdownCtx); err != nil {
		logger.Error().Err(err).Msg("Error stopping internal HTTP server")
	}

	logger.Info().Msg("Data Ingestion Service stopped")
}

