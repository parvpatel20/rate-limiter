# Benchmarks

Command used:

```bash
go test -bench=. -benchmem -benchtime=10s ./test/bench/
```

Environment:
- OS: Linux
- CPU: Intel(R) Core(TM) i5-6300U CPU @ 2.40GHz
- Arch: amd64
- Go benchmark package: test/bench

Results:

```text
BenchmarkLocalTokenBucket-4      52296052       248.9 ns/op        0 B/op      0 allocs/op
BenchmarkHybridWithMiniredis-4      43594    263428 ns/op   215726 B/op    871 allocs/op
BenchmarkPolicyResolve-4          2890635      3651 ns/op      1464 B/op     36 allocs/op
```

Notes:
- These are local machine measurements and will vary across environments.
- `HybridWithMiniredis` includes fake Redis round-trips and script execution overhead.
- `PolicyResolve` is currently allocation-heavy due to fallback key construction.
