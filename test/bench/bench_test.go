package bench

import (
	"context"
	"fmt"
	"testing"
	"time"

	miniredis "github.com/alicebob/miniredis/v2"
	"github.com/parvpatel20/rate-limiter/internal/limiter"
	"github.com/parvpatel20/rate-limiter/internal/policy"
	"github.com/parvpatel20/rate-limiter/internal/store"
)

func BenchmarkLocalTokenBucket(b *testing.B) {
	tb := limiter.NewLocalTokenBucket()
	ctx := context.Background()
	limit := int64(1_000_000)
	window := time.Minute

	b.ReportAllocs()
	b.SetParallelism(8)
	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			_, _ = tb.Allow(ctx, "tenant:acme|plan:enterprise|user:1|method:GET|route:/v1/search", limit, window)
		}
	})
}

func BenchmarkHybridWithMiniredis(b *testing.B) {
	mr := miniredis.RunT(b)
	st, err := store.NewRedisStore("redis://" + mr.Addr())
	if err != nil {
		b.Fatalf("new redis store: %v", err)
	}
	defer st.Close()

	h := limiter.NewHybridLimiter(limiter.NewLocalTokenBucket(), st, limiter.HybridConfig{FailOpen: true})
	ctx := context.Background()
	limit := int64(1_000_000)
	window := time.Minute

	b.ReportAllocs()
	b.SetParallelism(8)
	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			_, _ = h.Allow(ctx, "tenant:acme|plan:enterprise|user:1|method:GET|route:/v1/search", limit, window)
		}
	})
}

func BenchmarkPolicyResolve(b *testing.B) {
	policies := make(map[string]policy.Policy, 64)
	policies["global:default"] = policy.Policy{Name: "global", Descriptor: "global:default", Limit: 100, WindowSeconds: 60, Algorithm: "token_bucket"}
	for i := 0; i < 50; i++ {
		k := fmt.Sprintf("tenant:t%d|plan:enterprise|method:GET|route:/v1/r%d", i, i)
		policies[k] = policy.Policy{Name: fmt.Sprintf("tenant_%d", i), Descriptor: k, Limit: 1000, WindowSeconds: 60, Algorithm: "token_bucket"}
	}
	key := "tenant:t42|plan:enterprise|user:77|method:GET|route:/v1/r42"

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = policy.ResolveWithMatcher(policies, key)
	}
}
