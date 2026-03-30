package limiter

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestTokenBucket_LimitAndRetryAfter(t *testing.T) {
	tb := NewLocalTokenBucket()
	ctx := context.Background()
	key := "tenant:acme|plan:free|user:42|method:POST|route:/v1/search"
	limit := int64(5)
	window := 200 * time.Millisecond

	for i := int64(0); i < limit; i++ {
		res, err := tb.Allow(ctx, key, limit, window)
		if err != nil {
			t.Fatalf("allow returned error: %v", err)
		}
		if !res.Allowed {
			t.Fatalf("request %d unexpectedly denied", i+1)
		}
		expectedRemaining := limit - (i + 1)
		if res.Remaining != expectedRemaining {
			t.Fatalf("remaining mismatch: got %d want %d", res.Remaining, expectedRemaining)
		}
	}

	res, err := tb.Allow(ctx, key, limit, window)
	if err != nil {
		t.Fatalf("allow returned error: %v", err)
	}
	if res.Allowed {
		t.Fatalf("expected request limit+1 to be denied")
	}
	if res.RetryAfter <= 0 {
		t.Fatalf("expected positive retry_after, got %v", res.RetryAfter)
	}
}

func TestTokenBucket_Refill(t *testing.T) {
	tb := NewLocalTokenBucket()
	ctx := context.Background()
	key := "tenant:acme|plan:free|user:|method:GET|route:/v1/status"
	limit := int64(4)
	window := 120 * time.Millisecond

	for i := int64(0); i < limit; i++ {
		res, err := tb.Allow(ctx, key, limit, window)
		if err != nil || !res.Allowed {
			t.Fatalf("expected prefill request %d to pass; err=%v allowed=%v", i+1, err, res.Allowed)
		}
	}

	res, err := tb.Allow(ctx, key, limit, window)
	if err != nil {
		t.Fatalf("allow returned error: %v", err)
	}
	if res.Allowed {
		t.Fatalf("expected immediate post-limit request to be denied")
	}

	time.Sleep(window / time.Duration(limit))
	res, err = tb.Allow(ctx, key, limit, window)
	if err != nil {
		t.Fatalf("allow after refill returned error: %v", err)
	}
	if !res.Allowed {
		t.Fatalf("expected request to pass after refill; retry_after=%v", res.RetryAfter)
	}
}

func TestTokenBucket_Concurrent(t *testing.T) {
	tb := NewLocalTokenBucket()
	ctx := context.Background()
	key := "tenant:acme|plan:enterprise|user:99|method:POST|route:/v1/bulk"
	limit := int64(50)
	window := time.Minute

	var allowed int64
	wg := sync.WaitGroup{}
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			res, err := tb.Allow(ctx, key, limit, window)
			if err == nil && res.Allowed {
				atomic.AddInt64(&allowed, 1)
			}
		}()
	}
	wg.Wait()

	if got := atomic.LoadInt64(&allowed); got != limit {
		t.Fatalf("allowed mismatch under concurrency: got %d want %d", got, limit)
	}
}
