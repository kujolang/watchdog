# Current telemetry contracts

## Intake contracts

`kujo.telemetry.v1` is accepted at `/api/telemetry/requests` and `/api/telemetry/traces`. A request intake is idempotent on `(source_app, request_id)`. Trace bundles upsert on trace/span/event external keys. The schema permits extra fields and bounds a bundle to 128 spans, 512 events, and 64 tool calls.

| Record | Producer | Required semantics | Optional/high-value fields | Persistence | Policy |
|---|---|---|---|---|---|
| model request | proxy, external producer, legacy wrapper | source, provider/model, status, time | session/user/tenant/project/workflow/task/correlation, tokens, cost, latency, error, summaries | `requests` | summaries content-gated; external strings redacted/bounded |
| tool call | proxy synthesis, producer | name/status | external call id, args/result, latency, session/request | `tool_calls` | args/results redacted; content posture is inconsistent in legacy wrapper |
| agent step | proxy synthesis, producer | step type/number | agent, content, metadata, session | `agent_steps` | content/metadata redacted/bounded |
| trace | external intake, proxy-derived | source, trace/session ID, state/time | request, model/name, totals, cost, attrs | `traces` | attrs redacted and JSON-bounded |
| span | external intake, proxy-derived | trace/span ID, kind/name/time | parent, status, request/session, attrs | `trace_spans` | same |
| event | external intake | trace/event ID, name/time | span, sequence, attrs | `trace_events` | same |
| audit event | server controls | action/time | actor/resource/details | `audit_events` | internal security record; not exported today |

## Current stored field inventory

| Table | Identity/correlation | Provider/model/usage/cost | Timing/status/error | Content/extension |
|---|---|---|---|---|
| `requests` | integer ID; request, session, user, tenant, project, workflow, task, correlation IDs | provider/model; input/output/total/cached-input/cache-write tokens; input/output/cache/cost totals, rates, provenance | created time, latency, status, finish reason, error class/message | prompt/response summaries, source app, data class |
| `tool_calls` | integer ID; request DB ID, session, external tool-call ID | none | status, latency, created time | tool name, arguments, result, source/data class |
| `agent_steps` | integer ID; session, agent, step number | none | step type, created time | content, metadata JSON, source/data class |
| `traces` | integer ID; unique external trace ID, request DB ID, session | model plus cumulative token/cost/rate/provenance fields | start/end/duration/status/created time | schema version, source/data class, name, attributes JSON |
| `trace_spans` | unique `(trace_id, span_id)`; parent, request DB ID, session | no independent normalized usage contract | start/end/duration/status/created time | span kind/name, source/data class, attributes JSON |
| `trace_events` | unique `(trace_id, event_id)`; optional span; sequence | none | event time/created time | name, source/data class, attributes JSON |
| `audit_events` | event/actor/resource identifiers | none | event time | details JSON |

Timestamps enter through several routes as producer values and are stored largely as text/epoch-like values. Required fields differ by route: the JSON Schema requires schema/source/trace/session at bundle level, while server helpers also synthesize missing name/status/times and derived rows. Attributes are truncated to a bounded JSON string rather than validated against a typed metadata contract.

## Producer and representation behavior

- **Proxy:** always owns HTTP timing/status/provider/profile. It currently derives a request row, trace/span rows, a `proxy_forward` tool call, and lifecycle agent steps. Only the request/trace transport facts are reliable for arbitrary paths.
- **External request intake:** owns request ID and supplied request/trace/tool/step bundle. Replay is idempotent on source + request ID.
- **External trace intake:** owns trace/span/event/tool IDs and can append/upsert without a request. Trace totals use monotonic maximum on replay rather than additive accumulation.
- **Legacy wrapper:** owns model/tool callbacks and writes request/tool/step tables directly. It does not pass through the server’s complete admission/policy path.
- **API:** request/tool/step/trace/span/event rows are serialized close to database shape. Numeric/JSON coercion varies by endpoint and is not a public backend-neutral contract.

## Current redaction and bounds

Recursive redaction applies sensitive key and term matching before server persistence. Sensitive keys become redacted; strings containing sensitive terms can be replaced wholesale. Token metric keys are exempted from false-positive credential matching. Content capture defaults off; external attributes, tool fields, step content/metadata, error text, and proxy summaries are bounded. The effective gap is not the core server policy but paths that write tables directly and source payloads whose semantic class is not explicit.

## Field assessment

### Stable enough to preserve

- `source_app`, `session_id`, correlation headers, provider/model, normalized input/output/total/cached-input token counts.
- Explicit cost amount plus provenance and rates.
- Trace/span/event concepts; parent-child relationship; start/end/duration; status; bounded attributes.
- Idempotent external intake and central redaction before persistence.

### Internal or duplicated

- Database integer IDs, raw table rows, and current JSONL `kind/data` format.
- `agent_steps` synthesized from trace lifecycle and proxy transport.
- `proxy_forward` as a tool call.
- Totals repeated on request, trace, and spans.
- Session/source/data-class repeated on every relational row for query convenience.

### Provider-specific

- `prompt_tokens`/`completion_tokens` decoding and Chat Completions `choices`/`finish_reason`.
- Current SSE `[DONE]` and final usage parsing.
- Catalog pricing assumptions and provider header behavior.

### Kujo-specific

- `X-Observe-*` headers and event names emitted by Pi/Dispatch.
- `workflow_id`, `task_id`, and agent step vocabulary.
- Agents SDK event payload shape and current Watchdog transform.

## Normalization required

- Convert canonical trace/span IDs to W3C widths while retaining invalid/source IDs under provenance.
- Replace fixed workflow/task columns in the contract with typed `references`.
- Store timestamp as Unix nanoseconds or RFC3339-normalized instant at the boundary; never accept ambiguous local time.
- Keep core usage fields (`input`, `output`, `total`) and explicit cache/reasoning fields, plus bounded provider-native usage; do not recompute when provider definitions differ.
- Replace cost component columns in the wire contract with an array of typed cost observations, each with `kind`, currency, amount, source, and catalog version.
- Distinguish `content` from `attributes`; content is separately classified and opt-in.
- Stop translating every producer event into both an agent step and trace event. Compatibility views may derive old rows until dashboard migration.

## Compatibility posture

Keep v1 endpoints and schema intact during migration. A v1 translator produces v2 canonical records, records conversion warnings, and populates legacy views. Existing proxy and Pi correlation headers remain accepted. No v2 producer writes old tables directly.
