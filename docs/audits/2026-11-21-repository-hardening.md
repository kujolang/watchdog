# Watchdog hardening audit · 2026-11-21

## Repository

Watchdog on `main` started at `7a0bd9a63d68421831ed66d6eed29805c48e1b24`. The verified implementation ends at `55251577d2b9520c94de77618bf44709ab957363`. The subsequent documentation commits update deployment smoke checks and add this receipt. This audit preserves the [October audit](repository-hardening.md) as historical evidence.

Watchdog operates a local AI telemetry recorder, dashboard, OpenAI-compatible proxy, canonical intake and delivery journal. The review followed the Kujo HTTP and SQLite entrypoints and root mirrors, JavaScript client and Claude adapter, dashboard asset build, pricing and backup helpers, canonical and OTLP contracts, deployment configuration, CI and optional Agents SDK and RunLedger integrations. The ongoing OpenRouter catalog update dated 2026-11-08 existed before the audit. The pricing verification commit preserves its exact bytes. The catalog commit affects future estimates and fixture verification.

## Baseline

The existing suite on Node 26.12.1 and the local Kujo 1.9.0 binary ran before implementation. It had 70 passes, five failures and one optional skip. Three failures came from assertions hardcoding the 2026-11-01 OpenRouter catalog while the working tree already contained the 2026-11-08 snapshot. Two failed gzip cases came from a Kujo binary built without `runtime-archive`. The same two baseline suites passed on the official Kujo 1.6.0 macOS x64 release after verifying its archive checksum. The dashboard build, typecheck and generated asset comparison passed before changes. npm audit found one moderate transitive advisory.

Local receipts are under ignored `tmp/hardening-20261121/`. The final verification uses the official release binary. CI compiles its pinned Kujo source on Linux.

## Findings and changes

| ID | Priority | Area | Finding and evidence | Action | Status |
|---|---|---|---|---|---|
| H21 | P0 | Default bind | The startup configuration and listener exposed the default unauthenticated service on all interfaces | Bind to `127.0.0.1` and retain explicit `WDG_HOST` | Verified |
| H22 | P0 | Canonical durability | Queue failure after a committed canonical batch left a partial journal. A retry could deduplicate against the committed batch without rebuilding delivery rows | Commit accepted records and the delivery journal together | Verified by injected write failure and replay |
| H23 | P0 | Legacy integrity | Connection-scoped row IDs and separately allocated step numbers could mismatch writes. A later child-write error left an incomplete legacy request that retries could treat as already recorded | Use statement-local SQLite IDs and step assignment. Commit request and trace bundles on a dedicated writer | Verified by concurrent submissions and rollback/retry |
| H24 | P0 | Retention and capacity | Prune and backfill applied related writes independently. Prune could use query parameters after ignoring an invalid request body | Use SQLite transactions for backfill and both prune routes. Reject invalid prune bodies | Verified by failure after earlier successful statements |
| H25 | P1 | Export work and size | The worker remapped each prefix, re-encoded the final batch and used a string length for the wire cap | Map small fitting batches once and enforce encoded byte size before compression | Verified by workload and multibyte boundary |
| H26 | P1 | Export timestamps | Kujo 1.6 rejected the timezone-less parse pattern and the mapper emitted current wall time instead of the canonical span time | Preserve RFC 3339 offset and up to nine fractional digits using integer nanoseconds. Use the observation time for synthetic event spans | Verified by JSON mapper and worker fixtures |
| H27 | P1 | Retry semantics | OTLP partial success replayed an entire batch even when the collector had accepted some spans | Dead-letter ambiguous rows and retain the response status. Keep existing transient retries | Verified for JSON and Protobuf. [OTLP/HTTP partial success](https://opentelemetry.io/docs/specs/otlp/#partial-success-1) |
| H28 | P1 | Spool durability | A batch larger than the configured budget could evict existing files and still report itself as spooled. An append failure poisoned later flushes | Preflight size, retain the new append on equal timestamps and keep prior failures from blocking replay. Limit replay and eviction to owned batch files | Verified by deterministic filesystem and failure cases |
| H29 | P2 | Supply chain | npm reported one moderate build-chain advisory for `postcss-selector-parser` 6.1.4 | Resolve 6.1.6 within existing constraints | Verified by npm audit and byte-identical generated assets |
| H30 | P2 | Verification and docs | Pricing assertions duplicated catalog dates. The runbook still referenced obsolete dashboard assets | Verify stored pricing provenance against the checked-in fixtures and smoke the served Dither assets | Verified by catalog, pricing, API and docs checks |

The principal write paths live in `src/dashboard_server.kujo`, `src/telemetry_repository.kujo`, `src/telemetry_delivery.kujo` and their compatibility mirrors. Legacy v2 projection remains best effort and runs after the legacy bundle commits. Canonical delivery remains local to the SQLite transaction. HTTP delivery stays in the separate exporter process. Tests inject SQLite failures into canonical intake, legacy request and trace intake, backfill and retention, then verify persisted state. The parallel legacy fixture verifies request IDs and step ownership for six identities and their replays.

The exporter keeps the existing bounded selection for payloads near the cap. Its common path skips repeated prefix mapping and skips JSON serialization in Protobuf mode. The spool continues at-least-once replay and exposes failures to its caller. Its byte cap measures serialized UTF-8. The HTTP client now checks query and fragment on the original base URL, before endpoint normalization could erase them.

## Performance and efficiency

The benchmark ran the normal one-shot exporter through a loopback OTLP/HTTP collector, reset the same SQLite queue before each invocation, discarded one warmup per revision and alternated revisions for five samples. Both revisions used Kujo 1.6.0 and Node 26.12.1 on an Intel i7-9750H macOS host. The 64-record JSON payload was 113,876 bytes in both cases. The records and all semantic fields besides the corrected timestamps matched after normalizing attribute and object order. The final run also asserted each span's exact source start and end time.

| Workload | Baseline | Audited |
|---|---:|---:|
| 64-record worker invocation median | 6,565.69 ms | 357.93 ms |
| Sample range | 6,392.95–7,370.96 ms | 346.28–421.12 ms |
| npm audit | 1 moderate | 0 reported |

The wall time includes process startup, mapping, serialization, loopback HTTP and journal updates. The comparison includes both removed prefix work and corrected timestamp parsing. Production latency and memory were outside this workload. The verification receipt keeps per-test detail in files. Tool registration and replay permissions use the existing producer contract. JSONL cursors, native batch limits and content projection provide bounded detail at the consuming boundaries. The measurements cover exporter wall time, payload bytes and package advisories.

## Security and compatibility

- The default listen address is now loopback. Remote or container deployments relying on an implicit all-interface listener must select a bind address through the existing `WDG_HOST` setting. See the [deployment runbook](../DEPLOYMENT_HARDENING_RUNBOOK.md).
- Prune routes return HTTP 400 for a supplied body that is invalid JSON or has a non-object shape. Empty-body query parameters and the default dry-run behavior remain supported. The fixture route honors the JSON `dry_run` selection.
- Partial OTLP delivery is terminal in the existing `dead` status. Counts from a collector describe its batch and cannot establish the fate of each individual record.
- The existing canonical and legacy success envelopes, schema versions, formats and environment names still apply. The requests identity lookup adds a non-unique SQLite index on startup. Existing duplicate rows remain readable and existing same-source keys resolve to the earliest ID.
- The review checked auth gates, gateway credentials, privacy projection, filesystem ownership, parameter binding, exporter destination controls and backup subprocess argument boundaries. The only package change is a development dependency lockfile update. [Advisory](https://github.com/advisories/GHSA-rj75-hqrm-r3gf)

## Checklist coverage

| Phases | Reviewed |
|---|---|
| 0–2 | Git, project manifests, runtime entrypoints, supported mirrors, contracts, configuration and previous audit. Removed the unused dashboard-local fast-write wrapper and kept its supported repository export. |
| 3–6 | Export and spool hot paths, batch size and destination response bounds, output receipts, wire volume, producer data projection, retry amplification and progressive export. |
| 7–10 | Authentication and bind defaults, redaction, storage/worker state transitions, failure rollback, public API status and compatibility. |
| 11–14 | Lockfile and npm audit, generated asset reproducibility, CI workflows, optional integrations, failure injection and runbook accuracy. |
| 15–16 | Developer and agent verification routes, content and context ownership, compatibility mirror checks and dependency dead weight. Existing legacy formats stay available because their consumers depend on them. |
| 17–18 | Implementation, targeted regression coverage, matched worker benchmark, full suite and runbook updates. |

## Remaining work

P1 carry-forward from October includes the advisory buffered-proxy latency budgets and coordinated leases for multi-process exporter workers. The worker remains an at-least-once delivery process. Production validation continues to use an independent edge rate limiter because caller-provided identity hints are not a trust boundary. Proxy transport and connected-source cross-process CAS were outside these fixes. Local verification used loopback fixtures and the existing Agents SDK and RunLedger integration contracts. Provider egress, remote collectors and a live deployment were outside the audit.

## Verification receipt

- `KUJO_BIN=/tmp/watchdog-release-runtime.9rBoun/kujo AGENTS_SDK_PATH="$PWD/../agents-sdk" WDG_VERIFICATION_DIR="$PWD/tmp/hardening-20261121/final-main" npm test` passed all 76 checks, including Agents SDK. The three opt-in proxy budgeting checks remained advisory and missed their targets.
- `KUJO_BIN=/tmp/watchdog-release-runtime.9rBoun/kujo RUNLEDGER_REPO=/tmp/watchdog-runledger-fixture.YzJr4J node tests/runtime_measurements_adapter_check.js --integration` passed 76 cases and the HTTP restart and receipt path.
- `npm ci --ignore-scripts && npm run build:charts && npm run typecheck && git diff --exit-code -- vendor/dither-charts.js vendor/dither-charts.css && npm audit --json` passed.
- `node scripts/sync_compat_entrypoints.js --check`, `bash .github/scripts/check-kujo-tool-artifacts.sh 7a0bd9a HEAD` and `git diff --check 7a0bd9a..HEAD` passed.
- `KUJO_BIN=/tmp/watchdog-release-runtime.9rBoun/kujo nice -n 10 node tmp/hardening-20261121/exporter-benchmark.cjs /tmp/watchdog-bench-baseline.NmqWuR /tmp/watchdog-legacy.ZqkLJt` passed with semantic hash `0f14f0f81f16b1feb957bce12f14817fea0aca7132481e2de2b038bc26e3c3f9` after normalizing the separately checked timestamps.
