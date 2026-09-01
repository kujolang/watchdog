# Security and privacy review

## Universal pipeline

```text
untrusted source -> bounds/schema -> normalize/classify -> central policy/redact
                 -> canonical storage -> approved export view -> destination
```

No adapter or exporter receives an escape hatch around policy. A destination may request less data, never more. Enabling an integration cannot change `WDG_CONTENT_CAPTURE_MODE=off` or weaken `WDG_REDACTION_MODE=basic`.

## Data classes and defaults

| Class | Default | Treatment |
|---|---|---|
| operational metadata | on | allowlist, type/size bound |
| identifiers | minimized | operational opaque IDs allowed; user/tenant/email/path/repo/session names hash or redact by default |
| content summaries | off unless existing explicit summary mode | non-reversible, bounded, clearly labeled |
| prompts/responses | off | explicit class-specific opt-in |
| tool input/output | off | explicit opt-in; credentials always redacted |
| retrieval documents | off | references/hashes/counts only by default |
| shell command/output | off | category/status/duration/exit only by default |
| detailed errors/stacks/provider bodies | off | class/code/retryable plus redacted short message by default |
| credentials | prohibited | reject/redact; never store/export/spool |

## Identifier policy

Allow source-local session/run/request/tool IDs when they are random/opaque and operationally necessary. Hash stable user, tenant, email, workspace, repository, path, URL query, branch/session title, and account identifiers with an installation-local keyed hash. Strip URL credentials/query/fragment; retain scheme + allowed host class only when useful. Bound display names and prevent control characters. Provide per-field preserve/hash/drop configuration, with hash/drop defaults for personal/workspace identity.

## Threats and controls

| Threat | Required control |
|---|---|
| untrusted OTLP/JSON trace poisoning | auth/source allowlist, strict schema/types, reserved namespace protection, W3C validation, per-source quotas |
| oversized/decompression bombs | compressed and decompressed caps, streaming decoder bounds, record/attribute/event/link limits |
| database growth attack | admission rate/byte budgets, transactional queue/storage caps, retention, drop metrics, WAL checkpoint/compaction policy |
| prompt/tool/PII leakage | metadata-only default, central recursive redaction, content-class allowlist, export from approved representation only |
| credential leakage | key/value/content redaction, never persist auth headers, resolve exporter secrets at send time |
| SSRF/webhook abuse | exact allowlist, HTTPS/loopback, DNS/IP checks, redirect off, block metadata/private/link-local, no arbitrary headers |
| export/retry amplification | bounded per-profile queue/attempts/backoff, circuit breaker, max response/body, no recursive telemetry export |
| cross-tenant metadata | source/tenant authorization at admission and query; no producer-selected tenant without binding |
| malicious adapter | official adapters out-of-process or pure modules, signed/versioned packages, conformance, no DB/network authority |
| trace ID collision/replay mutation | namespaced idempotency, conflicting replay rejection/audit |
| path leakage | hash/drop paths and cwd; no transcript path by default |

## OTLP trust boundary

Do not listen on public interfaces by default. Reject logs/metrics and non-AI traces. Resource attributes cannot select exporter credentials, tenant, retention, redaction, or profile. Ignore upstream `watchdog.privacy.approved=true` claims; Watchdog recomputes policy. Baggage is allowlisted and excluded from storage by default.

## Host hooks

Hook payloads often include prompts, tool arguments/results, cwd, transcript paths, and shell commands. The host adapter must construct a new metadata-only object in memory; it must not forward raw hook JSON to Watchdog. Timeouts fail open for telemetry side effects, not for host permission policy. Watchdog telemetry hooks must never grant/deny tools unless a distinct policy product explicitly owns that behavior.

## Export privacy proof

Conformance fixtures seed canary secrets, emails, paths, prompt/tool/retrieval text, malicious attribute keys, and source claims. Tests inspect stored rows, JSONL, OTLP wire bytes, dead letters, logs, and backups. No canary may appear in metadata-only mode.

