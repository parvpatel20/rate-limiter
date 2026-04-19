package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/parvpatel20/rate-limiter/internal/config"
	httplayer "github.com/parvpatel20/rate-limiter/internal/http"
	"github.com/parvpatel20/rate-limiter/internal/keybuild"
	"github.com/parvpatel20/rate-limiter/internal/limiter"
	"github.com/parvpatel20/rate-limiter/internal/logging"
	"github.com/parvpatel20/rate-limiter/internal/metrics"
	"github.com/parvpatel20/rate-limiter/internal/policy"
	"github.com/parvpatel20/rate-limiter/internal/store"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("load config", "error", err)
		os.Exit(1)
	}

	logger := logging.NewLogger(cfg.AppEnv)

	redisStore, err := store.NewRedisStore(cfg.RedisURL)
	if err != nil {
		logger.Error("redis store", "error", err)
		os.Exit(1)
	}
	defer func() { _ = redisStore.Close() }()

	reg := prometheus.NewRegistry()
	m := metrics.New(reg)

	localTB := limiter.NewLocalTokenBucket()
	failOpen := cfg.FailureMode == "open"

	hyb := limiter.NewHybridLimiter(localTB, redisStore, limiter.HybridConfig{
		FailOpen: failOpen,
		Logger:   logger,
		OnLocalDecision: func(decision string) {
			m.LocalDecisionsTotal.WithLabelValues(decision).Inc()
		},
		OnRedisDuration: func(operation string, d time.Duration) {
			m.RedisDurationSeconds.WithLabelValues(operation).Observe(d.Seconds())
		},
		CircuitBreaker: limiter.CircuitBreakerConfig{
			OnStateChange: func(state limiter.CircuitState, _ int) {
				m.ObserveCircuitState(state)
			},
		},
	})
	m.ObserveCircuitState(hyb.CircuitState())

	go func() {
		tick := time.NewTicker(5 * time.Second)
		defer tick.Stop()
		for range tick.C {
			m.ActiveKeys.Set(float64(localTB.ActiveKeys()))
			m.ObserveCircuitState(hyb.CircuitState())
		}
	}()

	policyStore, err := policy.NewYAMLStore(cfg.PoliciesFile)
	if err != nil {
		logger.Error("policy store", "error", err)
		os.Exit(1)
	}

	builder := keybuild.NewHTTPBuilder(map[string]string{
		"acme":     "enterprise",
		"globex":   "free",
		"initech":  "free",
		"umbrella": "enterprise",
	})

	sliding := limiter.NewLocalSlidingWindow()
	mw := httplayer.NewMiddleware(builder, policyStore, hyb, sliding, logger)
	mw.Metrics = m
	mw.FailureMode = cfg.FailureMode

	admin := &httplayer.AdminAPI{
		Builder:        builder,
		Policies:       policyStore,
		TokenLimiter:   hyb,
		SlidingLimiter: sliding,
		AdminSecret:    cfg.AdminSecret,
	}

	mainMux := http.NewServeMux()
	promHandler := promhttp.HandlerFor(reg, promhttp.HandlerOpts{Registry: reg})
	mainMux.Handle("GET /metrics", promHandler)
	mainMux.Handle("GET /ui", httplayer.UIHandler())

	admin.Register(mainMux)

	healthHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","service":"ratelimitd"}`))
	})
	mainMux.Handle("/", mw.Handler(healthHandler))

	metricsMux := http.NewServeMux()
	metricsMux.Handle("GET /metrics", promHandler)

	mainSrv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           mainMux,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	metricsSrv := &http.Server{
		Addr:              ":" + cfg.MetricsPort,
		Handler:           metricsMux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
	}

	separateMetrics := cfg.MetricsPort != cfg.Port

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		if separateMetrics {
			logger.Info("ratelimitd listening", "http", mainSrv.Addr, "metrics", metricsSrv.Addr)
		} else {
			logger.Info("ratelimitd listening", "http", mainSrv.Addr, "metrics", "same port as http (GET /metrics)")
		}
		if err := mainSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("http server", "error", err)
			os.Exit(1)
		}
	}()

	if separateMetrics {
		go func() {
			if err := metricsSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				logger.Error("metrics server", "error", err)
				os.Exit(1)
			}
		}()
	}

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	_ = mainSrv.Shutdown(shutdownCtx)
	if separateMetrics {
		_ = metricsSrv.Shutdown(shutdownCtx)
	}
	logger.Info("shutdown complete")
}
