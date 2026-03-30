package store

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

const tokenBucketScript = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local now_ms = tonumber(ARGV[3])
local ttl_ms = tonumber(ARGV[4])

if (limit <= 0) or (rate <= 0) then
  return {0, 0, limit, now_ms, 0}
end

local data = redis.call('HMGET', key, 'tokens', 'last_refill_ms')
local tokens = tonumber(data[1])
local last_refill_ms = tonumber(data[2])

if (tokens == nil) or (last_refill_ms == nil) then
  tokens = limit
  last_refill_ms = now_ms
end

local elapsed_ms = now_ms - last_refill_ms
if elapsed_ms < 0 then
  elapsed_ms = 0
end

local refill = (elapsed_ms / 1000.0) * rate
tokens = math.min(limit, tokens + refill)

local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end

local remaining = math.floor(tokens)
local retry_after_ms = 0
if allowed == 0 then
  retry_after_ms = math.ceil(((1 - tokens) / rate) * 1000)
  if retry_after_ms < 0 then
    retry_after_ms = 0
  end
end

local reset_after_ms = math.ceil(((limit - tokens) / rate) * 1000)
if reset_after_ms < 0 then
  reset_after_ms = 0
end
local reset_at_ms = now_ms + reset_after_ms

redis.call('HMSET', key, 'tokens', tokens, 'last_refill_ms', now_ms)
redis.call('PEXPIRE', key, ttl_ms)

return {allowed, remaining, limit, reset_at_ms, retry_after_ms}
`

const slidingWindowCounterScript = `
local key = KEYS[1]
local amount = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])

local count = redis.call('INCRBY', key, amount)
if count == amount then
  redis.call('PEXPIRE', key, window_ms)
end
return count
`

type RedisStore struct {
	client *redis.Client
}

func NewRedisStore(redisURL string) (*RedisStore, error) {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	if opt.MaxRetries == 0 {
		opt.MaxRetries = 1
	}
	if opt.DialTimeout == 0 {
		opt.DialTimeout = 50 * time.Millisecond
	}
	if opt.ReadTimeout == 0 {
		opt.ReadTimeout = 50 * time.Millisecond
	}
	if opt.WriteTimeout == 0 {
		opt.WriteTimeout = 50 * time.Millisecond
	}
	if opt.PoolTimeout == 0 {
		opt.PoolTimeout = 50 * time.Millisecond
	}
	client := redis.NewClient(opt)
	return &RedisStore{client: client}, nil
}

func (s *RedisStore) IncrBy(ctx context.Context, key string, amount int64, window time.Duration) (int64, error) {
	res, err := s.client.Eval(ctx, slidingWindowCounterScript, []string{key}, amount, window.Milliseconds()).Result()
	if err != nil {
		return 0, fmt.Errorf("redis sliding window incr failed for key %q: %w", key, err)
	}
	count, err := asInt64(res)
	if err != nil {
		return 0, fmt.Errorf("redis sliding window incr parse failed for key %q: %w", key, err)
	}
	return count, nil
}

func (s *RedisStore) TokenBucketAllow(ctx context.Context, key string, limit int64, rate float64) (Result, error) {
	now := time.Now()
	if limit <= 0 || rate <= 0 {
		return Result{Allowed: false, Remaining: 0, Limit: limit, ResetAt: now, RetryAfter: 0}, nil
	}

	windowSeconds := float64(limit) / rate
	ttl := time.Duration(windowSeconds * 2 * float64(time.Second))
	if ttl <= 0 {
		ttl = 2 * time.Second
	}

	raw, err := s.client.Eval(ctx, tokenBucketScript, []string{key}, limit, rate, now.UnixMilli(), ttl.Milliseconds()).Result()
	if err != nil {
		return Result{}, fmt.Errorf("redis token bucket script failed for key %q: %w", key, err)
	}

	arr, ok := raw.([]interface{})
	if !ok || len(arr) != 5 {
		return Result{}, fmt.Errorf("redis token bucket script returned unexpected shape for key %q", key)
	}

	allowedInt, err := asInt64(arr[0])
	if err != nil {
		return Result{}, fmt.Errorf("redis token bucket parse allowed failed for key %q: %w", key, err)
	}
	remaining, err := asInt64(arr[1])
	if err != nil {
		return Result{}, fmt.Errorf("redis token bucket parse remaining failed for key %q: %w", key, err)
	}
	limitOut, err := asInt64(arr[2])
	if err != nil {
		return Result{}, fmt.Errorf("redis token bucket parse limit failed for key %q: %w", key, err)
	}
	resetAtMS, err := asInt64(arr[3])
	if err != nil {
		return Result{}, fmt.Errorf("redis token bucket parse reset_at failed for key %q: %w", key, err)
	}
	retryAfterMS, err := asInt64(arr[4])
	if err != nil {
		return Result{}, fmt.Errorf("redis token bucket parse retry_after failed for key %q: %w", key, err)
	}

	if remaining < 0 {
		remaining = 0
	}
	if remaining > limitOut {
		remaining = limitOut
	}

	return Result{
		Allowed:    allowedInt == 1,
		Remaining:  remaining,
		Limit:      limitOut,
		ResetAt:    time.UnixMilli(resetAtMS),
		RetryAfter: time.Duration(math.Max(float64(retryAfterMS), 0)) * time.Millisecond,
	}, nil
}

func (s *RedisStore) Close() error {
	return s.client.Close()
}

func asInt64(v interface{}) (int64, error) {
	switch x := v.(type) {
	case int64:
		return x, nil
	case int:
		return int64(x), nil
	case float64:
		return int64(x), nil
	case string:
		n, err := strconv.ParseInt(x, 10, 64)
		if err != nil {
			return 0, err
		}
		return n, nil
	default:
		return 0, fmt.Errorf("unexpected numeric type %T", v)
	}
}
