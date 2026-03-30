package store

import (
	"context"
	"math"
	"sync"
	"time"
)

type memBucket struct {
	tokens     float64
	lastRefill time.Time
}

type memCounter struct {
	count     int64
	expiresAt time.Time
}

type MemoryStore struct {
	mu       sync.Mutex
	buckets  map[string]*memBucket
	counters map[string]*memCounter
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		buckets:  make(map[string]*memBucket),
		counters: make(map[string]*memCounter),
	}
}

func (s *MemoryStore) IncrBy(ctx context.Context, key string, amount int64, window time.Duration) (int64, error) {
	select {
	case <-ctx.Done():
		return 0, ctx.Err()
	default:
	}

	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()

	counter, ok := s.counters[key]
	if !ok || now.After(counter.expiresAt) {
		counter = &memCounter{count: 0, expiresAt: now.Add(window)}
		s.counters[key] = counter
	}
	counter.count += amount
	return counter.count, nil
}

func (s *MemoryStore) TokenBucketAllow(ctx context.Context, key string, limit int64, rate float64) (Result, error) {
	select {
	case <-ctx.Done():
		return Result{}, ctx.Err()
	default:
	}

	now := time.Now()
	if limit <= 0 || rate <= 0 {
		return Result{Allowed: false, Remaining: 0, Limit: limit, ResetAt: now, RetryAfter: 0}, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	b, ok := s.buckets[key]
	if !ok {
		b = &memBucket{tokens: float64(limit), lastRefill: now}
		s.buckets[key] = b
	}

	elapsedSeconds := now.Sub(b.lastRefill).Seconds()
	if elapsedSeconds > 0 {
		b.tokens += elapsedSeconds * rate
		if b.tokens > float64(limit) {
			b.tokens = float64(limit)
		}
		b.lastRefill = now
	}

	if b.tokens >= 1 {
		b.tokens -= 1
		remaining := int64(math.Floor(b.tokens))
		resetAfter := time.Duration((float64(limit) - b.tokens) / rate * float64(time.Second))
		return Result{Allowed: true, Remaining: remaining, Limit: limit, ResetAt: now.Add(resetAfter)}, nil
	}

	retryAfter := time.Duration((1 - b.tokens) / rate * float64(time.Second))
	if retryAfter < 0 {
		retryAfter = 0
	}
	return Result{Allowed: false, Remaining: 0, Limit: limit, ResetAt: now.Add(retryAfter), RetryAfter: retryAfter}, nil
}

func (s *MemoryStore) Close() error {
	return nil
}
