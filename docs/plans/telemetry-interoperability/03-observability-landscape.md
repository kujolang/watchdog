# Observability landscape

The market separates into transport/infrastructure, AI-semantic platforms, framework-owned tracing, and local proxy products. Watchdog should interoperate across those categories without absorbing their product responsibilities.

| Category | Examples | They should own | Watchdog relationship |
|---|---|---|---|
| telemetry standard/transport | OpenTelemetry, OTLP, W3C Trace Context | wire interoperability and distributed context | map canonical records at the boundary |
| collector/backends | OTel Collector, Tempo/Grafana, Datadog, Honeycomb, New Relic, Elastic, SigNoz, Jaeger | fleet ingestion, long retention, queries, alerts, SLOs | OTLP export only |
| AI observability | Langfuse, Phoenix, LangSmith, Weave, Braintrust | AI-specific exploration, datasets, scoring/evals, team workflows | OTLP plus OTel GenAI/OpenInference projection; scores later if justified |
| framework instrumentation | LangChain, LlamaIndex, CrewAI, AutoGen, PydanticAI, Semantic Kernel, Mastra | lifecycle hooks close to runtime | emit OTel/OpenInference into guarded intake |
| proxy/local products | Helicone and similar | provider traffic interception and hosted/local product features | competitive reference, not a protocol dependency |
| execution evidence | RunLedger | durable receipt, git/command/test/verdict evidence | correlate by run/artifact reference |

## Boundary validation

The proposed ownership principle matches the code. Watchdog already has the most leverage at the point where traffic or lifecycle events cross a privacy boundary. It can guarantee local visibility, normalize provider/framework differences, and route approved records. Building enterprise querying or alerting would duplicate mature platforms and undermine local simplicity.

“Telemetry bus” is inaccurate because the desired system does not provide general topic routing, arbitrary schemas, subscriber offsets, or indefinite durable delivery. “Bridge” understates policy and persistence. **Local-first AI telemetry gateway** accurately captures admission, normalization, policy enforcement, local evidence, and egress routing.

## Standards and vendor convergence

Current first-party documentation shows broad OTLP trace ingestion across Langfuse, Phoenix, Grafana/Tempo, Datadog, Honeycomb, New Relic, Elastic, SigNoz, Weave, LangSmith, and Braintrust. This sharply reduces the value of native trace clients. AI semantics are less converged: OTel GenAI conventions are evolving, while OpenInference is an OTel-compatible AI projection with broad instrumentation coverage. Watchdog therefore needs one transport implementation and multiple versioned mapping profiles—not vendor-specific persistence readers.

## Deliberate exclusions

- No Kafka, ClickHouse, Elasticsearch, Redis, or Postgres migration for the local gateway.
- No organization-wide log collection or arbitrary host metrics.
- No polling of SaaS systems for telemetry that can be pushed or proxied.
- No transcript scraping where a documented lifecycle or OTLP interface exists.
- No destination SDK in core unless OTLP demonstrably loses a required semantic and the target has a stable, self-host-compatible API.

