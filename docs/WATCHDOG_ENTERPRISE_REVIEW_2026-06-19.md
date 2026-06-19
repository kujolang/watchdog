# Watchdog Enterprise Review Follow-Up Checklist

## Goal
Use this checklist to continue moving Watchdog toward a polished, broadly useful
enterprise-grade Kujo reference application without weakening its local-first
developer experience.

## Review Summary
Watchdog already has a strong foundation: OpenAI-compatible proxying, SQLite
telemetry, API/proxy token modes, redaction, request-size controls, rate-limit
controls, audit events, export chunking, source/root compatibility checks,
deployment docs, and CI coverage.

It is not universally enterprise-ready by default. Enterprise readiness still
requires operator choices around TLS, network binding, token management,
retention, backups, observability exports, and deployment automation. The items
below are the next highest-value improvements.

## Status Legend
- [ ] Not started
- [x] Completed and validated

## Tier A: Security And Compliance

### SEC-R01 Add token rotation and hash-at-rest guidance
- [ ] Support explicit token rotation workflow and document hash-at-rest options for deployments that cannot keep shared tokens only in environment managers.
Acceptance criteria:
- Operators can rotate API/proxy tokens without guessing which settings must change.
- Docs explain recommended secret-manager usage and what Watchdog does not persist.
Validation/testing expectations:
- Add config/static tests for documented rotation env names and redacted diagnostics.

### SEC-R02 Add reverse-proxy hardening examples
- [ ] Provide copyable nginx/Caddy examples for TLS, localhost upstream binding, request-size limits, and auth-header forwarding.
Acceptance criteria:
- A new operator can safely expose Watchdog behind HTTPS without inventing headers or limits.
Validation/testing expectations:
- Add static checks that examples include TLS, no-store caching, and forwarded host/IP headers.

### SEC-R03 Add configurable audit export controls
- [ ] Extend `/api/export` to optionally include or exclude `audit_events`, with clear defaults.
Acceptance criteria:
- Compliance workflows can export security events intentionally.
- Normal telemetry exports do not surprise users with audit data unless requested.
Validation/testing expectations:
- Add JSON and JSONL export tests for audit inclusion/exclusion.

## Tier B: Performance And Operations

### PERF-R01 Add SQLite WAL/vacuum maintenance controls
- [ ] Add documented startup/runtime controls for WAL mode, busy timeout, checkpointing, and vacuum/analyze maintenance.
Acceptance criteria:
- Long-running deployments have a supported DB maintenance path.
Validation/testing expectations:
- Add diagnostics output for DB mode and static tests for docs.

### PERF-R02 Add scheduled retention policy
- [ ] Add optional retention-at-startup or interval-based pruning configured by environment.
Acceptance criteria:
- Operators can bound database growth without manually calling prune.
Validation/testing expectations:
- Add dry-run and destructive-retention tests with isolated temp databases.

### PERF-R03 Add large-dataset route benchmarks
- [ ] Seed deterministic large telemetry fixtures and benchmark common filtered list/chart/export endpoints.
Acceptance criteria:
- Performance claims are backed by repeatable measurements.
Validation/testing expectations:
- Add benchmark profile output for route latency, row counts, and index-sensitive filters.

## Tier C: Product Functionality

### FEAT-R01 Add `/api/v1/*` aliases
- [ ] Add versioned route aliases while preserving existing `/api/*` routes.
Acceptance criteria:
- Integrators can target stable versioned URLs.
Validation/testing expectations:
- Add route parity tests for representative endpoints and headers.

### FEAT-R02 Add provider pricing configuration
- [ ] Allow pricing rates to be loaded from a local JSON config while retaining built-in defaults.
Acceptance criteria:
- Non-OpenAI-compatible providers and custom models can report more accurate costs.
Validation/testing expectations:
- Add config precedence tests and malformed-config fallback tests.

### FEAT-R03 Add OpenTelemetry/OTLP export bridge
- [ ] Provide optional export mapping from Watchdog rows to OTLP-compatible spans/events.
Acceptance criteria:
- Enterprise teams can integrate Watchdog data with existing observability stacks.
Validation/testing expectations:
- Add deterministic mapping tests with redaction preserved.

## Tier D: Presentation And Adoption

### DOC-R01 Add production readiness matrix
- [ ] Add a README/runbook matrix for local, team, and enterprise deployments.
Acceptance criteria:
- Users can see exactly which controls are required for each deployment profile.
Validation/testing expectations:
- Add docs contract test for matrix rows and required controls.

### DOC-R02 Add short architecture walkthrough
- [ ] Create a concise "Why Watchdog shows off Kujo" page focused on server-first routing, SQLite contracts, compatibility entrypoints, and regression tests.
Acceptance criteria:
- The project funnels curious users toward Kujo language strengths without feeling like marketing copy.
Validation/testing expectations:
- Add link checks from README and release docs.

### DOC-R03 Add release artifact checklist
- [ ] Document release packaging expectations: clean root, generated artifacts ignored, CI green, changelog updated, and smoke commands captured.
Acceptance criteria:
- A maintainer can prepare a polished demo/release consistently.
Validation/testing expectations:
- Add static checks for release checklist coverage.

## Work Log
Date: 2026-06-19
Summary: Completed review pass with focused hardening and cleanup: proxy path/query validation, safe scalar query forwarding, export `max_rows` cap enforcement, time-filter SQLite indexes, root fixture cleanup, README clarification, and regression coverage.
Files changed: <src/dashboard_server.kujo, src/watchdog_shared.kujo, tests/proxy_integration_stub_suite.js, tests/export_jsonl_mode_check.js, tests/schema_migration_static_check.js, tests/proxy_route_compatibility_static_check.js, tests/fixtures/http_server_smoke.kujo, README.md, docs/WATCHDOG_SCOUT_CHECKLIST.md, docs/WATCHDOG_ENTERPRISE_REVIEW_2026-06-19.md>
Tests and validation: <PASS: KUJO_BIN=/Users/robertdevore/2026/Kujolang/kujo-repos/kujo/target/release/kujo for f in tests/*.js; do node "$f"; done; PASS: node scripts/sync_compat_entrypoints.js --check>
README/docs updated: <yes + README.md, docs/WATCHDOG_SCOUT_CHECKLIST.md, docs/WATCHDOG_ENTERPRISE_REVIEW_2026-06-19.md>
Follow-ups: <execute the unchecked items above in priority order>
