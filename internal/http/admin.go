package httplayer

import (
	"encoding/json"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/parvpatel20/rate-limiter/internal/keybuild"
	"github.com/parvpatel20/rate-limiter/internal/limiter"
	"github.com/parvpatel20/rate-limiter/internal/policy"
)

type policyLister interface {
	List() []policy.Policy
}

type AdminAPI struct {
	Builder        keybuild.KeyBuilder
	Policies       policy.PolicyStore
	TokenLimiter   limiter.Limiter
	SlidingLimiter limiter.Limiter
	AdminSecret    string
}

type CheckRequest struct {
	TenantID string `json:"tenant_id"`
	UserID   string `json:"user_id"`
	Route    string `json:"route"`
	Method   string `json:"method"`
	Plan     string `json:"plan"`
}

type SimulateRequest struct {
	TenantID        string `json:"tenant_id"`
	UserID          string `json:"user_id"`
	Route           string `json:"route"`
	Method          string `json:"method"`
	Plan            string `json:"plan"`
	RequestsPerSec  int    `json:"requests_per_second"`
	DurationSeconds int    `json:"duration_seconds"`
}

func (a *AdminAPI) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /v1/check", a.Check)
	mux.HandleFunc("GET /v1/policies/", a.PoliciesForTenant)
	mux.HandleFunc("POST /v1/simulate", a.Simulate)
	mux.HandleFunc("POST /v1/admin/reload", a.Reload)
}

func (a *AdminAPI) Check(w http.ResponseWriter, r *http.Request) {
	var req CheckRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	desc := requestDescriptor(req)
	pol, ok := a.Policies.Resolve(desc.Key())
	if !ok {
		http.Error(w, "no policy matched", http.StatusNotFound)
		return
	}
	lim := a.pickLimiter(pol.Algorithm)
	if lim == nil {
		http.Error(w, "limiter unavailable", http.StatusInternalServerError)
		return
	}

	inspectKey := "inspect:" + desc.Key()
	res, err := lim.Allow(r.Context(), inspectKey, pol.Limit, time.Duration(pol.WindowSeconds)*time.Second)
	if err != nil {
		http.Error(w, "limiter error", http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"policy": pol,
		"result": res,
	})
}

func (a *AdminAPI) PoliciesForTenant(w http.ResponseWriter, r *http.Request) {
	tenantID := strings.TrimPrefix(r.URL.Path, "/v1/policies/")
	if tenantID == "" {
		http.Error(w, "tenant id is required", http.StatusBadRequest)
		return
	}

	lister, ok := a.Policies.(policyLister)
	if !ok {
		http.Error(w, "policy listing unavailable", http.StatusNotImplemented)
		return
	}
	all := lister.List()
	out := make([]policy.Policy, 0)
	needle := "tenant:" + tenantID
	for _, p := range all {
		if strings.Contains(p.Descriptor, needle) || strings.HasPrefix(p.Descriptor, "plan:") || p.Descriptor == "global:default" {
			out = append(out, p)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"tenant_id": tenantID,
		"policies":  out,
	})
}

func (a *AdminAPI) Simulate(w http.ResponseWriter, r *http.Request) {
	var req SimulateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.RequestsPerSec <= 0 || req.DurationSeconds <= 0 {
		http.Error(w, "requests_per_second and duration_seconds must be positive", http.StatusBadRequest)
		return
	}

	desc := requestDescriptor(CheckRequest{
		TenantID: req.TenantID,
		UserID:   req.UserID,
		Route:    req.Route,
		Method:   req.Method,
		Plan:     req.Plan,
	})
	pol, ok := a.Policies.Resolve(desc.Key())
	if !ok {
		http.Error(w, "no policy matched", http.StatusNotFound)
		return
	}

	total := req.RequestsPerSec * req.DurationSeconds
	allowed, denied := simulate(pol.Algorithm, pol.Limit, time.Duration(pol.WindowSeconds)*time.Second, req.RequestsPerSec, total)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"policy":  pol,
		"total":   total,
		"allowed": allowed,
		"denied":  denied,
	})
}

func (a *AdminAPI) Reload(w http.ResponseWriter, r *http.Request) {
	if a.AdminSecret == "" || r.Header.Get("X-Admin-Secret") != a.AdminSecret {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if err := a.Policies.Reload(); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"status": "ok"})
}

func (a *AdminAPI) pickLimiter(algorithm string) limiter.Limiter {
	if algorithm == "sliding_window" {
		if a.SlidingLimiter != nil {
			return a.SlidingLimiter
		}
		return a.TokenLimiter
	}
	return a.TokenLimiter
}

func requestDescriptor(req CheckRequest) limiter.Descriptor {
	method := req.Method
	if method == "" {
		method = http.MethodGet
	}
	route := req.Route
	if route == "" {
		route = "/"
	}
	plan := req.Plan
	if plan == "" {
		plan = "free"
	}
	return limiter.Descriptor{
		TenantID: req.TenantID,
		UserID:   req.UserID,
		Route:    route,
		Method:   method,
		Plan:     plan,
	}
}

func simulate(algorithm string, limit int64, window time.Duration, rps int, total int) (int, int) {
	if algorithm == "sliding_window" {
		return simulateSlidingWindow(limit, window, rps, total)
	}
	return simulateTokenBucket(limit, window, rps, total)
}

func simulateTokenBucket(limit int64, window time.Duration, rps int, total int) (int, int) {
	if limit <= 0 || window <= 0 || rps <= 0 || total <= 0 {
		return 0, max(total, 0)
	}
	tokens := float64(limit)
	rate := float64(limit) / window.Seconds()
	step := 1.0 / float64(rps)
	lastT := 0.0
	allowed := 0
	for i := 0; i < total; i++ {
		nowT := float64(i) * step
		tokens = math.Min(float64(limit), tokens+(nowT-lastT)*rate)
		lastT = nowT
		if tokens >= 1 {
			tokens -= 1
			allowed++
		}
	}
	return allowed, total - allowed
}

func simulateSlidingWindow(limit int64, window time.Duration, rps int, total int) (int, int) {
	if limit <= 0 || window <= 0 || rps <= 0 || total <= 0 {
		return 0, max(total, 0)
	}
	step := 1.0 / float64(rps)
	windowS := window.Seconds()
	times := make([]float64, 0, limit)
	allowed := 0
	for i := 0; i < total; i++ {
		nowT := float64(i) * step
		cut := nowT - windowS
		idx := 0
		for idx < len(times) && times[idx] <= cut {
			idx++
		}
		if idx > 0 {
			times = append([]float64(nil), times[idx:]...)
		}
		if int64(len(times)) < limit {
			times = append(times, nowT)
			allowed++
		}
	}
	return allowed, total - allowed
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
