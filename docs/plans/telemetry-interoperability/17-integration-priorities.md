# Integration priorities

## Tier 0: architecture prerequisites

Canonical v2, normalization/policy/repository boundaries, stable JSONL v2, conformance harnesses, W3C IDs, and bounded exporter journal. These are not optional groundwork and must land before vendor-facing claims.

## Tier 1: first wave

1. **OTLP/HTTP exporter and destination profiles.** Proves standards export and reaches Collector, Langfuse, Phoenix, Grafana, Datadog, Honeycomb, New Relic, Elastic, SigNoz, Weave, LangSmith, and Braintrust with one transport.
2. **OpenInference projection.** Proves AI-native semantics and Phoenix/framework compatibility without a Phoenix client.
3. **Agents SDK / `kujo agent` adapter plus Pi migration.** Proves native Kujo ingestion, shared client/spool, nested agent/tool/model correlation, and removes local-transform-only behavior.
4. **AI-relevant OTLP trace receiver.** Proves external ecosystem ingestion for AutoGen/Semantic Kernel/PydanticAI/LangChain/LlamaIndex/CrewAI instrumentors while preserving the non-collector boundary.
5. **One external host hook adapter.** Prefer Claude Code when OTLP plus hook-gap fixtures are stable; otherwise Copilot CLI’s explicit HTTP hook contract. Package outside core.

JSONL v2 ships with tier 0 and provides the portable offline export requirement.

## Tier 2

- Dispatch/Relay/workflows adapter using shared run/reference contract.
- MCP client/server helpers and conformance fixtures.
- Additional host adapters (Copilot, Cursor, Hermes proxy profile).
- Eval score export after comparing OTLP representation with Langfuse/Braintrust score APIs.
- Responses API and embeddings proxy decoders.

## Tier 3 / monitor

- Generic signed webhook after SSRF and endpoint governance.
- Metrics exporter derived from canonical records.
- OTel logs for unscoped gateway/security events.
- VS Code extension and Codex official integration after stable lifecycle APIs are verified.
- Adapter scaffold CLI after real external adapters reveal stable repetition.

## Deliberately not built

- Native trace exporters for Langfuse, Phoenix, Grafana, Datadog, Honeycomb, New Relic, Elastic, SigNoz, Weave, LangSmith, or Braintrust.
- Langfuse legacy trace API support.
- Generic OTLP logs/metrics collection.
- Framework callbacks duplicating existing OTel/OpenInference instrumentation.
- Transcript/history scraping for Codex, Claude, Cursor, or Copilot.
- Helicone or other proxy-to-proxy chaining without a distinct user requirement.
- Zipkin-specific exporter; use Collector translation.

## Architecture proof

The smallest credible demo starts Watchdog and a fixture OTLP receiver, ingests one Agents SDK trace and one OpenInference OTLP trace, views both locally, exports both to OTLP and JSONL, restarts across a destination outage, verifies replay/idempotency, and scans every sink for seeded content/credential canaries. Nothing else should be called a first release.

