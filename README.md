# rate-limiter

A production-style rate limiter service in Go with:
- in-memory algorithms (token bucket and sliding window)
- Redis-backed hybrid limiting for cross-instance correctness
- policy-driven matching with hot reload
- admin APIs for inspection/simulation/reload
- Prometheus metrics and Grafana dashboard
- lightweight built-in UI at `/ui`

## Run Locally

1. Ensure `.env` is configured.
2. Start service:

```bash
go run ./cmd/ratelimitd
```

3. Useful endpoints:
- `GET /ui` (built-in dashboard)
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