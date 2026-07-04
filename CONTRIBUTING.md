# Contributing

Thanks for helping improve this Kujo ecosystem project.

This guide is intended for standalone Kujo tools and primitives. It does not
cover the core Kujo language repo, Kujo Skills, or Kujo Workflows when those
projects have their own contribution rules.

## Development Principles

- Keep changes focused, reviewable, and tied to one user-visible concern.
- Prefer deterministic, local-first behavior.
- Do not add network calls, provider calls, timestamps, or machine-specific
  output to core command paths unless the feature explicitly requires it.
- Preserve redaction, path safety, guarded cleanup, and stable output ordering.
- Add tests for behavior changes. Bug fixes should include regression coverage.
- Avoid speculative refactors unless they directly simplify the change at hand.

For Watchdog specifically, preserve local telemetry/proxy behavior, redaction
policy, auth mode semantics, and root compatibility entrypoints that mirror
`src/` surfaces.

## Local Setup

Use the Kujo runtime expected by this repository. Most repos support one of
these environment variables:

```bash
export KUJO_BIN=/path/to/kujo
export KUJO=/path/to/kujo
```

Watchdog local startup:

```bash
export KUJO_BIN="${KUJO_BIN:-kujo}"
"$KUJO_BIN" run --interpreter dashboard_server.kujo
```

Default dashboard:

```text
http://localhost:7700
```

Check the repo README, `Makefile`, `tests/`, and `scripts/` directory for the
authoritative local commands.

## Agent And Example Hygiene

Start with `README.md`, `CONTRIBUTING.md`, relevant docs, and examples before
broad source sweeps.

Treat user-facing examples as canonical copyable surfaces. Examples should be
short, runnable, and representative of the idioms humans and agents should copy.

For Watchdog:

- Start broad code searches from `src/`, `demo.kujo`, `scripts/`, `tests/`,
  `docs/`, `README.md`, and `CONTRIBUTING.md`.
- Treat `demo.kujo`, `README.md`, and `docs/KENNEL_INTEGRATION_GUIDE.md` as
  copyable examples.
- Treat `tests/` as contract coverage. Preserve explicit fixtures and expected
  output when they make behavior easier to audit.
- Root compatibility entrypoints mirror `src/`; update `src/` first, then run
  `node scripts/sync_compat_entrypoints.js`.

Exclude generated and bulk paths from broad searches unless the task explicitly
targets them. For Watchdog, skip `tmp/`, `data/`, `vendor/`, SQLite files, and
local proxy config files.

Document any important search exclusions in larger cleanup or audit PRs.

## Code Standards

- Match the surrounding code style before introducing a new abstraction.
- Keep command output readable and stable.
- Prefer small local helpers for repeated output, error, section, or key/value
  formatting once repetition distracts from the behavior.
- Keep CLI/API contracts explicit: flags, exit codes, JSON fields, artifact
  paths, endpoints, and documented examples should agree with implementation
  behavior.
- Keep config honest. A config key should either change observable behavior or
  be clearly documented as reserved.
- Preserve compatibility entrypoints and wrappers when a repo provides them.
- Keep introductory snippets direct. Use small local helpers such as
  `print_lines`, `section`, `kv`, or `ok` only when they remove repetitive
  status, menu, banner, or summary output.

## Kujo Runtime Notes

Kujo ecosystem tools often follow these defensive patterns:

- Prefer `while` loops in complex functions.
- Avoid duplicate local names across branches in the same function.
- Keep imports at the top of the file.
- Export functions that are imported by another module.
- Guard dictionary access with `has_key()` or local helper wrappers.
- Remember that some builtins return int-like `1`/`0` instead of booleans.
- Guard parsing operations such as JSON or TOML parsing and validate the result.
- Keep deep tree walks iterative where recursion risks VM stack limits.
- Be careful with byte-based string indexes versus character-based substring
  operations; use existing repo helpers when available.

Follow stricter runtime notes in the local repo when they exist.

## Validation

Before opening a pull request, run the strongest local validation available for
the repo.

Watchdog source and docs validation:

```bash
export KUJO_BIN=/path/to/kujo/target/release/kujo
for f in tests/*.js; do
  echo "==> $f"
  node "$f" || exit 1
done
```

Additional smoke and benchmark schema checks:

```bash
node tests/benchmark_script_schema_check.js
node scripts/benchmark_profiles.js --fixture --profiles=quick,soak --json-out=tmp/benchmark-fixture.json
```

Proxy smoke may intentionally produce upstream `401` without an API key while
still recording telemetry.

Tests should stay offline and deterministic unless the repo explicitly marks a
live-provider or network test as opt-in.

## Documentation And Changelog

Update docs when behavior, configuration, command output, flags, schemas,
examples, or security expectations change.

For Watchdog, check:

- `README.md`
- `docs/`
- `docs/DEPLOYMENT_HARDENING_RUNBOOK.md` for auth, request handling, exports, or
  retention changes
- `docs/KENNEL_INTEGRATION_GUIDE.md`
- command reference or flags docs
- examples
- `CHANGELOG.md`

User-visible behavior changes should include a changelog entry when the repo has
a changelog.

## Security Expectations

- Do not log or commit real API keys, bearer tokens, prompts with secrets, or
  telemetry DBs.
- Keep redaction policy and auth mode docs aligned with implementation.
- Changes touching auth, request handling, exports, or retention paths must
  include positive and negative behavior tests, non-regression proof from the
  full suite, and documentation updates.

## Pull Requests

A good PR includes:

- Problem statement.
- Change summary.
- User-visible impact and risk level.
- Test evidence with commands and outcomes.
- Documentation or changelog updates.
- Known risks or follow-up work, if any.

Keep generated artifacts out of commits unless the artifact is the reviewed
output of the change.

## Commit Messages

Use concise, imperative commit subjects. Prefer small commits that can be
reverted safely.
