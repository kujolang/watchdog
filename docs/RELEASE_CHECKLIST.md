# Release Checklist

This checklist defines minimum release controls for Watchdog.

## Versioning Policy

- Use semantic versioning intent: `MAJOR.MINOR.PATCH`.
- Bump major for breaking API contract or incompatible behavior changes.
- Bump minor for backward-compatible features.
- Bump patch for backward-compatible fixes.
- Update `CHANGELOG.md` in every release PR.

## Pre-Release

- Confirm clean working tree and up-to-date `main`.
- Run full regression suite:

```bash
for f in tests/*.js; do
	echo "==> $f"
	node "$f" || exit 1
done
```

- Verify hardened startup behavior with production profile:

```bash
WDG_DEPLOYMENT_PROFILE=production \
WDG_API_AUTH_MODE=token \
WDG_API_AUTH_TOKEN='release-api-token' \
WDG_PROXY_AUTHZ_MODE=token \
WDG_PROXY_AUTHZ_TOKEN='release-proxy-token' \
kujo run dashboard_server.kujo --interpreter
```

- Ensure docs reflect configuration and endpoint behavior changes.
- Ensure `CHANGELOG.md` has release notes for the version.

## Release

- Tag release with `vMAJOR.MINOR.PATCH`.
- Publish release notes from the changelog entry.
- Include migration notes for any API contract or deployment behavior changes.

## Post-Release

- Run smoke checks against release artifacts.
- Confirm issue templates and security reporting paths are still accurate.
- Open follow-up issues for deferred improvements discovered during release.
