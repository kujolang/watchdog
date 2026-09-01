# Implementation prompt

You are implementing Watchdog’s telemetry interoperability expansion. Treat this package as the approved research and architecture baseline. Do not redo product research unless an upstream API has changed or a cited fact fails a fixture. Work phase-by-phase in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), keep compatibility green, and stop at explicit authorization boundaries for sibling repositories.

## Objective

Evolve Watchdog from a local OpenAI-compatible proxy with multiple table-shaped telemetry paths into a **local-first AI telemetry gateway**. It must accept proxy/native/AI-OTLP telemetry, normalize it into a provider-neutral contract, apply one authoritative privacy policy, persist it locally in bounded SQLite, show it in the existing dashboard, and export it asynchronously through JSONL v2 and OTLP mapping profiles.

Watchdog is not an enterprise observability backend, generic OTel collector, SIEM, workflow engine, agent framework, eval engine, billing system, or hosted requirement. Do not introduce Kafka, Kubernetes, Postgres, Redis, Elasticsearch, or ClickHouse.

## Non-negotiable architecture

```text
source -> protocol admission -> pure ingestion adapter -> canonical v2
       -> central privacy/redaction -> canonical repository + export journal
       -> independent exporter worker -> destination
```

Adapters cannot access database/exporters/retention. Exporters cannot access raw source/database/redaction configuration. No exporter performs privacy recovery. No host/framework defines a Watchdog schema. No network call occurs while a database transaction is open.

Implement `watchdog.telemetry.v2` from [TELEMETRY_SCHEMA_PROPOSAL.json](TELEMETRY_SCHEMA_PROPOSAL.json), refining only when implementation evidence requires it. Document every refinement in an ADR and update schemas, golden fixtures, mappings, and this plan atomically.

## Canonical semantics

- Records are `trace`, `span`, or `event`.
- Spans represent timed operations with kinds: model, agent, tool, retrieval, workflow, handoff, approval, execution, persistence, evaluation, internal.
- Events represent instantaneous facts and never duplicate a complete operation. Stream is one model span with first-byte/chunk/final events as needed, not a second payload.
- W3C 32-hex trace and 16-hex span IDs define causality. Generate canonical IDs for invalid sources and retain source IDs as bounded provenance.
- Session and run are optional grouping references. Turn/workflow/task/agent/tool-call/request/artifact/eval are typed references, not mandatory columns.
- `record_id` is idempotent inside a source namespace. Conflicting replay returns 409/audit; no silent mutation.
- Timestamp input is normalized to RFC3339/Unix nanosecond precision at admission. Reject ambiguity and unreasonable live timestamps.

Usage fields are nullable. Normalize input/output/total/cached-input/cache-write/reasoning only when source semantics match; retain bounded provider usage and describe total semantics. Never turn missing into zero. Include fixtures for OpenAI prompt/completion/cached/reasoning/audio details, Anthropic cache creation/read, Gemini prompt/cached/candidates/thoughts/modalities, and Bedrock input plus cache read/write semantics.

Cost is an array of observations: provider-reported, catalog-estimated, subscription-value estimate, or unknown. Keep currency/source/catalog/rates/time. Never populate a destination billed-cost field with an unlabeled estimate.

## API and migration

Add dedicated `/telemetry/v2/batches` and guarded `/telemetry/v2/otlp/v1/traces`. Keep `/api/telemetry/requests`, `/api/telemetry/traces`, `/proxy/v1`, X-Observe headers, dashboard/API v1, and database upgrade compatibility. v1 routes translate into v2. Do not reuse dashboard internals as the new ingestion API.

Implement additive migrations and compatibility views. Proxy/v1/v2 all call the same normalizer-policy-repository path. Backfill old data metadata-only with migration provenance; do not newly export historical content. End direct writes from `src/watchdog.kujo` after its compatibility replacement is tested. Avoid indefinite dual storage.

Proxy decoders are endpoint-specific. Preserve transparent forwarding and base-URL zero-code behavior. Existing Chat Completions JSON/SSE is the first decoder. Unrecognized endpoints are opaque: capture method/path family/status/duration/bytes/provider/profile/correlation only. Do not invent tool/agent/usage facts. Never deep-parse multipart/files/images/audio/fine-tuning or provider extension bodies without a separate approved decoder and fixtures. Replace full-response buffering with incremental streaming before claiming the stream performance budget.

## Privacy and security

Preserve defaults: content off and basic redaction. New integrations cannot silently increase capture. Prompts, responses, tool args/results, retrieval bodies, shell commands/output, artifact bodies, detailed provider errors, transcripts, cwd/paths, and host raw payloads are content and absent by default.

Operational metadata is allowlisted and bounded. Opaque random IDs may be preserved; user/tenant/email/path/repository/URL query/branch/session title/account identifiers hash or drop by default using an installation-local keyed hash. Strip credentials. Resolve exporter credentials from environment/OS secret references at send time. Never persist auth headers or secrets in DB/WAL/queue/dead-letter/JSONL/log/backup.

OTLP intake defaults loopback, requires auth/source policy remotely, accepts traces only, and gates to recognized GenAI/OpenInference semantics or an authenticated Watchdog resource marker. Reject logs, metrics, generic traces, malformed compression, oversize/decompression bombs, invalid IDs, excessive resources/scopes/spans/events/links/attributes, and producer claims that select tenant/privacy/exporter/credentials.

Use the canary privacy suite in [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md). Inspect wire bytes and every local sink, not only API output.

## JSONL and exporters

JSONL v2 is canonical, versioned, one record per line, stable by ingest sequence, with opaque resumable cursor, manifest, checksum, atomic rotation, and idempotent replay. Keep v1 export only through an explicit compatibility option.

Implement one OTLP/HTTP Protobuf exporter. Profiles select:

- base OTel;
- pinned OTel GenAI mapping;
- pinned OpenInference mapping.

Do not make those profiles internal schemas. Include mapping version in export metadata. Keep custom `watchdog.*` attributes when no semantically correct standard field exists. Never force approval/handoff/artifact/cost provenance into an incorrect standard attribute.

Do not build native trace exporters for Langfuse, Phoenix, Grafana, Datadog, Honeycomb, New Relic, Elastic, SigNoz, Weave, LangSmith, or Braintrust. They are OTLP profiles. Langfuse’s legacy trace API is deprecated; Phoenix uses OTLP/OpenInference. Consider a Langfuse score API only in a later evaluation-specific phase if OTLP cannot represent scores adequately.

Default exporter delivery: asynchronous bounded SQLite queue, 64 MiB or 50k refs/profile, 7 days, 10 attempts, 256 records/512 KiB mapped batch, 5 s connect/10 s request timeout, exponential full-jitter backoff capped at 5 minutes. Treat network/timeout/408/429/5xx as retryable, pause on 401/403, permanently reject other 4xx, honor bounded Retry-After, and handle partial success per record when possible. Queue overflow/drop/expiry is observable. Each profile has independent checkpoint, worker, circuit breaker, and budget. Export failure never changes proxy/model success.

Credentials are profile references, not hundreds of variables. A profile contains endpoint, mapping, batch/timeout/queue policy, and secret references. Recommend Collector fan-out in production but support direct OTLP.

Generic webhook is not first wave. If later authorized, require exact endpoint allowlist, HTTPS except explicit loopback, DNS/IP revalidation, block private/link-local/metadata addresses, no redirects, no source credential forwarding, HMAC timestamp/body, and the same bounded async delivery.

## Kujo and external integration sequence

After core/conformance/OTLP export:

1. Add the Agents SDK mapper and a live shared Watchdog client. `kujo agent` must report actual delivery state, not “prepared/local-only” as success.
2. Migrate Pi’s metadata-only producer to the shared v2 serializer/client while preserving its trusted-project opt-in, file permissions, atomic bounded spool, retry classification, and X-Observe compatibility.
3. Correlate RunLedger by run/reference only; do not copy receipts, changed files, commands, tests, verdicts, or notes.
4. Dispatch/Relay keep workflow/mission orchestration; they emit lifecycle spans/references. Replace Dispatch’s zero-duration event-to-span OTLP rendering.
5. Eval remains the engine; emit evaluation spans/score events and artifact references only.
6. MCP client emits tool span; instrumented server continues as child or linked trace. Record server/tool identity, status, latency, sizes, approval events. Content off.
7. Add AI-relevant OTLP ingest fixtures for AutoGen, Semantic Kernel, PydanticAI, LangChain/LlamaIndex/CrewAI/OpenInference rather than custom callbacks.
8. Package one metadata-only host adapter externally. Prefer Claude OTLP plus lifecycle hook gaps; otherwise Copilot HTTP hooks. Never scrape transcripts. Cursor is tier 2; VS Code observes extension-owned lifecycle only; Codex waits for a stable official host contract; Hermes remains proxy-only until lifecycle evidence exists.

Do not modify sibling repositories in a Watchdog-only phase. When sibling migrations are authorized, make separate small commits in each repository and keep fallback compatibility until clean integration tests pass.

## Conformance and tests

Build fixture-first offline suites before live integration:

- ingestion: minimum/full/replay/conflict/invalid IDs/times/nesting/stream/usage/error/malicious metadata/oversize/content modes/partial batch;
- exporter: mapping/auth/endpoint/gzip/bounds/batching/timeout/retry/Retry-After/partial/permanent/restart/full/expiry/multi-profile/privacy/correlation/usage/cost;
- migration: fresh DB, every supported old schema, interruption/restart, backfill, backup/restore, compatibility query parity;
- security: decompression bomb, trace poisoning, tenant spoofing, ID collision, path/credential/content canaries, queue/retry amplification;
- live: opt-in dedicated projects/credentials only, never required for ordinary CI.

Update current watchdog API, proxy, auth/rate, redaction, retention/export, backup, pricing, frontend, and load/soak tests. CI validates JSON Schema/JSON, generated/mirrored files, docs links, offline conformance, and clean tree.

## Performance release gates

Implement a paired direct-vs-Watchdog harness for JSON and true streaming. Record p50/p95/p99 total and added latency, TTFT, throughput, CPU, RSS, and DB bytes/event. Enforce:

- nonstream proxy overhead p50 <=3 ms, p95 <=10 ms, p99 <=25 ms;
- stream TTFT overhead p95 <=10 ms with memory independent of full response size;
- v2 100-record ingest p95 <=25 ms after body receipt;
- persistence transaction p95 <=10 ms/default batch;
- exporter enqueue p95 <=5 ms;
- exporter-down versus disabled proxy p95 delta <=2 ms;
- default-bound RSS delta <=64 MiB and startup increment <=1 s.

Run sustained 10/50/200 events/s for 30 minutes and 1k bursts with a dashboard reader, queue outage/recovery, retention, and content-on worst case. Publish the measured supported SQLite envelope rather than an unqualified EPS claim. Local metadata retention is complete by default; do not add probabilistic sampling. Deterministic export sampling may be a later additive feature.

## File ownership and quality controls

Keep canonical source under `src/` and preserve repository mirror/generation conventions. Use migrations rather than editing installed DBs. Add dependencies only when their audit/size/license/maintenance cost is justified; prefer a minimal Protobuf implementation already supported by the Kujo runtime. Do not mix remote I/O into request transactions.

For each phase: update relevant schema/ADR/docs, golden fixtures, security tests, benchmarks, migration/rollback notes, and supported-version matrix. Commit small meaningful units. Before release, satisfy every checkbox in [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md), resolve or explicitly accept every item in [RISK_REGISTER.md](RISK_REGISTER.md), run clean-machine verification, and leave the working tree clean.

