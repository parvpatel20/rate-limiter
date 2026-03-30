package httplayer

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"math"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/parvpatel20/rate-limiter/internal/keybuild"
	"github.com/parvpatel20/rate-limiter/internal/limiter"
	"github.com/parvpatel20/rate-limiter/internal/logging"
	"github.com/parvpatel20/rate-limiter/internal/metrics"
	"github.com/parvpatel20/rate-limiter/internal/policy"
)

type Middleware struct {
	Builder        keybuild.KeyBuilder
	Policies       policy.PolicyStore
	TokenLimiter   limiter.Limiter
	SlidingLimiter limiter.Limiter
	FailureMode    string
	Timeout        time.Duration
	Logger         *slog.Logger
	Metrics        *metrics.Metrics
}

func NewMiddleware(builder keybuild.KeyBuilder, policies policy.PolicyStore, tokenLimiter limiter.Limiter, slidingLimiter limiter.Limiter, logger *slog.Logger) *Middleware {
	mode := os.Getenv("FAILURE_MODE")
	if mode == "" {
		mode = "open"
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &Middleware{
		Builder:        builder,
		Policies:       policies,
		TokenLimiter:   tokenLimiter,
		SlidingLimiter: slidingLimiter,
		FailureMode:    mode,
		Timeout:        100 * time.Millisecond,
		Logger:         logger,
		Metrics:        nil,
	}
}

func (m *Middleware) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		desc, err := m.Builder.Build(r)
		if err != nil {
			http.Error(w, "invalid request descriptor", http.StatusBadRequest)
			return
		}
		traceID := r.Header.Get("X-Trace-ID")
		if traceID == "" {
			traceID = newTraceID()
		}
		r = r.WithContext(logging.WithRequestValues(r.Context(), desc.TenantID, traceID, desc.Route))

		p, ok := m.Policies.Resolve(desc.Key())
		if !ok {
			if m.Metrics != nil {
				m.Metrics.PolicyCacheHitsTotal.WithLabelValues("miss").Inc()
				m.Metrics.RequestsTotal.WithLabelValues(desc.TenantID, desc.Route, "denied").Inc()
			}
			http.Error(w, "no policy matched", http.StatusTooManyRequests)
			return
		}
		if m.Metrics != nil {
			outcome := "hit"
			if p.Descriptor == "global:default" {
				outcome = "fallback_default"
			}
			m.Metrics.PolicyCacheHitsTotal.WithLabelValues(outcome).Inc()
		}

		activeLimiter := m.selectLimiter(p.Algorithm)
		if activeLimiter == nil {
			http.Error(w, "limiter unavailable", http.StatusInternalServerError)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), m.Timeout)
		defer cancel()

		res, err := activeLimiter.Allow(ctx, desc.Key(), p.Limit, time.Duration(p.WindowSeconds)*time.Second)
		if err != nil {
			latencyMS := time.Since(start).Milliseconds()
			attrs := append(logging.RequestAttrs(r.Context()), "result", "error", "latency_ms", latencyMS)
			if m.FailureMode == "closed" {
				m.Logger.Warn("rate_limit_error_closed", append(attrs, "event", "rate_limit_error", "error", err)...)
				if m.Metrics != nil {
					m.Metrics.RequestsTotal.WithLabelValues(desc.TenantID, desc.Route, "error").Inc()
				}
				http.Error(w, "rate limiter unavailable", http.StatusServiceUnavailable)
				return
			}
			m.Logger.Warn("rate_limit_error_open", append(attrs, "event", "rate_limit_error", "error", err)...)
			if m.Metrics != nil {
				m.Metrics.RequestsTotal.WithLabelValues(desc.TenantID, desc.Route, "error").Inc()
			}
			w.Header().Set("X-RateLimit-Warning", "degraded")
			next.ServeHTTP(w, r)
			return
		}

		setRateLimitHeaders(w, res)
		if !res.Allowed {
			latencyMS := time.Since(start).Milliseconds()
			m.Logger.Warn("rate_limit_denied", append(logging.RequestAttrs(r.Context()), "event", "rate_limit_denied", "result", "denied", "remaining", res.Remaining, "retry_after", res.RetryAfter.String(), "latency_ms", latencyMS)...)
			if m.Metrics != nil {
				m.Metrics.RequestsTotal.WithLabelValues(desc.TenantID, desc.Route, "denied").Inc()
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			retrySeconds := int64(math.Ceil(res.RetryAfter.Seconds()))
			if retrySeconds < 0 {
				retrySeconds = 0
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"error":       "rate limit exceeded",
				"retry_after": retrySeconds,
			})
			return
		}

		next.ServeHTTP(w, r)
	})
}

func newTraceID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 10)
	}
	return hex.EncodeToString(b)
}

func (m *Middleware) selectLimiter(algorithm string) limiter.Limiter {
	if algorithm == "sliding_window" {
		if m.SlidingLimiter != nil {
			return m.SlidingLimiter
		}
		return m.TokenLimiter
	}
	return m.TokenLimiter
}

func setRateLimitHeaders(w http.ResponseWriter, res limiter.Result) {
	w.Header().Set("X-RateLimit-Limit", strconv.FormatInt(res.Limit, 10))
	w.Header().Set("X-RateLimit-Remaining", strconv.FormatInt(res.Remaining, 10))
	retrySeconds := int64(math.Ceil(res.RetryAfter.Seconds()))
	if retrySeconds < 0 {
		retrySeconds = 0
	}
	w.Header().Set("Retry-After", strconv.FormatInt(retrySeconds, 10))
	w.Header().Set("X-RateLimit-Reset", strconv.FormatInt(res.ResetAt.Unix(), 10))
}
