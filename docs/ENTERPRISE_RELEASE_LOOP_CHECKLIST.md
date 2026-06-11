# Watchdog Enterprise Release Loop Checklist

## Goal
Close the remaining deployment-hardening gaps with strict one-item loops: implement, test, full-regression, commit, push.

## Execution Rules
1. Pick the first unchecked item.
2. Keep changes scoped to that item.
3. Add or update deterministic tests for the change.
4. Run targeted tests plus full `tests/*.js` regression.
5. Update docs affected by behavior changes.
6. Mark item done only after tests pass and commit is pushed.

## Items

### Loop 1: Secure Production Startup Defaults
- [x] Add production startup policy guardrails that fail closed unless API and proxy auth are tokenized with non-empty tokens.
- [x] Add break-glass override switch with explicit warnings.
- [x] Add startup guard regression tests for fail/secure-pass/override-pass.

### Loop 2: Governance And Release Controls
- [x] Add SECURITY policy document with disclosure workflow and contact process.
- [x] Add CODEOWNERS and contribution/release workflow docs.
- [x] Add release checklist and changelog/versioning policy.

### Loop 3: Portability And Reproducibility
- [x] Remove host-specific binary path assumptions from docs/tests in favor of `KUJO_BIN` or PATH-first strategy.
- [x] Add preflight checks for missing or invalid Kujo runtime in CI/documented commands.

### Loop 4: Offline/Restricted-Network Frontend Reliability
- [x] Add optional vendored local dashboard assets for Chart.js fallback in restricted networks.
- [x] Add static checks to ensure deterministic asset loading policy.

### Loop 5: Documentation Trust And Operational Clarity
- [x] Reconcile stale scout checklist snapshot/history statements so current status is unambiguous.
- [x] Consolidate residual follow-up notes into active backlog items with ownership and acceptance criteria.

## Consolidated Open Backlog (Post-Loop)

### BL-001 Browser-Level Dashboard Contract Coverage
Owner: @robertdevore
Acceptance criteria: Add headless-browser coverage for requests, filters, empty states, and escape rendering paths in CI.

### BL-002 Tenant/Project Scoping For Tool And Agent Exports
Owner: @robertdevore
Acceptance criteria: `/api/export` supports tenant/project scoping for tool-call and agent-step records with deterministic regression coverage.

### BL-003 Deep Nested Redaction Coverage
Owner: @robertdevore
Acceptance criteria: Redaction handles nested arrays/maps without shape loss and includes allowlist-based exclusions in tests.

### BL-004 Performance Trend Persistence
Owner: @robertdevore
Acceptance criteria: Benchmark script stores trend history artifacts and reports delta comparisons against prior baselines.

### BL-005 Optional JSONL Chunk-Size Tuning Guidance
Owner: @robertdevore
Acceptance criteria: Export docs/tests cover chunk-size tuning guidance and bounded response behavior for large NDJSON/JSONL exports.

### BL-006 Canonical Kennel Bootstrap Snippets
Owner: @robertdevore
Acceptance criteria: Kennel integration guide includes maintainer-approved bootstrap snippets validated by static doc checks.

## Work Log
- Date: 2026-05-27
  Loop: initialized
  Summary: Created enterprise release loop checklist from readiness review gaps.
  Commit: pending
- Date: 2026-05-27
  Loop: 1
  Summary: Added production startup policy enforcement (`WDG_DEPLOYMENT_PROFILE=production`) with fail-closed auth requirements and break-glass override, plus startup guard regression suite.
  Tests: node tests/production_startup_guard_check.js && node tests/api_auth_mode_check.js && node tests/proxy_authz_mode_check.js && node tests/src_layout_compatibility_check.js; for f in tests/*.js; do node "$f" || exit 1; done
  Commit: pending
- Date: 2026-05-27
  Loop: 2
  Summary: Added enterprise governance/release controls (`SECURITY.md`, `.github/CODEOWNERS`, `CONTRIBUTING.md`, `CHANGELOG.md`, `docs/RELEASE_CHECKLIST.md`) and linked them from `README.md`.
  Tests: node tests/governance_release_docs_check.js && node tests/enterprise_architecture_doc_check.js && node tests/ci_workflow_static_check.js; for f in tests/*.js; do node "$f" || exit 1; done
  Commit: pending
- Date: 2026-05-27
  Loop: 3
  Summary: Introduced shared Kujo runtime resolver/preflight helper for runtime-dependent tests, removed host-specific runtime paths from active docs/tests, and added portability contract checks.
  Tests: export KUJO_BIN=${KUJO_BIN:-kujo} && node tests/runtime_portability_contract_check.js && node tests/api_auth_mode_check.js && node tests/proxy_config_visibility_check.js && node tests/watchdog_api_route_suite.js; export KUJO_BIN=${KUJO_BIN:-kujo} && for f in tests/*.js; do node "$f" || exit 1; done
  Commit: pending
- Date: 2026-05-27
  Loop: 4
  Summary: Added optional local Chart.js vendor route/fallback (`/assets/vendor/chart.umd.min.js`), environment override (`WDG_CHARTJS_LOCAL_PATH`), and fallback policy docs/static checks.
  Tests: export KUJO_BIN=${KUJO_BIN:-kujo} && node tests/dashboard_dependency_pinning_check.js && node tests/dashboard_local_vendor_asset_route_check.js && node tests/src_layout_compatibility_check.js && node tests/runtime_portability_contract_check.js; export KUJO_BIN=${KUJO_BIN:-kujo} && for f in tests/*.js; do node "$f" || exit 1; done
  Commit: pending
- Date: 2026-05-27
  Loop: 5
  Summary: Reconciled stale scout checklist status language, added active-backlog pointers, and consolidated residual follow-ups into owner-tagged backlog items with acceptance criteria.
  Tests: export KUJO_BIN=${KUJO_BIN:-kujo} && node tests/scout_backlog_alignment_check.js && node tests/governance_release_docs_check.js && node tests/runtime_portability_contract_check.js; export KUJO_BIN=${KUJO_BIN:-kujo} && for f in tests/*.js; do node "$f" || exit 1; done
  Commit: pending
