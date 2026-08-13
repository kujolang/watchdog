# Changelog

All notable changes to Watchdog are documented in this file.

The format follows Keep a Changelog principles and semantic versioning intent.

## [Unreleased]

### Fixed

- Reject negative token telemetry and non-finite provider-reported costs before persistence.
- Preserve safe dotted proxy resource identifiers, streamed `data:` content, and upstream retry/request-id headers.
- Apply tenant and project export scopes to related tool, step, trace, span, and event rows.

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
