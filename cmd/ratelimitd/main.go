package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"log/slog"

	appconfig "github.com/parvpatel20/rate-limiter/internal/config"
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
	cfg, err := appconfig.Load()
	if err != nil {
		slog.Error("invalid config", "error", err)
		os.Exit(1)
	}

	logger := logging.NewLogger(cfg.AppEnv)
	metricSet := metrics.New(prometheus.DefaultRegisterer)

	policyStore, err := policy.NewYAMLStore(cfg.PoliciesFile)
	if err != nil {
		logger.Error("policy store init failed", "error", err)
		os.Exit(1)
	}

	redisStore, err := store.NewRedisStore(cfg.RedisURL)
	if err != nil {
		logger.Error("redis store init failed", "error", err)
		os.Exit(1)
	}
	defer redisStore.Close()

	localBucket := limiter.NewLocalTokenBucket()
	hybrid := limiter.NewHybridLimiter(localBucket, redisStore, limiter.HybridConfig{
		FailOpen: cfg.FailureMode == "open",
		Logger:   logger,
		OnLocalDecision: func(decision string) {
			metricSet.LocalDecisionsTotal.WithLabelValues(decision).Inc()
		},
		OnRedisDuration: func(operation string, d time.Duration) {
			metricSet.RedisDurationSeconds.WithLabelValues(operation).Observe(d.Seconds())
		},
		CircuitBreaker: limiter.CircuitBreakerConfig{
			OpenAfterFailures: 5,
			OpenTimeout:       30 * time.Second,
			OnStateChange: func(state limiter.CircuitState, failures int) {
				metricSet.ObserveCircuitState(state)
				event := "circuit_breaker_closed"
				levelAttrs := []any{"event", event, "consecutive_failures", failures}
				switch state {
				case limiter.CircuitOpen:
					event = "circuit_breaker_open"
					levelAttrs[1] = event
					logger.Warn("circuit breaker open", levelAttrs...)
				case limiter.CircuitHalfOpen:
					event = "circuit_breaker_half_open"
					levelAttrs[1] = event
					logger.Warn("circuit breaker half-open", levelAttrs...)
				default:
					logger.Info("circuit breaker closed", levelAttrs...)
				}
			},
		},
	})
	metricSet.ObserveCircuitState(hybrid.CircuitState())
	sliding := limiter.NewLocalSlidingWindow()

	builder := keybuild.NewHTTPBuilder(map[string]string{
		"acme":   "enterprise",
		"globex": "free",
	})

	mw := httplayer.NewMiddleware(builder, policyStore, hybrid, sliding, logger)
	mw.FailureMode = cfg.FailureMode
	mw.Timeout = 100 * time.Millisecond
	mw.Metrics = metricSet

	admin := &httplayer.AdminAPI{
		Builder:        builder,
		Policies:       policyStore,
		TokenLimiter:   hybrid,
		SlidingLimiter: sliding,
		AdminSecret:    cfg.AdminSecret,
	}

	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	mux.HandleFunc("/ui", httplayer.UIHandler())
	admin.Register(mux)
	root := mw.Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	}))
	mux.Handle("/", root)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	var wg sync.WaitGroup
	done := make(chan struct{})

	wg.Add(1)
	go func() {
		defer wg.Done()
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				start := time.Now()
				err := policyStore.Reload()
				if err != nil {
					logger.Warn("policy reload failed", "event", "policy_reload", "error", err, "duration_ms", time.Since(start).Milliseconds())
					continue
				}
				loaded := len(policyStore.List())
				logger.Info("policy reload succeeded", "event", "policy_reload", "policies_loaded", loaded, "duration_ms", time.Since(start).Milliseconds())
			}
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				evicted, remaining := localBucket.CleanupStats(10 * time.Minute)
				metricSet.ActiveKeys.Set(float64(remaining))
				logger.Debug("bucket cleanup run", "event", "bucket_cleanup", "keys_evicted", evicted, "keys_remaining", remaining)
			}
		}
	}()

	errCh := make(chan error, 1)
	metricsErrCh := make(chan error, 1)
	go func() {
		logger.Info("ratelimitd listening", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	metricsSrv := &http.Server{
		Addr: ":9090",
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/metrics" {
				promhttp.Handler().ServeHTTP(w, r)
				return
			}
			http.NotFound(w, r)
		}),
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() {
		logger.Info("metrics listening", "addr", metricsSrv.Addr)
		if err := metricsSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			metricsErrCh <- err
		}
	}()

	select {
	case <-ctx.Done():
		logger.Info("shutdown signal received")
	case err := <-errCh:
		logger.Error("server failed", "error", err)
	case err := <-metricsErrCh:
		logger.Error("metrics server failed", "error", err)
	}

	close(done)
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown failed", "error", err)
	}
	if err := metricsSrv.Shutdown(shutdownCtx); err != nil {
		logger.Error("metrics graceful shutdown failed", "error", err)
	}
	if err := redisStore.Close(); err != nil {
		logger.Warn("redis close failed", "error", err)
	}
	wg.Wait()
}
