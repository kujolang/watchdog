# Acceptance criteria

## Architecture and compatibility

- [ ] `watchdog.telemetry.v2`, ingestion adapter v1, exporter v1, JSONL v2, and mapping-profile versions evolve independently.
- [ ] Proxy, v1 request intake, and v1 trace intake use one normalization/policy/repository path; no producer/exporter accesses tables directly.
- [ ] Existing `/proxy/v1`, v1 intake routes, X-Observe headers, dashboard/API v1, privacy defaults, backup, and retention tests remain green.
- [ ] Opaque proxy endpoints create transport/model-request metadata only—no invented tools, agent steps, content, or usage.

## Semantics

- [ ] W3C-valid canonical trace/span IDs and parentage are enforced; source IDs remain provenance.
- [ ] Nested agent/model/tool/retrieval/handoff/workflow cases render without ambiguity or duplicate operation payloads.
- [ ] OpenAI, Anthropic, Gemini, and Bedrock usage fixtures preserve cache/reasoning/provider distinctions and null vs zero.
- [ ] Provider-reported, catalog-estimated, subscription-value, and unknown cost observations remain distinguishable through JSONL and OTLP.

## Privacy/security

- [ ] Default configuration stores and exports no prompt, response, tool input/output, retrieval body, shell command/output, detailed provider error, transcript path, credential, email, or raw repository/path canary.
- [ ] Adapters cannot raise content mode; exporters only receive approved records.
- [ ] OTLP intake rejects logs/metrics, generic unmarked traces, bad W3C IDs, malformed compression, oversize/decompression bombs, reserved policy fields, and unauthenticated remote sources.
- [ ] Credentials are absent from database, WAL after checkpoint test, queues, dead letters, JSONL, logs, and backups.
- [ ] Tenant/source authorization and query isolation pass adversarial tests.

## Delivery

- [ ] OTLP/HTTP Protobuf exports base OTel, pinned GenAI, and pinned OpenInference golden traces.
- [ ] Collector, Langfuse, Phoenix, Grafana/Tempo, Datadog, and Honeycomb profiles pass endpoint/auth/mapping fixture tests; live tests remain opt-in.
- [ ] Queue survives restart and destination outage, obeys bytes/count/age/attempt bounds, classifies permanent/retryable/partial failures, and isolates profiles.
- [ ] JSONL v2 ordering/cursors/checksums are stable and replay idempotently.

## Performance

- [ ] Paired direct/proxy harness measures nonstream and stream p50/p95/p99, TTFT, CPU, RSS, and DB bytes/event.
- [ ] Reference-machine results meet budgets in `14-storage-performance-review.md` or a documented release decision explicitly revises them.
- [ ] 10/50/200 events/s sustained and 1k burst tests prove the supported SQLite envelope, including dashboard reads, exporter outage/recovery, and retention.
- [ ] Optional exporter outage changes proxy p95 by <=2 ms relative to exporter disabled and never changes model request success.

## Integration proof and release

- [ ] One Agents SDK/`kujo agent` trace and one Pi trace use the shared v2 client/spool.
- [ ] One external OpenInference/OTel framework trace ingests through the guarded receiver.
- [ ] One external host hook adapter passes content-off and lifecycle fixtures.
- [ ] Clean checkout build/test, offline fixture suite, schema validation, docs/link checks, migration up/down/restart test, and backup/restore all pass.
- [ ] Release notes state supported versions, experimental mappings, known semantic losses, bounds, privacy defaults, and rollback steps.

