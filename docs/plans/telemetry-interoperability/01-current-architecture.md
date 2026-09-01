# Current architecture

## Runtime map

```text
 application
   | base URL + optional X-Observe-* correlation headers
   v
 /proxy/v1/* -- validate/auth/rate-limit/redact -- upstream profile
   |                                                |
   | buffered JSON or SSE response                  |
   +---------------- capture -----------------------+
                           |
 external producers -> /api/telemetry/{requests,traces}
                           |
         requests / tool_calls / agent_steps
         traces / trace_spans / trace_events
                           |
      SQLite WAL + indexes + retention + backup
                  /                         \
       dashboard/query APIs             JSONL export
```

Canonical server behavior lives in `src/dashboard_server.kujo`; `dashboard_server.kujo` is a packaged mirror. Shared schema/bootstrap lives in `src/watchdog_shared.kujo`. `src/watchdog.kujo` is an older AI SDK wrapper that writes tables directly and does not represent the desired boundary.

## Ownership map

| Concern | Current owner | Evidence / limitation |
|---|---|---|
| OpenAI proxying | dashboard server `/proxy/v1` | Generic HTTP methods/path forwarding, upstream profiles, JSON/SSE handling |
| Request/response capture | proxy handler | Body buffered; summaries governed by content capture; semantic parsing is Chat Completions-shaped |
| Usage/model/cost | requests + trace totals | OpenAI names normalized to input/output; cached input supported; model-catalog estimate plus provenance |
| Tools/steps | proxy synthesis and external intake | Proxy currently creates a `proxy_forward` tool and lifecycle steps even when no AI tool occurred |
| Trace/correlation | `kujo.telemetry.v1`, X-Observe headers | Arbitrary string IDs; trace/span/event tables already generalize well |
| Provider identity/routing | upstream profiles + request columns | Routing is useful; pricing lookup is still primarily model-based |
| Errors/timing | proxy/intake normalization | Status, class, message, latency/duration captured and bounded |
| Redaction/content | server-wide policy | `basic` redaction and content `off` defaults; recursive redaction before storage |
| Persistence/query | SQLite schema + `/api/*` | WAL/indexed local store, table-shaped APIs |
| Retention/backup | prune APIs + scheduled VACUUM INTO | Bounded local lifecycle, integrity/hash/encryption options |
| Export | `/api/export?format=jsonl` | Raw table rows with kind tags; not yet a stable replay contract |
| Dashboard | embedded HTML/JS | Useful local views; coupled to current table/API shapes |

## What generalizes

- Local single-node SQLite, WAL, indexes, pruning, backups, and read APIs match the local-first role.
- Proxy base-URL substitution is the strongest zero-code ingestion path and should remain.
- Trace/span/event storage and replay-safe external keys form a strong compatibility foundation.
- Central policy, redaction, size limits, auth, and rate limiting are exactly the right gateway responsibilities.
- Cost provenance already distinguishes provider-reported values from catalog/fallback estimates.

## Coupling and debt

- Only Chat Completions-style fields are meaningfully decoded. The proxy can forward other OpenAI-compatible paths, but it cannot claim correct embeddings, Responses API, image/audio, fine-tuning, or provider-native semantics.
- Streaming is upstream SSE parsing after a buffered response, not a fully streaming pass-through. It captures final usage when the provider emits it but adds memory and time-to-first-byte risk.
- Request, trace, span/event, tool, and agent-step rows overlap. Derived proxy steps and `proxy_forward` are transport facts mislabeled as agent semantics.
- External IDs are bounded but not W3C-width IDs. Timestamp and JSON fields are permissive. `additionalProperties` is open.
- The legacy `src/watchdog.kujo` wrapper writes content-bearing fields directly and can bypass current server policy.
- JSONL leaks table layout and uses independent per-table offsets, so it is neither a snapshot nor a durable cursor.

## Proxy boundary

Continue to forward unrecognized OpenAI-compatible endpoints opaquely and capture safe HTTP/model-request metadata. Deep parsing must be endpoint decoder-specific. Initial decoders:

1. Chat Completions JSON and SSE (existing, corrected).
2. Responses API JSON/SSE only after fixture coverage.
3. Embeddings usage only after fixture coverage.

All other bodies remain opaque. Never parse fine-tuning files, image/audio bytes, multipart uploads, or arbitrary provider extensions merely to enrich telemetry. The record should say `decoder: opaque` and preserve status, duration, byte counts, provider/profile, path family, and correlation.

## Current operational envelope

- Proxy methods: GET/POST/PUT/PATCH/DELETE with bounded path depth and scalar query forwarding; traversal, URL-scheme injection, and unsafe query shapes are rejected.
- Default request body maximum is 1 MiB and semantic parse ceiling is 512 KiB. Proxy timeout defaults to 120 seconds.
- Auth defaults off for trusted local use; token auth is the production posture. Rate limiting uses SQLite-backed buckets.
- Export defaults to 10,000 rows and caps at 50,000; retention and backups are local operator controls.
- Current quick/soak fixture profiles measure end-to-end stub throughput and DB growth, not direct-versus-proxy overhead. A 2026-09-01 local run produced quick `17.97 req/s`, `365 ms p95`, `1,365 B/request` and soak `15.22 req/s`, `848 ms p95`, `1,792 B/request`. These are advisory machine/profile observations—not a supported latency-overhead or capacity claim.
