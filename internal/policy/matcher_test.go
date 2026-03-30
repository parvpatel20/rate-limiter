package policy

import "testing"

func TestResolveWithMatcher_FallbackOrder(t *testing.T) {
	policies := map[string]Policy{
		"tenant:acme|plan:enterprise|user:42|method:POST|route:/v1/login": {Name: "full"},
		"tenant:acme|plan:enterprise|user:42|route:/v1/login":             {Name: "without_method"},
		"tenant:acme|plan:enterprise|method:POST|route:/v1/login":         {Name: "without_user"},
		"tenant:acme|plan:enterprise|user:42|method:POST":                 {Name: "without_route"},
		"plan:enterprise": {Name: "plan_only"},
		"tenant:acme":     {Name: "tenant_only"},
		"global:default":  {Name: "global"},
	}

	tests := []struct {
		name    string
		key     string
		want    string
		wantHit bool
	}{
		{
			name:    "full match",
			key:     "tenant:acme|plan:enterprise|user:42|method:POST|route:/v1/login",
			want:    "full",
			wantHit: true,
		},
		{
			name:    "without method fallback",
			key:     "tenant:acme|plan:enterprise|user:42|method:PUT|route:/v1/login",
			want:    "without_method",
			wantHit: true,
		},
		{
			name:    "without user fallback",
			key:     "tenant:acme|plan:enterprise|user:99|method:POST|route:/v1/login",
			want:    "without_user",
			wantHit: true,
		},
		{
			name:    "without route fallback",
			key:     "tenant:acme|plan:enterprise|user:42|method:POST|route:/v1/other",
			want:    "without_route",
			wantHit: true,
		},
		{
			name:    "plan only fallback",
			key:     "tenant:initech|plan:enterprise|user:7|method:GET|route:/v1/search",
			want:    "plan_only",
			wantHit: true,
		},
		{
			name:    "tenant only fallback",
			key:     "tenant:acme|plan:unknown|user:7|method:GET|route:/v1/search",
			want:    "tenant_only",
			wantHit: true,
		},
		{
			name:    "global fallback",
			key:     "tenant:initech|plan:unknown|user:7|method:GET|route:/v1/search",
			want:    "global",
			wantHit: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := ResolveWithMatcher(policies, tt.key)
			if ok != tt.wantHit {
				t.Fatalf("hit mismatch: got %v want %v", ok, tt.wantHit)
			}
			if ok && got.Name != tt.want {
				t.Fatalf("policy mismatch: got %q want %q", got.Name, tt.want)
			}
		})
	}
}

func TestResolveWithMatcher_NoPolicy(t *testing.T) {
	policies := map[string]Policy{
		"tenant:acme|plan:enterprise|user:42|method:POST|route:/v1/login": {Name: "full"},
	}

	_, ok := ResolveWithMatcher(policies, "tenant:globex|plan:free|user:1|method:POST|route:/v1/login")
	if ok {
		t.Fatalf("expected no policy match")
	}
}
