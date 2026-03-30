package limiter

import (
	"testing"
	"time"
)

func TestCircuitBreaker_Transitions(t *testing.T) {
	cb := NewCircuitBreaker(CircuitBreakerConfig{OpenAfterFailures: 2, OpenTimeout: 40 * time.Millisecond})

	if cb.State() != CircuitClosed {
		t.Fatalf("initial state mismatch")
	}

	if !cb.AllowRequest() {
		t.Fatalf("closed state should allow requests")
	}
	cb.OnFailure()
	if cb.State() != CircuitClosed {
		t.Fatalf("should remain closed after first failure")
	}

	cb.OnFailure()
	if cb.State() != CircuitOpen {
		t.Fatalf("should open after threshold failures")
	}
	if cb.AllowRequest() {
		t.Fatalf("open state should block before timeout")
	}

	time.Sleep(45 * time.Millisecond)
	if !cb.AllowRequest() {
		t.Fatalf("should allow probe after open timeout")
	}
	if cb.State() != CircuitHalfOpen {
		t.Fatalf("should be half-open after timeout probe")
	}

	cb.OnSuccess()
	if cb.State() != CircuitClosed {
		t.Fatalf("should close after successful probe")
	}

	cb.OnFailure()
	cb.OnFailure()
	if cb.State() != CircuitOpen {
		t.Fatalf("should reopen after repeated failures")
	}

	time.Sleep(45 * time.Millisecond)
	if !cb.AllowRequest() {
		t.Fatalf("probe should be allowed again")
	}
	cb.OnFailure()
	if cb.State() != CircuitOpen {
		t.Fatalf("half-open failure should return to open")
	}
}
