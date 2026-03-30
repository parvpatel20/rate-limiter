package store

import (
	"context"
	"time"
)

// Result is backend-agnostic limiter output used by Store implementations.
type Result struct {
	Allowed    bool
	Remaining  int64
	Limit      int64
	ResetAt    time.Time
	RetryAfter time.Duration
}

// Store abstracts distributed state operations used by hybrid limiting.
type Store interface {
	IncrBy(ctx context.Context, key string, amount int64, window time.Duration) (int64, error)
	TokenBucketAllow(ctx context.Context, key string, limit int64, rate float64) (Result, error)
	Close() error
}
