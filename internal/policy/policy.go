package policy

// Policy defines a single rate limit rule.
type Policy struct {
	Name          string `yaml:"name"`
	Descriptor    string `yaml:"descriptor"`
	Limit         int64  `yaml:"limit"`
	WindowSeconds int    `yaml:"window_seconds"`
	Algorithm     string `yaml:"algorithm"`
}

// PolicyStore resolves policies from a descriptor key and supports reload.
type PolicyStore interface {
	Resolve(key string) (Policy, bool)
	Reload() error
}
