# Dependency-ordered implementation plan

## Phase 0 — Lock baselines and decision records

**Goal:** preserve immutable v1/API/privacy/performance evidence.  
**Files:** existing schemas, tests, fixtures, docs; new `docs/architecture/` ADRs and golden baseline manifest.  
**Reuse:** current telemetry schema tests, proxy stub, redaction, load/soak, backup/retention tests.  
**New:** snapshot fixtures for all current API/JSONL rows and paired direct/proxy benchmark harness.  
**Security/docs:** record content-off/basic-redaction outputs and threat boundary.  
**Exit:** clean-machine baseline is reproducible and checksummed; no feature code.

## Phase 1 — Canonical v2 types and pure normalization

**Goal:** implement the compact trace/span/event model and W3C/reference/usage/cost/error/content types.  
**Likely files:** `schemas/telemetry-v2.schema.json`, new `src/telemetry_v2.kujo`, `src/telemetry_normalize.kujo`, schema tests.  
**Reuse:** v1 validators, bounds/redaction helpers, provider pricing provenance.  
**New:** pure v1, proxy, and canonical JSON normalizers; deterministic ID/time utilities; typed refs.  
**Tests/fixtures:** provider usage variants, invalid IDs/times, nested lifecycle, null/zero, cost provenance, canonical golden JSON.  
**Security:** classify all source fields; no persistence/network in normalizers.  
**Exit:** fixture-only conformance passes and v1 conversion is loss-audited.

## Phase 2 — Authoritative policy and canonical repository

**Goal:** make one policy/persistence path authoritative.  
**Likely files:** `src/watchdog_shared.kujo`, new migration(s), `src/dashboard_server.kujo`, compatibility views/repository module.  
**Reuse:** SQLite bootstrap/migration/index patterns, redaction/content modes, auth/rate limits.  
**New:** v2 tables/ingest sequence/source namespace/refs; repository API; audit warnings.  
**Tests:** replay/conflict/transaction/parentage, migration/restart, compatibility query parity, canary scan, concurrent batch writes.  
**Benchmarks:** DB bytes/record and write latency at defined envelopes.  
**Exit:** proxy and v1 intake can write v2 through one transaction while existing APIs/tests stay green.

## Phase 3 — JSONL v2 and compatibility migration

**Goal:** prove database-neutral egress/replay before remote delivery.  
**Likely files:** export routes/module, JSONL schema/manifest, CLI/docs/tests.  
**Reuse:** current export filtering/bounds and backup filesystem safety.  
**New:** stable ingest cursor, canonical line envelope, manifest/checksum/rotation/replay.  
**Tests:** deterministic order, concurrent ingest snapshot semantics, cursor resume, truncation, replay idempotency, v1 explicitly selectable.  
**Exit:** round-trip canonical equality and content-off scan pass.

## Phase 4 — Ingestion/exporter conformance harnesses and shared client

**Goal:** make contracts executable offline.  
**Likely files:** `tests/fixtures/telemetry-v2/`, `tests/ingestion_conformance.*`, `tests/exporter_conformance.*`, new lightweight client/spool module/package.  
**Reuse:** Pi atomic spool semantics (permissions, byte/file/age bounds, permanent/transient classification), proxy stub server patterns.  
**New:** adapter manifest, fixture runner, fake OTLP/webhook servers, shared bounded client.  
**Security:** no live network by default; canary scans; secret resolver mocks.  
**Exit:** a reference adapter/exporter passes all offline vectors.

## Phase 5 — Bounded exporter journal and OTLP/HTTP

**Goal:** reliable isolated standards export.  
**Likely files:** migration, `src/export_queue.kujo`, `src/export_otlp.kujo`, config/profile parser, worker lifecycle, diagnostics/dashboard health.  
**Reuse:** SQLite transactions, rate/retention conventions, backup diagnostics.  
**New:** profile/delivery/checkpoint/dead-letter tables, Protobuf encoder or minimal audited dependency, gzip, retry/circuit breaker.  
**Tests:** auth, endpoint parsing, batching, partial success, `Retry-After`, restart, queue full/expiry, multi-export isolation.  
**Benchmarks:** enqueue delta <=5 ms; exporter-down proxy delta <=2 ms; RSS/queue bounds.  
**Exit:** Collector fixture receives correct trace and failures cannot affect proxy success.

## Phase 6 — OTel GenAI and OpenInference profiles

**Goal:** AI-native semantics without internal coupling.  
**Likely files:** checked-in mapping tables and golden OTLP fixtures, profile docs.  
**Reuse:** single OTLP transport.  
**New:** pinned base/GenAI/OpenInference mappers; mapping-version resource metadata; loss reporting.  
**Tests:** model/tool/agent/retrieval/eval, usage/cost/content-off, Langfuse/Phoenix fixture expectations.  
**Exit:** same canonical trace exports under all profiles without schema migration; no content canaries.

## Phase 7 — Kujo native ingestion migration

**Goal:** Agents SDK, `kujo agent`, and Pi use canonical push delivery.  
**Files in this repo:** client/adapter docs, fixtures, compatibility tests. **Sibling changes require separate authorized tasks** in `agents-sdk`, `kujo`, and `kujo-pi`.  
**Reuse:** Agents SDK lifecycle/sink, Pi metadata bridge/spool/correlation, current X-Observe headers.  
**New:** Agents mapper, live delivery sink, shared client; Pi serializer/spool replacement.  
**Tests:** nested agents/handoffs/tools/model calls, retries/compaction, offline/restart, RunLedger run ref.  
**Exit:** no “prepared/local-only” success claim; existing v1 remains fallback during window.

## Phase 8 — Guarded AI OTLP trace ingest

**Goal:** external standards-based ingestion without becoming a collector.  
**Likely files:** OTLP decoder/receiver route, source policy/config, conformance fixtures.  
**New:** Protobuf decode, AI relevance gate, OTel/OI import mappings, partial success response.  
**Tests:** AutoGen/Semantic Kernel/PydanticAI/LangChain/LlamaIndex fixtures, generic/log/metric rejection, decompression/poisoning/tenant tests.  
**Exit:** external AI trace displays/exports canonically; generic telemetry is rejected.

## Phase 9 — One host adapter and MCP helper

**Goal:** prove fast-moving external lifecycle packaging.  
**Files:** separate official adapter package/repository plus fixtures/docs here; no in-process arbitrary scripts.  
**Choice gate:** Claude OTLP + hook-gap adapter if fixture access is stable; otherwise Copilot HTTP hook adapter.  
**Tests:** session/turn/tool/approval/subagent/compact/error, timeout, host version, raw-payload canaries.  
**MCP:** client/server propagation, double-count avoidance, sizes/status-only default.  
**Exit:** install/uninstall and clean-machine offline proof; permissions documented.

## Phase 10 — Hardening, multi-export, release

**Goal:** validate production envelope and rollback.  
**Tests:** concurrent local dashboard + JSONL + two OTLP profiles, auth failure, rate limit, disk full simulation, retention, backup/restore, migration rollback.  
**Benchmarks:** all published budgets and sustained/burst matrix.  
**Docs:** operator profiles, privacy, supported versions, loss matrix, troubleshooting, release notes.  
**Exit:** all acceptance criteria checked, clean checkout green, compatibility window and deprecation dates explicit.

