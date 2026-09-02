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

Redirects are disabled, response bodies are capped at 64 KiB, and remote HTTPS profiles default to Kujo's DNS-pinned `deny_private` destination policy. This blocks private, loopback, link-local, multicast, and unspecified DNS answers. Set `allow_private_network: true` only for an operator-controlled internal collector; loopback HTTP collectors are recognized explicitly. Hop-by-hop, host, cookie, proxy-authorization, and content-length header mappings are rejected.

## Delivery semantics

- `2xx`: sent, unless OTLP reports rejected spans; unidentifiable partial failures retry the batch with documented duplicate risk.
- network errors, timeouts, `408`, `429`, and `5xx`: retry with capped exponential jitter; integer `Retry-After` is honored up to five minutes.
- `401/403`: pause the profile to prevent credential hammering.
- other `4xx`: dead-letter with bounded reason and payload hash.
- attempt limit: dead-letter.
- queue capacity: oldest pending/retry delivery becomes `dropped`; canonical local data remains intact.
- queue age: pending/retry rows older than the profile bound become `dropped` before transport.
- terminal history and dead letters are age- and count-bounded independently from canonical telemetry retention.

Defaults are 50,000 pending/retry records per profile, a seven-day queue age, seven-day terminal history, 10,000 dead letters, 256 records or 512 KiB per request, ten attempts, and a 10-second request timeout. Global caps are enforced. `GET /api/telemetry/v2/export-status` exposes queue/profile health, and the local dashboard renders it without requiring a remote destination. Optional exporter failure never fails proxy forwarding. `/api/admin/prune` covers canonical records and terminal exporter history in addition to the legacy tables; pending/retry delivery rows remain protected until delivery policy drops or sends them.

The worker maps repository records through a pure exporter contract and receives no raw source payload. Content removed by Watchdog policy cannot be reconstructed by a mapping profile.
