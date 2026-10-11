# Watchdog repository hardening audit — 2026-10-10

## Repository and scope

- Repository: `watchdog`; branch: `main`.
- Starting SHA: `4ceb20317d3e50f6d63a6ed473a1ebc46311721d`.
- Ending audited implementation SHA: `40ec05e8ce1a2640d6673b5bd8c38029abb9fc71`.
- The subsequent documentation-only audit commit is identified by `git log -1 --format=%H -- docs/audits/repository-hardening.md`; the final pushed SHA is also recorded in the session handoff. This avoids a self-referential commit hash.
- Purpose: local AI telemetry SDK, authenticated dashboard/API, OpenAI-compatible proxy, canonical telemetry/OTLP intake, durable delivery and operational tooling.
- Users/consumers: operators, Kujo applications, JavaScript producers, Agents SDK, RunLedger and OTLP collectors.
- Dependencies: Kujo HTTP/SQLite/filesystem/runtime-measurement primitives; Node tooling and fetch; React/D3/Motion/esbuild/Tailwind asset chain; sqlite3/OpenSSL backup tools; configured upstream provider APIs.
- Scope: only this repository changed. The initially modified, tracked `watchdog_proxy_config.json` was preserved on disk and removed from tracking (already ignored). A generic `config/proxy.example.json` replaces the tracked local configuration.

The review covered the implementation, canonical contracts and schemas, root compatibility mirrors, configuration, tests/fixtures, SDKs, source registry, exporter, operational scripts, deployment docs and CI. Root entrypoints are supported compatibility artifacts, not dead duplicates: `src/` is authoritative and `scripts/sync_compat_entrypoints.js` maintains them. No broad module rewrite, dependency replacement or speculative cache was justified.

Local validation used Node v26.7.0 and explicit Kujo v1.8.1 at `/Users/robertdevore/2026/Kujolang/kujo-repos/kujo/target/release/kujo`. PATH resolves to Kujo v1.5.0, so the explicit override matters. CI retains its existing pinned v1.6.0 download and digest; that remote CI run was not executed locally. Third-party generated bundles and external runtime internals were not exhaustively audited. This is a broad evidence-driven engineering review, not a proof that every possible vulnerability or concurrency schedule is covered.

## Baseline

Before source changes, a Python subprocess harness ran every `tests/*.js` and `tests/*.mjs` with the explicit Kujo binary. It executed 76 files: 75 passed and one failed (the count includes the `_kujo_bin.js` helper). `runtime_measurements_adapter_check.js` incorrectly required every counter emitted by the newer runtime, although the v1 contract permits optional numeric extensions. The failing case was `missing-counter-bytecode_compile_wall_ns`.

`npm ci --ignore-scripts`, asset build and TypeScript checks passed. Compatibility mirrors matched. Initial npm audit reported 12 package findings: 8 high, 4 moderate. Baseline proxy performance budgets were already advisory and failing; test process success did not mean all budget booleans were true.

Detailed local logs are under ignored `tmp/hardening-20261010/`: `baseline.json`, `baseline-*.log`, red/green regression logs, before/after benchmark JSON, dependency audits and `final/receipt.json`. These contain local evidence rather than committed bulky output. The measurements and command recipes below are the durable receipt.

## Findings

| ID | Priority | Area | Finding and evidence | Action | Status |
|---|---|---|---|---|---|
| H01 | P1 | Credential boundary | Proxy passthrough forwarded its own gateway bearer; upstream-stub regression reproduced disclosure | Suppress gateway credential, retain independent provider bearer | Fixed |
| H02 | P1 | Privacy/validation | Canonical scalar projection ignored sensitive keys; untyped numeric/boolean leaves could retain objects | Reuse redaction and validate typed leaves; preserve known numeric metrics | Fixed |
| H03 | P1 | OTLP failure semantics | Receive-time identity changed on replay; persistence failure was acknowledged as success | Stable source timestamp, legacy observation preservation, 400/409 errors | Fixed |
| H04 | P1 | Resource bounds | Incoming batch could exceed record cap; SQLite text length undercounted UTF-8 bytes | Enforce remaining record slots and BLOB byte lengths | Fixed |
| H05 | P1 | Client lifetime/state | Concurrent same-client flushes replayed the same spool; unread response bodies retained resources | Coalesce flush promise; abort status-only response in finally | Fixed |
| H06 | P2 | Efficiency | Client cloned discarded content and cloned records twice; backup hash read whole file | Project before cloning; hash with fixed 1 MiB buffer | Fixed, measured |
| H07 | P2 | Verification | CI omitted `.mjs`; adapter test treated optional runtime counters as required | Unified compact runner, pinned required-counter assertions, build/type/drift gates | Fixed |
| H08 | P2 | Dependency/config hygiene | Compatible updates available; local proxy config tracked despite ignore rule | Update lockfile; preserve local file and add portable example | Fixed in scope |
| H09 | P1 | Abuse boundary | `rate_limit_key` trusts session/XFF/X-Real-IP/Host from caller | Document independent pre-authentication edge limiter and review trusted-peer migration | Open, source-proven |
| H10 | P2 | Supply chain | Seven package findings remain in Tailwind 3 build chain | Preserve compatibility; deliberate major migration required | Open |
| H11 | P1 | Performance | Existing buffered-proxy latency targets remain unmet | Retain advisory reporting; preserve evidence for architecture work | Open, measured |
| H12 | Needs evidence | Concurrent state | Export worker has no cross-process claim lease; registry atomic replacement is not CAS; backup flag is process-local | Document single-client replay scope; reproduce deployment-specific races before redesign | Deferred |
| H13 | Needs evidence | Export complexity | Exporter repeatedly maps a growing batch (code-supported quadratic work) | Profile representative large batches before redesign | Deferred |

## Changes implemented

### Credentials, privacy and typed intake

`src/dashboard_server.kujo` and its root mirror now keep the gateway bearer on the gateway side of the provider boundary. Clients using `X-Watchdog-Proxy-Token` with a distinct provider `Authorization` retain both supported authentication roles. Streaming and buffered cases are tested in `tests/proxy_authz_mode_check.js`; the new assertion failed on the original implementation.

Canonical metadata maps/arrays now use the existing sensitive-key/value policy, and names/catalog values undergo scalar redaction. Known numeric token/throughput/context keys remain metrics rather than being mistaken for credentials. `src/telemetry_repository.kujo` validates nullable usage counts, retryable flags, names and cost leaves before serialization. `tests/telemetry_v2_api_suite.js` covers the sensitive-value canary, names, metric preservation and malformed structured leaves. No schema version or database migration was added. Previously accepted malformed leaves can now return 400; this enforces the documented typed contract. Arbitrary semantic secrets embedded in innocent-looking metadata remain outside deterministic pattern redaction guarantees.

### Deterministic OTLP retries and truthful responses

`src/telemetry_otlp_ingest.kujo` derives observation time from the source end/start timestamp and uses deterministic epoch fallback, replacing wall-clock fallback. OTLP integer/string token counts normalize to nonnegative integers. `preserve_otlp_observations` performs one bounded, parameterized lookup to retain receive timestamps on records written by the old adapter; other changed fields still conflict. The API checks persistence results and returns 409 for identity conflict and 400 for invalid records. Tests cover identical retry acceptance, changed-record conflict, stable observation time, JSON and protobuf intake. `docs/otlp-ingest.md` documents the contract correction.

### Queue and client resource bounds

`src/telemetry_delivery.kujo` counts serialized UTF-8 bytes rather than characters for enqueue, eviction and backfill. It enforces record slots within an incoming batch, recording explicit dropped rows beyond capacity. The Kujo delivery fixture reproduces oversized-batch and multibyte cases. No cross-process lease guarantee is introduced.

`clients/javascript/watchdog-telemetry.mjs` removes content before cloning and avoids cloning the record array twice. Same-client overlapping flush calls share one promise; completion or rejection releases it. Status-only HTTP sends abort their controller in `finally` to release unread bodies. The new `shared_client_lifecycle_check.mjs` uses synchronization barriers to verify one replay, reset, signal cleanup and input immutability. Spool sharing between client instances/processes still requires external coordination, documented in the client guide.

### Backup memory and verification workflow

`scripts/watchdog_backup.js` computes the same SHA-256 using a fixed 1 MiB buffer with descriptor cleanup. `tests/backup_script_check.js` checks output and sidecar digests. Backup format, permissions, encryption and retention interfaces remain intact.

`scripts/verify.js` discovers JS/MJS checks, streams each process to its evidence file and emits compact per-check receipts plus machine-readable aggregate JSON. It excludes helper modules and explicitly reports the external Agents SDK test as skipped unless `AGENTS_SDK_PATH` is supplied. CI uses `npm test`, asset build, typecheck and generated-asset drift checks. No existing assertion or timing budget was weakened. The adapter test independently pins the 30 required v1 counters, continues negative validation, and permits documented optional numeric extensions (79 cases). Dependency updates use compatible lockfile resolution; generated assets are unchanged.

## Performance and efficiency

Measurements are local samples, not universal guarantees. No flaky millisecond threshold was added to CI. Output-equivalence and bounded-resource regressions provide stable ratchets; existing load/latency tests remain unchanged.

| Measurement | Before | After | Interpretation |
|---|---:|---:|---|
| Shared-client projection p50, 100 records, 100 samples | 3.397285 ms | 1.842277 ms | Same mocked-network workload and output hash |
| Shared-client projection p95 | 4.765234 ms | 2.467073 ms | CPU/clone reduction; not network latency |
| Client input/output bytes | 469,660 / 62,260 | 469,660 / 62,260 | No new wire-size/token reduction claimed |
| Backup peak RSS (`time -l`) | 107,606,016 bytes | 84,492,288 bytes | Whole-command measurement; hash buffer now bounded |
| Backup wall time | 2.48 s | 2.81 s | No backup speedup claimed |
| Backup output | 67,379,200 bytes | 67,379,200 bytes | Exact same SHA-256 |
| npm audit package findings | 12 (8 high, 4 moderate) | 7 (5 high, 2 moderate) | Transitive counts, not unique vulnerabilities |
| npm dependency total | 146 | 146 | No dependency-count reduction claimed |
| Buffered proxy nonstream p95 overhead | 52.537 ms | 51.713 ms | Existing advisory budget still fails |
| Streaming TTFT p95 overhead | 53.030 ms | 27.139 ms | Existing advisory budget still fails; sample noise applies |
| Exporter outage p95 delta | -1.535 ms | +2.617 ms | Final sample misses opt-in 2 ms target; not a stable causal regression finding |
| Quick load throughput / p95 | 40.35 rps / 190 ms | 45.01 rps / 172 ms | Existing pass thresholds satisfied; no causal speed claim |
| Quick load main DB file | 778,240 bytes | 958,464 bytes | Main-file snapshot varies with WAL checkpoint timing; not a logical-size equivalence metric |

Client output SHA-256: `aec73b33f4ad6918e17227fb544b6a6d4adfc7ceb44a0e0dca5c560e96100852` in both runs. Backup SHA-256: `ebc871e6eb1b77d59f036130df8b9a474abc39a064d893dbba28f02314f1a235` in both runs. Proxy benchmark DB bytes/event remained 18,773.333 in both samples.

Token/context review found no need to redesign schemas or reduce safety context. The client wire representation is unchanged; no tokenizer measurement or token saving is claimed. The verification runner moves verbose evidence into files and emits one status per test plus an aggregate receipt; it does not discard diagnostics. No before/after console-byte claim is made. Build output stayed byte-identical; build time and binary size were not optimization targets.

## Security

Reviewed boundaries include API/proxy authentication, caller-controlled headers, provider credential forwarding, canonical/OTLP decoding, redaction, SQL parameterization, source/config persistence, HTTP exports, SDK spool files and backup subprocess/filesystem operations. Confirmed credential and metadata defects were fixed with red/green regressions. The rate limiter remains cooperative per-session throttling, not an adversarial identity boundary. Shared API credentials grant broad access; tenant/project query filters are not tenant ACLs. Deployment guidance now states those limits and corrects the stale claim that `WDG_HOST=127.0.0.1` cannot bind loopback.

The baseline Codex Security scan `c2b6c29d-f1b6-49a9-a896-5b101ad38d80` completed with three medium findings and explicitly partial security coverage. It is tied to the starting snapshot, so it still describes the two subsequently fixed flaws. It excludes exhaustive third-party/runtime analysis and retains concurrency/dependency follow-ups. No clean-security certification is implied.

Remaining build advisories concern [braces recursion exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and [postcss-selector-parser quadratic parsing](https://github.com/advisories/GHSA-rj75-hqrm-r3gf). Build-only reachability limits impact; no remotely exploitable dashboard path was demonstrated. `npm audit fix --force` would propose a Tailwind major migration, so it was not used.

## Compatibility

- Public API routes and success envelopes: unchanged; malformed typed canonical leaves now fail and OTLP persistence failures now correctly return 400/409.
- Proxy auth: own gateway bearer is no longer disclosed; distinct provider authorization and override mode remain supported.
- CLI commands/exit codes: existing interfaces preserved; additive `npm test`, `npm run typecheck`, benchmark helper and verification receipt.
- File formats/schemas/database: no version or migration change; queue error text generalized to `queue capacity exceeded` for either cap.
- Configuration/environment: no runtime variable removed or renamed; additive `WDG_VERIFICATION_DIR` for evidence location. Local proxy config remains at the same runtime path but is untracked; generic example is documented.
- Generated root entrypoints remain synchronized. Assets remain identical.
- External consumers: Agents SDK and RunLedger integrations pass with local checkouts. Consumers relying on malformed telemetry or falsely successful conflicting OTLP writes must correct their payload/retry logic.

## Cross-repository follow-ups

No sibling repository change is required by the implemented fixes. Kujo v1 measurements may include optional counters; the corrected Watchdog test preserves that contract rather than requesting a runtime rollback. A future trusted-peer rate limiter must verify the peer-address API on the minimum supported runtime before depending on it. Local Kujo v1.8.1 source has peer metadata, but that does not prove compatibility with CI's v1.6.0 pin. No ecosystem-wide migration was performed.

## Remaining work

- **P0:** none demonstrated.
- **P1:** H09 trusted rate-limit identity; H11 buffered proxy budget work. Neither is concealed by test process success.
- **P2:** H10 deliberate Tailwind/build advisory migration with CSS/output verification.
- **P3:** no cosmetic churn proposed.
- **Needs more evidence:** H12 multi-process races/leases, H13 repeated exporter mapping; portable runtime-version matrix; logical database size measurement independent of WAL checkpoints; demo-path aliases before claiming destructive-path safety.
- **Not worth changing without evidence:** root compatibility mirrors, stable schemas, mature dependencies replaced by custom implementations, broad dashboard split, speculative caches.

SignalBox admitted only unresolved items: rate identity `cap_2eb1488b-2a1b-4b15-8ee6-11226f3c4914`, build advisories `cap_64dc3471-1b08-459b-a1e6-cd428ccdca34`, proxy budgets `cap_d0654e7c-6632-4c34-8304-fbfa7c4062be`; human-review signal `sig_fcbac543-6d7d-4d69-bf22-32490526dbdc`. The signal corrects the rate capture's mistaken function label to `rate_limit_key`. Exact-ID and concept retrieval verified. No duplicate matched; resolved work, routine checks and speculative race claims were rejected from Capture admission. Strata stores the completed handoff/current-state episode with the final commit and this report as evidence.

## Verification receipt

All commands run from the repository unless noted. `KUJO_BIN` below means the explicit v1.8.1 path above. Logs are in `tmp/hardening-20261010/`.

| Command | Result |
|---|---|
| Baseline Python subprocess loop: `node <file>` for sorted `tests/*.js` + `tests/*.mjs`, explicit `KUJO_BIN` | 75 passed, 1 pre-existing adapter-test failure; helper included |
| `npm ci --ignore-scripts` | Passed |
| `npm run build:charts` | Passed before/after |
| `npx tsc --noEmit` / final `npm run typecheck` | Passed |
| `npm audit --json` | Exit nonzero, 12 before / 7 after findings preserved |
| `npm audit fix --ignore-scripts` | Compatible updates applied; remaining advisories reported |
| `node scripts/sync_compat_entrypoints.js` | Passed; mirrors synchronized |
| `KUJO_BIN=... AGENTS_SDK_PATH=../agents-sdk WDG_VERIFICATION_DIR=tmp/hardening-20261010/final npm test` | 76 passed, 0 failed, 0 skipped |
| `KUJO_BIN=... node tests/telemetry_v2_api_suite.js` | Passed after final metric-preservation edit |
| `KUJO_BIN=... node tests/telemetry_otlp_ingest_check.js` | Passed after final timestamp assertion |
| `node tests/shared_client_lifecycle_check.mjs` | Passed |
| `KUJO_BIN=... RUNLEDGER_REPO=../runledger node tests/runtime_measurements_adapter_check.js --integration` | Passed, 79 cases and RunLedger E2E |
| `KUJO_BIN=... WDG_LOAD_PROFILE=all node tests/load_soak_suite.js` | Passed, real quick and soak profiles |
| `node scripts/benchmark_profiles.js --fixture --profiles=quick,soak --json-out=tmp/hardening-20261010/profiles.json` | Passed report-generation fixture; not a live performance measurement |
| `git show 4ceb203:clients/javascript/watchdog-telemetry.mjs > tmp/hardening-20261010/client-before.mjs` then `node scripts/benchmark_client.mjs tmp/hardening-20261010/client-before.mjs` and `node scripts/benchmark_client.mjs` | Same output SHA; timings above |
| `/usr/bin/time -l node scripts/watchdog_backup.js --db tmp/hardening-20261010/backup-benchmark.db --out-dir tmp/hardening-20261010/backup-benchmark-output --retention-count 1` | Before/after actual CLI on 64 MiB zeroblob fixture; matching backup SHA |
| `git diff --exit-code -- vendor` | Passed after rebuilt assets |
| `git diff --check` | Passed |

The suite includes canonical/API/SQL injection/identity/privacy, auth matrices, source management, export failure/retry, dashboard/static, backup, demos, real load, proxy overhead, JS client and cross-repository SDK tests. No new regression is known in these checks. There is no separate repository formatter/linter configuration to claim as run. Remote CI and exhaustive long-duration/multi-process testing remain outside this local receipt.
