# Exporter contract

Version independently as `watchdog.exporter.v1`.

## Interface

```text
map(approved_canonical_records, profile) -> bounded destination batch
send(batch, credential_resolver, deadline) -> per-record outcomes
```

Input records have already passed policy. The exporter may further reduce data but may never recover source payloads or bypass policy. It receives no database handle. The worker owns checkpoint selection and transactions around it.

## Required declarations

- supported canonical record/span kinds and mapping profile/version;
- endpoint scheme/host policy, auth header names, maximum payload/records;
- batching, compression, timeout, retryable/permanent status rules;
- correlation, usage, cost, error, session, and custom-attribute mapping behavior;
- content behavior for every destination field;
- partial-success semantics and idempotency limitations.

## Queue and failure semantics

Default buffered profile bounds: 64 MiB or 50,000 delivery references, maximum age 7 days, 10 attempts, batch 256 records or 512 KiB mapped payload, 5 s connect/10 s request timeout, exponential backoff from 1 s to 5 min with full jitter. Values are configurable downward/upward within global safety caps.

- Network, timeout, `408`, `429`, and `5xx`: retry; honor capped `Retry-After`.
- `401/403`: pause profile and surface operator action; do not hammer.
- Other `4xx`/schema rejection: dead-letter the affected records with bounded reason.
- Partial success: acknowledge successes, retry only explicitly retryable failures; if destination cannot identify failures, retry batch with duplicate-risk metric.
- Queue full: never block proxy indefinitely; drop according to profile policy (oldest unsent by default), emit audit/health counter, and preserve error traces preferentially only if configured deterministically.
- Storage unavailable: canonical intake fails clearly; proxy forwarding continues and reports telemetry loss unless explicit proxy strict-capture mode is separately enabled.

## Multi-export

Delivery state is `(profile_id, record_id)`. Mappers run outside DB locks. Profiles have separate workers, circuit breakers, queue budgets, and health. Disabling/deleting a profile requires an explicit choice to drain, retain-until-expiry, or discard recoverably.

## Conformance suite

Offline fixture server tests auth construction without revealing secrets, endpoint policy, timeouts, batching boundaries, gzip, retry/Retry-After, partial success, permanent rejection, restart recovery, queue full/expiry, content-off preservation, malicious attributes, oversized mapped payload, correlation, usage/cost provenance, and multi-export isolation. Live tests are opt-in and must use dedicated credentials/projects.

## JSONL v2

Each line is one canonical envelope with `jsonl_version`, `schema_version`, `exported_at`, `record_id`, `sequence`, and `record`. Ordering is stable by canonical ingest sequence and record ID. Cursor is an opaque signed/versioned sequence token, not table offset. A manifest records query window, policy version, counts, first/last cursor, and checksum. Replay validates schema/policy and preserves idempotency. File rotation is size/age bounded and atomic.

## Webhook

Defer to tier 3. If implemented: HTTPS only except explicit loopback, exact endpoint allowlist, DNS/IP revalidation blocking private/link-local/metadata ranges, no redirects by default, HMAC-SHA256 over timestamp/body, anti-replay timestamp, credential reference, no source auth forwarding, bounded JSONL-like batch, and the same async queue semantics.

