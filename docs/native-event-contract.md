# Native lifecycle event adapter v1

`watchdog.native-event.v1` is the host/framework-facing lifecycle contract. It is smaller than the canonical storage contract and converts source IDs/timestamps into canonical W3C correlation through `telemetry_native_adapter.kujo`.

Producers emit bounded metadata for session, turn, model, agent, tool, handoff, retrieval, workflow, approval, execution, error, artifact, evaluation, and internal lifecycle observations. Timed observations become spans; explicitly instantaneous observations become span events. The adapter never accepts content fields. Prompts, responses, tool arguments/results, retrieval documents, shell text/output, and file content stay outside this contract.

Canonical references carry source-owned grouping without multiplying top-level IDs: session, run, turn, workflow, task, agent, tool call, request, artifact, evaluation, or external. RunLedger IDs are `run` references; Eval results are `evaluation` references; Dispatch/Relay mission and workflow IDs are `workflow`, `run`, or `task` references. Watchdog observes these systems and does not duplicate their receipts, orchestration state, or evaluation logic.

MCP client/server adapters emit one logical tool span per side only when their roles are explicit. Use `rpc.system=mcp`, bounded server/tool names, status/latency, approval/risk metadata, and input/output byte counts. Propagate W3C trace context when the transport allows it. Tool inputs and outputs remain absent by default. Deployments must choose one authoritative logical tool observation or retain client/server spans with an explicit relation to avoid double-counting.

Host integrations (Pi, Codex, Claude Code, Cursor, Copilot, VS Code, Hermes) map only lifecycle hooks the host actually exposes. Missing model, token, cost, approval, or compaction hooks remain unknown; adapters must not infer them from UI text. Fast-moving host adapters should live outside Watchdog core and pass the same conformance fixtures before release.
