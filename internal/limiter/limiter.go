package limiter

import (
	"context"
	"strings"
	"time"
)

// Descriptor captures all identifying request attributes used for policy resolution.
type Descriptor struct {
	TenantID string
	UserID   string
	Route    string
	Method   string
	Plan     string
}

// Key builds the canonical composite key used by policy matching and limit tracking.
func (d Descriptor) Key() string {
	var b strings.Builder
	b.Grow(64)
	b.WriteString("tenant:")
	b.WriteString(d.TenantID)
	b.WriteString("|plan:")
	b.WriteString(d.Plan)
	b.WriteString("|user:")
	b.WriteString(d.UserID)
	b.WriteString("|method:")
	b.WriteString(d.Method)
	b.WriteString("|route:")
	b.WriteString(d.Route)
	return b.String()
}

// Result is returned by all limiter implementations and directly maps to HTTP headers.
type Result struct {
	Allowed    bool
	Remaining  int64
	Limit      int64
	ResetAt    time.Time
	RetryAfter time.Duration
}

// Limiter defines the uniform contract for token bucket, sliding window, and hybrid algorithms.
type Limiter interface {
	Allow(ctx context.Context, key string, limit int64, window time.Duration) (Result, error)
}
