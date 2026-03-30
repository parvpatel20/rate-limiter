package limiter

import (
	"sync"
	"time"
)

type CircuitState int

const (
	CircuitClosed CircuitState = iota
	CircuitOpen
	CircuitHalfOpen
)

type CircuitBreakerConfig struct {
	OpenAfterFailures int
	OpenTimeout       time.Duration
	OnStateChange     func(state CircuitState, consecutiveFailures int)
}

type CircuitBreaker struct {
	mu sync.Mutex

	cfg CircuitBreakerConfig

	state               CircuitState
	consecutiveFailures int
	openedAt            time.Time
	halfOpenProbeActive bool
}

func NewCircuitBreaker(cfg CircuitBreakerConfig) *CircuitBreaker {
	if cfg.OpenAfterFailures <= 0 {
		cfg.OpenAfterFailures = 5
	}
	if cfg.OpenTimeout <= 0 {
		cfg.OpenTimeout = 30 * time.Second
	}
	return &CircuitBreaker{cfg: cfg, state: CircuitClosed}
}

// AllowRequest reports whether a Redis call should be attempted now.
func (cb *CircuitBreaker) AllowRequest() bool {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	now := time.Now()
	switch cb.state {
	case CircuitClosed:
		return true
	case CircuitOpen:
		if now.Sub(cb.openedAt) >= cb.cfg.OpenTimeout {
			cb.state = CircuitHalfOpen
			cb.halfOpenProbeActive = true
			cb.emitStateChange()
			return true
		}
		return false
	case CircuitHalfOpen:
		if cb.halfOpenProbeActive {
			return false
		}
		cb.halfOpenProbeActive = true
		return true
	default:
		return true
	}
}

func (cb *CircuitBreaker) OnSuccess() {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	stateChanged := cb.state != CircuitClosed
	cb.state = CircuitClosed
	cb.consecutiveFailures = 0
	cb.halfOpenProbeActive = false
	if stateChanged {
		cb.emitStateChange()
	}
}

func (cb *CircuitBreaker) OnFailure() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	now := time.Now()
	switch cb.state {
	case CircuitClosed:
		cb.consecutiveFailures++
		if cb.consecutiveFailures >= cb.cfg.OpenAfterFailures {
			cb.state = CircuitOpen
			cb.openedAt = now
			cb.halfOpenProbeActive = false
			cb.emitStateChange()
		}
	case CircuitHalfOpen:
		cb.state = CircuitOpen
		cb.openedAt = now
		cb.halfOpenProbeActive = false
		cb.emitStateChange()
	case CircuitOpen:
		cb.openedAt = now
	}
}

func (cb *CircuitBreaker) State() CircuitState {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	return cb.state
}

func (cb *CircuitBreaker) emitStateChange() {
	if cb.cfg.OnStateChange != nil {
		cb.cfg.OnStateChange(cb.state, cb.consecutiveFailures)
	}
}
