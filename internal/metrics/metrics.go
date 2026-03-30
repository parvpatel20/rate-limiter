package metrics

import (
	"context"
	"strings"
	"time"

	"github.com/parvpatel20/rate-limiter/internal/limiter"
	"github.com/prometheus/client_golang/prometheus"
)

type Metrics struct {
	RequestsTotal        *prometheus.CounterVec
	RedisDurationSeconds *prometheus.HistogramVec
	LocalDecisionsTotal  *prometheus.CounterVec
	PolicyCacheHitsTotal *prometheus.CounterVec
	CircuitBreakerState  prometheus.Gauge
	ActiveKeys           prometheus.Gauge
}

func New(reg prometheus.Registerer) *Metrics {
	m := &Metrics{
		RequestsTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "ratelimit_requests_total",
			Help: "Total number of rate-limit middleware checks partitioned by tenant, route, and result.",
		}, []string{"tenant", "route", "result"}),
		RedisDurationSeconds: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "ratelimit_redis_duration_seconds",
			Help:    "Latency distribution of Redis operations used by rate limiting.",
			Buckets: []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1},
		}, []string{"operation"}),
		LocalDecisionsTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "ratelimit_local_decisions_total",
			Help: "Count of local pre-decisions indicating whether Redis was needed.",
		}, []string{"decision"}),
		PolicyCacheHitsTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "ratelimit_policy_cache_hits_total",
			Help: "Count of policy resolution outcomes indicating direct/fallback matches.",
		}, []string{"outcome"}),
		CircuitBreakerState: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "ratelimit_circuit_breaker_state",
			Help: "Circuit breaker state where 0=closed, 1=open, 2=half-open.",
		}),
		ActiveKeys: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "ratelimit_active_keys",
			Help: "Number of active in-memory rate-limit keys currently tracked.",
		}),
	}
	reg.MustRegister(
		m.RequestsTotal,
		m.RedisDurationSeconds,
		m.LocalDecisionsTotal,
		m.PolicyCacheHitsTotal,
		m.CircuitBreakerState,
		m.ActiveKeys,
	)
	m.CircuitBreakerState.Set(0)
	return m
}

func (m *Metrics) ObserveCircuitState(state limiter.CircuitState) {
	switch state {
	case limiter.CircuitOpen:
		m.CircuitBreakerState.Set(1)
	case limiter.CircuitHalfOpen:
		m.CircuitBreakerState.Set(2)
	default:
		m.CircuitBreakerState.Set(0)
	}
}

func (m *Metrics) WrapLimiter(l limiter.Limiter) limiter.Limiter {
	if l == nil {
		return nil
	}
	return &instrumentedLimiter{next: l, m: m}
}

type instrumentedLimiter struct {
	next limiter.Limiter
	m    *Metrics
}

func (i *instrumentedLimiter) Allow(ctx context.Context, key string, limit int64, window time.Duration) (limiter.Result, error) {
	tenant, route := tenantAndRouteFromKey(key)
	resultLabel := "error"
	res, err := i.next.Allow(ctx, key, limit, window)
	if err == nil {
		if res.Allowed {
			resultLabel = "allowed"
		} else {
			resultLabel = "denied"
		}
	}
	i.m.RequestsTotal.WithLabelValues(tenant, route, resultLabel).Inc()
	return res, err
}

func tenantAndRouteFromKey(key string) (string, string) {
	tenant := "unknown"
	route := "unknown"
	parts := strings.Split(key, "|")
	for _, p := range parts {
		if strings.HasPrefix(p, "tenant:") {
			tenant = strings.TrimPrefix(p, "tenant:")
		}
		if strings.HasPrefix(p, "route:") {
			route = strings.TrimPrefix(p, "route:")
		}
	}
	if tenant == "" {
		tenant = "unknown"
	}
	if route == "" {
		route = "unknown"
	}
	return tenant, route
}
