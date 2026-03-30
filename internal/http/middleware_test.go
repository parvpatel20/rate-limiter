package httplayer

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/parvpatel20/rate-limiter/internal/keybuild"
	"github.com/parvpatel20/rate-limiter/internal/limiter"
	"github.com/parvpatel20/rate-limiter/internal/policy"
)

type fixedPolicyStore struct {
	policy policy.Policy
	hit    bool
}

func (s *fixedPolicyStore) Resolve(key string) (policy.Policy, bool) { return s.policy, s.hit }
func (s *fixedPolicyStore) Reload() error                            { return nil }

type limiterStub struct {
	res limiter.Result
	err error
}

func (l limiterStub) Allow(_ context.Context, _ string, _ int64, _ time.Duration) (limiter.Result, error) {
	if l.err != nil {
		return limiter.Result{}, l.err
	}
	return l.res, nil
}

func TestMiddleware_DeniedIncludesHeaders(t *testing.T) {
	builder := keybuild.NewHTTPBuilder(map[string]string{"acme": "enterprise"})
	ps := &fixedPolicyStore{policy: policy.Policy{Name: "p", Limit: 10, WindowSeconds: 60, Algorithm: "token_bucket"}, hit: true}
	lim := limiterStub{res: limiter.Result{Allowed: false, Remaining: 0, Limit: 10, RetryAfter: 2 * time.Second, ResetAt: time.Now().Add(2 * time.Second)}}
	mw := NewMiddleware(builder, ps, lim, nil, nil)

	h := mw.Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodPost, "/v1/search", nil)
	req.Header.Set("X-Tenant-ID", "acme")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("status mismatch: got=%d want=%d", rr.Code, http.StatusTooManyRequests)
	}
	for _, hname := range []string{"X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After", "X-RateLimit-Reset"} {
		if rr.Header().Get(hname) == "" {
			t.Fatalf("missing header %s", hname)
		}
	}
	if _, err := strconv.Atoi(rr.Header().Get("Retry-After")); err != nil {
		t.Fatalf("Retry-After must be integer seconds: %v", err)
	}
}

func TestMiddleware_AllowedPreservesDownstreamStatusAndHeaders(t *testing.T) {
	builder := keybuild.NewHTTPBuilder(map[string]string{"acme": "enterprise"})
	ps := &fixedPolicyStore{policy: policy.Policy{Name: "p", Limit: 5, WindowSeconds: 60, Algorithm: "token_bucket"}, hit: true}
	lim := limiterStub{res: limiter.Result{Allowed: true, Remaining: 4, Limit: 5, ResetAt: time.Now().Add(60 * time.Second)}}
	mw := NewMiddleware(builder, ps, lim, nil, nil)

	h := mw.Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
	}))

	req := httptest.NewRequest(http.MethodGet, "/v1/search", nil)
	req.Header.Set("X-Tenant-ID", "acme")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("status mismatch: got=%d want=%d", rr.Code, http.StatusCreated)
	}
	if rr.Header().Get("X-RateLimit-Limit") != "5" {
		t.Fatalf("X-RateLimit-Limit mismatch")
	}
	if rr.Header().Get("X-RateLimit-Remaining") == "" {
		t.Fatalf("X-RateLimit-Remaining missing")
	}
}

func TestMiddleware_FailureOpenAndFailureClosed(t *testing.T) {
	builder := keybuild.NewHTTPBuilder(map[string]string{"acme": "enterprise"})
	ps := &fixedPolicyStore{policy: policy.Policy{Name: "p", Limit: 5, WindowSeconds: 60, Algorithm: "token_bucket"}, hit: true}
	errLimiter := limiterStub{err: errors.New("boom")}

	mwOpen := NewMiddleware(builder, ps, errLimiter, nil, nil)
	mwOpen.FailureMode = "open"
	hOpen := mwOpen.Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) }))
	reqOpen := httptest.NewRequest(http.MethodGet, "/v1/search", nil)
	reqOpen.Header.Set("X-Tenant-ID", "acme")
	rrOpen := httptest.NewRecorder()
	hOpen.ServeHTTP(rrOpen, reqOpen)
	if rrOpen.Code != http.StatusOK {
		t.Fatalf("open mode status mismatch: got=%d want=200", rrOpen.Code)
	}
	if rrOpen.Header().Get("X-RateLimit-Warning") != "degraded" {
		t.Fatalf("open mode must include degraded warning header")
	}

	mwClosed := NewMiddleware(builder, ps, errLimiter, nil, nil)
	mwClosed.FailureMode = "closed"
	hClosed := mwClosed.Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) }))
	reqClosed := httptest.NewRequest(http.MethodGet, "/v1/search", nil)
	reqClosed.Header.Set("X-Tenant-ID", "acme")
	rrClosed := httptest.NewRecorder()
	hClosed.ServeHTTP(rrClosed, reqClosed)
	if rrClosed.Code != http.StatusServiceUnavailable {
		t.Fatalf("closed mode status mismatch: got=%d want=503", rrClosed.Code)
	}
}
