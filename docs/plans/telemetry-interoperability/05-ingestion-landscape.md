# Ingestion landscape

## Mode selection

| Source | Preferred mode | Reason |
|---|---|---|
| OpenAI-compatible application | proxy | zero-code base-URL change; reliable transport metadata |
| Kujo Agents SDK / `kujo agent` | push v2 client | lifecycle exists in-process and has canonical run/session IDs |
| Pi | push v2 client + proxy correlation | mature metadata-only lifecycle and durable spool already exist |
| Dispatch/Relay/workflows | push v2 adapter | orchestrator owns authoritative run state; Watchdog observes |
| RunLedger/Eval | reference/score event | correlate evidence/results without copying their records |
| OTel/OpenInference frameworks | guarded OTLP trace push | avoids custom callbacks and preserves distributed context |
| host with documented hooks | thin external adapter push | hooks expose lifecycle; adapter strips content before delivery |
| host with only base URL | proxy only | do not scrape transcripts or claim unavailable lifecycle |
| MCP | client/server instrumentation push | tool lifecycle exists at the execution boundary |
| SaaS observability destinations | export, never pull | Watchdog is not a reverse-ingestion scraper |

## Framework recommendations

- **LangChain/LangGraph:** use its existing OTel/OpenInference/LangSmith-compatible instrumentation and point OTLP at Watchdog. No core adapter.
- **LlamaIndex:** use current OpenInference instrumentation/callback path. Retrieval spans map well; content remains off by Watchdog policy.
- **CrewAI:** validate its native tracing/third-party OpenInference instrumentor through fixtures; do not vendor its SDK.
- **AutoGen:** native OpenTelemetry tracing covers agent/runtime/tool operations; use OTLP.
- **PydanticAI:** its Logfire instrumentation is OpenTelemetry-based; use OTLP with a fixture mapping profile.
- **Semantic Kernel:** it emits OTel-compatible logs/metrics/traces and notes GenAI conventions are experimental; ingest traces only.
- **Mastra:** prefer its current OTel observability exporter if present; capability claims remain version-pinned and null where docs do not establish them.

## Host recommendations

- **Claude Code/Agent SDK:** official hooks cover sessions, prompts, tools, permissions, subagents, compaction, and errors; official Agent SDK/usage monitoring can emit OTLP. Prefer OTLP for traces and a metadata-only hook adapter only for lifecycle not present in exported spans.
- **Copilot CLI/cloud agent:** official session/tool/subagent/error/compaction hooks support command or HTTP delivery. Build an external adapter package, not core code.
- **Cursor:** current hooks cover session, tool, shell, MCP, subagent, compaction, and response/thought lifecycle; enterprise OTel export exists for logs/metrics. Use hooks for a local adapter; never assume enterprise access.
- **VS Code:** public extension APIs expose only lifecycle owned by the extension’s participant/tools, not all built-in Copilot activity. A Watchdog extension can observe what it implements, not global model traffic.
- **Codex:** current official OpenAI documentation reviewed for this package does not establish a public, stable all-lifecycle telemetry hook contract. Treat app-server/plugin integration as discovery work; proxy model traffic or instrument a Kujo-owned harness meanwhile.
- **Hermes:** current Kujo integration exposes a Nous/OpenAI-compatible base URL override, so proxy ingestion is supported. No verified lifecycle API is claimed.
- **Pi:** implement the shared client migration first; it is the best proven host lifecycle source in the ecosystem.

## MCP model

The initiating client emits a `tool` span with `rpc.system=mcp`, tool and server identity, request/result byte counts, status, and duration. If the server is instrumented, it continues `traceparent` as a child span; if context cannot cross trust boundaries, create a new trace with a link. Approval requested/decided are events on the client span. Tool arguments, output, shell content, and MCP elicitation content are opt-in content blocks. Server and client must not both report the same execution as independent root tool calls.

## Pull/scrape ruling

No first-wave polling. Polling misses local lifecycle, complicates credentials and retention, creates duplicate state, and encourages Watchdog to become a collector. A later import command may replay JSONL/OTLP fixtures, but it is explicit batch ingestion, not background scraping.

