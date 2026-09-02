# Native producer integration contract

Watchdog's native ecosystem integrations share one boundary:

```text
source lifecycle -> pure metadata allowlist adapter -> host-owned fail-open
delivery/spool -> POST /telemetry/v2/batches -> Watchdog policy -> storage/export
```

An adapter never writes Watchdog tables, chooses retention/exporters, reads
destination credentials, or forwards raw source payloads. A producer may emit
`watchdog.telemetry.v2` directly or `watchdog.native-event.v1` for Watchdog to
normalize. Delivery must be asynchronous or outside the producer's critical
operation and must never change application success.

## Implemented producers

| Producer | Repository boundary | Lifecycle coverage | Delivery boundary |
| --- | --- | --- | --- |
| Kujo Pi | `src/telemetry.mjs` | session, run, turn, agent, model usage, tool, shell class, persistence | native bounded atomic spool and fail-open HTTP flush |
| Agents SDK | `src/agents/tracing/watchdog.kujo` | run, model, tool, handoff, approval/guardrail, memory, artifact, budget | host callbacks; reference JavaScript client proves outage/replay |
| AI SDK | `src/watchdog_telemetry.kujo` | provider-neutral model lifecycle, token/cache/reasoning usage, sanitized error class | embedding host callback/client |
| MCP | `src/telemetry/watchdog.kujo` | client/server tool lifecycle, approval/risk, sizes, correlation `_meta` | MCP host callback/client |
| Dispatch | `src/core/trace.kujo` | workflow/task/model/tool/handoff/approval/error lifecycle | embedding host callback/client |
| Relay | `src/watchdog.kujo` | mission/run/task/agent lifecycle; proxy request reconciliation remains separate | embedding host callback/client |
| Eval | `src/watchdog_telemetry.kujo` | bounded suite/check scores and pass/fail status | evaluator host callback/client |
| RunLedger | receipt `correlation` block and `correlate` CLI | Watchdog/Dispatch/Relay/Eval identifiers only | no telemetry delivery; evidence stays in RunLedger |
| Kujo Workflows | `ai-sdk-watchdog-showcase` | end-to-end proxy, canonical v2 query, JSONL, exporter status | runnable distribution/proof workflow |

The Kujo language and current `kujo agent` host are intentionally not changed
by this integration wave. Agents SDK remains the canonical producer contract
for a later host hookup; this avoids adding a second schema inside Kujo.

## Correlation ownership

- Watchdog owns W3C trace/span IDs and typed source references.
- Producers preserve their session/run/task/tool/evaluation IDs as references.
- Dispatch and Relay own orchestration state; Eval owns scores and reports;
  RunLedger owns receipts. Watchdog stores observations and links, not copies of
  those systems' evidence payloads.
- MCP client and server spans share one trace and tool-call reference. Each
  layer reports its own latency, preventing double counting.
- Model traffic routed through `/proxy/v1` uses `X-Observe-*` correlation. A
  native lifecycle record and proxy request can therefore join without
  duplicating prompt/response content.

## Privacy defaults

Every listed adapter constructs a new allowlisted record. Prompt/response text,
tool arguments/results, retrieval documents, shell text, workflow payloads,
paths, diffs, snapshots, transcripts, and detailed provider errors are absent
by default. Enabling a producer does not change Watchdog content policy.

## Versioning

Producer adapter versions are independent of Watchdog releases. Breaking input
mapping changes require a new adapter version; additive metadata fields may
ship within v1 when Watchdog's schema already permits them. The canonical
schema, native-event input, exporter contract, mapping profiles, and JSONL
format keep their own version identifiers.
