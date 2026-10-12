# Changelog

All notable changes to Watchdog are documented in this file.

The format follows Keep a Changelog principles and semantic versioning intent.

## [Unreleased]

## [1.2.1] - 2026-10-12

### Fixed

- Give credential regression scenarios separate session budgets so the auth/rate-limit CI matrix tests both controls without fixture interference.
- Keep Watchdog gateway bearer tokens out of upstream provider requests while preserving separate provider credentials.
- Redact sensitive canonical metadata and validate numeric, boolean and cost fields before storage.
- Make OTLP retries deterministic, preserve observations written by older adapters, and return errors for invalid or conflicting records.
- Enforce delivery queue record limits within each incoming batch and count UTF-8 bytes correctly.
- Isolate concurrent canonical transactions and fail closed on writer contention.
- Coalesce overlapping JavaScript client flushes and release unread HTTP response bodies.
- Keep the runtime-measurement validator aligned with the required v1 counters while accepting optional numeric extensions.

### Changed

- Prepare canonical records before taking the SQLite writer lock and batch identity lookups.
- Use verified native JSON encoding, cached redaction matching and equivalent native hexadecimal ID validation.
- Avoid cloning discarded client content and hash backups with a fixed-size buffer.
- Run JavaScript and ES module checks through one evidence-preserving test runner; verify types and generated dashboard assets in CI.
- Update compatible build dependencies and replace the tracked local proxy configuration with `config/proxy.example.json`.
- Refresh OpenRouter pricing and expand direct-provider and Ollama model coverage. Costs remain estimates, not invoices.

Routes and schema versions remain compatible. Invalid typed telemetry now fails validation, and OTLP identity conflicts return 409. Keep API, gateway and provider credentials separate. Rate-limit identity, advisory proxy latency targets and Tailwind build dependency advisories remain documented in the [hardening audit](docs/audits/repository-hardening.md).

## [1.2.0] - 2026-09-29

### Added

- Verify bounded Kujo 1.6 runtime-measurement summaries and attach numeric observations and exact content-addressed references to existing native execution events.
- Preserve caller timing and RunLedger correlation through HTTP intake, deduplication and server restart, without copying private runtime payloads or granting workflow authority.

### Changed

- Refresh provider and OpenRouter pricing catalogs with September 27 data. Costs remain estimates, not invoices.
- Pin release verification to Kujo 1.6.0 and the released RunLedger integration; run Node 24 regressions and the authentication/rate-limit matrix.

### Fixed

- Isolate authentication, rate-limit and redaction fixtures so one control cannot mask another test's result.

Existing proxy, telemetry and dashboard contracts remain compatible. Runtime-measurement production requires Kujo 1.6.0; Watchdog remains observational and does not authorize retries.

## [1.1.0] - 2026-09-26

### Added

- Add immutable canonical observability evidence for source identity, terminal outcomes, retries/fallbacks/recovery, truthful timing, context capacity, and billing provenance.
- Add canonical logical-request queries, lineage diagnostics, dashboard evidence views, and lossless JSONL/OTLP projections.
- Add a Dither Kit trend sparkline to the canonical-records dashboard card.
- Add a phase-gated implementation prompt for a secure, evidence-backed Connected Sources management panel.
- Add the `watchdog.sources-panel.v1` API, private `watchdog.sources.v1` registry, exact source aggregation, evidence-backed verification, and safe named proxy-profile management.
- Add a responsive, keyboard-accessible Sources dashboard with filters, detail/setup dialogs, non-secret copy actions, and registration lifecycle controls.

### Changed

- Balance the nine overview cards into four- and five-card desktop rows and replace data-view emoji decorations with local Tabler SVG icons.
- Keep source registrations separate from exporter destinations and apply named proxy-profile creates, updates, disables, and deletes to new requests without restarting Watchdog.

### Fixed

- Refine Connected Sources spacing and Departure Mono typography, restore the local add icon, and expose accessible icon controls for editing or deleting manageable connections.
- Reject negative token telemetry and non-finite provider-reported costs before persistence.
- Preserve safe dotted proxy resource identifiers, streamed `data:` content, and upstream retry/request-id headers.
- Apply tenant and project export scopes to related tool, step, trace, span, and event rows.
- Reject stable record-identity conflicts without mutating canonical or export state, and attach owned canonical events to OTLP spans without duplicating operations.

## [1.0.1] - 2026-08-11

### Fixed

- Reject unknown named upstream profiles before egress and preserve the selected profile name in telemetry.
- Enforce proxy and telemetry request limits using UTF-8 byte counts, including both external telemetry intake routes.
- Classify trusted externally supplied costs as provider-reported and validate that supplied costs are non-negative numbers.
- Make backup retention inventory the generated files on disk so missing or stale manifests cannot bypass pruning.
- Validate reprice time and row-limit selectors before generating SQL and record every pricing source actually applied.
- Treat missing, null, and empty OpenRouter base rates as unavailable instead of zero-cost pricing.

### Changed

- Refresh the checked-in provider and OpenRouter pricing catalogs and their documented coverage.

## [1.0.0] - 2026-08-08

- Declared the local dashboard, OpenAI-compatible proxy, SQLite telemetry, redaction, auth, rate-limit, backup, and export surfaces stable.
- Aligned the VERSION file, Kujo metadata, and README badge at 1.0.0.
- Kept deployment-specific TLS, firewall, retention, secrets, and live-upstream proof as operator responsibilities.

## [0.1.0] - 2026-05-22

- Initial Watchdog release with a local dashboard, SQLite telemetry storage, and an OpenAI-compatible proxy.
- Added the first release documentation set and operational checks for the project.
