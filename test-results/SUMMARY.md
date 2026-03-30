# Test Summary (2026-03-30)

## Matrix

| Test Step | Expected | Actual | Status | Artifact |
|---|---|---|---|---|
| Step 1 unit tests with race on internal packages | PASS, no race output | PASS across internal packages, no race warnings observed | PASS | unit-test-20260330.txt |
| Step 1 coverage report | Coverage artifacts generated | coverage.out and coverage.html generated | PASS | coverage-20260330.txt, coverage-func-20260330.txt |
| Step 2 benchmarks (10s) | Stable measured numbers | LocalTB 248.9 ns/op, Hybrid 263428 ns/op, PolicyResolve 3651 ns/op | PASS | benchmark-20260330.txt |
| Step 3 integration tests with real Redis | Integration package executes and scenarios logged | test/integration package missing, command fails at setup | FAIL | integration-20260330.txt |
| Step 4 HTTP middleware/admin tests | All tests PASS | PASS | PASS | http-20260330.txt |
| Step 5 single-instance load | Executed with k6 summary | Executed, all checks passed; p95 threshold failed (72.03ms > 10ms) | PARTIAL | single-instance-20260330.txt |
| Step 5 cross-instance correctness | 2 instances behind LB with shared Redis | k6 executed; allowed_200=20 denied_429=1343513. No proven 2-instance LB setup captured in this run. | PARTIAL | cross-instance-20260330.txt, cross-instance-scale-20260330.txt |
| Step 6 Redis failure chaos | Traffic during outage + recovery evidence | Redis stopped/restarted with timestamps while k6 ran; traffic continued with accepted status set | PASS | redis-failure-20260330.txt, redis-chaos-timeline-20260330.txt |
| Step 7 abuse scenario | Bad tenant throttled heavily, good tenant unaffected | Executed; checks passed, non-2xx rate 97.88% overall under abuse profile | PASS | abuse-20260330.txt |
| Step 8 hot reload | Policy change reflected after reload interval | First attempt inconclusive; second attempt: pre 20/0, post 5/15 after 31s | PASS | hot-reload-20260330.txt, hot-reload-acme-20260330.txt |

## Coverage Snapshot

| Package | Coverage |
|---|---|
| internal/limiter | 71.0% |
| internal/policy | 51.2% |
| internal/keybuild | 0.0% |

Notes:
- The original target of 80%+ for internal/limiter, internal/policy, and internal/keybuild is not yet met.
- Additional tests are needed, especially for keybuild and YAML store paths.

## Performance

- BenchmarkLocalTokenBucket-4: 52296052 iterations, 248.9 ns/op, 0 allocs/op
- BenchmarkHybridWithMiniredis-4: 43594 iterations, 263428 ns/op, 871 allocs/op
- BenchmarkPolicyResolve-4: 2890635 iterations, 3651 ns/op, 36 allocs/op

## Cross-Instance Correctness

- k6 cross_instance run recorded:
	- allowed_200: 20
	- denied_429: 1343513
- This output demonstrates strict throttling behavior, but does not by itself prove the required two-instance load-balancer distribution in this environment snapshot.

## Chaos Resilience

Timeline from redis-chaos-timeline-20260330.txt:
- baseline_start: 2026-03-30T18:27:08+05:30
- redis_stop: 2026-03-30T18:27:38+05:30
- redis_start: 2026-03-30T18:28:38+05:30
- sequence_end: 2026-03-30T18:29:08+05:30

Observed outcome:
- redis_failure workload continued through outage window and completed successfully.

## Artifact Index

- unit-test-20260330.txt
- coverage-20260330.txt
- coverage-func-20260330.txt
- benchmark-20260330.txt
- integration-setup-20260330.txt
- integration-20260330.txt
- http-20260330.txt
- stack-up-20260330.txt
- stack-ps-20260330.txt
- single-instance-20260330.txt
- cross-instance-scale-20260330.txt
- cross-instance-20260330.txt
- multi-tenant-20260330.txt
- abuse-20260330.txt
- redis-failure-20260330.txt
- redis-chaos-timeline-20260330.txt
- hot-reload-20260330.txt
- hot-reload-acme-20260330.txt
