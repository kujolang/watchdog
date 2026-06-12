# Contributing

## Development Workflow

1. Fork or branch from `main`.
2. Keep pull requests scoped to one concern.
3. Add or update deterministic tests for behavior changes.
4. Run the full local suite before opening a pull request:

```bash
for f in tests/*.js; do
	echo "==> $f"
	node "$f" || exit 1
done
```

5. Update `README.md` and relevant docs for behavior/config changes.

## Agent and Example Hygiene

- Start broad code searches from canonical paths: `src/`, `demo.kujo`,
  `scripts/`, `tests/`, `docs/`, `README.md`, and `CONTRIBUTING.md`.
- Exclude generated or bulk runtime paths from ordinary sweeps:
  `tmp/`, `data/`, `vendor/`, SQLite files, and local proxy config files.
- Treat `demo.kujo`, `README.md`, and `docs/KENNEL_INTEGRATION_GUIDE.md` as
  copyable examples. They should model the most token-efficient idioms agents
  and humans should imitate.
- Keep introductory snippets direct. Use small local helpers such as
  `print_lines`, `section`, `kv`, or `ok` only when they remove repetitive
  status, menu, banner, or summary output.
- Treat `tests/` as contract coverage. Preserve explicit fixtures and expected
  output when they make behavior easier to audit.
- Root compatibility entrypoints mirror `src/`; update `src/` first, then run
  `node scripts/sync_compat_entrypoints.js`.

## Pull Request Expectations

- Clearly explain the user impact and risk level.
- Include test evidence in the pull request description.
- Avoid unrelated refactors in the same pull request.

## Security Changes

Changes touching auth, request handling, exports, or retention paths must include:

- positive/negative behavior tests
- non-regression proof from full suite run
- docs update in `README.md` and/or `docs/DEPLOYMENT_HARDENING_RUNBOOK.md`

## Commit Style

- Use concise, imperative commit messages.
- Prefer small commits that can be reverted safely.
- Keep generated runtime artifacts out of commits.
