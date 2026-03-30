package store

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	miniredis "github.com/alicebob/miniredis/v2"
)

func TestRedisStoreTokenBucket_Atomicity(t *testing.T) {
	mr := miniredis.RunT(t)
	rs, err := NewRedisStore("redis://" + mr.Addr())
	if err != nil {
		t.Fatalf("new redis store: %v", err)
	}
	defer rs.Close()

	ctx := context.Background()
	key := "tb:acme"
	limit := int64(25)
	rate := float64(limit) / 60.0

	var allowed int64
	wg := sync.WaitGroup{}
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			res, err := rs.TokenBucketAllow(ctx, key, limit, rate)
			if err == nil && res.Allowed {
				atomic.AddInt64(&allowed, 1)
			}
		}()
	}
	wg.Wait()

	if got := atomic.LoadInt64(&allowed); got != limit {
		t.Fatalf("allowed mismatch: got=%d want=%d", got, limit)
	}
}

func TestRedisStoreTokenBucket_SetsExpiry(t *testing.T) {
	mr := miniredis.RunT(t)
	rs, err := NewRedisStore("redis://" + mr.Addr())
	if err != nil {
		t.Fatalf("new redis store: %v", err)
	}
	defer rs.Close()

	ctx := context.Background()
	_, err = rs.TokenBucketAllow(ctx, "tb:ttl", 10, 10.0/60.0)
	if err != nil {
		t.Fatalf("token bucket allow: %v", err)
	}

	pttl, err := rs.client.PTTL(ctx, "tb:ttl").Result()
	if err != nil {
		t.Fatalf("pttl read failed: %v", err)
	}
	if pttl <= 0 {
		t.Fatalf("expected positive TTL, got %v", pttl)
	}
}

func TestRedisStoreTokenBucket_CorruptedTypeReturnsError(t *testing.T) {
	mr := miniredis.RunT(t)
	rs, err := NewRedisStore("redis://" + mr.Addr())
	if err != nil {
		t.Fatalf("new redis store: %v", err)
	}
	defer rs.Close()

	ctx := context.Background()
	if err := rs.client.Set(ctx, "tb:bad", "not-a-hash", time.Minute).Err(); err != nil {
		t.Fatalf("seed bad key: %v", err)
	}

	_, err = rs.TokenBucketAllow(ctx, "tb:bad", 5, 5.0/60.0)
	if err == nil {
		t.Fatalf("expected error for wrong redis key type")
	}
}

func TestRedisStoreIncrBy_Basic(t *testing.T) {
	mr := miniredis.RunT(t)
	rs, err := NewRedisStore("redis://" + mr.Addr())
	if err != nil {
		t.Fatalf("new redis store: %v", err)
	}
	defer rs.Close()

	ctx := context.Background()
	count, err := rs.IncrBy(ctx, "sw:acme", 3, 2*time.Second)
	if err != nil {
		t.Fatalf("incrby failed: %v", err)
	}
	if count != 3 {
		t.Fatalf("count mismatch: got=%d want=3", count)
	}

	count, err = rs.IncrBy(ctx, "sw:acme", 2, 2*time.Second)
	if err != nil {
		t.Fatalf("incrby failed: %v", err)
	}
	if count != 5 {
		t.Fatalf("count mismatch: got=%d want=5", count)
	}
}
