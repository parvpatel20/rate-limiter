package limiter

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"time"

	"github.com/parvpatel20/rate-limiter/internal/store"
)

var ErrRedisUnavailable = errors.New("redis unavailable")

type HybridConfig struct {
	FailOpen          bool
	FastDenyThreshold time.Duration
	CircuitBreaker    CircuitBreakerConfig
	Logger            *slog.Logger
	OnLocalDecision   func(decision string)
	OnRedisDuration   func(operation string, d time.Duration)
}

type HybridLimiter struct {
	local *LocalTokenBucket
	store store.Store
	cb    *CircuitBreaker
	cfg   HybridConfig
}

func NewHybridLimiter(local *LocalTokenBucket, st store.Store, cfg HybridConfig) *HybridLimiter {
	if cfg.FastDenyThreshold <= 0 {
		cfg.FastDenyThreshold = 250 * time.Millisecond
	}
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}
	return &HybridLimiter{
		local: local,
		store: st,
		cb:    NewCircuitBreaker(cfg.CircuitBreaker),
		cfg:   cfg,
	}
}

func (h *HybridLimiter) Allow(ctx context.Context, key string, limit int64, window time.Duration) (Result, error) {
	localRes, err := h.local.Allow(ctx, key, limit, window)
	if err != nil {
		return Result{}, err
	}

	if !localRes.Allowed && localRes.Remaining == 0 && localRes.RetryAfter > h.cfg.FastDenyThreshold {
		if h.cfg.OnLocalDecision != nil {
			h.cfg.OnLocalDecision("fast_deny")
		}
		return localRes, nil
	}
	if h.cfg.OnLocalDecision != nil {
		h.cfg.OnLocalDecision("redis_needed")
	}

	if !h.cb.AllowRequest() {
		if h.cfg.FailOpen {
			if h.cfg.OnLocalDecision != nil {
				h.cfg.OnLocalDecision("fast_allow")
			}
			return localRes, nil
		}
		return Result{}, ErrRedisUnavailable
	}

	rate := float64(limit) / window.Seconds()
	start := time.Now()
	redisRes, err := h.store.TokenBucketAllow(ctx, key, limit, rate)
	if h.cfg.OnRedisDuration != nil {
		h.cfg.OnRedisDuration("token_bucket", time.Since(start))
	}
	if err != nil {
		h.cb.OnFailure()
		h.cfg.Logger.Error("redis_error", "event", "redis_error", "error", err, "fallback", "local_only")
		if h.cfg.FailOpen {
			if h.cfg.OnLocalDecision != nil {
				h.cfg.OnLocalDecision("fast_allow")
			}
			return localRes, nil
		}
		return Result{}, fmt.Errorf("hybrid redis allow failed: %w", err)
	}

	h.cb.OnSuccess()
	h.syncLocalFromRedis(key, limit, redisRes)

	return Result{
		Allowed:    redisRes.Allowed,
		Remaining:  redisRes.Remaining,
		Limit:      redisRes.Limit,
		ResetAt:    redisRes.ResetAt,
		RetryAfter: redisRes.RetryAfter,
	}, nil
}

func (h *HybridLimiter) CircuitState() CircuitState {
	return h.cb.State()
}

func (h *HybridLimiter) syncLocalFromRedis(key string, limit int64, redisRes store.Result) {
	if limit <= 0 {
		return
	}

	shard := &h.local.shards[shardIndex(key)]
	shard.mu.Lock()
	defer shard.mu.Unlock()

	now := time.Now()
	b, ok := shard.buckets[key]
	if !ok {
		b = &bucket{}
		shard.buckets[key] = b
	}

	tokens := float64(redisRes.Remaining)
	if tokens < 0 {
		tokens = 0
	}
	if tokens > float64(limit) {
		tokens = float64(limit)
	}
	if math.IsNaN(tokens) || math.IsInf(tokens, 0) {
		tokens = 0
	}

	b.tokens = tokens
	b.lastRefill = now
	b.lastAccess = now
}
