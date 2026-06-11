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
