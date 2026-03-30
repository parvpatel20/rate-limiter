package metrics

import (
	"context"
	"testing"
	"time"

	"github.com/parvpatel20/rate-limiter/internal/limiter"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
)

type fakeLimiter struct {
	res limiter.Result
	err error
}

func (f fakeLimiter) Allow(_ context.Context, _ string, _ int64, _ time.Duration) (limiter.Result, error) {
	return f.res, f.err
}

func TestWrapLimiterCountsAllowedAndDenied(t *testing.T) {
	reg := prometheus.NewRegistry()
	m := New(reg)

	allowed := m.WrapLimiter(fakeLimiter{res: limiter.Result{Allowed: true}})
	denied := m.WrapLimiter(fakeLimiter{res: limiter.Result{Allowed: false}})

	_, _ = allowed.Allow(context.Background(), "tenant:acme|plan:enterprise|user:1|method:GET|route:/v1/search", 10, time.Minute)
	_, _ = denied.Allow(context.Background(), "tenant:acme|plan:enterprise|user:1|method:GET|route:/v1/search", 10, time.Minute)

	if got := testutil.ToFloat64(m.RequestsTotal.WithLabelValues("acme", "/v1/search", "allowed")); got != 1 {
		t.Fatalf("allowed count mismatch: got=%v want=1", got)
	}
	if got := testutil.ToFloat64(m.RequestsTotal.WithLabelValues("acme", "/v1/search", "denied")); got != 1 {
		t.Fatalf("denied count mismatch: got=%v want=1", got)
	}
}
