package policy

import (
	"fmt"
	"os"
	"sync"

	"gopkg.in/yaml.v3"
)

type yamlFile struct {
	Policies []Policy `yaml:"policies"`
}

type YAMLStore struct {
	path string

	mu       sync.RWMutex
	policies map[string]Policy
}

// List returns a snapshot copy of all currently loaded policies.
func (s *YAMLStore) List() []Policy {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Policy, 0, len(s.policies))
	for _, p := range s.policies {
		out = append(out, p)
	}
	return out
}

func NewYAMLStore(path string) (*YAMLStore, error) {
	s := &YAMLStore{
		path:     path,
		policies: make(map[string]Policy),
	}
	if err := s.Reload(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *YAMLStore) Resolve(key string) (Policy, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return ResolveWithMatcher(s.policies, key)
}

func (s *YAMLStore) Reload() error {
	raw, err := os.ReadFile(s.path)
	if err != nil {
		return fmt.Errorf("read policies file: %w", err)
	}

	var data yamlFile
	if err := yaml.Unmarshal(raw, &data); err != nil {
		return fmt.Errorf("parse policies yaml: %w", err)
	}

	next := make(map[string]Policy, len(data.Policies))
	for _, p := range data.Policies {
		if p.Descriptor == "" {
			return fmt.Errorf("policy %q has empty descriptor", p.Name)
		}
		if p.Limit <= 0 {
			return fmt.Errorf("policy %q has non-positive limit", p.Name)
		}
		if p.WindowSeconds <= 0 {
			return fmt.Errorf("policy %q has non-positive window_seconds", p.Name)
		}
		if p.Algorithm != "token_bucket" && p.Algorithm != "sliding_window" {
			return fmt.Errorf("policy %q has unsupported algorithm %q", p.Name, p.Algorithm)
		}
		next[p.Descriptor] = p
	}

	s.mu.Lock()
	s.policies = next
	s.mu.Unlock()
	return nil
}
