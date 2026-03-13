// Package http provides HTTP handlers for the data-ingestion service.
package http

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
)

// HistoryHandler serves time-series query endpoints backed by TimescaleDB.
type HistoryHandler struct {
	pool   *pgxpool.Pool
	logger zerolog.Logger
}

// NewHistoryHandler creates a new handler for historian queries.
func NewHistoryHandler(pool *pgxpool.Pool, logger zerolog.Logger) *HistoryHandler {
	return &HistoryHandler{
		pool:   pool,
		logger: logger.With().Str("component", "history-handler").Logger(),
	}
}

// Register mounts the history routes on the given mux.
func (h *HistoryHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/api/history", h.handleHistory)
}

// historyRow represents a single time-series data point.
type historyRow struct {
	Time     time.Time `json:"time"`
	Value    *float64  `json:"value"`
	ValueStr *string   `json:"value_str,omitempty"`
	Quality  int16     `json:"quality"`
}

// historyStats holds aggregated statistics.
type historyStats struct {
	Count   int64    `json:"count"`
	Avg     *float64 `json:"avg"`
	Min     *float64 `json:"min"`
	Max     *float64 `json:"max"`
	Latest  *float64 `json:"latest"`
}

// historyResponse is the JSON shape returned to the client.
type historyResponse struct {
	Topic  string       `json:"topic"`
	Stats  historyStats `json:"stats"`
	Points []historyRow `json:"points"`
}

// handleHistory serves GET /api/history?topic=...&from=...&to=...&limit=...
func (h *HistoryHandler) handleHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	topic := r.URL.Query().Get("topic")
	if topic == "" {
		http.Error(w, `missing required "topic" query parameter`, http.StatusBadRequest)
		return
	}

	// Time range defaults to the last 10 minutes.
	now := time.Now()
	from := now.Add(-10 * time.Minute)
	to := now
	if v := r.URL.Query().Get("from"); v != "" {
		if ms, err := strconv.ParseInt(v, 10, 64); err == nil {
			from = time.UnixMilli(ms)
		}
	}
	if v := r.URL.Query().Get("to"); v != "" {
		if ms, err := strconv.ParseInt(v, 10, 64); err == nil {
			to = time.UnixMilli(ms)
		}
	}

	limit := 500
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 5000 {
			limit = n
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// Fetch stats
	var stats historyStats
	err := h.pool.QueryRow(ctx,
		`SELECT count(*), avg(value), min(value), max(value),
		        (SELECT value FROM metrics WHERE topic=$1 AND time BETWEEN $2 AND $3 AND value IS NOT NULL ORDER BY time DESC LIMIT 1)
		 FROM metrics WHERE topic=$1 AND time BETWEEN $2 AND $3 AND value IS NOT NULL`,
		topic, from, to,
	).Scan(&stats.Count, &stats.Avg, &stats.Min, &stats.Max, &stats.Latest)
	if err != nil {
		h.logger.Error().Err(err).Str("topic", topic).Msg("Stats query failed")
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Fetch data points
	rows, err := h.pool.Query(ctx,
		`SELECT time, value, value_str, quality
		 FROM metrics
		 WHERE topic=$1 AND time BETWEEN $2 AND $3
		 ORDER BY time ASC
		 LIMIT $4`,
		topic, from, to, limit,
	)
	if err != nil {
		h.logger.Error().Err(err).Str("topic", topic).Msg("History query failed")
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	points := make([]historyRow, 0, 128)
	for rows.Next() {
		var p historyRow
		if err := rows.Scan(&p.Time, &p.Value, &p.ValueStr, &p.Quality); err != nil {
			h.logger.Error().Err(err).Msg("Row scan failed")
			continue
		}
		points = append(points, p)
	}

	resp := historyResponse{
		Topic:  topic,
		Stats:  stats,
		Points: points,
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-cache")
	json.NewEncoder(w).Encode(resp)
}
