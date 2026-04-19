# Rate Limiter

A **Go** service that enforces tenant- and route-aware rate limits with **Redis-backed hybrid token buckets**, **YAML policies** (hot reload), **Prometheus metrics**, and a **React control plane** so others can explore behavior without reading code.

---

## Why this repo exists

- **Backend**: Production-style limits (distributed state via Redis, circuit breaker, fail-open vs fail-closed).
- **Frontend**: A polished dashboard to watch metrics, run `/v1/check`, inspect policies, simulate traffic, probe health, run burst tests, and trigger admin reload—ideal for demos and interviews.

---

## Features

### Backend (Go)

| Capability | Notes |
|------------|--------|
| **Token bucket** | Primary algorithm; hybrid local + Redis for cross-instance behavior. |
| **Sliding window** | In-process `LocalSlidingWindow` for matching policies; use for single-instance or best-effort demos (not synced via Redis in this codebase). |
| **Redis + circuit breaker** | Hybrid limiter with fast local hints, Redis for shared counts, breaker on Redis failures. |
| **Policies** | YAML descriptors with ordered fallback (`tenant|plan|user|method|route` → plan → tenant → `global:default`). |
| **Admin API** | `/v1/check` (inspect keys prefixed so probes do not consume live counters), `/v1/simulate`, `/v1/policies/:tenant`, `/v1/admin/reload`. |
| **Metrics** | Main HTTP port plus optional dedicated scrape port (default `9090`). |

### Frontend (React + Vite + Tailwind)

| Tab | Purpose |
|-----|---------|
| **Overview** | KPIs + Prometheus text metrics. |
| **Rate Tester** | Live `POST /v1/check` with history. |
| **Policies** | `GET /v1/policies/:tenant`. |
| **Simulation** | `POST /v1/simulate` (model, not live traffic). |
| **Health** | `GET /` with `X-Tenant-ID` (same limits as real traffic). |
| **Burst Test** | Sequential requests to a chosen route (proxied to the backend). |
| **Admin** | Policy reload with `X-Admin-Secret`. |

Dev server proxies `/api/*` → backend (see `frontend/vite.config.ts`), so the UI talks to `http://localhost:8080` without CORS issues.

---

## Architecture

```text
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────────────────┐
│   Browser   │────▶│  Vite (optional) │────▶│  ratelimitd :8080                 │
│             │     │  /api → :8080    │     │  / GET (health, rate-limited)   │
└─────────────┘     └──────────────────┘     │  /ui  built-in HTML playground  │
                                              │  /v1/* admin & simulation APIs  │
                                              │  GET /metrics                   │
                                              └───────────────┬─────────────────┘
                                                              │
                         ┌────────────────────────────────────┼────────────────────┐
                         ▼                                    ▼                    ▼
                  ┌─────────────┐                      ┌──────────────┐      ┌─────────────┐
                  │   Redis     │                      │ policies.yaml │      │ Prometheus  │
                  │ (token $$$) │                      │ hot reload    │      │ scrape :9090 │
                  └─────────────┘                      └──────────────┘      └─────────────┘
```

Dedicated metrics listener (default **9090**) exposes the same registry for Docker Compose / Prometheus (`configs/prometheus.yml` targets `ratelimitd:9090`).

---

## Quick start

### Prerequisites

- Go **1.23+** (see `go.mod`)
- Node **18+** (frontend)
- Docker (optional, for Redis + full stack)

### 1. Redis

```bash
docker compose up -d redis
```

### 2. Environment

```bash
cp .env.example .env
```

Minimum variables:

| Variable | Purpose |
|----------|---------|
| `REDIS_URL` | e.g. `redis://localhost:6379` |
| `POLICIES_FILE` | e.g. `./configs/policies.yaml` |
| `PORT` | HTTP API (e.g. `8080`) |
| `METRICS_PORT` | Prometheus scrape port (default `9090`; if set equal to `PORT`, only one process listens and `GET /metrics` is on that port) |
| `FAILURE_MODE` | `open` (allow on Redis error) or `closed` (503) |
| `ADMIN_SECRET` | Required for `POST /v1/admin/reload` |
| `APP_ENV` | `development` or `production` (logging format) |

### 3. Run the backend

```bash
go run ./cmd/ratelimitd
```

- API + UI: `http://localhost:8080` (health: `GET /`, built-in UI: `GET /ui`)
- Metrics on main port: `http://localhost:8080/metrics`
- Dedicated metrics (default): `http://localhost:9090/metrics`

### 4. Run the React dashboard (optional)

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. API calls use the `/api` proxy to `localhost:8080`.

### 5. Full stack (Compose)

```bash
docker compose up -d
```

**Inside Compose**, point Redis at the service name, e.g. `REDIS_URL=redis://redis:6379`, and policies at the path baked into the image, e.g. `POLICIES_FILE=/app/configs/policies.yaml`.

---

## API reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health JSON (`200`); requires `X-Tenant-ID`; **counts toward rate limits**. |
| `GET` | `/ui` | Small built-in HTML dashboard (no Node required). |
| `GET` | `/metrics` | Prometheus text on the main port; also on `METRICS_PORT` when different. |
| `POST` | `/v1/check` | Evaluate limit for a JSON body (uses `inspect:` keys—does not consume live route keys). |
| `GET` | `/v1/policies/{tenant}` | List relevant policies for demos. |
| `POST` | `/v1/simulate` | Analytic simulation (not live HTTP). |
| `POST` | `/v1/admin/reload` | Reload YAML; header `X-Admin-Secret` required. |

---

## Policies

Example (`configs/policies.yaml`):

```yaml
policies:
  - name: global_default
    descriptor: global:default
    limit: 100
    window_seconds: 60
    algorithm: token_bucket

  - name: login_route_sliding
    descriptor: tenant:acme|plan:enterprise|method:POST|route:/v1/login
    limit: 10
    window_seconds: 60
    algorithm: sliding_window
```

---

## Testing & quality

```bash
# Go tests (scope packages to avoid optional nested modules under frontend/node_modules)
go test ./cmd/... ./internal/... ./test/...

go build -o ratelimitd ./cmd/ratelimitd

cd frontend
npm run build
npm run lint
```

Benchmarks:

```bash
go test -bench=. -benchmem -benchtime=3s ./test/bench/
```

See `BENCHMARKS.md` for sample numbers.

---

## Load testing

Scripts under `test/load/` (k6). Example:

```bash
k6 run test/load/single_instance.js
```

---

## Observability

- **Prometheus**: scrape `METRICS_PORT` (Compose file in `configs/prometheus.yml`).
- **Grafana**: dashboard JSON in `configs/grafana/dashboards/ratelimit.json` (Compose service on port `3000`).

Key metric names: `ratelimit_requests_total`, `ratelimit_local_decisions_total`, `ratelimit_circuit_breaker_state`, `ratelimit_active_keys`, `ratelimit_redis_duration_seconds`.

---

## Project layout

```text
rate-limiter/
├── cmd/ratelimitd/       # Entrypoint
├── internal/
│   ├── http/             # Middleware, admin API, embedded /ui
│   ├── limiter/          # Token bucket, sliding window, hybrid, circuit breaker
│   ├── policy/           # YAML + matcher
│   ├── store/            # Redis + memory
│   ├── metrics/          # Prometheus
│   ├── keybuild/         # Request → descriptor
│   └── logging/
├── configs/              # policies.yaml, Prometheus, Grafana
├── frontend/             # Vite React UI
└── test/load, test/bench
```

---

## Design notes & limitations

- **`sliding_window` in this repo** uses the in-process sliding implementation for matching routes. Token-bucket policies use the **hybrid Redis** path and are appropriate for multi-instance correctness.
- **`/v1/check`** uses isolated limiter keys (`inspect:` prefix) so demos do not drain production counters.
- **Fail-open vs closed** applies when Redis is unavailable; see `FAILURE_MODE`.

---

## License

MIT
