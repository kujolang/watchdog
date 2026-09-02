# Telemetry exporters

Watchdog exports policy-approved canonical telemetry through a bounded SQLite delivery journal. Ingestion only enqueues local references; remote latency and outages do not sit on the model/proxy request path. `export_worker.kujo` maps and sends due deliveries. Run it once from a scheduler or with `--watch` under a local supervisor.

Copy `config/exporters.example.json` to an operator-owned path and set `WDG_EXPORTERS_CONFIG_PATH`. A profile has an independent ID, endpoint, mapping profile, retry state, and delivery row. Up to 16 enabled OTLP/HTTP profiles may run together. Watchdog supports OTLP/HTTP JSON; direct it to an OpenTelemetry Collector or a destination’s documented OTLP endpoint.

Supported mapping profiles:

- `otel.base.v1`: structural Watchdog attributes only.
- `otel.genai.v1`: pinned GenAI usage/provider/model projection plus namespaced Watchdog semantics.
- `openinference.v1`: the same OTLP transport plus OpenInference span kinds for model, agent, tool, retrieval, evaluation, and chain-like workflow spans.

Grafana/Tempo, Datadog, Honeycomb, New Relic, Elastic, SigNoz, Jaeger, Zipkin, and custom collectors should use OTLP. Langfuse should initially use its OTLP endpoint and `otel.genai.v1`. Phoenix should initially use `openinference.v1`. Watchdog does not ship dedicated trace transports for these destinations.

## Credentials and endpoints

Committed profiles contain environment-variable names, never credential values:

```json
{
  "id": "production-collector",
  "type": "otlp_http",
  "endpoint": "https://collector.example.com/v1/traces",
  "mapping_profile": "otel.genai.v1",
  "headers_from_env": {"Authorization": "WATCHDOG_OTLP_AUTH"}
}
```

HTTPS is mandatory except for explicit loopback HTTP (`127.0.0.1`, `localhost`, or `[::1]`). User-info, query strings, and fragments are rejected. The worker never forwards source request credentials and does not print resolved header values.

## Delivery semantics

- `2xx`: sent, unless OTLP reports rejected spans; unidentifiable partial failures retry the batch with documented duplicate risk.
- network errors, timeouts, `408`, `429`, and `5xx`: retry with capped exponential jitter; integer `Retry-After` is honored up to five minutes.
- `401/403`: pause the profile to prevent credential hammering.
- other `4xx`: dead-letter with bounded reason and payload hash.
- attempt limit: dead-letter.
- queue capacity: oldest pending/retry delivery becomes `dropped`; canonical local data remains intact.

Defaults are 50,000 pending/retry records per profile, 256 records or 512 KiB per request, ten attempts, and a 10-second request timeout. Global caps are enforced. `GET /api/telemetry/v2/export-status` exposes queue/profile health. Optional exporter failure never fails proxy forwarding.

The worker maps repository records through a pure exporter contract and receives no raw source payload. Content removed by Watchdog policy cannot be reconstructed by a mapping profile.
