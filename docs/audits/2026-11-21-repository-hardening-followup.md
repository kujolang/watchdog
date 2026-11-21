# Watchdog repository hardening follow-up · 2026-11-21

## Repository

Watchdog on `main` started at `58d63ed6f35fcc687112dbd6085a6d1d71578d57`. The verified implementation ends at `3e625cf48724dd788afa5b2a4fea114e8cbc99f4`. The report is a subsequent commit. This pass builds on the [earlier November audit](2026-11-21-repository-hardening.md).

Watchdog collects AI telemetry, proxies OpenAI-compatible traffic, and makes records available through a dashboard, SQLite-backed APIs, backups and OTLP export. The reviewed dependencies were the Kujo 1.6.0 runtime, SQLite, Node.js, the dashboard asset toolchain, OpenSSL for encrypted backups, and the optional Agents SDK and RunLedger integrations. Hosted providers and collectors were represented by loopback fixtures.

## Baseline

Node 26.12.1 and the verified Kujo 1.6.0 macOS x64 release ran all 76 checks, including the Agents SDK integration, before implementation. The dashboard build, typecheck, asset comparison and npm audit passed. The three existing proxy latency budgets were advisory and missed their targets in the baseline. Detailed local receipts are in ignored `tmp/hardening-followup/`.

## Findings

| ID | Priority | Area | Evidence | Action and status |
|---|---|---|---|---|
| H31 | P0 | Export delivery | The journal selected the same due rows in overlapping invocations and acknowledged rows individually | Reserve the worker sidecar per SQLite database. Commit delivery rows, dead letters and profile state together. Verified against an overlapping worker and a failing second acknowledgement. |
| H32 | P0 | Rate-limit consistency | Independent SQLite readers could both read the same request count and replace it with the same next value | Use a dedicated writer and one transaction for counting, reset, expiry and eviction. Verified across two listeners with 40 requests and one quota. |
| H33 | P0 | Connected Sources configuration | Atomic rename did not serialize revision checks. A large replacement could exceed the same file's read cap | Hold a per-file advisory lock during revision check and private publication. Enforce the encoded byte cap before replacement. Verified by concurrent writers with one revision and a multibyte boundary. |
| H34 | P1 | Canonical observation accuracy and retention | Text ordering incorrectly ranked offset timestamps. The delete trigger rescanned all records for a producer on every deletion. Timestamp validation accepted impossible dates | Use RFC 3339 parsing, an index ordered by instant and transactional summary repair. Update counts incrementally. Verified across intake, startup migration and deletion. |
| H35 | P1 | Backup publication and recovery | A failed checksum rename left a discoverable backup. A failed journal insert kept the in-progress flag set | Stage on the destination volume with private permissions and publish the backup after its digest. Release the guard on thrown errors. Verified with checksum and journal write failures. |
| H36 | P1 | Native producer bounds | The JavaScript client attempted network submission before checking the spool size cap. Replay read persisted files in full | Check encoded UTF-8 bytes before transport and bound replay reads. Verified with oversized multibyte submissions and a persisted oversized file. |
| H37 | P2 | Inventory consistency and I/O | The inventory could hash one proxy config version and display another. A rejected registry could be read again in full to fingerprint the error | Use a single bounded configuration snapshot for the inventory and publish its cache key with the result. Verified by the Connected Sources suite and query benchmark. |
| H38 | P1 | Backup scratch retention | Host inspection found two prior owner-private backup scratch directories totaling approximately 726 MiB. A verification attempt separately hit ENOSPC | Preserved the directories for owner review. SignalBox holds the corroborated observation. Exact preexisting failure causes and recovery value are unknown. |
| H39 | P1 | Verification isolation | Test instances could schedule backups and write to the live default backup directory | Disable scheduled backups in the runner and provide a fixture destination. The dedicated backup suites exercise helper and API behavior independently. |

Five new regression checks also failed against the original code for their intended assertions. They covered duplicate worker delivery, shared quota counts, impossible timestamps, failed checksum publication and the failed backup receipt guard.

In-flight exporter acknowledgements use guarded updates so a terminal capacity drop is not revived. A successful remote request can still be replayed if the process exits before recording the response. Connected Sources locks coordinate Watchdog API writers. Operator changes made outside the API need independent coordination. Existing parsed profile fields and source revisions remain compatible. Invalid timestamps and oversized configuration replacements now use the existing HTTP 400 response style. Contended configuration writes return 503. Concurrent workers exit with a SQLite reservation error. The observation migration adds an index, replaces its triggers and repairs derived rows in one transaction. Canonical record payloads and timestamps are kept as provided.

## Performance and efficiency

The same local fixture deleted 500 of 10,000 canonical rows for one producer under a transaction, verified the remaining count and first/last observation, and rolled back. SQL ran through Node SQLite against databases initialized by each revision's Kujo entrypoint. Each revision had one warmup and five alternating samples on the same macOS host. The measurement excludes seeding, migration, readback and rollback.

| Workload | Baseline | Audited |
|---|---:|---:|
| Canonical row deletion median | 7,511.46 ms | 26.07 ms |
| Canonical row deletion range | 6,452.33–7,682.53 ms | 21.02–32.36 ms |
| Connected Sources inventory p95 in the 50,000-row gate | 8.49 ms | 5.29 ms |

The deletion fixture used native canonical rows. OTLP classification is rechecked when an OTLP row is removed and that path was outside the timed fixture. The inventory gate stayed under its existing 25 ms budget. Host load varied between suite runs, so the inventory figures are gate evidence. Proxy latency, memory use, build time and model token consumption have no improved target claims in this pass.

## Checklist coverage

| Phases | Reviewed |
|---|---|
| 0–2 | Git, entrypoints and mirrors, SQLite initialization, proxy and ingest routes, source management, schemas, SDK adapter, dashboard, backup, packaging and earlier audits. Reused the current writer and regression suites. |
| 3–4 | Export journal I/O, canonical retention triggers, proxy configuration snapshot reads, producer spool limits, backup stage lifetime and benchmark evidence. |
| 5–6 | Dashboard and agent tool output, metadata-only projection, bounded JSONL cursors and command receipts. Watchdog does not register model tools or inject prompts. Producer flush and exporter delivery can amplify replay. Direct tests cover byte and concurrency bounds. |
| 7–10 | SQLite rollback, duplicate workers, auth and redaction boundaries, writes and locks, backup subprocess handling, timestamp validation, API and CLI compatibility. Header-selected buckets are still operator grouping hints. |
| 11–14 | Package and lockfile audit, reproducible dashboard assets, CI workflow and release gates, fixture failures, documentation and mirror drift. |
| 15–16 | Short verification receipts, drill-down and progressive export, root compatibility paths and current test entrypoints. The existing CLI and telemetry versions retain downstream consumers. |
| 17–18 | Implemented the fixes above, ran matched benchmarks, validated the updated fixtures and reran the repository suite. |

## Remaining work

- **P1** Backup scratch recovery after abrupt process termination needs ownership and recovery review. The directories observed on this host predate this pass.
- **P1, carried forward** The nonstream overhead, time-to-first-output overhead and exporter-outage isolation budgets remain advisory. All three missed their targets in the final isolated run. An independent edge limiter is necessary for untrusted traffic because Watchdog's grouping hints are supplied by callers.
- **Cross-repository** Both optional integrations passed against their existing interfaces.
- **Verification limits** The runtime was exercised on macOS. Hosted CI covers Linux. Live providers, collectors, remote deployments and Windows remain outside the verified environment. Connected Sources file mutation uses the Kujo POSIX file lock and private-file primitives.

## Verification receipt

- `KUJO_BIN=/tmp/watchdog-release-runtime.9rBoun/kujo AGENTS_SDK_PATH="$PWD/../agents-sdk" WDG_VERIFICATION_DIR="$PWD/tmp/hardening-followup/baseline" npm test` passed 76 checks.
- From the audited checkout, `KUJO_BIN=/tmp/watchdog-release-runtime.9rBoun/kujo AGENTS_SDK_PATH=<agents-sdk-checkout> WDG_VERIFICATION_DIR=<evidence-dir>/verified-isolated npm test` passed 76 checks with zero failures or skips. An earlier pass stopped on host ENOSPC. The rerun isolated the generated backup fixtures from operating data.
- `KUJO_BIN=/tmp/watchdog-release-runtime.9rBoun/kujo RUNLEDGER_REPO=/tmp/watchdog-runledger-followup node tests/runtime_measurements_adapter_check.js --integration` passed 76 fixture cases and the HTTP restart and receipt check. The checkout used CI's pinned RunLedger commit `88fb37c81567bb94e1e341037514fe37cbafa76f`.
- `npm run build:charts && npm run typecheck && git diff --exit-code -- vendor && npm audit --json` passed with byte-identical assets and zero reported advisories.
- `KUJO_BIN=/tmp/watchdog-release-runtime.9rBoun/kujo node tmp/hardening-followup/source-prune-benchmark.cjs "$PWD" /tmp/watchdog-hardening-followup` passed the matched deletion workload.
- `node scripts/sync_compat_entrypoints.js --check`, `node tests/docs_link_check.js`, `git diff --check` and the repository artifact guard passed.
