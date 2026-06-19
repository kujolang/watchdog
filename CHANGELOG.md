# Changelog

All notable changes to Watchdog are documented in this file.

The format follows Keep a Changelog principles and semantic versioning intent.

## [Unreleased]

- Added safer proxy path/query validation with safe scalar query forwarding to upstream OpenAI-compatible endpoints.
- Added expression indexes for timestamp filters and stricter export chunk caps for larger telemetry datasets.
- Moved the standalone HTTP runtime smoke fixture out of the project root and added a new enterprise review follow-up checklist.

## [0.1.0] - 2026-05-22

- Initial Watchdog release with a local dashboard, SQLite telemetry storage, and an OpenAI-compatible proxy.
- Added the first release documentation set and operational checks for the project.
