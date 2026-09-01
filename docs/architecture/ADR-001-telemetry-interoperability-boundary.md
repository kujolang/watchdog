# ADR-001: Watchdog is a local-first AI telemetry gateway

Status: accepted (2026-09-01)

## Decision

Watchdog owns canonical AI telemetry normalization, correlation, authoritative privacy policy, bounded local persistence, local visibility, and isolated export routing. It accepts telemetry through the existing OpenAI-compatible proxy, versioned native ingestion adapters, and a guarded AI-trace subset of OTLP. It exports a stable JSONL contract and versioned OTLP mapping profiles.

The durable internal contract is `watchdog.telemetry.v2`. It is deliberately smaller than OpenTelemetry and OpenInference. Trace, span, and event are the only structural record types; domain semantics such as model, tool, agent, workflow, handoff, approval, execution, retrieval, persistence, and evaluation are span kinds or references.

OpenTelemetry collectors and downstream platforms continue to own large-scale storage, distributed tracing infrastructure, enterprise dashboards, alerting, SLOs, and long-term retention. Watchdog does not become a general OTLP collector, log platform, metrics warehouse, SIEM, workflow engine, eval engine, or billing system.

## Consequences

- Adapters normalize into v2 and never write database tables.
- Exporters consume policy-approved repository records and never read tables directly.
- Existing v1 endpoints remain compatibility surfaces translated into v2 during migration.
- Content remains off unless the operator explicitly opts in; adapters cannot expand capture.
- OTLP export is first-class. Grafana, Datadog, Honeycomb, New Relic, Elastic, SigNoz, Jaeger, Zipkin, and compatible collectors do not receive dedicated trace exporters.
- Langfuse and Phoenix initially use pinned OTLP/OpenInference mapping profiles; native exporters are deferred until fixture evidence proves a material semantic gap.
- Optional telemetry delivery is asynchronous and fail-open for the observed application. Durable queues are bounded.

## Rejected alternatives

- **Telemetry bus:** implies a general broker and broader delivery guarantees than Watchdog owns.
- **Observability platform:** overlaps deliberately external storage, analytics, alerting, and dashboard responsibilities.
- **OpenTelemetry-native internal model:** couples database evolution to experimental semantic conventions and loses Watchdog-specific privacy and provenance semantics.
- **Exporter-specific raw transforms:** bypasses authoritative privacy policy and creates incompatible source-to-destination paths.
