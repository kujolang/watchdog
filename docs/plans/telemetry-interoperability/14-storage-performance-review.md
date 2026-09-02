# Storage and performance review

## SQLite decision

SQLite remains appropriate for a local-first, single-process gateway. Current WAL mode, indexed time/session/status/provider/correlation queries, bounded pruning, quick-check backups, and local dashboard fit the workload. Do not network-mount the database or promise cluster semantics. Hosted/fleet deployments should export to an external observability system; a future alternate repository backend is a separate project.

Implemented baseline: every Watchdog connection enables WAL,
`synchronous=NORMAL`, a 5-second busy timeout, and foreign-key enforcement
before schema work. Canonical retention protects records with pending/retry
deliveries. Terminal delivery history, queue age, and dead letters are bounded
independently from canonical local retention.

## Schema direction

Add append-oriented canonical `telemetry_records` or normalized trace/span/event v2 tables plus:

- monotonic `ingest_sequence` for stable export/replay;
- source namespace + record ID unique index;
- trace/span parent and observed/start time indexes;
- typed-reference join table or indexed JSON only after query benchmarks;
- exporter profile/delivery/checkpoint/dead-letter tables with foreign keys and byte counters;
- policy/mapping/schema versions on records.

Do not store the same payload in legacy and v2 tables indefinitely. Compatibility views and a bounded migration window are required. Large content, if enabled, needs separate compressed/bounded storage so metadata queries do not scan blobs.

## Write behavior

Use short transactions, prepared/batched inserts, one writer coordination path, and no network under a transaction. Validate/normalize outside the lock, commit canonical records and queue references atomically, and checkpoint WAL based on size/idle policy. Retention deletes in bounded chunks; VACUUM is scheduled/manual, not request-path.

## Capacity bounds

There is no honest universal “SQLite EPS limit” independent of hardware, journal settings, record size, indexes, and concurrent readers. Define supported envelopes and benchmark them:

- default batch: <=100 records / 1 MiB compressed / 4 MiB decoded;
- queue: <=64 MiB or 50k refs per profile, 7 d age, 10 attempts;
- content: off; content blocks <=64 KiB each and <=256 KiB/trace when enabled initially;
- trace: <=512 spans, <=4096 events total, <=32 events/span, <=16 links/span, <=128 attrs/record;
- local retention: byte and age caps, not age alone;
- overload: `429` for push intake; proxy forwarding continues with an explicit telemetry-drop counter.

The executable harness is `tests/telemetry_envelope_benchmark.js`. Its default
quick profile exercises 10/50/200-event batches, a 1,000-event burst, dashboard
reads, a configured unavailable exporter, queue retention protection, and
database growth. `WDG_ENVELOPE_SOAK=true` selects the 30-minute-per-rate soak;
that profile is an explicit release qualification job, not a routine unit test.

## Performance budgets

| Path | Budget |
|---|---|
| proxy added latency excluding upstream | p50 <=3 ms, p95 <=10 ms, p99 <=25 ms for metadata-only nonstream; measure direct vs proxied |
| streaming | first-byte overhead p95 <=10 ms; memory must not scale with full response; stream incrementally |
| v2 ingest | p95 <=25 ms for 100 metadata records after body receipt |
| persistence | p95 transaction <=10 ms for default batch on reference machine |
| export enqueue | p95 <=5 ms incremental to canonical commit |
| exporter | entirely off primary request path; worker CPU <=1 core at default envelope |
| memory | steady-state RSS delta <=64 MiB with full default queues; no response-sized buffering |
| startup | <=1 s incremental for migrations/worker initialization excluding integrity maintenance |

`tests/proxy_overhead_benchmark.js` sends identical streaming and nonstreaming
requests directly and through Watchdog and reports p50/p95/p99, TTFT, process CPU
time, RSS delta, and database bytes/event. Set `WDG_REQUIRE_PROXY_BUDGET=true`
and `WDG_REQUIRE_STREAMING_BUDGET=true` to turn the published budgets into hard
gates.

## 2026-09-01 reference-machine result and release decision

Reference machine: Intel Core i7-9750H, 16 GiB RAM, macOS 26.3.1. The paired
quick run used a release Kujo interpreter and 12 samples per path. It measured
nonstream overhead p50 76.73 ms, p95/p99 114.29 ms; streaming TTFT overhead p95
158.05 ms; RSS delta 2.38 MiB; and 16.2 KiB/event database growth. The quick
canonical run achieved 17.23, 20.52, and 24.27 accepted events/s for the nominal
10/50/200 cases; the 1,000-record burst completed in 51.82 s; dashboard reads
remained <=63 ms; and database growth was 1,596 bytes/event.

These results do **not** meet the original latency or 50/200 events/s targets.
The causes are broader than exporter work: the current Kujo HTTP client buffers
POST responses, and the interpreted HTTP/persistence path has substantial
per-request cost. Therefore:

- metadata interoperability is supported as experimental and bounded to a
  measured 10 events/s sustained envelope on this reference machine;
- 50/200 events/s, the 1,000-event burst, and streaming are stress observations,
  not supported production envelopes;
- exporter delivery remains off the application request path, but production
  enablement is blocked until a streaming POST transport exists and the paired
  nonstream p95 meets a deliberately re-approved budget;
- CI records budgets by default and uses strict environment flags only on a
  release-qualification runner. A release must not claim the original budgets
  from fixture-only data.

This is a release decision, not a waiver: the original table remains the target.

## Sampling

Retain all bounded metadata locally by default. Do not probabilistically sample initial local storage. Support deterministic export sampling later by trace ID, always retaining errors if configured. Content capture is a privacy control, not sampling. Queue overflow dropping is overload behavior and must be reported, not called sampling.

## Token efficiency

Telemetry must stay outside model context. Host adapters are hooks/sidecars, not model tools. Do not inject the canonical schema, trace IDs, or exporter state into prompts. MCP telemetry rides protocol metadata and execution instrumentation; it adds no tool schema. Measure hook payload bytes and ensure adapters emit a reduced payload rather than raw transcripts.
