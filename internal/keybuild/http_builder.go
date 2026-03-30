package keybuild

import (
	"errors"
	"net/http"

	"github.com/parvpatel20/rate-limiter/internal/limiter"
)

var ErrMissingTenantID = errors.New("missing tenant id")

type HTTPBuilder struct {
	tenantPlans map[string]string
	defaultPlan string
}

func NewHTTPBuilder(tenantPlans map[string]string) *HTTPBuilder {
	plans := make(map[string]string, len(tenantPlans))
	for tenant, plan := range tenantPlans {
		plans[tenant] = plan
	}
	if len(plans) == 0 {
		plans["acme"] = "enterprise"
		plans["globex"] = "free"
	}
	return &HTTPBuilder{tenantPlans: plans, defaultPlan: "free"}
}

func (b *HTTPBuilder) Build(r *http.Request) (limiter.Descriptor, error) {
	tenantID := r.Header.Get("X-Tenant-ID")
	if tenantID == "" {
		return limiter.Descriptor{}, ErrMissingTenantID
	}

	// TODO: Extract tenant/user from JWT claims when auth middleware is available.
	userID := r.Header.Get("X-User-ID")
	route := r.URL.Path
	if route == "" {
		route = "/"
	}

	plan := b.defaultPlan
	if p, ok := b.tenantPlans[tenantID]; ok {
		plan = p
	}

	return limiter.Descriptor{
		TenantID: tenantID,
		UserID:   userID,
		Route:    route,
		Method:   r.Method,
		Plan:     plan,
	}, nil
}
