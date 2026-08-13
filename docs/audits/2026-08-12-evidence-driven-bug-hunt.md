# Watchdog Evidence-Driven Bug Hunt — 2026-08-12

## Executive Summary

- Repository: `kujolang/watchdog`
- Baseline commit: `3e3a8fcbcb2a3e5e92bb169da4d40cf4ee15bb04`
- Repository type: local-first monitoring service, OpenAI-compatible HTTP proxy, SQLite telemetry store, dashboard, and maintenance CLI scripts
- Primary responsibilities: proxy provider traffic; persist request, tool, agent, trace, cost, auth, rate-limit, and backup telemetry; expose authenticated APIs, exports, and a local dashboard
- Attack surfaces investigated: HTTP routing and query forwarding, provider response normalization, SSE parsing, telemetry validation and persistence, tenant/project export scoping, auth/rate limits, redaction, request-size limits, backup paths and retention, pricing/repricing scripts, pagination/time filters, compatibility mirrors, and dashboard contracts
- Candidate hypotheses tested: 12
- Confirmed bugs: 6
- Fixed bugs: 6
- Rejected hypotheses: 5
- Needs-specification findings: 1
- Regression tests added or strengthened: 3 suites
- Existing test failures before audit: 0; all 41 executable JavaScript suites passed at the baseline
- Final validation status: PASS for targeted regressions, the complete JavaScript suite, chart build, compatibility synchronization, fixture benchmarks, catalog refresh execution, and diff checks. The refreshed remote pricing output was reviewed but intentionally not retained because catalog/test pinning is release-managed.

## Bug Summary Table

| ID | Severity | Subsystem | Root Cause | Regression Test | Fixed | Backtested |
| --- | --- | --- | --- | --- | --- | --- |
| BUG-001 | Medium | Telemetry intake | Token counters were coerced without rejecting negative values | `tests/watchdog_api_route_suite.js` | Yes | Yes |
| BUG-002 | Medium | Telemetry intake | `NaN`/`Infinity` passed the non-negative-only cost check and failed later as an internal error | `tests/watchdog_api_route_suite.js` | Yes | Yes |
| BUG-003 | Medium | Proxy routing | Path validation treated any `..` substring as traversal, including safe opaque identifiers | `tests/proxy_integration_stub_suite.js` | Yes | Yes |
| BUG-004 | Medium | SSE telemetry | Global `data:` replacement corrupted valid JSON strings inside SSE payloads | `tests/proxy_integration_stub_suite.js` | Yes | Yes |
| BUG-005 | High | Export isolation | Tenant/project filters applied only to request rows, not related exported records | `tests/tenant_project_partitioning_check.js` | Yes | Yes |
| BUG-006 | Medium | Proxy response contract | Proxy responses discarded upstream retry guidance and request identifiers | `tests/proxy_integration_stub_suite.js` | Yes | Yes |

## Detailed Confirmed Bugs

### BUG-001 — Negative token telemetry was persisted

- Severity: Medium
- Subsystem: external request and trace telemetry intake
- Invariant violated: token counts and derived costs must be non-negative; rejected telemetry must not mutate state
- Fixture: authenticated local telemetry payloads with `input_tokens: -1`
- Exact reproduction command: `KUJO_BIN=/Users/robertdevore/2026/Kujolang/kujo-repos/kujo/target/release/kujo node tests/watchdog_api_route_suite.js`
- Expected behavior: HTTP 400 and no request/trace row
- Observed pre-fix behavior: HTTP 200 and negative telemetry persistence
- Reproduction count: 2
- Root cause: `to_int_or_zero` accepted negative integers and no admission validation ran before persistence
- Files changed: `src/dashboard_server.kujo`, compatibility mirror, `tests/watchdog_api_route_suite.js`
- Fix: validate all request/body and nested-trace token counters before any insert
- RED evidence: baseline `3e3a8fc`; assertion `200 !== 400`; exit 1
- GREEN evidence: fixed tree; same command; PASS; exit 0
- Backtest: baseline FAIL, fixed PASS
- Related tests: external intake, pricing estimates, API routes, schema migration, redaction
- Full-suite result: PASS
- Potential regression risk: Low; valid zero and positive counters retain existing coercion behavior

### BUG-002 — Non-finite reported costs produced HTTP 500

- Severity: Medium
- Subsystem: provider-reported cost intake
- Invariant violated: malformed telemetry must produce a controlled client error and must not corrupt state
- Fixture: `cost_usd: "NaN"` and `cost_usd: "Infinity"`
- Exact reproduction command: same API route suite command as BUG-001
- Expected behavior: HTTP 400 with the existing non-negative-number error contract
- Observed pre-fix behavior: HTTP 500 for `NaN`
- Reproduction count: 2
- Root cause: the check tested only `cost_usd < 0`; non-finite floats bypassed it and failed during persistence
- Files changed: `src/dashboard_server.kujo`, compatibility mirror, `tests/watchdog_api_route_suite.js`
- Fix: reject values whose self-difference is non-zero, covering `NaN` and infinities without changing finite values
- RED evidence: baseline `3e3a8fc`; assertion `500 !== 400`; exit 1
- GREEN evidence: fixed tree; same command; PASS; exit 0
- Backtest: baseline FAIL, fixed PASS
- Related tests: direct API value estimates, repricing workflow, OpenRouter catalog checks
- Full-suite result: PASS
- Potential regression risk: Low

### BUG-003 — Safe dotted resource IDs were rejected as traversal

- Severity: Medium
- Subsystem: proxy path compatibility and path safety
- Invariant violated: safe OpenAI-compatible opaque path segments must be forwarded; only actual relative path segments must be rejected
- Fixture: `GET /proxy/v1/files/file..safe/content`
- Exact reproduction command: `KUJO_BIN=/Users/robertdevore/2026/Kujolang/kujo-repos/kujo/target/release/kujo node tests/proxy_integration_stub_suite.js`
- Expected behavior: request reaches the upstream and its 404 response is preserved
- Observed pre-fix behavior: Watchdog rejected it locally with HTTP 400 and no egress
- Reproduction count: 2
- Root cause: `contains(text, "..")` conflated safe substrings with the exact `..` relative segment
- Files changed: proxy server source/mirror and proxy integration suite
- Fix: reject exact `.` and `..` segments while retaining the encoded traversal and separator defenses
- RED evidence: baseline `3e3a8fc`; assertion `400 !== 404`; exit 1
- GREEN evidence: fixed tree; same command; PASS; exit 0
- Backtest: baseline FAIL, fixed PASS
- Related tests: proxy route compatibility, unsafe encoded traversal, named upstream profiles
- Full-suite result: PASS
- Potential regression risk: Low; the existing `%2e%2e` traversal regression remains green

### BUG-004 — SSE payload text containing `data:` was corrupted

- Severity: Medium
- Subsystem: streaming provider response telemetry
- Invariant violated: proxy telemetry must summarize the provider payload without altering valid JSON content
- Fixture: streamed delta content `"hello data:"` followed by `" world"`
- Exact reproduction command: proxy integration suite command above
- Expected behavior: persisted response summary `hello data: world`
- Observed pre-fix behavior: the first event became invalid JSON and the summary omitted it
- Reproduction count: 2
- Root cause: `replace(line, "data:", "")` removed every occurrence rather than only the SSE field prefix
- Files changed: proxy server source/mirror and proxy integration suite
- Fix: remove exactly the leading prefix using `substring`
- RED evidence: baseline `3e3a8fc`; response-summary assertion failed; exit 1
- GREEN evidence: fixed tree; same command; PASS; exit 0
- Backtest: baseline FAIL, fixed PASS
- Related tests: streamed identity, usage, finish reason, and passthrough body checks
- Full-suite result: PASS
- Potential regression risk: Low

### BUG-005 — Scoped exports leaked records from other tenants/projects

- Severity: High
- Subsystem: JSON/JSONL export isolation
- Invariant violated: documented tenant/project export filters must constrain every related exported record kind
- Fixture: three proxy sessions across different tenant/project pairs, exported with `tenant_id=tenant_alpha`
- Exact reproduction command: `KUJO_BIN=/Users/robertdevore/2026/Kujolang/kujo-repos/kujo/target/release/kujo node tests/tenant_project_partitioning_check.js`
- Expected behavior: requests, tool calls, agent steps, traces, spans, and events are all limited to the selected tenant/project
- Observed pre-fix behavior: request rows were scoped, while tool calls and other related arrays contained cross-tenant data
- Reproduction count: 2
- Root cause: tenant/project predicates were added only to `request_conditions`
- Files changed: server source/mirror and tenant/project integration test
- Fix: apply correlated request predicates to every exported record kind, including trace-event correlation through traces
- RED evidence: baseline `3e3a8fc`; tool-call isolation assertion failed; exit 1
- GREEN evidence: fixed tree; same command; PASS; exit 0
- Backtest: baseline FAIL, fixed PASS
- Related tests: JSONL export, tenant/project API/chart partitioning, retention/export static controls
- Full-suite result: PASS
- Potential regression risk: Medium; independent traces without a request/session association are intentionally excluded from a tenant/project-scoped export because no trustworthy scope can be inferred

### BUG-006 — Retry and request-correlation headers were dropped

- Severity: Medium
- Subsystem: OpenAI-compatible proxy responses
- Invariant violated: controlled upstream failures must preserve client-actionable retry guidance and provider request identity
- Fixture: upstream HTTP 429 with `Retry-After: 7` and `X-Request-Id: stub-rate-limit-1`
- Exact reproduction command: proxy integration suite command above
- Expected behavior: status, body, retry header, and request-id header reach the client
- Observed pre-fix behavior: status/body passed through but both headers were absent
- Reproduction count: 2
- Root cause: `forward_response` accepted only status, body, and content type
- Files changed: proxy server source/mirror and proxy integration suite
- Fix: safely forward `Retry-After` and `X-Request-Id`
- RED evidence: baseline `3e3a8fc`; assertion `'' !== '7'`; exit 1
- GREEN evidence: fixed tree; same command; PASS; exit 0
- Backtest: baseline FAIL, fixed PASS
- Related tests: upstream 429 passthrough, timeout, malformed response, auth override
- Full-suite result: PASS
- Potential regression risk: Low; arbitrary upstream headers remain filtered

## Rejected Hypotheses

1. Hypothesis: concurrent authenticated requests corrupt SQLite rate-limit buckets. Plausibility: read/update rate-limit operations could race. Fixture: the existing concurrent request burst in `rate_limit_controls_check.js`. Observed: all allowed requests completed, subsequent limits and reset behavior were correct. Rejected because no invariant violation reproduced.
2. Hypothesis: multibyte UTF-8 request bodies bypass byte limits. Plausibility: character count and byte count differ. Fixture: existing exact/boundary Unicode payload cases in `request_body_limits_check.js`. Observed: byte boundaries were enforced for proxy and both telemetry routes. Rejected because the implementation uses encoded byte length and all assertions passed.
3. Hypothesis: encoded traversal reaches an upstream. Plausibility: route decoders can normalize `%2e%2e`. Fixture: `/proxy/v1/chat/%2e%2e`. Observed: HTTP 400, no upstream receipt, and an `unsafe_proxy_path` telemetry row. Rejected because the security boundary held before and after BUG-003.
4. Hypothesis: a missing backup manifest bypasses retention. Plausibility: manifest-only retention can orphan old backups. Fixture: delete the manifest, add an old generated backup, run retention. Observed: filesystem inventory pruned the orphan and checksum while retaining the configured count. Rejected because `backup_script_check.js` passed.
5. Hypothesis: malformed upstream JSON falsely reports a proxy failure. Plausibility: telemetry parsing could be coupled to forwarding. Fixture: upstream HTTP 200 with malformed JSON. Observed: body/status passed through and telemetry remained controlled. Rejected because forwarding does not depend on successful telemetry parsing.

## Needs Specification

- Question: Should an existing but malformed `WDG_PROXY_CONFIG_PATH` abort startup, disable proxying, or continue with defaults?
- Relevant implementation: `read_proxy_config_file` returns an empty map for parse/type failures, causing `effective_proxy_config` to use the public OpenAI default.
- Interpretation A: fail closed because a configuration typo can redirect intended local traffic to an unintended default upstream.
- Interpretation B: preserve the current forgiving local-first startup behavior and surface a diagnostic warning.
- Why unresolved: the precedence contract is documented, but malformed-file behavior is not.
- Recommended decision: specify fail-closed behavior for production and an explicit warning/fallback policy for local mode before changing production behavior.

## Test Additions

| Test | Bug prevented | Fixture type | Fails on baseline | Passes after fix |
| --- | --- | --- | --- | --- |
| `tests/watchdog_api_route_suite.js` | BUG-001, BUG-002 | HTTP integration + persistence | YES | YES |
| `tests/proxy_integration_stub_suite.js` | BUG-003, BUG-004, BUG-006 | local upstream stub integration | YES | YES |
| `tests/tenant_project_partitioning_check.js` | BUG-005 | multi-tenant integration/export | YES | YES |

## Validation Matrix

| Validation | Command | Result |
| --- | --- | --- |
| Diff/static validation | `git diff --check` | PASS |
| Compatibility mirrors | `node scripts/sync_compat_entrypoints.js` | PASS |
| Targeted API regressions | `KUJO_BIN=... node tests/watchdog_api_route_suite.js` | PASS |
| Targeted proxy regressions | `KUJO_BIN=... node tests/proxy_integration_stub_suite.js` | PASS |
| Targeted partition regressions | `KUJO_BIN=... node tests/tenant_project_partitioning_check.js` | PASS |
| Complete unit/integration/static suite | `for f in tests/*.js; do node "$f" || exit 1; done` (excluding helper `_kujo_bin.js`) | PASS, 41/41 |
| Dashboard asset build | `npm run build:charts` | PASS, no tracked artifact drift |
| Fixture benchmark | `node scripts/benchmark_profiles.js --fixture --profiles=quick,soak --json-out=tmp/benchmark-fixture.json` | PASS |
| Pricing refresh execution | `node scripts/refresh_openrouter_pricing_catalog.js` | PASS; generated remote update reviewed and not retained because release pinning is out of audit scope |
| Backtest | baseline worktree plus each regression suite | PASS: baseline failed all six regressions; fixed tree passed |

## Repository Attack Coverage

| Area | Status | Evidence |
| --- | --- | --- |
| CLI | APPLICABLE — investigated | backup, benchmark, repricing, refresh argument/error paths |
| Input validation | APPLICABLE — investigated | BUG-001, BUG-002; malformed/oversized bodies |
| Filesystem/path safety | APPLICABLE — investigated | backup separation/retention/delete checks; proxy traversal |
| State transitions | APPLICABLE — investigated | telemetry rejection non-mutation, backup lifecycle, idempotent request intake |
| Determinism | APPLICABLE — investigated | fixtures, compatibility mirrors, catalog/build drift |
| Serialization | APPLICABLE — investigated | JSON, JSONL, malformed upstream JSON, SSE |
| Concurrency | APPLICABLE — investigated | rate-limit burst and load suite |
| Async/timeouts | APPLICABLE — investigated | upstream timeout returns controlled 502 |
| Error handling | APPLICABLE — investigated | 4xx/5xx, malformed provider body, invalid telemetry |
| Security/secrets | APPLICABLE — investigated | auth, redaction, traversal, export isolation |
| Networking/provider adapters | APPLICABLE — investigated | passthrough/override/named profiles, SSE, 429, timeout |
| API contracts | APPLICABLE — investigated | filtering, pagination, export, version/security headers |
| MCP | NOT APPLICABLE | no MCP transport in this repository |
| Agent systems | APPLICABLE — investigated | agent-step intake/derivation/export |
| Retrieval/RAG | NOT APPLICABLE | no retrieval index |
| Parsing/language tooling | NOT APPLICABLE | Kujo is an implementation language, not this repo's product surface |
| Generation/build | APPLICABLE — investigated | mirrored entrypoints and dashboard asset build |
| Caching | NOT APPLICABLE | no behavior-affecting application cache identified |
| Versioning/migrations | APPLICABLE — investigated | API version and schema migration suites |
| Unicode | APPLICABLE — investigated | UTF-8 body-limit boundaries |
| Resource limits | APPLICABLE — investigated | body, export, pagination, rate-limit, trace collection caps |
| Cross-feature interactions | APPLICABLE — investigated | tenant + export; streaming + telemetry; auth + rate limits |
| Fault injection | APPLICABLE — investigated | timeout, 429, malformed JSON, missing backup manifest |
| Metamorphic/differential | APPLICABLE — investigated | source/mirror equivalence, JSON/JSONL scopes, repeated request intake |

## Remaining Risk

- Live provider traffic was not exercised because no credentials or external spend were authorized; local stubs covered provider response shapes, failures, streaming, and headers.
- Production TLS, reverse-proxy trust, firewall, secret manager, and external storage behavior require target-environment validation.
- Linux and Windows execution were not available; macOS plus portability/static contracts were exercised.
- Failure semantics for malformed proxy configuration remain explicitly unspecified.
