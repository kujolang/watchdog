# Trace and correlation model

## Canonical hierarchy

```text
session (cross-run user/workspace continuity; optional)
  run (one agent/workflow execution; optional)
    trace (one distributed causal tree)
      span
        child span
          event
```

Only `trace_id`, `span_id`, and `parent_span_id` define causality. `session_id` and `run_id` group traces but do not imply parentage. Everything else is a typed reference.

## Canonical versus source IDs

| ID | Canonical rule | Source handling |
|---|---|---|
| trace | 32 lowercase hex, nonzero | valid W3C retained; invalid external value stored under source IDs and remapped |
| span | 16 lowercase hex, nonzero | same |
| parent span | same trace only | unresolved parent produces warning; configurable reject for canonical intake |
| session | opaque, bounded, preferably producer-stable | hash if it embeds user/path/repository; no global semantics |
| run | opaque, bounded execution ID | shared with Agents/Dispatch/Relay/RunLedger |
| turn | typed reference | not a required column; often a workflow/internal span |
| tool call/request/agent/workflow/task | typed reference | preserve source namespace and relation |
| correlation | compatibility alias only | translate to run/request/link reference; do not add another hierarchy |

## Required scenarios

- One user session with many turns: one session ref; each turn may be a trace or a child workflow span depending on whether distributed context continues.
- Multiple model/tool calls: child spans under the turn/agent span.
- Nested agents: child agent span when synchronous; linked trace when independently scheduled or handed off.
- Handoff: handoff span/event records destination agent/run reference; continued causal work uses child context where possible, otherwise a trace link.
- Workflow pause/resume: same run reference; use a new trace when context cannot safely persist, linked to the prior trace. Do not fabricate multi-day span duration.

## Propagation

Forward `traceparent` through HTTP/MCP where supported. Preserve current `X-Observe-Trace` and `X-Observe-Parent` as compatibility inputs, but emit W3C headers preferentially. Session/run references use explicit allowlisted headers or canonical batch fields, not arbitrary baggage. Never forward user/tenant/email/path/repository baggage by default.

## Collision and idempotency

`record_id` is producer/adapter stable and unique within source namespace. Persistence uniqueness is `(source_namespace, record_id)`. Replays return the prior canonical ID. Conflicting replay content is a `409` and audit event; it never mutates a previously accepted record silently.

