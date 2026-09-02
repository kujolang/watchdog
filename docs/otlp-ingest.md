# Guarded OTLP trace ingest

`POST /telemetry/v2/otlp/v1/traces` accepts authenticated OTLP/HTTP JSON trace requests. It is an AI interoperability receiver, not a general OpenTelemetry Collector.

Admission rules:

- only trace payloads under `resourceSpans` are accepted; Watchdog has no OTLP logs or metrics receiver;
- spans must carry an allowlisted AI signal (`gen_ai.*`, `openinference.*`, `watchdog.*`, or `rpc.system=mcp`);
- W3C-sized non-zero lowercase trace/span IDs are required;
- at most 100 canonical records are admitted per request, including accepted span events;
- generic, invalid, and over-limit spans are counted in OTLP `partialSuccess.rejectedSpans`;
- requests with no accepted AI span fail with HTTP 400;
- the standard API authentication and body-size controls apply.

Watchdog strips OpenInference/GenAI prompt, response, tool argument/result, and retrieval-document attributes before canonical normalization. The record receives `source_content_dropped_by_watchdog_policy` provenance. Source OTLP content is not treated as operator consent to capture it.

The receiver currently supports OTLP/HTTP JSON (`application/json`). Protobuf requests receive HTTP 415 with an `Accept-Post` hint. Deploy an OpenTelemetry Collector to translate OTLP protobuf to OTLP JSON when needed. This deliberate boundary avoids embedding a general collector/protobuf runtime in the local proxy.

Frameworks that already emit AI-relevant OpenTelemetry or OpenInference should target this receiver instead of gaining a Watchdog-specific callback adapter. Generic infrastructure telemetry should go directly to the operator's collector.

Offline conformance fixtures cover standard/OpenInference output shaped for
LangChain, LlamaIndex, CrewAI, AutoGen, PydanticAI, and Semantic Kernel.
OpenInference `llm.token_count.*` values map to canonical usage while remaining
preserved as source usage provenance.
