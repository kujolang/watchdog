# Watchdog Scout Checklist

## Goal
Create a durable, agent-friendly backlog that turns Watchdog into a secure, extensible, developer-ready observability proxy for Kujo and Kennel ecosystems.

## How Agents Must Work This Checklist
1. Read this file first, then read README.md, then inspect only files relevant to the selected item.
2. Select the first unchecked actionable item in top-to-bottom order.
3. Complete exactly one actionable item at a time unless the item is explicitly blocked.
4. Add or update tests before or alongside implementation whenever practical.
5. Update README.md and other docs only when behavior or usage changes.
6. Mark the item complete only after code, tests, and docs are done.
7. Flip the checkbox from [ ] to [x] only for the completed item.
8. Add a Work Log entry using the Item Completion Template.
9. Keep diffs tightly scoped to the selected item.
10. If blocked, keep checkbox unchecked and add a blocker note directly under the item using this format:
Blocker (YYYY-MM-DD): <reason>. Evidence: <failing command output, test result, or file proof>.

## Status Legend
- [ ] Not started
- [x] Completed and validated
- Blocker note present = started but blocked

## Current Status Snapshot
All actionable items in this scout checklist are completed and validated in the Work Log below.

This file is now the historical implementation ledger for the 2026-05-22 backlog execution.

Active open work is tracked in:
- [ENTERPRISE_RELEASE_LOOP_CHECKLIST.md](ENTERPRISE_RELEASE_LOOP_CHECKLIST.md)
- [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)

## Actionable Items

## Tier 0: Safety And Quick Wins

### SEC-001 Harden frontend rendering against stored XSS
- [x] Escape or safely render all dynamic values inserted into dashboard HTML tables and trace cards.
Implementation expectations:
- Replace unsafe template interpolation paths with escaped text or textContent-based rendering.
- Audit requests, tool calls, sessions, errors, and trace headers.
Acceptance criteria:
- Injected HTML in session_id, user_id, provider, model, tool_name, and error_code is displayed as inert text.
Validation/testing expectations:
- Add regression tests or deterministic render checks for malicious payload samples.
- Manual browser smoke test with synthetic malicious records.
Evidence:
- [dashboard.html](../dashboard.html#L905)
- [dashboard.html](../dashboard.html#L954)
- [dashboard.html](../dashboard.html#L1048)
- [dashboard.html](../dashboard.html#L1072)
Dependencies/unknowns:
- Decide whether to keep innerHTML templates or migrate to DOM API row builders.

### SEC-002 Add optional API authentication and local-safe defaults
- [x] Protect telemetry and export APIs with an optional token mode and safer bind behavior for non-local usage.
Implementation expectations:
- Add environment-configured auth mode for API routes.
- Add explicit host binding control and document secure defaults.
Acceptance criteria:
- Unauthorized calls to protected endpoints return 401/403.
- Local dev remains easy with clear opt-out settings.
Validation/testing expectations:
- Add route auth tests for allowed and denied requests.
- Validate stats, sessions, and export paths under auth-on and auth-off modes.
Evidence:
- [dashboard_server.kujo](../dashboard_server.kujo#L797)
- [dashboard_server.kujo](../dashboard_server.kujo#L911)
Dependencies/unknowns:
- Confirm Kujo runtime host-binding defaults and deployment patterns.

### SEC-003 Restrict sensitive config disclosures
- [x] Reduce metadata disclosure in proxy-config API and avoid exposing unnecessary key state detail.
Implementation expectations:
- Return minimal safe config fields by default.
- Optionally hide or gate proxy-config endpoint.
Acceptance criteria:
- Endpoint no longer reveals sensitive environment naming details unless explicitly enabled.
Validation/testing expectations:
- Add tests for redacted response shape.
Evidence:
- [dashboard_server.kujo](../dashboard_server.kujo#L797)
Dependencies/unknowns:
- Determine expected observability/debug tradeoff for local-only workflows.

### ARC-001 Clean repository layout and runtime artifacts
- [x] Move runtime-generated artifacts out of tracked root and create clean source layout.
Implementation expectations:
- Introduce folders such as src, scripts, tests, docs, and data or tmp.
- Add .gitignore strategy for SQLite runtime files.
Acceptance criteria:
- Root directory contains source and project metadata, not mutable telemetry files.
Validation/testing expectations:
- Confirm scripts still run from documented commands.
Evidence:
- [watchdog.db](../watchdog.db)
- [watchdog.db-shm](../watchdog.db-shm)
- [watchdog.db-wal](../watchdog.db-wal)
Dependencies/unknowns:
- Decide whether to keep a seeded demo DB in repo or generate on demand.

### DOC-001 Fix quick-start and structure documentation accuracy
- [x] Correct pathing and startup commands in README and align project tree docs with actual structure.
Implementation expectations:
- Fix Quick Start directory path.
- Add docs section that points to this checklist.
Acceptance criteria:
- A new user can follow README verbatim from clone to running dashboard and proxy.
Validation/testing expectations:
- Execute documented startup commands exactly as written.
Evidence:
- [README.md](../README.md#L33)
Dependencies/unknowns:
- Ensure cross-machine path examples stay portable.

## Tier 1: Core Architecture And Compatibility

### ARC-002 Extract shared modules and remove duplicated logic
- [x] Refactor duplicated helpers and schema logic into shared Kujo modules.
Implementation expectations:
- Deduplicate pricing tables, schema creation, string helpers, and parsing helpers.
- Keep public behavior unchanged.
Acceptance criteria:
- Single source of truth for shared logic.
- No behavior regressions in request logging and cost calculations.
Validation/testing expectations:
- Add unit-level tests for shared helper modules.
Evidence:
- [watchdog.kujo](../watchdog.kujo#L16)
- [dashboard_server.kujo](../dashboard_server.kujo#L169)
- [watchdog.kujo](../watchdog.kujo#L48)
- [dashboard_server.kujo](../dashboard_server.kujo#L469)
Dependencies/unknowns:
- Confirm preferred Kujo module organization convention in sibling repos.

### ARC-003 Introduce schema migration strategy and database indexes
- [x] Add migration versioning and indexes for common dashboard queries.
Implementation expectations:
- Add migration table and incremental migration scripts.
- Add indexes for created_at, session_id, status, and provider/model query paths.
Acceptance criteria:
- Existing DB upgrades without data loss.
- Query endpoints maintain or improve response times with larger datasets.
Validation/testing expectations:
- Add migration upgrade and rollback-safety tests where possible.
- Run query benchmark smoke tests.
Evidence:
- [dashboard_server.kujo](../dashboard_server.kujo#L469)
- [dashboard_server.kujo](../dashboard_server.kujo#L861)
Dependencies/unknowns:
- Define max expected request volume and retention horizon.

### FEAT-001 Expand proxy route compatibility
- [x] Support broader OpenAI-compatible path and method patterns, including nested resource paths.
Implementation expectations:
- Support more than one action segment and non-POST routes when needed.
- Preserve request and response pass-through behavior.
Acceptance criteria:
- Typical endpoints such as models listing and nested resources can be proxied.
Validation/testing expectations:
- Add compatibility tests for chat completions, responses, embeddings, and models list.
Evidence:
- [dashboard_server.kujo](../dashboard_server.kujo#L810)
- [dashboard_server.kujo](../dashboard_server.kujo#L817)
Dependencies/unknowns:
- Confirm route parameter capabilities in current Kujo HTTP server implementation.

### FEAT-002 Add API query filtering and pagination
- [x] Add query params to telemetry APIs for pagination, filtering, and time windows.
Implementation expectations:
- Support page or cursor style access for requests, tool calls, sessions, and traces.
- Keep default responses backward compatible.
Acceptance criteria:
- Large datasets are browseable without pulling full tables each refresh.
Validation/testing expectations:
- Add tests for valid and invalid query parameters.
Evidence:
- [dashboard_server.kujo](../dashboard_server.kujo#L861)
- [dashboard_server.kujo](../dashboard_server.kujo#L866)
- [dashboard_server.kujo](../dashboard_server.kujo#L871)
Dependencies/unknowns:
- Decide stable pagination contract for external consumers.

### FEAT-003 Add retention, pruning, and export controls
- [x] Implement retention policies and controlled export options for long-running deployments.
Implementation expectations:
- Add time-based purge command or endpoint.
- Add export scoping by time range and optionally by session.
Acceptance criteria:
- Operators can keep DB size bounded while preserving required audit windows.
Validation/testing expectations:
- Add tests for retention rules and export filters.
Evidence:
- [dashboard_server.kujo](../dashboard_server.kujo#L911)
Dependencies/unknowns:
- Determine default retention policy and compliance requirements.

### TEST-001 Build backend route test harness
- [x] Create an automated test suite for API route behavior and response envelopes.
Implementation expectations:
- Cover stats, requests, tool-calls, agent-steps, errors, sessions, charts, and export endpoints.
- Include status-code and schema assertions.
Acceptance criteria:
- Core route contracts are validated in CI-style runs.
Validation/testing expectations:
- Add deterministic seeded dataset for route assertions.
Evidence:
- [tests/fixtures/http_server_smoke.kujo](../tests/fixtures/http_server_smoke.kujo#L1)
Dependencies/unknowns:
- Evaluate best Kujo testing pattern used in nearby repos.

### TEST-002 Add proxy integration tests with upstream stubs
- [x] Add success, error, timeout, and malformed-response tests for proxy forwarding.
Implementation expectations:
- Validate logging side effects in requests, tool_calls, and agent_steps tables.
- Cover both passthrough and override auth modes.
Acceptance criteria:
- Proxy behavior and telemetry side effects are regression-tested.
Validation/testing expectations:
- Include SSE and non-SSE response parsing tests.
Evidence:
- [dashboard_server.kujo](../dashboard_server.kujo#L670)
Dependencies/unknowns:
- Confirm available HTTP mock strategy in Kujo runtime.

### TEST-003 Add frontend contract tests
- [x] Add tests for dashboard rendering, filtering, sorting, and escaping behavior.
Implementation expectations:
- Validate deterministic rendering from fixture API payloads.
- Include empty-state and error-state coverage.
Acceptance criteria:
- UI contract changes are caught before release.
Validation/testing expectations:
- Include regression fixtures for malicious HTML payloads.
Evidence:
- [dashboard.html](../dashboard.html#L848)
- [dashboard.html](../dashboard.html#L920)
Dependencies/unknowns:
- Decide browser automation strategy for Kujo ecosystem.

## Tier 2: Security Hardening And Operations

### SEC-004 Add request body limits and defensive parsing controls
- [x] Enforce configurable request size and parsing limits to reduce memory pressure and abuse risk.
Implementation expectations:
- Reject oversize proxy payloads with clear error response.
- Guard JSON parsing against pathological bodies.
Acceptance criteria:
- Oversized requests fail safely without crashing server.
Validation/testing expectations:
- Add tests around threshold boundaries and malformed payloads.
Evidence:
- [dashboard_server.kujo](../dashboard_server.kujo#L595)
- [dashboard_server.kujo](../dashboard_server.kujo#L670)
Dependencies/unknowns:
- Determine practical defaults for local versus production usage.

### SEC-005 Add telemetry redaction policy
- [x] Redact sensitive fields in prompt summaries, tool args, and errors before persistence and export.
Implementation expectations:
- Introduce configurable redaction rules.
- Preserve debug usefulness while removing secrets and PII.
Acceptance criteria:
- Known secret patterns are not persisted in DB or export payloads.
Validation/testing expectations:
- Add positive and negative redaction tests.
Evidence:
- [dashboard_server.kujo](../dashboard_server.kujo#L481)
- [dashboard_server.kujo](../dashboard_server.kujo#L912)
Dependencies/unknowns:
- Finalize secret pattern set and allowlist behavior.

### SEC-006 Add basic rate limiting for proxy and API endpoints
- [x] Apply configurable rate controls per client or session to reduce abuse and accidental overload.
Implementation expectations:
- Add lightweight in-memory limiter with clear exceed responses.
- Exempt internal health endpoints if introduced.
Acceptance criteria:
- Burst abuse is throttled without affecting normal local development.
Validation/testing expectations:
- Add limiter tests for allowed burst, sustained traffic, and reset behavior.
Evidence:
- [dashboard_server.kujo](../dashboard_server.kujo#L810)
- [dashboard_server.kujo](../dashboard_server.kujo#L824)
Dependencies/unknowns:
- Determine identity keying strategy behind reverse proxies.

### DOC-002 Add deployment and hardening runbook
- [x] Document secure deployment patterns and operational checks.
Implementation expectations:
- Include auth mode setup, network exposure guidance, retention tuning, and backup strategy.
- Add troubleshooting for common proxy errors.
Acceptance criteria:
- Operator can deploy safely with documented defaults and checks.
Validation/testing expectations:
- Validate all documented commands during doc update.
Evidence:
- [README.md](../README.md#L69)
- [README.md](../README.md#L111)
Dependencies/unknowns:
- Collect environment-specific examples for local, container, and hosted setups.

## Tier 3: Kennel And Ecosystem Integration

### FEAT-004 Add Kennel correlation fields and workflow metadata
- [x] Extend telemetry schema to capture workflow, task, and agent correlation IDs used by Kennel.
Implementation expectations:
- Add optional fields and preserve backward compatibility.
- Surface filters for new fields in API and dashboard.
Acceptance criteria:
- Kennel-originated traces can be filtered and grouped natively.
Validation/testing expectations:
- Add schema and API tests for correlation fields.
Evidence:
- [dashboard_server.kujo](../dashboard_server.kujo#L469)
Dependencies/unknowns:
- Confirm canonical Kennel field names and types.

### FEAT-005 Add machine-friendly streaming exports
- [x] Provide JSONL or chunked export modes suitable for downstream analysis pipelines.
Implementation expectations:
- Add export format selection and time-window filtering.
- Keep existing JSON export behavior stable.
Acceptance criteria:
- Large exports can be consumed incrementally by tooling.
Validation/testing expectations:
- Add export format and compatibility tests.
Evidence:
- [dashboard_server.kujo](../dashboard_server.kujo#L911)
Dependencies/unknowns:
- Define preferred ingestion format in Kennel analytics pipelines.

### FEAT-006 Add multi-project or tenant partitioning support
- [x] Support project or tenant scoping in proxy ingestion and dashboard querying.
Implementation expectations:
- Add tenant or project identifier fields and route-level extraction logic.
- Add dashboard filters by project or tenant.
Acceptance criteria:
- Multiple teams can share one Watchdog instance without trace mixing.
Validation/testing expectations:
- Add tests for partitioned query and access behavior.
Evidence:
- [dashboard_server.kujo](../dashboard_server.kujo#L481)
- [dashboard.html](../dashboard.html#L874)
Dependencies/unknowns:
- Decide isolation requirements and auth model for shared deployments.

### TEST-004 Add load and soak test suite
- [x] Add repeatable performance tests for proxy throughput, dashboard query latency, and DB growth behavior.
Implementation expectations:
- Include baseline scenarios and pass-fail thresholds.
- Track metrics before and after indexing and retention changes.
Acceptance criteria:
- Performance regressions are detectable in repeat runs.
Validation/testing expectations:
- Include local quick profile and longer soak profile.
Evidence:
- [dashboard_server.kujo](../dashboard_server.kujo#L886)
- [dashboard_server.kujo](../dashboard_server.kujo#L891)
Dependencies/unknowns:
- Determine realistic load envelope per deployment target.

### DOC-003 Add Kennel integration guide
- [x] Document end-to-end integration from Kennel agents to Watchdog proxy, fields, and dashboards.
Implementation expectations:
- Provide sample configs, headers, and workflow correlation usage.
- Add troubleshooting for common integration errors.
Acceptance criteria:
- A Kennel contributor can integrate and verify traces in one pass.
Validation/testing expectations:
- Validate all sample commands and headers in a live run.
Evidence:
- [README.md](../README.md#L124)
Dependencies/unknowns:
- Coordinate with Kennel maintainers for canonical examples.

## Item Completion Template
Date: YYYY-MM-DD
Item ID: <SEC-001>
Summary: <what changed>
Files changed: <list>
Tests and validation: <commands and pass or fail>
README or docs updated: <yes or no and where>
Follow-ups: <optional>

## Work Log
- 2026-05-22: Checklist created from full repo review and later completed; keep this section as historical execution evidence.
- Date: 2026-05-22
	Item ID: <SEC-001>
	Summary: Escaped dynamic dashboard fields, normalized trace step type classes, and added deterministic render safety regression checks.
	Files changed: dashboard.html, tests/dashboard_xss_regression_check.js, docs/WATCHDOG_SCOUT_CHECKLIST.md
	Tests and validation: node tests/dashboard_xss_regression_check.js (pass)
	README or docs updated: yes, checklist status and work log
	Follow-ups: Consider migrating all table rendering to explicit DOM node construction in a future hardening pass.
- Date: 2026-05-22
	Item ID: <SEC-003>
	Summary: Added safe-by-default proxy config disclosure mode and retained verbose metadata only behind explicit visibility setting.
	Files changed: dashboard_server.kujo, tests/proxy_config_visibility_check.js, docs/WATCHDOG_SCOUT_CHECKLIST.md
	Tests and validation: node tests/proxy_config_visibility_check.js (pass); curl smoke checks for /api/stats, /api/proxy-config, /api/requests, /api/export, and /proxy/v1/chat/completions (expected 401 passthrough without key)
	README or docs updated: yes, checklist status and work log
	Follow-ups: Implement SEC-002 auth and host-safety controls, then optionally gate /api/proxy-config behind that auth mode.
- Date: 2026-05-22
	Item ID: <ARC-001>
	Summary: Shifted default runtime DB location into data/, added ignore rules and structure placeholders, and stopped tracking mutable root SQLite artifacts.
	Files changed: dashboard_server.kujo, demo.kujo, README.md, .gitignore, data/.gitkeep, tmp/.gitkeep, tests/layout_defaults_check.js, docs/WATCHDOG_SCOUT_CHECKLIST.md
	Tests and validation: node tests/layout_defaults_check.js (pass); runtime smoke with WDG_DB_PATH set to data/watchdog.db and curl /api/stats (pass)
	README or docs updated: yes, runtime defaults and project structure in README plus checklist updates
	Follow-ups: Consider moving source .kujo files into src/ in a dedicated architecture loop after introducing migration-safe entrypoints.
- Date: 2026-05-22
	Item ID: <DOC-001>
	Summary: Fixed quick-start repository path and added a dedicated implementation backlog section linking the scout checklist.
	Files changed: README.md, docs/WATCHDOG_SCOUT_CHECKLIST.md
	Tests and validation: Verified documented startup command runs from /path/to/kujo-watchdog using kujo run dashboard_server.kujo --interpreter (server start pass)
	README or docs updated: yes, quick-start and backlog discovery sections
	Follow-ups: Keep README command samples synchronized with any future file layout refactors.
- Date: 2026-05-22
	Item ID: <ARC-002>
	Summary: Introduced watchdog_shared.kujo for pricing and schema setup, then rewired dashboard_server.kujo and watchdog.kujo to consume shared helpers.
	Files changed: watchdog_shared.kujo, dashboard_server.kujo, watchdog.kujo, tests/shared_module_dedupe_check.js, docs/WATCHDOG_SCOUT_CHECKLIST.md
	Tests and validation: node tests/shared_module_dedupe_check.js (pass); runtime startup smoke via kujo run dashboard_server.kujo --interpreter (pass, with existing Kujo type-check warning signatures)
	README or docs updated: yes, checklist status and work log
	Follow-ups: Add runtime-level unit tests around watchdog_shared.kujo helper behavior once dedicated Kujo test harness is in place.
- Date: 2026-05-22
	Item ID: <ARC-003>
	Summary: Added schema_migrations version table, baseline migration insert, and query-focused indexes for requests, tool_calls, and agent_steps.
	Files changed: watchdog_shared.kujo, tests/schema_migration_static_check.js, docs/WATCHDOG_SCOUT_CHECKLIST.md
	Tests and validation: node tests/schema_migration_static_check.js (pass); runtime server start plus query endpoint smoke for /api/requests, /api/charts/requests-over-time, and /api/sessions (pass)
	README or docs updated: yes, checklist status and work log
	Follow-ups: Add runtime DB introspection tests to assert index existence from sqlite_master once Kujo test harness coverage expands.
- Date: 2026-05-22
	Item ID: <FEAT-001>
	Summary: Expanded proxy route handling to support GET/POST/PUT/PATCH/DELETE across 1-4 segment OpenAI-compatible paths with centralized action-path dispatching.
	Files changed: dashboard_server.kujo, README.md, tests/proxy_route_compatibility_static_check.js, docs/WATCHDOG_SCOUT_CHECKLIST.md
	Tests and validation: node tests/proxy_route_compatibility_static_check.js (pass); smoke checks for /api/stats, /api/proxy-config, /api/requests, /api/export, POST /proxy/v1/chat/completions, and GET /proxy/v1/models (pass with expected upstream 401s without credentials)
	README or docs updated: yes, proxy route matrix documentation
	Follow-ups: Extend proxy path handling beyond four dynamic segments if Kujo router adds wildcard capture support.
- Date: 2026-05-22
	Item ID: <FEAT-002>
	Summary: Added reusable query parsing helpers and endpoint-level pagination/filter/time-window support for requests, tool-calls, agent-steps, and sessions.
	Files changed: dashboard_server.kujo, README.md, tests/api_query_support_static_check.js, docs/WATCHDOG_SCOUT_CHECKLIST.md
	Tests and validation: node tests/api_query_support_static_check.js (pass); runtime query smoke using page/page_size/since_ms filters on list endpoints plus required Watchdog API/proxy smoke checks (pass)
	README or docs updated: yes, API query parameter documentation
	Follow-ups: Add response metadata mode (total_count, page_info) once backward-compatible contract is finalized.
- Date: 2026-05-22
	Item ID: <FEAT-003>
	Summary: Added dry-run prune controls and scoped export filtering by session/time window, including filter metadata in export responses.
	Files changed: dashboard_server.kujo, README.md, tests/retention_export_controls_static_check.js, docs/WATCHDOG_SCOUT_CHECKLIST.md
	Tests and validation: node tests/retention_export_controls_static_check.js (pass); runtime dry-run prune call and filtered export call plus required Watchdog API/proxy smoke checks (pass)
	README or docs updated: yes, prune/export control examples and endpoint reference
	Follow-ups: Add authenticated admin guard for prune endpoint when SEC-002 is implemented.
- Date: 2026-05-22
	Item ID: <TEST-001>
	Summary: Added an automated backend route suite that seeds deterministic demo data, boots the server, and asserts HTTP status plus JSON envelope/schema behavior across core API endpoints.
	Files changed: tests/watchdog_api_route_suite.js, docs/WATCHDOG_SCOUT_CHECKLIST.md
	Tests and validation: node tests/watchdog_api_route_suite.js (pass)
	README or docs updated: yes, checklist status and work log
	Follow-ups: Split suite into faster unit and slower integration tiers once scripts/run_tests.kujo is introduced.
- Date: 2026-05-22
	Item ID: <SEC-002>
	Summary: Added optional token auth for Watchdog API routes, enforced 401/403/500 auth outcomes, and documented non-local hardening defaults around Kujo's current all-interface server binding.
	Files changed: dashboard_server.kujo, README.md, tests/api_auth_mode_check.js, docs/WATCHDOG_SCOUT_CHECKLIST.md
	Tests and validation: node tests/api_auth_mode_check.js (pass); WDG_PORT=7700 WDG_API_AUTH_MODE=off kujo run dashboard_server.kujo --interpreter with curl smoke checks for /api/stats, /api/proxy-config, /api/requests, /proxy/v1/chat/completions, /api/export (pass with expected upstream 401 on proxy call); command check for scripts/run_tests.kujo (not present)
	README or docs updated: yes, API auth mode and non-local hardening guidance
	Follow-ups: When Kujo adds host-binding controls to http_server, expose an explicit bind-host setting and document secure non-local examples.
- Date: 2026-05-22
	Item ID: <TEST-002>
	Summary: Added a full proxy integration suite with an upstream stub to validate passthrough and override auth forwarding, JSON and SSE parsing paths, upstream error passthrough, malformed JSON handling, timeout handling, and telemetry side effects in requests/tool_calls/agent_steps.
	Files changed: tests/proxy_integration_stub_suite.js, dashboard_server.kujo, README.md, docs/WATCHDOG_SCOUT_CHECKLIST.md
	Tests and validation: node tests/proxy_integration_stub_suite.js (pass); node tests/watchdog_api_route_suite.js (pass); command check for scripts/run_tests.kujo (not present)
	README or docs updated: yes, WDG_PROXY_TIMEOUT_SECS configuration documented
	Follow-ups: Add compact fixture generators to reduce test startup overhead when the test matrix grows.
- Date: 2026-05-22
	Item ID: <TEST-003>
	Summary: Added deterministic frontend contract tests that execute dashboard render logic against fixture payloads and validate filtering, sorting, escaping, and empty/error-state behavior.
	Files changed: tests/frontend_contract_suite.js, docs/WATCHDOG_SCOUT_CHECKLIST.md
	Tests and validation: node tests/frontend_contract_suite.js (pass); node tests/dashboard_xss_regression_check.js (pass); command check for scripts/run_tests.kujo (not present)
	README or docs updated: yes, checklist status and work log
	Follow-ups: Add browser-level contract coverage once a lightweight headless automation path is standardized.
- Date: 2026-05-22
	Item ID: <SEC-004>
	Summary: Added configurable proxy body-size and JSON parse-size guards with deterministic 400/413 failures, error telemetry logging, and defensive handling for malformed or oversized proxy payloads.
	Files changed: dashboard_server.kujo, README.md, tests/request_body_limits_check.js, docs/WATCHDOG_SCOUT_CHECKLIST.md
	Tests and validation: node tests/request_body_limits_check.js (pass); node tests/proxy_integration_stub_suite.js (pass); WDG_PORT=7700 WDG_API_AUTH_MODE=off kujo run dashboard_server.kujo --interpreter with curl smoke checks for /api/stats, /api/proxy-config, /api/requests, /proxy/v1/chat/completions, /api/export (pass with expected upstream 401 on proxy call); command check for scripts/run_tests.kujo (not present)
	README or docs updated: yes, body-size and parse-limit env configuration
	Follow-ups: Add optional per-route body limits if future proxy routes include large non-JSON payload workflows.
- Date: 2026-05-22
	Item ID: <SEC-005>
	Summary: Added configurable telemetry redaction policy with default sensitive-term masking for prompt summaries, tool payload fields, step metadata, and error messages before persistence/export.
	Files changed: dashboard_server.kujo, README.md, tests/telemetry_redaction_check.js, docs/WATCHDOG_SCOUT_CHECKLIST.md
	Tests and validation: node tests/telemetry_redaction_check.js (pass); node tests/proxy_integration_stub_suite.js (pass); WDG_PORT=7700 WDG_API_AUTH_MODE=off kujo run dashboard_server.kujo --interpreter with curl smoke checks for /api/stats, /api/proxy-config, /api/requests, /proxy/v1/chat/completions, /api/export (pass with expected upstream 401 on proxy call); command check for scripts/run_tests.kujo (not present)
	README or docs updated: yes, telemetry redaction policy configuration and behavior
	Follow-ups: Expand redaction to deep nested structures with deterministic key-path allowlists once larger payload examples are available.
- Date: 2026-05-22
	Item ID: <SEC-006>
	Summary: Added configurable in-memory throttling for API and proxy endpoints with session/IP-style bucket keying, reset windows, and explicit 429 responses.
	Files changed: dashboard_server.kujo, README.md, tests/rate_limit_controls_check.js, docs/WATCHDOG_SCOUT_CHECKLIST.md
	Tests and validation: node tests/rate_limit_controls_check.js (pass); node tests/proxy_integration_stub_suite.js (pass); WDG_PORT=7700 WDG_API_AUTH_MODE=off kujo run dashboard_server.kujo --interpreter with curl smoke checks for /api/stats, /api/proxy-config, /api/requests, /proxy/v1/chat/completions, /api/export (pass with expected upstream 401 on proxy call); command check for scripts/run_tests.kujo (not present)
	README or docs updated: yes, rate-limit configuration and behavior guidance
	Follow-ups: Add bounded bucket-eviction controls if long-lived deployments accumulate excessive unique client/session keys.
- Date: 2026-05-22
	Item ID: <DOC-002>
	Summary: Added a dedicated deployment and hardening runbook covering secure environment setup, network exposure controls, authenticated operational checks, retention/pruning workflows, backup/restore steps, and proxy troubleshooting.
	Files changed: docs/DEPLOYMENT_HARDENING_RUNBOOK.md, README.md, docs/WATCHDOG_SCOUT_CHECKLIST.md
	Tests and validation: Validated runbook commands with live server startup, authenticated API checks (/api/stats, /api/proxy-config, /api/requests, /api/export), proxy smoke request, prune dry-run/apply calls, and SQLite backup/restore copy commands (all pass; proxy smoke returned expected upstream 401 without key)
	README or docs updated: yes, added runbook and README runbook link
	Follow-ups: Add containerized deployment examples when an official Docker workflow is introduced.
- Date: 2026-05-22
	Item ID: <FEAT-004>
	Summary: Extended request telemetry schema with workflow/task/correlation identifiers, populated values from Observe headers/payload fields, added API filtering support, and surfaced fields in dashboard requests views.
	Files changed: watchdog_shared.kujo, dashboard_server.kujo, dashboard.html, README.md, tests/kennel_correlation_fields_check.js, docs/WATCHDOG_SCOUT_CHECKLIST.md
	Tests and validation: node tests/kennel_correlation_fields_check.js (pass); WDG_API_AUTH_MODE=off WDG_API_AUTH_TOKEN= node tests/watchdog_api_route_suite.js (pass); node tests/frontend_contract_suite.js (pass); WDG_PORT=7700 WDG_API_AUTH_MODE=off WDG_API_AUTH_TOKEN= kujo run dashboard_server.kujo --interpreter with curl smoke checks for /api/stats, /api/proxy-config, /api/requests, /proxy/v1/chat/completions, /api/export (pass with expected upstream 401 on proxy call); command check for scripts/run_tests.kujo (not present)
	README or docs updated: yes, new correlation headers and request filter docs
	Follow-ups: Add dedicated dashboard filter controls for workflow/task/correlation IDs in addition to free-text request search.
- Date: 2026-05-22
	Item ID: <FEAT-005>
	Summary: Added machine-friendly NDJSON/JSONL export mode on /api/export while preserving default JSON envelope responses and existing filter behavior.
	Files changed: dashboard_server.kujo, README.md, tests/export_jsonl_mode_check.js, docs/WATCHDOG_SCOUT_CHECKLIST.md
	Tests and validation: node tests/export_jsonl_mode_check.js (pass); WDG_API_AUTH_MODE=off WDG_API_AUTH_TOKEN= node tests/watchdog_api_route_suite.js (pass); WDG_PORT=7700 WDG_API_AUTH_MODE=off WDG_API_AUTH_TOKEN= kujo run dashboard_server.kujo --interpreter with curl smoke checks for /api/stats, /api/proxy-config, /api/requests, /proxy/v1/chat/completions, and /api/export?format=jsonl (pass with expected upstream 401 on proxy call and ndjson content-type); command check for scripts/run_tests.kujo (not present)
	README or docs updated: yes, export format query parameter and JSONL usage examples
	Follow-ups: Add optional chunk-size controls for very large NDJSON responses if long-running exports become latency-sensitive.
- Date: 2026-05-22
	Item ID: <FEAT-006>
	Summary: Added tenant/project partitioning fields with proxy header/body extraction, persisted request metadata, API/export query scoping, and dashboard tenant/project filters/columns.
	Files changed: watchdog_shared.kujo, dashboard_server.kujo, dashboard.html, README.md, tests/tenant_project_partitioning_check.js, tests/frontend_contract_suite.js, docs/WATCHDOG_SCOUT_CHECKLIST.md
	Tests and validation: node tests/tenant_project_partitioning_check.js (pass); WDG_API_AUTH_MODE=off WDG_API_AUTH_TOKEN= node tests/watchdog_api_route_suite.js (pass); node tests/frontend_contract_suite.js (pass); node tests/export_jsonl_mode_check.js (pass); WDG_PORT=7700 WDG_API_AUTH_MODE=off WDG_API_AUTH_TOKEN= kujo run dashboard_server.kujo --interpreter with curl smoke checks for /api/stats, /api/proxy-config, /api/requests?tenant_id=tenant_alpha&project_id=project_red, /api/export?tenant_id=tenant_alpha&format=json, and /proxy/v1/chat/completions (pass with expected upstream 401 on proxy call); command check for scripts/run_tests.kujo (not present)
	README or docs updated: yes, tenant/project headers, persisted fields, and filter/export examples
	Follow-ups: Extend tenant/project scoping to tool-call and agent-step exports via request-join session derivation when cross-session exports are required.
- Date: 2026-05-22
	Item ID: <TEST-004>
	Summary: Added a repeatable load/soak performance suite with quick and soak profiles, explicit pass/fail thresholds, baseline-versus-post-load dashboard query timings, proxy throughput and p95 latency checks, and SQLite growth tracking.
	Files changed: tests/load_soak_suite.js, docs/WATCHDOG_SCOUT_CHECKLIST.md
	Tests and validation: node tests/load_soak_suite.js (pass quick profile); WDG_LOAD_PROFILE=soak node tests/load_soak_suite.js (pass soak profile); WDG_API_AUTH_MODE=off WDG_API_AUTH_TOKEN= node tests/watchdog_api_route_suite.js (pass); command check for scripts/run_tests.kujo (not present)
	README or docs updated: yes, checklist status and work log
	Follow-ups: Add historical metrics persistence and trend diffing for CI-hosted perf baselines once automated runners are available.
- Date: 2026-05-22
	Item ID: <DOC-003>
	Summary: Added a dedicated Kennel integration guide with proxy setup, canonical Observe header mappings, tenant/project/workflow/task/correlation usage, live validation commands, and troubleshooting playbook.
	Files changed: docs/KENNEL_INTEGRATION_GUIDE.md, README.md, docs/WATCHDOG_SCOUT_CHECKLIST.md
	Tests and validation: Validated guide commands in a live local run with stub upstream and Watchdog startup, proxy request with Observe headers, scoped /api/requests filter query, scoped /api/export JSONL query, and dashboard route probe (all pass); command check for scripts/run_tests.kujo (not present)
	README or docs updated: yes, added integration guide and README cross-links
	Follow-ups: Add canonical Kennel config snippets once maintainer-approved client bootstrap templates are finalized.
