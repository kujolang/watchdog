# Canonical observability semantics

Watchdog keeps the `watchdog.telemetry.v2` envelope and opts new records into
the stricter `watchdog.observability.v1` profile with
`source["watchdog.semantic_profile"]`. Records without the profile remain valid.
Canonical JSON after Watchdog privacy policy is authoritative and immutable for
each `(producer.name, record_id)` identity.

## Identity and causal vocabulary

`producer.name` and `producer.version` identify the delivery integration. The
bounded record source may identify `application`, `harness`, `runtime`, and
`instrumentation` names and versions, plus adapter and original-schema
provenance. Missing versions are absent; they are not written as `unknown`.

Each model attempt is a separate span. A stable logical request uses a
`request` reference with relation `attempt_of`. Explicit `retries`,
`fallback_from`, and `recovers` relations identify the prior request. Watchdog
never infers those relations from session order, model changes, or timestamps.
Attempt numbers begin at 1.

Terminal decisions use `watchdog.operation.completed`,
`watchdog.operation.recovered`, or `watchdog.operation.cancelled` events. A
successful span is not by itself evidence of terminal completion.

The proxy accepts these bounded, metadata-only identity headers and removes
them before forwarding upstream: `X-Watchdog-Application-Name`,
`X-Watchdog-Application-Version`, `X-Watchdog-Harness-Name`,
`X-Watchdog-Harness-Version`, and `X-Watchdog-Logical-Request-Id`. When the
logical request header is absent, the proxy creates an identity for that one
inbound request only. Project identity remains a typed grouping reference and
never becomes application identity.

Callers that own retry policy may also send `X-Watchdog-Attempt-Number`,
`X-Watchdog-Retry-Of-Request-Id`, `X-Watchdog-Retry-Reason-Code`, and
`X-Watchdog-Retry-Decision-Source`. Explicit fallbacks use
`X-Watchdog-Fallback-From-Request-Id`, `X-Watchdog-Fallback-Dimension`, and
`X-Watchdog-Fallback-Reason-Code`. Invalid values fail with
`400 invalid_semantics` before upstream egress. These headers are stripped and
Watchdog never creates retry or fallback links from session order or a model
change alone.

## Timing, context, and cost

First-output timing is stored only when a producer or transport observes it.
Buffered proxy responses use timing source `unavailable_buffered_transport` and
leave first-output and generation metrics null. Zero or negative generation
duration and zero output tokens also produce null throughput.

Context utilization requires an unambiguous usage numerator and a known limit
with provenance. Default pressure thresholds are warning at 0.80, critical at
0.95, and overflow above 1.0. `WDG_CONTEXT_WARNING_RATIO` and
`WDG_CONTEXT_CRITICAL_RATIO` configure one global policy. Unknown limits or
ambiguous `usage.total_semantics` remain null and `unknown`; cached input is
never added to an already reported total. Catalog-derived values record the
catalog version and calculation time from the independent
`config/context_limit_catalog.json`, so later catalog changes do not reinterpret
historical records.

Cost kinds remain separate: provider-reported, catalog-estimated,
subscription-value estimate, and unknown. Provider-reported does not mean
invoice-backed unless `watchdog.cost.evidence` explicitly says `billing_api` or
`invoice`. Account grouping may use an operator alias or keyed pseudonym only;
credentials, emails, and raw billing identifiers are forbidden.

Canonical cost arrays are immutable evidence. Repricing adds a separate
`catalog_estimated` entry and never overwrites provider, billing API, invoice,
subscription-equivalent, or unknown evidence. Stable account pseudonyms require
an operator-held HMAC key; Watchdog does not derive them from raw identifiers.

## Replay and privacy

Exact batch replay and semantically identical records in later batches
deduplicate. A different post-policy canonical hash for an existing record ID
returns `409 record_identity_conflict`; the original record, references, and
export delivery remain unchanged. The conflict journal contains bounded IDs,
hashes, outcome, and time only—never record payloads.

Content capture stays off by default. All new fields are bounded metadata and
pass through the same authoritative redaction/policy boundary before hashing,
persistence, JSONL, or OTLP export.

## Canonical read model

`/api/telemetry/v2/records` accepts bounded `logical_request_id`, `application`,
`outcome`, `trace_id`, `kind`, `producer`, `after_time`, and `before_time`
filters. `/api/telemetry/v2/observability` groups evidence by explicit logical
request, orders attempts by explicit attempt number then time, and returns
terminal events separately from successful spans. Its diagnostics count
unresolved parents, historical cross-trace conflicts, and immutable identity
conflicts without exposing content. The dashboard renders missing evidence as
not reported or, for the buffered proxy, not measurable; it never substitutes
zero or heuristic completion.
