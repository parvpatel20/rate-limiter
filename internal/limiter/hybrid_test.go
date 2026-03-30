package limiter

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	miniredis "github.com/alicebob/miniredis/v2"
	"github.com/parvpatel20/rate-limiter/internal/store"
)

func TestHybridLimiter_RedisUpAgreeingWithLocal(t *testing.T) {
	mr := miniredis.RunT(t)
	st, err := store.NewRedisStore("redis://" + mr.Addr())
	if err != nil {
		t.Fatalf("new redis store: %v", err)
	}
	defer st.Close()

	h := NewHybridLimiter(NewLocalTokenBucket(), st, HybridConfig{FailOpen: true})
	ctx := context.Background()
	limit := int64(10)
	window := time.Minute
	key := "tenant:acme|plan:enterprise|user:42|method:GET|route:/v1/search"

	for i := int64(0); i < limit; i++ {
		res, err := h.Allow(ctx, key, limit, window)
		if err != nil {
			t.Fatalf("allow error: %v", err)
		}
		if !res.Allowed {
			t.Fatalf("request %d should be allowed", i+1)
		}
	}

	res, err := h.Allow(ctx, key, limit, window)
	if err != nil {
		t.Fatalf("allow error: %v", err)
	}
	if res.Allowed {
		t.Fatalf("request over limit should be denied")
	}
}

func TestHybridLimiter_CrossInstanceSharedRedis(t *testing.T) {
	mr := miniredis.RunT(t)
	stA, err := store.NewRedisStore("redis://" + mr.Addr())
	if err != nil {
		t.Fatalf("new redis store A: %v", err)
	}
	defer stA.Close()
	stB, err := store.NewRedisStore("redis://" + mr.Addr())
	if err != nil {
		t.Fatalf("new redis store B: %v", err)
	}
	defer stB.Close()

	hA := NewHybridLimiter(NewLocalTokenBucket(), stA, HybridConfig{FailOpen: true})
	hB := NewHybridLimiter(NewLocalTokenBucket(), stB, HybridConfig{FailOpen: true})

	ctx := context.Background()
	key := "tenant:acme|plan:enterprise|user:|method:POST|route:/v1/bulk"
	limit := int64(50)
	window := time.Minute

	var allowed int64
	for i := 0; i < 30; i++ {
		res, err := hA.Allow(ctx, key, limit, window)
		if err == nil && res.Allowed {
			atomic.AddInt64(&allowed, 1)
		}
	}
	for i := 0; i < 30; i++ {
		res, err := hB.Allow(ctx, key, limit, window)
		if err == nil && res.Allowed {
			atomic.AddInt64(&allowed, 1)
		}
	}

	if got := atomic.LoadInt64(&allowed); got != limit {
		t.Fatalf("cross-instance allowed mismatch: got=%d want=%d", got, limit)
	}
}

func TestHybridLimiter_RedisDownFallsBackLocal(t *testing.T) {
	st, err := store.NewRedisStore("redis://127.0.0.1:6399")
	if err != nil {
		t.Fatalf("new redis store: %v", err)
	}
	defer st.Close()

	h := NewHybridLimiter(NewLocalTokenBucket(), st, HybridConfig{
		FailOpen: true,
		CircuitBreaker: CircuitBreakerConfig{
			OpenAfterFailures: 2,
			OpenTimeout:       50 * time.Millisecond,
		},
	})

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	key := "tenant:acme|plan:free|user:1|method:GET|route:/v1/status"
	limit := int64(3)
	window := time.Minute

	allowed := 0
	for i := 0; i < 6; i++ {
		res, err := h.Allow(ctx, key, limit, window)
		if err != nil {
			t.Fatalf("fail-open should not return error: %v", err)
		}
		if res.Allowed {
			allowed++
		}
	}
	if allowed != int(limit) {
		t.Fatalf("local fallback should enforce local limit: got=%d want=%d", allowed, limit)
	}
	if st := h.CircuitState(); st != CircuitOpen {
		t.Fatalf("expected circuit to open after redis failures, got=%v", st)
	}
}
