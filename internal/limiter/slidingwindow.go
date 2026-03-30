package limiter

import (
	"context"
	"hash/fnv"
	"sync"
	"time"
)

const slidingWindowShardCount = 256

type windowEntry struct {
	timestamps []time.Time
	lastAccess time.Time
}

type windowShard struct {
	mu      sync.Mutex
	entries map[string]*windowEntry
}

type LocalSlidingWindow struct {
	shards [slidingWindowShardCount]windowShard
}

func NewLocalSlidingWindow() *LocalSlidingWindow {
	sw := &LocalSlidingWindow{}
	for i := range sw.shards {
		sw.shards[i].entries = make(map[string]*windowEntry)
	}
	return sw
}

func (sw *LocalSlidingWindow) Allow(ctx context.Context, key string, limit int64, window time.Duration) (Result, error) {
	select {
	case <-ctx.Done():
		return Result{}, ctx.Err()
	default:
	}

	now := time.Now()
	if limit <= 0 || window <= 0 {
		return Result{Allowed: false, Remaining: 0, Limit: limit, ResetAt: now, RetryAfter: window}, nil
	}

	shard := &sw.shards[slidingShardIndex(key)]
	shard.mu.Lock()
	defer shard.mu.Unlock()

	entry, ok := shard.entries[key]
	if !ok {
		entry = &windowEntry{}
		shard.entries[key] = entry
	}
	entry.lastAccess = now

	cutoff := now.Add(-window)
	keepFrom := 0
	for keepFrom < len(entry.timestamps) && !entry.timestamps[keepFrom].After(cutoff) {
		keepFrom++
	}
	if keepFrom > 0 {
		entry.timestamps = append([]time.Time(nil), entry.timestamps[keepFrom:]...)
	}

	current := int64(len(entry.timestamps))
	if current < limit {
		entry.timestamps = append(entry.timestamps, now)
		remaining := limit - int64(len(entry.timestamps))
		resetAt := now.Add(window)
		if len(entry.timestamps) > 0 {
			resetAt = entry.timestamps[0].Add(window)
		}
		return Result{Allowed: true, Remaining: remaining, Limit: limit, ResetAt: resetAt}, nil
	}

	oldest := entry.timestamps[0]
	retryAfter := oldest.Add(window).Sub(now)
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

// Memory note: each time.Time is 24 bytes on 64-bit Go. At 1000 req/min limit,
// one key may hold up to ~24KB of timestamps in the active window.
func slidingShardIndex(key string) uint32 {
	h := fnv.New32a()
	_, _ = h.Write([]byte(key))
	return h.Sum32() % slidingWindowShardCount
}
