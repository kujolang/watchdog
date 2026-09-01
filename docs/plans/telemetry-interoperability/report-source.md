# Canonical research synthesis

This is the canonical internal report used to derive the implementation package.

Watchdog’s durable advantage is not a destination dashboard. It is a trusted local crossing point: OpenAI-compatible traffic can be observed with a base-URL change; Kujo runtimes can push lifecycle facts; and a central server already has bounded SQLite, correlation, redaction, content-off defaults, cost provenance, query APIs, retention, export, and backup. The trace/span/event intake is more generic than the proxy decoder, but the current write model duplicates request/tool/step/trace facts and the JSONL format exposes tables.

The standards/destination research changes the likely implementation. OTLP is stable and now accepted by nearly every prioritized backend, including AI-specific Langfuse and Phoenix. Langfuse’s current trace path is OTLP and its legacy native trace API is deprecated. Phoenix accepts OTLP and uses OpenInference. Therefore a native exporter per platform would add maintenance without semantic gain. One OTLP transport with base OTel, version-pinned OTel GenAI, and version-pinned OpenInference projections is the correct egress architecture.

OTel GenAI and OpenInference should not become Watchdog’s database contract. They evolve independently, contain content-heavy fields, and do not cleanly represent every Watchdog concept such as approval, handoff, artifact, execution evidence, and cost provenance. The internal contract should contain only trace/span/event, W3C identity, typed grouping references, normalized-but-source-preserving usage/cost/error, classified content, and policy provenance.

Limited OTLP trace ingest is useful because AutoGen, Semantic Kernel, PydanticAI, LangChain, LlamaIndex, CrewAI, Claude, and related tools already emit OTel/OpenInference. It must be a guarded AI receiver, not a generic Collector: traces only, semantic/resource gate, loopback/auth, strict quotas, central policy, and rejection of logs/metrics/generic spans. This yields external ecosystem coverage without callback proliferation.

Native Kujo ingestion proves the model. Agents SDK already has rich event/run/session/parent structure but only transforms to a local Watchdog-shaped record; `kujo agent` treats that as local-only evidence. Pi has the production-quality design to reuse: opt-in metadata-only events, correlation headers, atomic bounded spool, permanent/transient classification, restricted permissions, and no credentials/content in spool. A shared v2 client/spool should carry Agents, Agent, and Pi, with Dispatch/Relay later. RunLedger and Eval remain evidence/evaluation owners and correlate through references.

Operationally, exporters are isolated asynchronous workers over a bounded SQLite journal. Multi-export is one record with per-profile delivery references. Queue bounds, attempts, age, bytes, circuit breakers, partial failure, and operator-visible drops are mandatory. No remote failure can alter model execution success. JSONL v2 is a first-class stable canonical record stream and replay format, not a database dump.

Privacy remains the hard boundary: content off and basic redaction stay defaults; adapters can only classify/reduce; central policy approves; exporters receive approved records. Host hooks frequently contain prompts, tool arguments/results, shell commands, cwd, transcript paths, and identifiers, so adapters construct new metadata-only payloads rather than forwarding raw JSON. W3C baggage and producer attributes cannot select tenant, credentials, policy, retention, or exporters.

The first wave is therefore: canonical v2 + JSONL/conformance; OTLP export/profiles; OpenInference projection; shared Kujo Agents/Agent/Pi ingestion; guarded AI OTLP ingest; one external host adapter. This proves standards export, AI semantics, native ecosystem ingestion, external ecosystem ingestion, offline portability, outage recovery, and privacy without expanding Watchdog into a platform.

