# Standards research

Research date: 2026-09-01. Stability describes the cited specification, not every language SDK or GenAI attribute.

| Standard | Status | Watchdog decision |
|---|---|---|
| W3C Trace Context | W3C Recommendation | canonical trace/span identity and propagation |
| W3C Baggage | Candidate Recommendation; privacy-sensitive | pass an allowlisted subset only; never persist/export arbitrary baggage |
| OpenTelemetry traces/API | stable core | primary export signal; limited trace ingest |
| OTLP protocol/exporter | stable | implement OTLP/HTTP Protobuf first; optional JSON for debugging, not default |
| OTel logs | stable data model | do not duplicate all records as logs; export only standalone errors/audit notifications where a trace event is insufficient |
| OTel metrics | stable core with evolving details | derive counters/histograms at export time; do not duplicate persistent metric state initially |
| OTel GenAI semantic conventions | active and evolving; moved to dedicated repository | version-pinned mapping profile; never internal schema |
| OpenInference | active OTel-based AI semantic convention | first-class optional projection/import profile; never internal schema |

## Trace context

Canonical IDs follow W3C widths: 16-byte/32-lowercase-hex trace IDs and 8-byte/16-hex span IDs. Incoming valid `traceparent` wins. An invalid producer ID is retained as `source.ids.trace_id`, and Watchdog generates a canonical ID. Preserve `tracestate` only as a bounded, policy-approved propagation field; do not use it for Watchdog semantics.

Baggage is not an identity database. Accept only configured keys, cap key/value/count/total bytes, reject credentials and content, and default to no persistence. Session/run references should be explicit canonical attributes rather than hidden in arbitrary baggage.

## OTLP choices

- Export OTLP/HTTP Protobuf to maximize direct and collector compatibility. Support gzip, configurable endpoint/headers, bounded batch, timeout, exponential backoff with jitter, and retry only for retryable statuses.
- Treat a Collector as the recommended production fan-out when operators already run one. Watchdog still owns its own bounded queue so a direct exporter outage does not affect the application.
- Ingest only `/telemetry/v2/otlp/v1/traces` (or a clearly isolated equivalent), never the dashboard’s internal endpoints. Reject logs/metrics initially with `415`/documented error.
- Gate accepted spans by recognized GenAI/OpenInference attributes or an explicit authenticated Watchdog resource marker. Cap resources/scopes/spans/events/links/attributes and decompressed bytes before conversion.

## Internal spans and events

Spans are the correct internal unit for timed work: model calls, tools, agent steps, workflow segments, retrieval, handoffs, approvals waiting, execution, and persistence. Events represent instantaneous state changes inside a trace or span: stream first byte, approval decision, retry, cache hit, handoff link, evaluation score, artifact produced. An event does not get a duplicate zero-duration span.

## Metrics and logs

Initial metrics are derived from canonical records: request/error/tool counts, duration and time-to-first-token histograms, input/output/cache/reasoning tokens, typed cost sums, and queue depth/drop counts. Exporter health metrics are operational, not AI trace duplicates. Errors attached to operations stay span status/events. Only unscoped gateway errors or security/audit signals merit OTel logs later.

## Primary specifications

- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [W3C Baggage](https://www.w3.org/TR/baggage/)
- [OTLP specification](https://opentelemetry.io/docs/specs/otlp/)
- [OTLP exporter requirements](https://opentelemetry.io/docs/specs/otel/protocol/exporter/)
- [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/)
- [OpenTelemetry stability](https://opentelemetry.io/docs/specs/otel/versioning-and-stability/)
- [OTel logs data model](https://opentelemetry.io/docs/specs/otel/logs/data-model/)
- [OTel metrics data model](https://opentelemetry.io/docs/specs/otel/metrics/data-model/)
- [OTel GenAI semantic conventions repository](https://github.com/open-telemetry/semantic-conventions-genai)
- [OpenInference semantic conventions](https://github.com/Arize-ai/openinference/blob/main/spec/semantic_conventions.md)

