# Exporter landscape

## Destination decision table

| Destination | Current trace ingestion | Recommended strategy | Native Watchdog trace adapter? |
|---|---|---|---|
| OTel Collector | OTLP | base OTLP profile | no |
| Grafana Tempo | OTLP gRPC/HTTP, commonly via Collector | OTLP | no |
| Datadog | direct OTLP/HTTP and Agent/Collector paths | OTLP; recommend Agent/Collector in production | no |
| Honeycomb | direct OTLP gRPC/HTTP | OTLP | no |
| New Relic | native OTLP, HTTP protobuf recommended | OTLP | no |
| Elastic | native OTLP/APM integration | OTLP | no |
| SigNoz | OTel-native OTLP | OTLP | no |
| Jaeger | OTLP in current deployments or Collector | OTLP | no |
| Zipkin | Zipkin protocol/Collector | Collector translates OTLP | no |
| Langfuse | v4 trace ingestion through OTLP/HTTP; legacy trace ingestion deprecated | OTLP Langfuse profile; separate score API only if needed later | no |
| Phoenix | OTLP gRPC/HTTP with OpenInference semantics | OTLP + OpenInference profile | no |
| LangSmith | OTLP supported | OTLP mapping profile | no |
| W&B Weave | OTLP endpoint; OpenInference example | OTLP/OpenInference profile | no |
| Braintrust | OTLP endpoint with GenAI mapping | OTLP GenAI profile | no |
| Sentry | evolving OTLP coverage | tier 3 compatibility validation | no |
| Helicone | product-specific proxy/API; equivalence not established here | no initial integration | no |
| JSONL | file/stream | canonical JSONL v2 | built in |
| custom webhook | arbitrary HTTP JSON | defer until SSRF/HMAC controls exist | generic only |

## Langfuse ruling

Langfuse’s current public API documentation says traces/spans are ingested through OTLP in v4 and marks the legacy trace/generation/span ingestion API deprecated, with a 2026 cloud sunset. A new native trace client would create immediate migration debt and no semantic advantage. Use resource attributes for session/user/tags only after Watchdog identifier policy. Eval score publishing is distinct: Langfuse’s score API may be a later, narrow exporter for score observations that OTLP cannot represent faithfully.

## Phoenix/OpenInference ruling

Phoenix accepts OTLP and is designed around OpenInference semantics. An OpenInference projection over the shared OTLP transport preserves LLM/tool/retriever/agent kinds without a Phoenix client. Keep mapping versioned because OpenInference evolves and content-heavy attributes must remain suppressed unless policy permits.

## Delivery behavior

All remote exporters are asynchronous. The primary path commits approved canonical telemetry and an exporter queue item in one local transaction, then returns. Workers independently batch by profile, export with timeout, classify outcomes, and update checkpoints. Retry transport errors, `408`, `429`, and `5xx`; honor bounded `Retry-After`. Do not retry authentication/authorization, schema rejection, or permanent `4xx` indefinitely. Dead-letter only bounded metadata and approved payload, never credentials.

Modes:

- `best_effort`: memory queue allowed, drops counted; suitable for development.
- `buffered` (default when an exporter is enabled): bounded durable SQLite queue.
- `strict`: ingestion API may report exporter unavailability only for explicitly synchronous administrative submissions; proxy/model execution still must not fail because a destination is down.

## Credentials and profiles

Use named profiles containing mapping profile, endpoint, signal, batch/timeout/queue policy, and references to secret environment variables or OS secret IDs. Headers are constructed at send time and are never stored with telemetry. One profile may target Langfuse, another a local Collector, and JSONL can run concurrently.

## Primary destination sources

- [Langfuse public API and OTLP ingestion](https://langfuse.com/docs/api-and-data-platform/features/public-api)
- [Langfuse compatibility](https://langfuse.com/docs/compatibility)
- [Phoenix self-hosted OTLP configuration](https://arize.com/docs/phoenix/self-hosting/configuration)
- [Grafana Tempo through an OTel Collector](https://grafana.com/docs/tempo/latest/set-up-for-tracing/instrument-send/set-up-collector/otel-collector/)
- [Datadog OTLP trace ingest](https://docs.datadoghq.com/opentelemetry/setup/otlp_ingest/traces/)
- [Honeycomb OpenTelemetry ingest](https://docs.honeycomb.io/send-data/opentelemetry)
- [New Relic OTLP guidance](https://docs.newrelic.com/docs/opentelemetry/best-practices/opentelemetry-otlp/)
- [Elastic OpenTelemetry intake](https://www.elastic.co/docs/solutions/observability/apm/opentelemetry-intake-api)
- [SigNoz self-hosted ingestion](https://signoz.io/docs/ingestion/self-hosted/overview/)
- [Weave OTLP](https://docs.wandb.ai/weave/guides/tracking/otel)
- [LangSmith OTLP](https://docs.langchain.com/langsmith/trace-with-opentelemetry)
- [Braintrust OTLP](https://www.braintrust.dev/docs/integrations/sdk-integrations/opentelemetry)

