# Watchdog telemetry interoperability

Status: implementation-ready research package, 2026-09-01  
Scope: Watchdog `1.0.1` at `c5625d0` plus read-only review of the named Kujo siblings and current first-party ecosystem documentation.

## Decision

Watchdog should be a **local-first AI telemetry gateway**: a policy enforcement and interoperability boundary between AI telemetry producers and operator-selected observability destinations. “Bus” overstates its durability and broker semantics; “proxy” understates native push ingestion; “observability platform” claims responsibilities that remain downstream.

Watchdog owns a small provider-neutral record, correlation, privacy/redaction, bounded SQLite persistence, local views, and isolated export delivery. It does not own enterprise retention, alerting, SLOs, fleet-wide search, workflow orchestration, evaluation execution, or billing truth.

```text
 OpenAI-compatible traffic   Kujo runtimes   host/framework OTLP or adapters
             \                    |                    /
              +------ proxy / /telemetry/v2 ----------+
                                  |
                     validate -> normalize -> policy
                                  |
                 canonical records + bounded SQLite
                       /          |          \
              dashboard       JSONL v2   outbound queue
                                              |
                         OTLP + mapping profiles
                     OTel GenAI / OpenInference / base
                                              |
                 Collector, Langfuse, Phoenix, Grafana,
                 Datadog, Honeycomb, New Relic, Weave,
                 LangSmith, Braintrust, Elastic, SigNoz
```

The canonical model uses spans for timed operations and events for points in time. The same fact is stored once: events annotate a span or trace and never repeat a complete operation payload. `trace_id`, `span_id`, and `parent_span_id` are canonical W3C-compatible identifiers. `session_id` and `run_id` are the two cross-trace grouping IDs. Turn, workflow, task, agent, tool-call, request, and provider IDs are typed references or source provenance, not columns every record must carry.

## First implementation wave

1. Canonical `watchdog.telemetry.v2`, normalization boundary, JSONL v2, and conformance fixtures.
2. Bounded asynchronous OTLP/HTTP exporter with base OTel, version-pinned OTel GenAI, and OpenInference mapping profiles. Destination profiles cover the collector ecosystem, Langfuse, Phoenix, Grafana, Datadog, Honeycomb, and peers without native trace exporters.
3. Agents SDK / `kujo agent` push adapter and shared Watchdog client/spool, with Pi migrated onto the same contract.
4. Guarded AI-relevant OTLP/HTTP trace ingestion as the external ecosystem proof; reject generic telemetry and unsupported signal types.
5. Claude Code or Copilot hook adapter as the first host package, selected by fixture availability. Both have documented lifecycle hooks; Claude additionally emits OTLP. Keep this outside core.

These are five interoperability layers, not five vendor forks. JSONL is part of the core schema phase. A Langfuse-native trace exporter and Phoenix-native trace exporter are explicitly not in the wave because both accept OTLP; Langfuse’s legacy trace API is deprecated.

## Package map

- [Current architecture](01-current-architecture.md) and [contracts](02-current-telemetry-contracts.md)
- [Landscape](03-observability-landscape.md), [standards](04-standards-research.md), [ingestion](05-ingestion-landscape.md), and [exporters](06-exporter-landscape.md)
- [Target architecture](07-target-architecture.md), [canonical model](08-canonical-telemetry-model.md), and [correlation](09-trace-correlation-model.md)
- [Ingestion contract](10-ingestion-adapter-contract.md), [export contract](11-exporter-contract.md), and [OTel/OpenInference mapping](12-otel-openinference-mapping.md)
- [Security/privacy](13-security-privacy-review.md), [storage/performance](14-storage-performance-review.md), [host matrix](15-agent-framework-host-matrix.md), and [distribution](16-distribution-analysis.md)
- [Priorities](17-integration-priorities.md), [risks](RISK_REGISTER.md), [acceptance](ACCEPTANCE_CRITERIA.md), [implementation plan](IMPLEMENTATION_PLAN.md), and [implementation prompt](IMPLEMENTATION_PROMPT.md)
- Machine contracts: [schema](TELEMETRY_SCHEMA_PROPOSAL.json), [ingestion matrix](INGESTION_MATRIX.json), [exporter matrix](EXPORTER_MATRIX.json), and [host matrix](HOST_TELEMETRY_MATRIX.json)
- Research audit: [source ledger](SOURCE_LEDGER.md) and [canonical research synthesis](report-source.md)

## Explicit answers

1. **Owns today:** OpenAI-compatible forwarding, local capture/query/dashboard, request/tool/step and trace/span/event persistence, pricing estimates with provenance, redaction/content capture policy, auth/rate limits, retention, JSONL export, and backup.
2. **Already generic:** `kujo.telemetry.v1` trace/span/event intake, source/session/correlation metadata, bounds, idempotency, query APIs, policy, SQLite operations.
3. **OpenAI-coupled:** proxy semantic parsing, Chat Completions usage/content/finish extraction, proxy-generated lifecycle records, and the legacy SDK wrapper.
4. **Kujo-coupled:** event names, correlation headers, Pi producer behavior, Agents SDK trace shape, and dashboard language; the storage primitives themselves need not be.
5. **Boundary:** local-first AI telemetry gateway.
6. **Model:** envelope + trace/span/event, typed references, normalized usage/cost/error/content, source provenance.
7. **Spans internally:** yes, for timed operations; events for milestones only.
8. **Hierarchy:** W3C trace/span parentage; session and run group traces; all other IDs are typed refs/provenance.
9. **OTLP ingest:** yes, traces only, loopback/authenticated, size/rate bounded, and gated to AI-relevant spans. Never a generic collector.
10. **OTLP export:** yes; the primary remote transport.
11. **OpenInference:** first-class, versioned export/import mapping profile, not the internal schema.
12. **OTLP-only destinations:** Collector, Grafana/Tempo, Datadog, Honeycomb, New Relic, Elastic, SigNoz, Jaeger, LangSmith, Weave, Braintrust, Langfuse traces, and Phoenix traces.
13. **Native exporters:** none for traces in wave one. A later Langfuse score client may add value for Eval scores. Webhook and JSONL are generic contracts.
14. **Langfuse:** OTLP profile now; no legacy native trace adapter. Reassess scores separately.
15. **Phoenix:** OTLP with OpenInference projection; no Phoenix-specific trace client.
16. **Grafana/Datadog/Honeycomb:** OTLP only.
17. **JSONL:** versioned envelope, one canonical record per line, deterministic ordering, stable cursor, replayable and independent of database rows.
18. **Webhook:** tier 3, after OTLP; HTTPS/loopback only, allowlisted host, HMAC, SSRF controls, bounded async queue.
19. **Ingestion contract:** source batch -> validation -> ID/time normalization -> semantic mapping -> authoritative policy -> canonical sink; no DB access.
20. **Exporter contract:** approved canonical batch + checkpoint -> bounded destination request + classified per-record outcome; no raw source or DB access.
21. **Pi:** preserve metadata-only lifecycle and spool behavior; replace its private serializer/delivery with the shared v2 client and mapping.
22. **Kujo Agent:** Agents SDK emits canonical events to the shared client; the plugin/host bridge supplies source refs but never a new schema.
23. **Codex/Claude/etc.:** use official OTLP when available; otherwise a thin hook/app-server adapter. Unknown capabilities remain null and must not be inferred from transcripts.
24. **Frameworks:** point existing OTel/OpenInference instrumentors at guarded OTLP ingest; write adapters only for missing stable signals.
25. **No initial custom adapter:** AutoGen, Semantic Kernel, PydanticAI, LangChain, LlamaIndex, and CrewAI have OTel/OpenInference paths of varying maturity; validate fixtures instead.
26. **MCP:** one client tool span, optional server child span/link, server/tool identity and status/duration/sizes; approval as event; payload content opt-in.
27. **RunLedger:** keeps durable execution receipts/evidence; Watchdog keeps operational telemetry. Correlate with `run_id` and artifact reference, never copy receipts.
28. **Eval:** attach score/evaluation events or artifact refs to an observed trace/span; Eval remains the engine.
29. **Dispatch/Relay:** they own workflow/mission state; emit run/workflow references and lifecycle spans into Watchdog.
30. **Default storage:** bounded operational metadata, counts, statuses, timestamps, model/provider names, hashed/bounded refs, and error classifications.
31. **Opt-in content:** prompts, responses, tool arguments/results, retrieval bodies, shell commands/output, artifacts, and detailed error bodies.
32. **Identifiers:** allowlist and bound; hash paths, repository, user/tenant/email-like values by default; preserve opaque operational IDs only when needed.
33. **Exporter failure:** isolated, asynchronous, classified, observable; optional telemetry never fails the application unless explicit strict mode is used outside proxy request latency.
34. **Durable spool:** yes, bounded SQLite outbound queue with byte/age/attempt limits and dead letters; adapt Pi’s proven semantics.
35. **Multi-export:** independent queue/checkpoint per profile; one exporter cannot block another.
36. **Credentials:** environment or OS secret provider referenced by profile; never stored in event rows, JSONL, committed config, or spool payload headers.
37. **SQLite limit:** local single-writer deployment, validated by workload benchmarks rather than a claimed universal EPS. Apply explicit admission and storage limits; scale out by exporting, not clustering SQLite.
38. **Budgets:** p95 proxy overhead <=10 ms excluding upstream, p95 local ingest acknowledgement <=25 ms for 100-record batch, enqueue <=5 ms p95, exporter work off request path, RSS delta <=64 MiB at default bounds, queue <=64 MiB/50k records by default.
39. **First integrations:** OTLP export/profiles, OpenInference projection, Kujo Agents/Agent + Pi, guarded OTLP ingest, one host hook adapter; JSONL v2 is baseline.
40. **Do not build:** vendor-native Grafana/Datadog/Honeycomb/New Relic/Elastic/SigNoz/Phoenix trace clients, Langfuse legacy trace client, polling scrapers, transcript parsers, or generic logs/metrics collector.
41. **Distribution:** OTel Collector catalogs/examples, OpenInference/Phoenix instrumentor users, Langfuse OTLP users, Kujo/Agents/Pi users, and host plugin/hook ecosystems. Marketplace listings are opportunities until actually accepted.
42. **Smallest proof:** ingest one v2 Kujo trace and one OpenInference OTLP trace, view both locally, export both as JSONL v2 and OTLP to a fixture collector, survive destination outage/restart, and prove content remains off.
43. **Migration:** additive v2 tables/views and normalization facade; v1 endpoints translate into v2; dashboard reads compatibility views; backfill metadata only; retire direct DB producers last.
44. **Backward compatible:** `/proxy/v1`, `/api/telemetry/requests`, `/api/telemetry/traces`, correlation headers, current dashboard/API v1, default privacy, existing database, export v1 while explicitly selected.
45. **Out of scope:** enterprise observability backend, general collector, SIEM/log warehouse, orchestrator, eval engine, billing authority, hosted requirement, and unbounded/high-scale infrastructure.

