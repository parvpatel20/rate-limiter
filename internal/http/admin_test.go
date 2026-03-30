package httplayer

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/parvpatel20/rate-limiter/internal/limiter"
	"github.com/parvpatel20/rate-limiter/internal/policy"
)

type reloadableStore struct {
	policies map[string]policy.Policy
	reloadOk bool
}

func (s *reloadableStore) Resolve(key string) (policy.Policy, bool) {
	if p, ok := policy.ResolveWithMatcher(s.policies, key); ok {
		return p, true
	}
	return policy.Policy{}, false
}

func (s *reloadableStore) Reload() error {
	if s.reloadOk {
		return nil
	}
	return os.ErrInvalid
}

func (s *reloadableStore) List() []policy.Policy {
	out := make([]policy.Policy, 0, len(s.policies))
	for _, p := range s.policies {
		out = append(out, p)
	}
	return out
}

func TestAdminAPI_CheckDoesNotPolluteRealKey(t *testing.T) {
	policies := map[string]policy.Policy{
		"plan:enterprise": {Name: "enterprise", Descriptor: "plan:enterprise", Limit: 100, WindowSeconds: 60, Algorithm: "token_bucket"},
		"global:default":  {Name: "default", Descriptor: "global:default", Limit: 10, WindowSeconds: 60, Algorithm: "token_bucket"},
	}
	store := &reloadableStore{policies: policies, reloadOk: true}
	lim := limiter.NewLocalTokenBucket()

	api := &AdminAPI{Policies: store, TokenLimiter: lim, SlidingLimiter: limiter.NewLocalSlidingWindow(), AdminSecret: "s3cr3t"}
	mux := http.NewServeMux()
	api.Register(mux)

	body := []byte(`{"tenant_id":"acme","user_id":"42","route":"/v1/search","method":"GET","plan":"enterprise"}`)
	for i := 0; i < 1000; i++ {
		req := httptest.NewRequest(http.MethodPost, "/v1/check", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("/v1/check status mismatch at %d: got=%d", i, rec.Code)
		}
	}

	realKey := limiter.Descriptor{TenantID: "acme", UserID: "42", Route: "/v1/search", Method: "GET", Plan: "enterprise"}.Key()
	res, err := lim.Allow(context.Background(), realKey, 100, 60*time.Second)
	if err != nil {
		t.Fatalf("real allow failed: %v", err)
	}
	if !res.Allowed {
		t.Fatalf("real key should remain unaffected by inspect calls")
	}
}

func TestAdminAPI_ReloadAuth(t *testing.T) {
	store := &reloadableStore{policies: map[string]policy.Policy{"global:default": {Name: "d", Descriptor: "global:default", Limit: 1, WindowSeconds: 60, Algorithm: "token_bucket"}}, reloadOk: true}
	api := &AdminAPI{Policies: store, TokenLimiter: limiter.NewLocalTokenBucket(), AdminSecret: "secret"}
	mux := http.NewServeMux()
	api.Register(mux)

	reqNo := httptest.NewRequest(http.MethodPost, "/v1/admin/reload", nil)
	recNo := httptest.NewRecorder()
	mux.ServeHTTP(recNo, reqNo)
	if recNo.Code != http.StatusUnauthorized {
		t.Fatalf("missing secret should be 401, got=%d", recNo.Code)
	}

	reqWrong := httptest.NewRequest(http.MethodPost, "/v1/admin/reload", nil)
	reqWrong.Header.Set("X-Admin-Secret", "wrong")
	recWrong := httptest.NewRecorder()
	mux.ServeHTTP(recWrong, reqWrong)
	if recWrong.Code != http.StatusUnauthorized {
		t.Fatalf("wrong secret should be 401, got=%d", recWrong.Code)
	}

	reqOK := httptest.NewRequest(http.MethodPost, "/v1/admin/reload", nil)
	reqOK.Header.Set("X-Admin-Secret", "secret")
	recOK := httptest.NewRecorder()
	mux.ServeHTTP(recOK, reqOK)
	if recOK.Code != http.StatusOK {
		t.Fatalf("correct secret should be 200, got=%d", recOK.Code)
	}
}

func TestAdminAPI_SimulateAndPoliciesEndpoints(t *testing.T) {
	policies := map[string]policy.Policy{
		"tenant:acme":     {Name: "tenant_acme", Descriptor: "tenant:acme", Limit: 20, WindowSeconds: 60, Algorithm: "token_bucket"},
		"plan:enterprise": {Name: "enterprise", Descriptor: "plan:enterprise", Limit: 100, WindowSeconds: 60, Algorithm: "token_bucket"},
		"global:default":  {Name: "default", Descriptor: "global:default", Limit: 10, WindowSeconds: 60, Algorithm: "token_bucket"},
	}
	store := &reloadableStore{policies: policies, reloadOk: true}
	api := &AdminAPI{Policies: store, TokenLimiter: limiter.NewLocalTokenBucket(), SlidingLimiter: limiter.NewLocalSlidingWindow(), AdminSecret: "secret"}
	mux := http.NewServeMux()
	api.Register(mux)

	reqPolicies := httptest.NewRequest(http.MethodGet, "/v1/policies/acme", nil)
	recPolicies := httptest.NewRecorder()
	mux.ServeHTTP(recPolicies, reqPolicies)
	if recPolicies.Code != http.StatusOK {
		t.Fatalf("policies endpoint status mismatch: got=%d", recPolicies.Code)
	}

	simBody := map[string]any{
		"tenant_id":           "acme",
		"user_id":             "42",
		"route":               "/v1/search",
		"method":              "GET",
		"plan":                "enterprise",
		"requests_per_second": 10,
		"duration_seconds":    2,
	}
	raw, _ := json.Marshal(simBody)
	reqSim := httptest.NewRequest(http.MethodPost, "/v1/simulate", bytes.NewReader(raw))
	recSim := httptest.NewRecorder()
	mux.ServeHTTP(recSim, reqSim)
	if recSim.Code != http.StatusOK {
		t.Fatalf("simulate endpoint status mismatch: got=%d", recSim.Code)
	}

	reqSimBad := httptest.NewRequest(http.MethodPost, "/v1/simulate", bytes.NewReader([]byte(`{"requests_per_second":0,"duration_seconds":0}`)))
	recSimBad := httptest.NewRecorder()
	mux.ServeHTTP(recSimBad, reqSimBad)
	if recSimBad.Code != http.StatusBadRequest {
		t.Fatalf("simulate bad request should be 400, got=%d", recSimBad.Code)
	}
}

func TestMiddlewarePolicyResolveWithRealYAMLStore(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "policies.yaml")
	yaml := []byte("policies:\n  - name: default\n    descriptor: global:default\n    limit: 5\n    window_seconds: 60\n    algorithm: token_bucket\n")
	if err := os.WriteFile(path, yaml, 0o600); err != nil {
		t.Fatalf("write yaml: %v", err)
	}
	store, err := policy.NewYAMLStore(path)
	if err != nil {
		t.Fatalf("yaml store init: %v", err)
	}
	if _, ok := store.Resolve("tenant:x|plan:free|user:1|method:GET|route:/v1"); !ok {
		t.Fatalf("expected fallback to global default")
	}
}
