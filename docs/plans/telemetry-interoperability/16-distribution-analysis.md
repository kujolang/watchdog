# Distribution analysis

Distribution value is real only when there is a documented integration surface or accepted listing. Repository examples and profile docs create discoverability; marketplace/directory placement remains speculative until published.

| Channel | Verified path | Opportunity | Priority |
|---|---|---|---|
| OpenTelemetry | standard OTLP endpoints and Collector ecosystem | reference Collector config, semantic mapping docs, contribution/listing if accepted | highest |
| Langfuse | documented OTLP trace ingestion | “local gateway to Langfuse” profile/example; no SDK fork | high |
| Phoenix/OpenInference | documented OTLP + OI model and broad instrumentors | OpenInference-compatible gateway docs/fixtures | high |
| Grafana/Datadog/Honeycomb/New Relic/Elastic/SigNoz | documented OTLP | vendor-neutral setup recipes; their users can adopt Watchdog locally | high aggregate, low per-vendor code |
| Kujo Agents/Pi/Agent/Dispatch/Relay | repository ownership and shared runtime | default local observability for Kujo ecosystem | highest product validation |
| Claude/Copilot/Cursor hooks | documented plugin/hook surfaces | installable metadata-only host adapters | high, after core |
| LangChain/LlamaIndex/CrewAI/AutoGen/PydanticAI/Semantic Kernel | documented or existing OTel/OI instrumentation | “point exporter at Watchdog” recipes and compatibility fixtures | high aggregate |
| VS Code Marketplace | public extension distribution | only if a useful Kujo-owned participant/host adapter exists | speculative tier 3 |
| MCP ecosystem | standard protocol and instrumentation opportunity | client/server helper and example | medium/high |
| JSONL/data tooling | portable file contract | CI artifacts, warehouses, offline/AI analysis, migration | high utility, no marketplace dependency |

## Recommended distribution assets

- One copy/paste OTLP profile per destination, generated from the same profile schema.
- A Collector configuration showing Watchdog -> Collector -> two destinations.
- OpenInference import/export golden traces with content off.
- Framework recipes that configure existing instrumentation rather than install Watchdog-specific callbacks.
- Host adapters as separate packages/plugins with explicit permissions and metadata-only defaults.
- Public conformance badges/results only after automated fixtures run against pinned versions.

Do not advertise compatibility from a protocol checkbox alone. A destination/framework is “verified” only after auth, correlation, usage, errors, content-off, outage, and version-pinned fixture tests pass.

