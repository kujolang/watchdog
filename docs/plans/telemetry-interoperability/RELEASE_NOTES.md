# Telemetry interoperability release notes

## Status

The v2 interoperability layer is experimental. Local canonical intake, guarded
AI-trace OTLP intake, JSONL v2, durable isolated export queues, OTLP/HTTP
Protobuf export, OpenTelemetry GenAI/OpenInference mappings, Kujo/Pi/Agents SDK
producers, the MCP helper, and the Claude Code hook adapter are implemented.
Provider-neutral AI SDK, Dispatch, Relay, Eval, RunLedger correlation, and the
canonical-v2 workflow proof are also implemented in their owning repositories.
The optional `watchdog.observability.v1` semantic profile now preserves
immutable source identity, explicit terminal outcomes and causal relations,
producer-observed timing, versioned context/cost provenance, canonical summary
queries, and lineage diagnostics without changing the v2 envelope.

Production promotion is blocked by the measured proxy and ingest performance in
`14-storage-performance-review.md`. In particular, streaming responses are
buffered by the current Kujo POST transport.

## Supported versions

- Watchdog telemetry schema: `watchdog.telemetry.v2`
- ingestion adapter: `watchdog.ingestion-adapter.v1`
- exporter contract/config: `watchdog.exporter.v1` / `watchdog.exporters.v1`
- JSONL: `watchdog.jsonl.v2`
- mapping profiles: `otel.base.v1`, `otel.genai.v1`, `openinference.v1`
- Kujo runtime: 1.2.2 or newer is required for binary-safe OTLP
  request/response bodies and gzip export
- OTLP transport: HTTP Protobuf or JSON traces; optional gzip

The OTel GenAI and OpenInference conventions are pinned translation profiles,
not Watchdog's storage contract. Their upstream specifications remain
experimental/evolving and require a profile-version bump for breaking mapping
changes.

## Known semantic losses and deliberate limits

- OTLP ingest accepts traces only and rejects generic, logs, and metrics input.
- Only AI-relevant spans are accepted; arbitrary baggage cannot select policy,
  tenant, retention, credentials, or exporters.
- The bounded Protobuf codec covers the complete OTLP trace signal consumed by
  Watchdog, including nested `AnyValue` arrays/key-value lists/bytes, links,
  flags, dropped counts, schema URLs, events, status, and partial success. It is
  deliberately not a generic Protobuf runtime and rejects unsupported signals
  and wire types.
- Langfuse, Phoenix, Grafana/Tempo, Datadog, and Honeycomb use their OTLP
  endpoints. No vendor-native trace SDK is bundled.
- Streaming proxy responses remain buffered in this release line.
- Proxy-native TTFT and precise client-disconnect cancellation remain
  unavailable; buffered proxy records explicitly preserve null timing.
- Canonical event records attach to an owning exported span when present.
  Ownerless events use a marked zero-duration synthetic projection.
- SQLite is single-process/local-first; one database is not a fleet collector.

## Bounds and privacy defaults

Content capture is off. Prompts, responses, tool inputs/outputs, retrieval and
shell content, detailed errors, paths, and transcripts require explicit policy;
an adapter cannot raise that policy. Exporters only receive the centrally
approved stored record.

Canonical batches are at most 100 records, 1 MiB compressed and 4 MiB decoded.
Each exporter queue is bounded to 50,000 references or 64 MiB, seven days, ten
attempts, and 10,000 dead letters by default. A trace is bounded to 512 spans and
4,096 events. Credentials are environment references and are not persisted.

## Failure and rollback

Exporter delivery is asynchronous, isolated per profile, durably queued, and
best effort. Retryable failures back off; permanent failures dead-letter;
capacity and age overflow drop with visible status. Destination failure never
changes the model response. Strict application-failure mode is not enabled.

Rollback steps:

1. Disable exporter profiles or move `WDG_EXPORTERS_CONFIG_PATH` to an empty v1
   profile file.
2. Stop external producers and continue using `/proxy/v1` and existing v1 intake
   routes; those compatibility paths remain supported.
3. Take a verified backup before changing binaries. The additive v2 tables may
   remain in SQLite when rolling back; older Watchdog versions ignore them.
4. Restore the verified pre-upgrade backup only when complete data rollback is
   required. Do not manually delete v2 tables from an active database.

There is no destructive down migration. This is intentional: additive schema
rollback preserves evidence and avoids silently discarding telemetry.
