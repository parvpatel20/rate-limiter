# rate-limiter

A production-style rate limiter service in Go with:
- in-memory algorithms (token bucket and sliding window)
- Redis-backed hybrid limiting for cross-instance correctness
- policy-driven matching with hot reload
- admin APIs for inspection/simulation/reload
- Prometheus metrics
- modern React + Vite control plane frontend

## Quick Start

### Prerequisites
- Go 1.22+
- Node.js 18+
- Docker (for Redis)

### 1) Start Redis

```bash
docker compose up -d redis
```

### 2) Start backend

```bash
go run ./cmd/ratelimitd
```

Backend listens on:
- `http://localhost:8080` (API + built-in `/ui`)
- `http://localhost:9090/metrics` (dedicated metrics endpoint)

### 3) Start frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend listens on:
- `http://localhost:5173`

## Main Flows to Test

### UI flows
1. Open `http://localhost:5173`
2. `Overview` tab: confirm KPI cards and charts load.
3. `Rate Tester` tab: run a check with tenant `acme` and route `/v1/search`.
4. `Policies` tab: load tenant policies for `acme`.
5. `Simulation` tab: run a burst simulation and validate allow/deny forecast.

### API flows (curl)

```bash
# Rate check
curl -s -X POST http://localhost:8080/v1/check \
  -H 'Content-Type: application/json' \
  -d '{"tenant_id":"acme","route":"/v1/search","method":"GET"}'

# Tenant policies
curl -s http://localhost:8080/v1/policies/acme

# Simulation
curl -s -X POST http://localhost:8080/v1/simulate \
  -H 'Content-Type: application/json' \
  -d '{"tenant_id":"acme","route":"/v1/search","method":"GET","plan":"free","requests_per_second":25,"duration_seconds":10}'

# Metrics
curl -s http://localhost:8080/metrics | head
```

## Quality Checks

From repo root:

```bash
GOCACHE=/tmp/go-build-cache go test ./...
go build ./cmd/ratelimitd
```

From `frontend/`:

```bash
npm run lint
npm run build
```

## Useful Endpoints
- `GET /ui` (built-in backend UI)
- `GET /` (rate-limited health endpoint; include `X-Tenant-ID`)
- `POST /v1/check`
- `GET /v1/policies/:tenantID`
- `POST /v1/simulate`
- `POST /v1/admin/reload`
- `GET /metrics` (also exposed on `:9090/metrics`)

## Load Tests

Scripts are in `test/load/`:
- `single_instance.js`
- `multi_tenant.js`
- `cross_instance.js`
- `abuse_scenario.js`
- `redis_failure.js`

Run example:

```bash
k6 run test/load/single_instance.js
```

## Benchmarks

Command:

```bash
go test -bench=. -benchmem -benchtime=3s ./test/bench/
```

Measured results:

```text
BenchmarkLocalTokenBucket-4      13718617      251.5 ns/op        0 B/op      0 allocs/op
BenchmarkHybridWithMiniredis-4      12232   278588 ns/op   215880 B/op    872 allocs/op
BenchmarkPolicyResolve-4           899824     3650 ns/op      1464 B/op     36 allocs/op
```

More details: `BENCHMARKS.md`
