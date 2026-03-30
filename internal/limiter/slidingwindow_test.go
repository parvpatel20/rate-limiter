package limiter

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestSlidingWindow_LimitAndRetryAfter(t *testing.T) {
	sw := NewLocalSlidingWindow()
	ctx := context.Background()
	key := "tenant:acme|plan:free|user:42|method:POST|route:/v1/search"
	limit := int64(3)
	window := 100 * time.Millisecond

	for i := int64(0); i < limit; i++ {
		res, err := sw.Allow(ctx, key, limit, window)
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

	res, err := sw.Allow(ctx, key, limit, window)
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

func TestSlidingWindow_BoundaryBehavior(t *testing.T) {
	sw := NewLocalSlidingWindow()
	ctx := context.Background()
	key := "tenant:acme|plan:free|user:|method:GET|route:/v1/login"
	limit := int64(1)
	window := 50 * time.Millisecond

	res, err := sw.Allow(ctx, key, limit, window)
	if err != nil || !res.Allowed {
		t.Fatalf("first request should be allowed; err=%v", err)
	}

	time.Sleep(window - 5*time.Millisecond)
	res, err = sw.Allow(ctx, key, limit, window)
	if err != nil {
		t.Fatalf("second request returned error: %v", err)
	}
	if res.Allowed {
		t.Fatalf("request inside the same window should be denied")
	}

	time.Sleep(10 * time.Millisecond)
	res, err = sw.Allow(ctx, key, limit, window)
	if err != nil {
		t.Fatalf("third request returned error: %v", err)
	}
	if !res.Allowed {
		t.Fatalf("request after window boundary should be allowed")
	}
}

func TestSlidingWindow_Concurrent(t *testing.T) {
	sw := NewLocalSlidingWindow()
	ctx := context.Background()
	key := "tenant:acme|plan:enterprise|user:99|method:POST|route:/v1/bulk"
	limit := int64(50)
	window := time.Second

	var allowed int64
	wg := sync.WaitGroup{}
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			res, err := sw.Allow(ctx, key, limit, window)
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
