package keybuild

import (
	"net/http"

	"github.com/parvpatel20/rate-limiter/internal/limiter"
)

// KeyBuilder extracts request attributes into a Descriptor.
type KeyBuilder interface {
	Build(r *http.Request) (limiter.Descriptor, error)
}
