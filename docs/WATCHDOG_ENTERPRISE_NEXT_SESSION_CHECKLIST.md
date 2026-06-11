# Watchdog Enterprise Next-Session Checklist

## Goal
Advance Watchdog from strong local/proxy observability into a more broadly deployable, deployment-hardened reference implementation for Kujo.

## How To Execute This Checklist
1. Read this file, then README.md, then only the files needed for the selected item.
2. Execute one unchecked item at a time in top-to-bottom order.
3. Keep diffs narrowly scoped and add/update tests with each item.
4. Update README.md and runbook docs whenever behavior changes.
5. Mark an item complete only after implementation, tests, and docs are all done.
6. Add a work-log entry after each completed item.

## Status Legend
- [ ] Not started
- [x] Completed and validated

## Tier A: Security And Compliance

### SEC-A01 Add optional proxy authentication mode
- [x] Require token auth for /proxy/* (separate from /api/*) with per-route override controls.
Implementation expectations:
- Add WDG_PROXY_AUTHZ_MODE and token env support.
- Support explicit allowlist for health endpoints.
Acceptance criteria:
- Unauthorized proxy calls fail with 401/403.
Validation/testing expectations:
- Add positive/negative auth tests for proxy routes.

### SEC-A02 Replace remote dashboard CDN dependencies
- [x] Remove remote JS/CSS CDN dependencies or pin with strict integrity and fallback strategy.
Implementation expectations:
- Vendor assets locally or add strict SRI + version pinning.
Acceptance criteria:
- Dashboard loads without unpinned third-party network fetches.
Validation/testing expectations:
- Add deterministic static assertions on dashboard asset references.

### SEC-A03 Add structured audit events for sensitive operations
- [x] Emit structured audit events for prune operations, auth failures, and config visibility requests.
Implementation expectations:
- Include timestamp, action, actor key (session/token class), and result.
Acceptance criteria:
- Operators can trace sensitive actions for incident review.
Validation/testing expectations:
- Add API tests asserting audit rows/event records.

## Tier B: Performance And Scalability

### PERF-B01 Add export cursor/chunk mode
- [x] Add cursor-based export pagination/chunk retrieval for large datasets.
Implementation expectations:
- Keep json/jsonl compatibility while supporting incremental retrieval.
Acceptance criteria:
- Large exports are practical without high memory pressure.
Validation/testing expectations:
- Add chunk progression and compatibility tests.

### PERF-B02 Bound rate-limit bucket memory
- [x] Add eviction/TTL strategy for in-memory rate-limit buckets.
Implementation expectations:
- Cap retained buckets and purge stale keys.
Acceptance criteria:
- Long-running deployments avoid unbounded limiter growth.
Validation/testing expectations:
- Add stress tests for bucket growth and eviction behavior.

### PERF-B03 Add lightweight benchmark command script
- [x] Add a repeatable script that runs quick/soak profiles and summarizes trend deltas.
Implementation expectations:
- Output machine-readable and human-readable summaries.
Acceptance criteria:
- Teams can compare current performance to previous baseline quickly.
Validation/testing expectations:
- Validate script output schema with deterministic assertions.

## Tier C: Product Functionality

### FEAT-C01 Add API versioning contract
- [x] Introduce stable /api/v1 routes or explicit version metadata for compatibility management.
Implementation expectations:
- Preserve existing routes with migration guidance.
Acceptance criteria:
- External consumers can pin to a stable API contract.
Validation/testing expectations:
- Add route/version contract tests.

### FEAT-C02 Add tenant/project filters for sessions and charts
- [x] Extend tenant/project scoping beyond requests/export into sessions and chart APIs.
Implementation expectations:
- Add query params and SQL conditions where applicable.
Acceptance criteria:
- Multi-tenant views remain consistent across all dashboard surfaces.
Validation/testing expectations:
- Add endpoint tests covering tenant/project chart/session scoping.

### FEAT-C03 Add minimal admin diagnostics endpoint
- [x] Add protected diagnostics for runtime config summary, migration state, and DB stats.
Implementation expectations:
- Redact sensitive values and gate via auth.
Acceptance criteria:
- Operators can troubleshoot without shell access.
Validation/testing expectations:
- Add access-control and schema tests.

## Tier D: Architecture And Presentation

### ARC-D01 Introduce src/ layout with compatibility entrypoints
- [x] Move implementation files into src/ while retaining root compatibility launch stubs.
Implementation expectations:
- Keep documented startup commands stable or update docs and wrappers cleanly.
Acceptance criteria:
- Repository root is metadata-first and implementation is structured under src/.
Validation/testing expectations:
- Run full suite and startup smoke checks from documented commands.

### ARC-D02 Add CI workflow for full regression suite
- [x] Add CI automation for all test suites and lint/static checks.
Implementation expectations:
- Include matrix for key environment modes (auth off/token, rate-limit off/basic).
Acceptance criteria:
- Pull requests run deterministic checks before merge.
Validation/testing expectations:
- Verify CI config against local run parity.

### DOC-D01 Add enterprise deployment architecture page
- [x] Add diagrams and patterns for reverse proxy, TLS, auth boundaries, and data retention.
Implementation expectations:
- Include single-node and scaled deployment variants.
Acceptance criteria:
- New adopters can deploy safely with minimal guesswork.
Validation/testing expectations:
- Validate all command snippets and config examples.

## Work Log Template
Date: YYYY-MM-DD
Item ID: <SEC-A01>
Summary: <what changed>
Files changed: <list>
Tests and validation: <commands and pass/fail>
README/docs updated: <yes/no + files>
Follow-ups: <optional>

## Work Log
Date: 2026-05-22
Item ID: <SEC-A01>
Summary: Added dedicated proxy-route token auth mode with configurable allowlist bypass controls and fail-closed validation behavior.
Files changed: <dashboard_server.kujo, tests/proxy_authz_mode_check.js, README.md, docs/DEPLOYMENT_HARDENING_RUNBOOK.md, docs/WATCHDOG_ENTERPRISE_NEXT_SESSION_CHECKLIST.md>
Tests and validation: <PASS: node tests/proxy_authz_mode_check.js && node tests/proxy_integration_stub_suite.js && node tests/watchdog_api_route_suite.js; PASS: token-mode smoke checks for /healthz, /readyz, /api/stats, /proxy/v1/models; PASS: for f in tests/*.js; do node "$f" || exit 1; done>
README/docs updated: <yes + README.md, docs/DEPLOYMENT_HARDENING_RUNBOOK.md>
Follow-ups: <none>

Date: 2026-05-22
Item ID: <DOC-D01>
Summary: Added `docs/ENTERPRISE_DEPLOYMENT_ARCHITECTURE.md` with single-node and scaled deployment diagrams, TLS/auth boundaries, retention lifecycle guidance, and validated command references.
Files changed: <docs/ENTERPRISE_DEPLOYMENT_ARCHITECTURE.md, tests/enterprise_architecture_doc_check.js, README.md, docs/DEPLOYMENT_HARDENING_RUNBOOK.md, docs/WATCHDOG_ENTERPRISE_NEXT_SESSION_CHECKLIST.md>
Tests and validation: <PASS: node tests/enterprise_architecture_doc_check.js; PASS: command-snippet smoke checks for health/readiness/version/diagnostics under documented env baseline; PASS: for f in tests/*.js; do node "$f" || exit 1; done>
README/docs updated: <yes + README.md, docs/DEPLOYMENT_HARDENING_RUNBOOK.md, docs/ENTERPRISE_DEPLOYMENT_ARCHITECTURE.md>
Follow-ups: <none>

Date: 2026-05-22
Item ID: <ARC-D02>
Summary: Added GitHub Actions workflow for full regression runs and auth/rate-limit matrix coverage with static CI contract checks for local parity.
Files changed: <.github/workflows/watchdog-ci.yml, tests/ci_workflow_static_check.js, README.md, docs/WATCHDOG_ENTERPRISE_NEXT_SESSION_CHECKLIST.md>
Tests and validation: <PASS: node tests/ci_workflow_static_check.js; PASS: local matrix parity loop over api_auth_mode={off,token} x rate_limit_mode={off,basic}; PASS: for f in tests/*.js; do node "$f" || exit 1; done>
README/docs updated: <yes + README.md>
Follow-ups: <none>

Date: 2026-05-22
Item ID: <ARC-D01>
Summary: Introduced `src/` canonical implementation layout and added root compatibility entrypoint parity checks plus sync tooling to preserve documented startup commands.
Files changed: <src/dashboard_server.kujo, src/watchdog_shared.kujo, src/watchdog.kujo, src/dashboard.html, scripts/sync_compat_entrypoints.js, tests/src_layout_compatibility_check.js, dashboard_server.kujo, watchdog_shared.kujo, watchdog.kujo, dashboard.html, README.md, docs/DEPLOYMENT_HARDENING_RUNBOOK.md, docs/WATCHDOG_ENTERPRISE_NEXT_SESSION_CHECKLIST.md>
Tests and validation: <PASS: node tests/src_layout_compatibility_check.js && node tests/watchdog_api_route_suite.js; PASS: smoke checks validated root startup command and `sync_compat_entrypoints --check`; PASS: for f in tests/*.js; do node "$f" || exit 1; done>
README/docs updated: <yes + README.md, docs/DEPLOYMENT_HARDENING_RUNBOOK.md>
Follow-ups: <none>

Date: 2026-05-22
Item ID: <FEAT-C03>
Summary: Added protected `/api/admin/diagnostics` endpoint returning redacted runtime configuration summary, migration history, and database table counts.
Files changed: <dashboard_server.kujo, tests/admin_diagnostics_check.js, README.md, docs/DEPLOYMENT_HARDENING_RUNBOOK.md, docs/WATCHDOG_ENTERPRISE_NEXT_SESSION_CHECKLIST.md>
Tests and validation: <PASS: node tests/admin_diagnostics_check.js && node tests/watchdog_api_route_suite.js; PASS: smoke checks verified unauthorized access is blocked and token values are not exposed in diagnostics payload; PASS: for f in tests/*.js; do node "$f" || exit 1; done>
README/docs updated: <yes + README.md, docs/DEPLOYMENT_HARDENING_RUNBOOK.md>
Follow-ups: <none>

Date: 2026-05-22
Item ID: <FEAT-C02>
Summary: Extended tenant/project query scoping to `/api/sessions` and all chart endpoints, keeping multi-tenant filtering behavior consistent across dashboard surfaces.
Files changed: <dashboard_server.kujo, tests/tenant_project_partitioning_check.js, README.md, docs/DEPLOYMENT_HARDENING_RUNBOOK.md, docs/WATCHDOG_ENTERPRISE_NEXT_SESSION_CHECKLIST.md>
Tests and validation: <PASS: node tests/tenant_project_partitioning_check.js && node tests/watchdog_api_route_suite.js; PASS: smoke checks verified tenant-scoped sessions and project-scoped chart counts; PASS: for f in tests/*.js; do node "$f" || exit 1; done>
README/docs updated: <yes + README.md, docs/DEPLOYMENT_HARDENING_RUNBOOK.md>
Follow-ups: <none>

Date: 2026-05-22
Item ID: <FEAT-C01>
Summary: Introduced explicit API version metadata contract via `X-Watchdog-API-Version` headers and a discoverable `/api/version` endpoint for client compatibility pinning.
Files changed: <dashboard_server.kujo, tests/api_version_contract_check.js, README.md, docs/DEPLOYMENT_HARDENING_RUNBOOK.md, docs/WATCHDOG_ENTERPRISE_NEXT_SESSION_CHECKLIST.md>
Tests and validation: <PASS: node tests/api_version_contract_check.js && node tests/watchdog_api_route_suite.js; PASS: smoke checks validated `/api/version` payload and `X-Watchdog-API-Version: v1` headers; PASS: for f in tests/*.js; do node "$f" || exit 1; done>
README/docs updated: <yes + README.md, docs/DEPLOYMENT_HARDENING_RUNBOOK.md>
Follow-ups: <none>

Date: 2026-05-22
Item ID: <PERF-B03>
Summary: Added `scripts/benchmark_profiles.js` to run quick/soak load profiles with human-readable summaries and machine-readable JSON reports, including trend delta calculations.
Files changed: <scripts/benchmark_profiles.js, tests/benchmark_script_schema_check.js, README.md, docs/DEPLOYMENT_HARDENING_RUNBOOK.md, docs/WATCHDOG_ENTERPRISE_NEXT_SESSION_CHECKLIST.md>
Tests and validation: <PASS: node tests/benchmark_script_schema_check.js && node scripts/benchmark_profiles.js --profiles=quick --json-out=tmp/benchmark-smoke.json; PASS: for f in tests/*.js; do node "$f" || exit 1; done>
README/docs updated: <yes + README.md, docs/DEPLOYMENT_HARDENING_RUNBOOK.md>
Follow-ups: <none>

Date: 2026-05-22
Item ID: <PERF-B02>
Summary: Added bounded limiter state management via stale bucket TTL cleanup and max-bucket eviction controls for long-running deployments.
Files changed: <dashboard_server.kujo, tests/rate_limit_bucket_eviction_check.js, README.md, docs/DEPLOYMENT_HARDENING_RUNBOOK.md, docs/WATCHDOG_ENTERPRISE_NEXT_SESSION_CHECKLIST.md>
Tests and validation: <PASS: node tests/rate_limit_bucket_eviction_check.js && node tests/rate_limit_controls_check.js; PASS: smoke checks confirmed cap eviction (`s1_after_cap=200`) and TTL expiry reset (`s4_after_ttl=200`); PASS: for f in tests/*.js; do node "$f" || exit 1; done>
README/docs updated: <yes + README.md, docs/DEPLOYMENT_HARDENING_RUNBOOK.md>
Follow-ups: <none>

Date: 2026-05-22
Item ID: <PERF-B01>
Summary: Added cursor/chunk export retrieval for json/jsonl/ndjson with response metadata (`chunk` object for JSON and cursor headers for JSONL/NDJSON).
Files changed: <dashboard_server.kujo, tests/export_jsonl_mode_check.js, README.md, docs/DEPLOYMENT_HARDENING_RUNBOOK.md, docs/WATCHDOG_ENTERPRISE_NEXT_SESSION_CHECKLIST.md>
Tests and validation: <PASS: node tests/export_jsonl_mode_check.js && node tests/watchdog_api_route_suite.js; PASS: smoke checks validated JSON chunk metadata and JSONL `X-Watchdog-Next-Cursor` header; PASS: for f in tests/*.js; do node "$f" || exit 1; done>
README/docs updated: <yes + README.md, docs/DEPLOYMENT_HARDENING_RUNBOOK.md>
Follow-ups: <none>

Date: 2026-05-22
Item ID: <SEC-A03>
Summary: Added persistent structured audit_events tracking for API/proxy auth failures, proxy-config visibility access, and prune operations, including actor-key and metadata fields.
Files changed: <watchdog_shared.kujo, dashboard_server.kujo, tests/audit_events_check.js, README.md, docs/DEPLOYMENT_HARDENING_RUNBOOK.md, docs/WATCHDOG_ENTERPRISE_NEXT_SESSION_CHECKLIST.md>
Tests and validation: <PASS: node tests/audit_events_check.js && node tests/api_auth_mode_check.js && node tests/proxy_authz_mode_check.js; PASS: smoke checks validated api_auth_failure/proxy_auth_failure/proxy_config_view/prune_operation emission via /api/audit-events; PASS: for f in tests/*.js; do node "$f" || exit 1; done>
README/docs updated: <yes + README.md, docs/DEPLOYMENT_HARDENING_RUNBOOK.md>
Follow-ups: <none>

Date: 2026-05-22
Item ID: <SEC-A02>
Summary: Removed remote Google Fonts dependency and pinned Chart.js with strict SRI plus version-pinned fallback loading behavior.
Files changed: <dashboard.html, tests/dashboard_dependency_pinning_check.js, tests/frontend_contract_suite.js, README.md, docs/DEPLOYMENT_HARDENING_RUNBOOK.md, docs/WATCHDOG_ENTERPRISE_NEXT_SESSION_CHECKLIST.md>
Tests and validation: <PASS: node tests/dashboard_dependency_pinning_check.js && node tests/frontend_contract_suite.js && node tests/dashboard_xss_regression_check.js; PASS: dashboard smoke checks for pinned Chart.js URL/SRI and no fonts.googleapis.com usage; PASS: for f in tests/*.js; do node "$f" || exit 1; done>
README/docs updated: <yes + README.md, docs/DEPLOYMENT_HARDENING_RUNBOOK.md>
Follow-ups: <none>
