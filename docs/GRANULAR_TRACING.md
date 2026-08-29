# Granular Tracing

Watchdog accepts an optional, provider-neutral trace contract for applications that need more detail than one request row. Watchdog only collects and displays telemetry. It does not own model execution, tool selection, tool credentials, or persistence, so every producer remains independently usable with or without Watchdog.

## Data model

- A `trace` represents one user-visible workflow, such as an interactive chat turn.
- A `span` represents timed work. Stable kinds are `workflow`, `model`, `tool`, `shell`, `persistence`, and `internal`.
- An `event` represents an ordered milestone. Typical names include `request_created`, `connect_started`, `connect_completed`, `first_token`, `thinking_started`, `tool_requested`, `tool_started`, `tool_completed`, `tool_failed`, `stream_completed`, `persistence_saved`, and `response_failed`.
- A legacy `tool_call` row may accompany a tool span for the existing Tool Calls dashboard.

IDs are supplied by the producer. `(trace_id, span_id)`, `(trace_id, event_id)`, and non-empty `(source_app, session_id, tool_call_id)` identities are idempotent. Trace token and cost fields are cumulative absolute values: re-sending the same or an older total does not add it again. Intake is bounded to 128 spans, 512 events, and 64 tool calls per request.

The current producer contract is `kujo.telemetry.v1`. New producers should send that exact `schema_version`; unknown versions fail closed with HTTP `400`. Legacy payloads without a version continue to map to v1. The authoritative machine-readable contract is [`../schemas/telemetry-trace-v1.schema.json`](../schemas/telemetry-trace-v1.schema.json).

## Intake

`POST /api/telemetry/requests` creates an idempotent request row and may include `trace`, `spans`, `events`, and `tool_calls`:

```json
{
  "schema_version": "kujo.telemetry.v1",
  "source_app": "my-chat",
  "request_id": "request-123",
  "session_id": "session-7",
  "provider": "openai-compatible",
  "model": "glm-5.2:cloud",
  "status": "success",
  "input_tokens": 120,
  "output_tokens": 80,
  "trace": {
    "trace_id": "trace-123",
    "name": "interactive_chat",
    "status": "success",
    "started_at_ms": 1000,
    "ended_at_ms": 1600,
    "duration_ms": 600,
    "cached_input_tokens": 20,
    "attributes": { "transport": "direct" }
  },
  "spans": [
    {
      "span_id": "model-1",
      "parent_span_id": "workflow-1",
      "span_kind": "model",
      "name": "provider_round",
      "status": "success",
      "started_at_ms": 1050,
      "ended_at_ms": 1500,
      "duration_ms": 450,
      "attributes": { "time_to_first_token_ms": 90 }
    }
  ],
  "events": [
    {
      "event_id": "first-token-1",
      "span_id": "model-1",
      "sequence": 3,
      "event_name": "first_token",
      "occurred_at_ms": 1140,
      "attributes": {}
    }
  ]
}
```

`POST /api/telemetry/traces` appends spans or events without requiring a model request. This is the intended endpoint for independent tool runtimes and persistence layers:

```json
{
  "schema_version": "kujo.telemetry.v1",
  "source_app": "my-storage-adapter",
  "trace_id": "trace-123",
  "session_id": "session-7",
  "events": [{
    "event_id": "persist-123",
    "sequence": 99,
    "event_name": "persistence_saved",
    "occurred_at_ms": 1650,
    "attributes": { "state": "committed" }
  }]
}
```

## Privacy and retention

Send counts, durations, status codes, hostnames, and bounded structural summaries by default. Prompt text, tool arguments, search queries, result bodies, and response content should remain off unless the operator explicitly opts in. Watchdog applies its configured redaction before persistence, but producer-side minimization is the primary privacy boundary.

Watchdog proxy persistence is metadata-only by default. Set `WDG_CONTENT_CAPTURE_MODE=summaries` only when the operator explicitly accepts bounded prompt and response summary storage; redaction remains a second layer, not a substitute for content minimization.

## Proxy correlation

Producers that route model traffic through `/proxy/v1` can attach `X-Observe-Session-Id`, `X-Observe-Project-Id`, `X-Observe-Correlation-Id`, `X-Observe-Trace-Id`, and `X-Observe-Parent-Span-Id`. When a trace ID is present, Watchdog writes a replay-safe model span for the proxied request and attaches it to the supplied parent span. These collector headers are not forwarded to the upstream provider.

Trace rows participate in `/api/export`, `/api/admin/prune`, `/api/admin/prune-fixtures`, and diagnostics. Protect all intake and query routes with `WDG_API_AUTH_MODE=token` outside a strictly local development environment.

## Dashboard

The Traces view renders a searchable waterfall with model/tool timing, event markers, time to first token, output throughput, token and inferred cost components, errors, and persistence confirmation. Legacy proxy lifecycle steps are grouped in a collapsible transport section so they do not obscure application-level work.
