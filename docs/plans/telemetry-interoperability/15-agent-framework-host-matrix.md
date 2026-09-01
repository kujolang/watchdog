# Agent, framework, and host matrix

Machine-readable details are in [INGESTION_MATRIX.json](INGESTION_MATRIX.json) and [HOST_TELEMETRY_MATRIX.json](HOST_TELEMETRY_MATRIX.json). `unknown` means the reviewed official/code evidence did not establish the capability.

## Hosts

| Host | Verified surface | Strong signals | Missing/conditional | Recommendation |
|---|---|---|---|---|
| Pi | repository bridge + proxy headers | session/run/turn/agent/tool/shell/model/status, durable spool | content intentionally absent; cost from correlated proxy | migrate to shared v2 client; tier 1 |
| Claude Code | lifecycle hooks + OTLP monitoring/Agent SDK | session, prompt, tool, permission, subagent, compact, error; OTLP usage/cost/tool activity | exact span coverage/config varies by surface | OTLP first; metadata hook supplement; tier 1/2 |
| Copilot CLI/cloud agent | command/HTTP/SDK hooks | session, prompt, tool, permission (CLI), subagent, compact, errors | cloud permission/notification differences; model/token/cost not guaranteed in hooks | official hook adapter package; tier 2 |
| Cursor | hooks; enterprise OTel logs/metrics | session/tool/shell/MCP/subagent/compact/response; tokens/tool calls/best-effort cost in enterprise export | plan/API availability and trace semantics | hook adapter after tier 1; do not require enterprise |
| VS Code | extension chat/model/tool APIs | lifecycle for participant/tool owned by the extension | no public global observer for all built-in Copilot actions | observe Kujo-owned extension only; tier 3 |
| Codex | no stable public all-lifecycle hook established by reviewed OpenAI docs | Kujo-owned harness can emit; model traffic may be proxied when configurable | session/tool/shell/approval/token/cost host API unverified | discovery/official plugin or app-server contract; no transcript scraper |
| Hermes | supported OpenAI-compatible Nous base URL in current Kujo deployment | proxy model request/usage/status | host lifecycle API unverified | proxy only; tier 2/3 |

Official host sources: [Claude hooks](https://code.claude.com/docs/en/hooks), [Claude OTLP observability](https://code.claude.com/docs/en/agent-sdk/observability), [Copilot hooks](https://docs.github.com/en/copilot/reference/hooks-reference), [Cursor hooks](https://prod.cursor.com/docs/hooks), [Cursor OTel export](https://prod.cursor.com/docs/enterprise/opentelemetry-export), and [VS Code Chat Participant API](https://code.visualstudio.com/api/extension-guides/ai/chat).

## Frameworks

| Framework | Existing path | Initial Watchdog work |
|---|---|---|
| LangChain/LangGraph | OTel/LangSmith and OpenInference instrumentors | OTLP import fixtures; no callback adapter |
| LlamaIndex | OpenInference/Phoenix instrumentation and callbacks | OTLP/OI fixtures including retrieval |
| CrewAI | ecosystem OpenInference instrumentor and tracing hooks | validate supported versions; no core dependency |
| AutoGen | native OTel tracing for agent/runtime/tool | OTLP fixtures |
| PydanticAI | Logfire/OpenTelemetry instrumentation | OTLP fixtures |
| Semantic Kernel | OTel-compatible traces/logs/metrics; GenAI conventions acknowledged experimental | traces only; fixture mapping |
| Mastra | observability/exporter surface varies by release | pin verified version before recommendation; null otherwise |

## Kujo ownership

- Agents SDK owns agent lifecycle events; a Watchdog adapter maps them and a shared client delivers them.
- `kujo agent` configures the sink and correlation; it must stop treating a local transform as successful delivery.
- Pi owns host lifecycle detection but not serialization, policy, or queue contract.
- Dispatch/Relay own orchestration/mission state and emit observer records.
- RunLedger owns execution receipts; Eval owns evaluation; Watchdog stores references/scores only.
- MCP client/server runtimes emit tool spans at their actual execution boundaries.

