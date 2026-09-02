# Acceptance criteria

## Architecture and compatibility

- [x] `watchdog.telemetry.v2`, ingestion adapter v1, exporter v1, JSONL v2, and mapping-profile versions evolve independently.
- [x] Proxy, v1 request intake, and v1 trace intake use one normalization/policy/repository path; no producer/exporter accesses tables directly.
- [x] Existing `/proxy/v1`, v1 intake routes, X-Observe headers, dashboard/API v1, privacy defaults, backup, and retention tests remain green.
- [x] Opaque proxy endpoints create transport/model-request metadata only—no invented tools, agent steps, content, or usage.

## Semantics

- [x] W3C-valid canonical trace/span IDs and parentage are enforced; source IDs remain provenance.
- [x] Nested agent/model/tool/retrieval/handoff/workflow cases render without ambiguity or duplicate operation payloads.
- [x] OpenAI, Anthropic, Gemini, and Bedrock usage fixtures preserve cache/reasoning/provider distinctions and null vs zero.
- [x] Provider-reported, catalog-estimated, subscription-value, and unknown cost observations remain distinguishable through JSONL and OTLP.

## Privacy/security

- [x] Default configuration stores and exports no prompt, response, tool input/output, retrieval body, shell command/output, detailed provider error, transcript path, credential, email, or raw repository/path canary.
- [x] Adapters cannot raise content mode; exporters only receive approved records.
- [x] OTLP intake rejects logs/metrics, generic unmarked traces, bad W3C IDs, malformed compression, oversize/decompression bombs, reserved policy fields, and unauthenticated remote sources.
- [x] Credentials are absent from database, WAL after checkpoint test, queues, dead letters, JSONL, logs, and backups.
- [x] The supported single-operator trust boundary enforces source authentication and tenant/project query filtering. Multi-tenant authorization within one Watchdog database is explicitly unsupported; deploy one gateway per trust boundary.

## Delivery

- [x] OTLP/HTTP Protobuf exports base OTel, pinned GenAI, and pinned OpenInference golden traces.
- [x] Collector, Langfuse, Phoenix, Grafana/Tempo, Datadog, and Honeycomb profiles pass endpoint/auth/mapping fixture tests; live tests remain opt-in.
- [x] Queue survives restart and destination outage, obeys bytes/count/age/attempt bounds, classifies permanent/retryable/partial failures, and isolates profiles.
- [x] JSONL v2 ordering/cursors/checksums are stable and replay idempotently.

## Performance

- [x] Paired direct/proxy harness measures nonstream and stream p50/p95/p99, TTFT, CPU, RSS, and DB bytes/event.
- [x] Reference-machine results meet budgets in `14-storage-performance-review.md` or a documented release decision explicitly revises them.
- [ ] 10/50/200 events/s sustained and 1k burst tests prove the supported SQLite envelope, including dashboard reads, exporter outage/recovery, and retention.
- [ ] Optional exporter outage changes proxy p95 by <=2 ms relative to exporter disabled and never changes model request success. Model success isolation passes, but repeated quick runs do not yet hold the 2 ms p95 delta; strict gating is available through `WDG_REQUIRE_EXPORTER_ISOLATION_BUDGET=true`.

## Integration proof and release

- [x] One Agents SDK/`kujo agent` trace and one Pi trace use the v2 delivery/spool contract; `tests/agents_sdk_shared_client_integration.mjs` proves the shared client offline/flush path and Pi's native suite proves its bounded v2 spool.
- [x] One external OpenInference/OTel framework trace ingests through the guarded receiver.
- [x] One external host hook adapter passes content-off and lifecycle fixtures.
- [x] AI SDK, MCP, Dispatch, Relay, Eval, and RunLedger expose bounded metadata-only projection/correlation contracts without database or exporter ownership; Kujo Workflows proves canonical v2 query/JSONL/export status.
- [x] Clean checkout build/test, offline fixture suite, schema validation, docs/link checks, additive migration/rollback/restart test, and backup/restore all pass (verified 2026-09-01 with `scripts/verify_telemetry_interoperability.js`).
- [x] Release notes state supported versions, experimental mappings, known semantic losses, bounds, privacy defaults, and rollback steps.

Unchecked items are release blockers, not omitted evidence. The current blockers
are the 30-minute 10/50/200 EPS qualification (the quick run supports only the
10 EPS envelope), publication and artifact-level qualification of the new Kujo
incremental HTTP transport, production per-request performance, and the strict
2 ms exporter-enabled p95 delta.
