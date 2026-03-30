package policy

import "strings"

var orderedFields = []string{"tenant", "plan", "user", "method", "route"}

// CandidateKeys returns descriptor fallback attempts in strict priority order.
func CandidateKeys(fullKey string) []string {
	parts := parseKey(fullKey)
	if len(parts) == 0 {
		return []string{"global:default"}
	}

	candidates := make([]string, 0, 7)
	push := func(v string) {
		if v == "" {
			return
		}
		for _, existing := range candidates {
			if existing == v {
				return
			}
		}
		candidates = append(candidates, v)
	}

	push(build(parts, "tenant", "plan", "user", "method", "route"))
	push(build(parts, "tenant", "plan", "user", "route"))
	push(build(parts, "tenant", "plan", "method", "route"))
	push(build(parts, "tenant", "plan", "user", "method"))
	if plan, ok := parts["plan"]; ok {
		push("plan:" + plan)
	}
	if tenant, ok := parts["tenant"]; ok {
		push("tenant:" + tenant)
	}
	push("global:default")

	return candidates
}

// ResolveWithMatcher finds the first matching policy using the fixed fallback order.
func ResolveWithMatcher(policies map[string]Policy, fullKey string) (Policy, bool) {
	for _, candidate := range CandidateKeys(fullKey) {
		if p, ok := policies[candidate]; ok {
			return p, true
		}
	}
	return Policy{}, false
}

func parseKey(key string) map[string]string {
	parts := make(map[string]string, 5)
	segments := strings.Split(key, "|")
	for _, seg := range segments {
		if seg == "" {
			continue
		}
		kv := strings.SplitN(seg, ":", 2)
		if len(kv) != 2 {
			continue
		}
		parts[strings.TrimSpace(kv[0])] = kv[1]
	}
	return parts
}

func build(parts map[string]string, keys ...string) string {
	out := make([]string, 0, len(keys))
	for _, want := range orderedFields {
		if !contains(keys, want) {
			continue
		}
		value, ok := parts[want]
		if !ok {
			return ""
		}
		out = append(out, want+":"+value)
	}
	if len(out) == 0 {
		return ""
	}
	return strings.Join(out, "|")
}

func contains(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}
