package limiter

import (
	"context"
	"hash/fnv"
	"math"
	"sync"
	"time"
)

const tokenBucketShardCount = 256

type bucket struct {
	tokens     float64
	lastRefill time.Time
	lastAccess time.Time
}

type bucketShard struct {
	mu      sync.Mutex
	buckets map[string]*bucket
}

type LocalTokenBucket struct {
	shards [tokenBucketShardCount]bucketShard
}

func NewLocalTokenBucket() *LocalTokenBucket {
	tb := &LocalTokenBucket{}
	for i := range tb.shards {
		tb.shards[i].buckets = make(map[string]*bucket)
	}
	return tb
}

func (tb *LocalTokenBucket) Allow(ctx context.Context, key string, limit int64, window time.Duration) (Result, error) {
	select {
	case <-ctx.Done():
		return Result{}, ctx.Err()
	default:
	}

	now := time.Now()
	if limit <= 0 || window <= 0 {
		return Result{
			Allowed:    false,
			Remaining:  0,
			Limit:      limit,
			ResetAt:    now,
			RetryAfter: window,
		}, nil
	}

	ratePerSecond := float64(limit) / window.Seconds()
	if ratePerSecond <= 0 {
		return Result{Allowed: false, Remaining: 0, Limit: limit, ResetAt: now, RetryAfter: window}, nil
	}

	shard := &tb.shards[shardIndex(key)]
	shard.mu.Lock()
	defer shard.mu.Unlock()

	b, ok := shard.buckets[key]
	if !ok {
		b = &bucket{
			tokens:     float64(limit),
			lastRefill: now,
			lastAccess: now,
		}
		shard.buckets[key] = b
	}

	elapsed := now.Sub(b.lastRefill).Seconds()
	if elapsed > 0 {
		b.tokens += elapsed * ratePerSecond
		if b.tokens > float64(limit) {
			b.tokens = float64(limit)
		}
		b.lastRefill = now
	}
	b.lastAccess = now

	if b.tokens >= 1 {
		b.tokens -= 1
		remaining := int64(math.Floor(b.tokens))
		resetAfter := time.Duration((float64(limit) - b.tokens) / ratePerSecond * float64(time.Second))
		return Result{
			Allowed:   true,
			Remaining: remaining,
			Limit:     limit,
			ResetAt:   now.Add(resetAfter),
		}, nil
	}

	retryAfter := time.Duration((1 - b.tokens) / ratePerSecond * float64(time.Second))
	if retryAfter < 0 {
		retryAfter = 0
	}
	return Result{
		Allowed:    false,
		Remaining:  0,
		Limit:      limit,
		ResetAt:    now.Add(retryAfter),
		RetryAfter: retryAfter,
	}, nil
}

// Cleanup removes stale buckets not accessed within the provided duration.
func (tb *LocalTokenBucket) Cleanup(olderThan time.Duration) {
	_, _ = tb.CleanupStats(olderThan)
}

// CleanupStats removes stale buckets and returns (evicted, remaining) counts.
func (tb *LocalTokenBucket) CleanupStats(olderThan time.Duration) (int, int) {
	cutoff := time.Now().Add(-olderThan)
	evicted := 0
	remaining := 0
	for i := range tb.shards {
		shard := &tb.shards[i]
		shard.mu.Lock()
		for key, b := range shard.buckets {
			if b.lastAccess.Before(cutoff) {
				delete(shard.buckets, key)
				evicted++
			}
		}
		remaining += len(shard.buckets)
		shard.mu.Unlock()
	}
	return evicted, remaining
}

func (tb *LocalTokenBucket) ActiveKeys() int {
	total := 0
	for i := range tb.shards {
		shard := &tb.shards[i]
		shard.mu.Lock()
		total += len(shard.buckets)
		shard.mu.Unlock()
	}
	return total
}

func shardIndex(key string) uint32 {
	h := fnv.New32a()
	_, _ = h.Write([]byte(key))
	return h.Sum32() % tokenBucketShardCount
}
