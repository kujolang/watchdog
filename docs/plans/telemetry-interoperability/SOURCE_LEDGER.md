# Source ledger

Research accessed 2026-09-01. Primary source claims are summarized; no source is treated as Watchdog’s internal contract.

## Repository evidence

- Watchdog `README.md`, `src/dashboard_server.kujo`, `src/watchdog_shared.kujo`, `src/watchdog.kujo`, `schemas/telemetry-trace-v1.schema.json`, migrations, tests, docs, security/CI/release/benchmark files at `c5625d0`.
- Read-only sibling review: `../kujo`, `../agents-sdk`, `../ai-sdk`, `../relay`, `../dispatch`, `../runledger`, `../eval`, `../kujo-pi`, `../mcp`, `../kujo-agents`, and `../kujo-workflows`.
- Key code facts were cross-checked against tests/fixtures: v1 bounds/idempotency, Pi spool, Agents event kinds, Dispatch trace rendering, Relay correlation, RunLedger receipt schema, and Eval result shape.

## Standards

- [W3C Trace Context Recommendation](https://www.w3.org/TR/trace-context/) — canonical trace/span widths and propagation.
- [W3C Baggage](https://www.w3.org/TR/baggage/) — Candidate Recommendation and privacy-sensitive propagation.
- [OTLP specification](https://opentelemetry.io/docs/specs/otlp/) — protocol and HTTP signal endpoints.
- [OTLP exporter specification](https://opentelemetry.io/docs/specs/otel/protocol/exporter/) — endpoint, headers, timeout/compression/retry configuration.
- [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/) — vendor-neutral receiver/processor/exporter pipeline.
- [OpenTelemetry stability](https://opentelemetry.io/docs/specs/otel/versioning-and-stability/) — signal/spec stability framing.
- [OTel log data model](https://opentelemetry.io/docs/specs/otel/logs/data-model/) and [metrics data model](https://opentelemetry.io/docs/specs/otel/metrics/data-model/) — signal model evidence.
- [OTel GenAI conventions](https://github.com/open-telemetry/semantic-conventions-genai) — active, separately evolving semantic repository.
- [OpenInference](https://github.com/Arize-ai/openinference) and [semantic conventions](https://github.com/Arize-ai/openinference/blob/main/spec/semantic_conventions.md) — OTel-compatible AI span kinds/attributes and instrumentor ecosystem.

## Destinations

- [Langfuse public API](https://langfuse.com/docs/api-and-data-platform/features/public-api), [compatibility](https://langfuse.com/docs/compatibility), and [scores](https://langfuse.com/docs/evaluation/evaluation-methods/scores-via-sdk) — OTLP v4 trace ingestion, legacy trace deprecation, separate score API.
- [Phoenix configuration](https://arize.com/docs/phoenix/self-hosting/configuration) and [authentication](https://arize.com/docs/phoenix/deployment/authentication) — OTLP and self-hosted auth.
- [Grafana Tempo/Collector](https://grafana.com/docs/tempo/latest/set-up-for-tracing/instrument-send/set-up-collector/otel-collector/).
- [Datadog OTLP traces](https://docs.datadoghq.com/opentelemetry/setup/otlp_ingest/traces/).
- [Honeycomb OpenTelemetry](https://docs.honeycomb.io/send-data/opentelemetry).
- [New Relic OTLP](https://docs.newrelic.com/docs/opentelemetry/best-practices/opentelemetry-otlp/).
- [Elastic OTel intake](https://www.elastic.co/docs/solutions/observability/apm/opentelemetry-intake-api).
- [SigNoz ingestion](https://signoz.io/docs/ingestion/self-hosted/overview/).
- [W&B Weave OTLP](https://docs.wandb.ai/weave/guides/tracking/otel).
- [LangSmith OTLP](https://docs.langchain.com/langsmith/trace-with-opentelemetry).
- [Braintrust OTLP](https://www.braintrust.dev/docs/integrations/sdk-integrations/opentelemetry).

## Hosts/frameworks/providers

- [Claude Code hooks](https://code.claude.com/docs/en/hooks), [monitoring](https://code.claude.com/docs/en/monitoring-usage), and [Agent SDK OTLP](https://code.claude.com/docs/en/agent-sdk/observability).
- [GitHub Copilot hooks](https://docs.github.com/en/copilot/reference/hooks-reference) and [SDK hook overview](https://docs.github.com/en/copilot/how-tos/copilot-sdk/hooks/hooks-overview).
- [Cursor hooks](https://prod.cursor.com/docs/hooks) and [OTel export](https://prod.cursor.com/docs/enterprise/opentelemetry-export).
- [VS Code Chat Participant API](https://code.visualstudio.com/api/extension-guides/ai/chat) and [Language Model API](https://code.visualstudio.com/api/references/vscode-api).
- Official OpenAI documentation search did not establish a stable public Codex all-lifecycle telemetry hook contract; the matrix records unknown rather than inferring one.
- [AutoGen tracing](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tracing.html).
- [Semantic Kernel observability](https://learn.microsoft.com/en-us/semantic-kernel/concepts/enterprise-readiness/observability/) and [advanced telemetry](https://learn.microsoft.com/en-us/semantic-kernel/concepts/enterprise-readiness/observability/telemetry-advanced).
- [Mastra observability](https://mastra.ai/ai-agent-observability) — OpenTelemetry-compatible export and model/tool/workflow trace coverage.
- [OpenAI Chat Completions usage](https://platform.openai.com/docs/api-reference/chat/create), [Gemini usage metadata](https://ai.google.dev/api/generate-content), [Anthropic pricing/usage categories](https://docs.anthropic.com/en/docs/about-claude/pricing), and [Bedrock Converse/cache usage](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html).

## Claim-to-source checks

| Decision | Repository/primary evidence |
|---|---|
| local-first gateway, not platform | current SQLite/dashboard/proxy/policy scope; destination products own fleet functions |
| OTLP primary exporter | OTLP spec plus current destination docs above |
| no Langfuse native trace client | current Langfuse public API/deprecation docs |
| Phoenix through OpenInference OTLP | Phoenix OTLP docs + OpenInference OTel specification |
| guarded trace-only OTLP ingest | framework/host OTel availability balanced against local gateway non-goal |
| shared spool/client | Pi’s tested bounded spool plus Agents SDK missing live Watchdog delivery |
| usage remains provider-native | OpenAI/Gemini/Anthropic/Bedrock definitions differ materially |
| unknown Codex fields | official docs review did not establish them; null is required by research brief |
