# OTel and OpenInference mapping

Mapping profiles are versioned artifacts (`otel.base.v1`, `otel.genai.<pinned-version>`, `openinference.<pinned-version>`). Attribute spellings must be generated from a checked-in mapping table and tested against golden OTLP.

## Structural mapping

| Watchdog | OTel | OpenInference profile |
|---|---|---|
| trace | OTLP trace | OTLP trace |
| span IDs/parent | Span identity/parent | same |
| trace links | Span links | same |
| model span | client/internal GenAI operation span | `openinference.span.kind=LLM` |
| agent span | internal agent invocation | `AGENT` |
| tool span | internal/client tool execution | `TOOL` |
| retrieval span | internal retrieval | `RETRIEVER` |
| workflow span | internal orchestration | `CHAIN` only when semantically chain-like; otherwise Watchdog namespace |
| evaluation span | internal evaluation | `EVALUATOR` |
| approval/handoff/execution/persistence | internal span + `watchdog.*` attrs | no false OI kind; keep custom attrs |
| event | Span Event | Span Event |
| status/error | OTel status + exception/error attrs | same plus OI attrs only where defined |

## Common fields

| Watchdog | OTel/OpenInference target | Rule |
|---|---|---|
| source producer/version | resource `service.name`, `service.version`, `telemetry.sdk.*` | never overwrite real service identity; Watchdog exporter is SDK metadata |
| session ref | versioned GenAI session attribute when supported; else `watchdog.session.id` | hash/policy before mapping |
| run ref | `watchdog.run.id` | custom until a stable equivalent exists |
| provider/model | pinned OTel GenAI provider/model attributes | distinguish requested vs response model |
| input/output/total usage | pinned GenAI usage attributes | nullable; no zeros from absence |
| cache/reasoning usage | pinned attributes when semantically exact, else `watchdog.usage.*` | provider-native JSON stays bounded |
| costs | destination-supported cost attrs or `watchdog.cost.*` | include kind/source/catalog; never label estimate billed |
| first-byte event | event `watchdog.stream.first_byte` + duration attr | do not create stream span |
| typed refs | `watchdog.ref.<type>` | only allowlisted scalar IDs |
| content blocks | OTel GenAI/OI input/output fields only when effective policy permits | metadata-only default omits them entirely |

## OTel GenAI caveat

The GenAI conventions are under active development in a dedicated repository. Watchdog’s internal field names and database migration must not follow every upstream rename. Pin a known mapping commit/release in code, expose it in resource attributes/export metadata, and add a new mapping profile additively.

## OpenInference caveat

OpenInference is valid OTel with a richer AI vocabulary and broad instrumentors. Its input/output value fields can contain prompts, documents, tool arguments, and responses. The mapper must omit these attributes—not emit placeholders—unless the matching Watchdog content class is enabled. OpenInference import receives the same treatment; presence in OTLP is not consent to persist.

## Langfuse mapping

Use OTLP plus the attributes Langfuse documents for trace/session/user/generation semantics. Model spans map to generations; other timed spans remain spans; events remain events when supported or span events. Usage maps cleanly. Cost maps only with provenance; scores do not map cleanly through generic traces and are a later score-API candidate. Expect loss for Watchdog approval/handoff/artifact/reference details; retain them as `watchdog.*` attributes.

## Phoenix mapping

The OpenInference projection maps model/agent/tool/retrieval/evaluation spans naturally. Approval, handoff, execution, persistence, and workflow-specific state remain custom Watchdog attributes/events. This is acceptable lossless transport—Phoenix may not visualize every custom semantic, but the OTLP retains it.

## MCP mapping

Use an OTel/OI tool span with `rpc.system=mcp` and bounded `mcp.server.name`, `mcp.tool.name`, result/status/size fields under versioned namespaces until stable MCP conventions are pinned. Propagate W3C context through supported MCP metadata/transport. Never export tool arguments/results by default.

