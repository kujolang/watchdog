# Watchdog Deployment And Hardening Runbook

This runbook documents secure deployment defaults, operational checks, retention controls, and troubleshooting steps for Watchdog.

For architecture topology patterns (single-node/scaled), see `docs/ENTERPRISE_DEPLOYMENT_ARCHITECTURE.md`.

## 1. Hardened Environment Baseline

Use explicit environment variables before starting Watchdog:

```bash
export KUJO_BIN=${KUJO_BIN:-kujo}
export WATCHDOG_ROOT=/path/to/kujo-watchdog
export WDG_PORT=7700
export WDG_DB_PATH="$WATCHDOG_ROOT/data/watchdog.db"
export WDG_PROXY_CONFIG_PATH="$WATCHDOG_ROOT/watchdog_proxy_config.json"
export WDG_DEPLOYMENT_PROFILE=production
export WDG_API_AUTH_MODE=token
export WDG_API_AUTH_TOKEN='replace-with-long-random-token'
export WDG_PROXY_AUTHZ_MODE=token
export WDG_PROXY_AUTHZ_TOKEN='replace-with-long-random-proxy-token'
export WDG_PROXY_AUTHZ_ALLOWLIST='/healthz,/readyz'
export WDG_REDACTION_MODE=basic
export WDG_RATE_LIMIT_MODE=basic
export WDG_RATE_LIMIT_MAX_REQUESTS=120
export WDG_RATE_LIMIT_WINDOW_SECS=60
export WDG_RATE_LIMIT_MAX_BUCKETS=5000
export WDG_RATE_LIMIT_BUCKET_TTL_SECS=600
export WDG_IDENTIFIER_MAX_LEN=128
export WDG_EXPORT_MAX_ROWS=10000
export WDG_MAX_PROXY_BODY_BYTES=1048576
export WDG_MAX_PARSE_BODY_BYTES=524288
export WDG_CHARTJS_LOCAL_PATH=vendor/chart.umd.min.js
```

Production profile startup policy:

- In `WDG_DEPLOYMENT_PROFILE=production`, startup fails closed unless API and proxy token auth are fully configured.
- Break-glass override is available via `WDG_ALLOW_INSECURE_STARTUP=true` and should only be used for tightly controlled recovery scenarios.

Start server:

```bash
"$KUJO_BIN" run dashboard_server.kujo --interpreter
```

`dashboard_server.kujo` is the documented root compatibility entrypoint and mirrors `src/dashboard_server.kujo`.

## 2. Network Exposure Guidance

- Kujo `http_server` currently binds to all interfaces (`0.0.0.0`).
- For non-local deployments, do not rely on network defaults alone.
- Require `WDG_API_AUTH_MODE=token`.
- Require `WDG_PROXY_AUTHZ_MODE=token`.
- Restrict inbound access with firewall rules and/or place Watchdog behind a reverse proxy.

## 3. Operational Verification Checks

Run these checks after each deploy:

```bash
curl -s http://127.0.0.1:7700/healthz
curl -s http://127.0.0.1:7700/readyz
curl -s http://127.0.0.1:7700/api/version -H 'X-Watchdog-Token: replace-with-long-random-token'
curl -s http://127.0.0.1:7700/api/stats -H 'X-Watchdog-Token: replace-with-long-random-token'
curl -s http://127.0.0.1:7700/api/proxy-config -H 'X-Watchdog-Token: replace-with-long-random-token'
curl -s http://127.0.0.1:7700/api/audit-events -H 'X-Watchdog-Token: replace-with-long-random-token'
curl -s http://127.0.0.1:7700/api/requests -H 'X-Watchdog-Token: replace-with-long-random-token'
curl -s "http://127.0.0.1:7700/api/sessions?tenant_id=example_tenant" -H 'X-Watchdog-Token: replace-with-long-random-token'
curl -s "http://127.0.0.1:7700/api/charts/status-breakdown?project_id=example_project" -H 'X-Watchdog-Token: replace-with-long-random-token'
curl -s http://127.0.0.1:7700/api/admin/diagnostics -H 'X-Watchdog-Token: replace-with-long-random-token'
curl -s http://127.0.0.1:7700/api/export -H 'X-Watchdog-Token: replace-with-long-random-token'
curl -s http://127.0.0.1:7700/proxy/v1/models -H 'X-Watchdog-Proxy-Token: replace-with-long-random-proxy-token'
curl -s http://127.0.0.1:7700/ | grep -q 'integrity="sha384-bs/nf9FbdNouRbMiFcrcZfLXYPKiPaGVGplVbv7dLGECccEXDW+S3zjqSKR5ZEaD"'
```

Expected shape for successful API checks:
- JSON includes `"ok": true`.

Optional proxy path smoke check:

```bash
curl -i -s -X POST http://127.0.0.1:7700/proxy/v1/chat/completions \
	-H 'Content-Type: application/json' \
	-d '{"model":"gpt-4.1-mini","messages":[{"role":"user","content":"runbook smoke"}]}'
```

Optional export payload-bound check:

```bash
curl -s "http://127.0.0.1:7700/api/export?max_rows=500" -H 'X-Watchdog-Token: replace-with-long-random-token'
curl -s "http://127.0.0.1:7700/api/export?format=json&chunk_size=500&cursor=0" -H 'X-Watchdog-Token: replace-with-long-random-token'
```

Optional benchmark baseline check:

```bash
node scripts/benchmark_profiles.js --profiles=quick,soak --json-out=tmp/benchmark-report.json
```

Optional restricted-network dashboard fallback setup:

```bash
mkdir -p "$WATCHDOG_ROOT/vendor"
# Copy vetted chart.umd.min.js to $WATCHDOG_ROOT/vendor/chart.umd.min.js
curl -s http://127.0.0.1:7700/assets/vendor/chart.umd.min.js | head -c 80
```

## 4. Retention Tuning And Pruning

Preview prune impact before delete:

```bash
curl -s -X POST http://127.0.0.1:7700/api/admin/prune \
	-H 'Content-Type: application/json' \
	-H 'X-Watchdog-Token: replace-with-long-random-token' \
	-d '{"before_ms": 1700000000000, "dry_run": true}'
```

Apply pruning:

```bash
curl -s -X POST http://127.0.0.1:7700/api/admin/prune \
	-H 'Content-Type: application/json' \
	-H 'X-Watchdog-Token: replace-with-long-random-token' \
	-d '{"before_ms": 1700000000000, "dry_run": false}'
```

## 5. Backup Strategy

Stop Watchdog before file-level backups of SQLite artifacts.

```bash
cp "$WATCHDOG_ROOT/data/watchdog.db" "$WATCHDOG_ROOT/tmp/watchdog.db.backup"
```

Restore:

```bash
cp "$WATCHDOG_ROOT/tmp/watchdog.db.backup" "$WATCHDOG_ROOT/data/watchdog.db"
```

## 6. Troubleshooting Proxy Errors

- `401 Unauthorized` from `/proxy/v1/...`:
	- In `WDG_PROXY_AUTHZ_MODE=token`, this indicates a missing proxy auth token.
	- In passthrough mode, this can also be an upstream auth failure when no upstream credential is provided.
- `403 Forbidden` from `/proxy/v1/...`:
	- Proxy token was present but did not match `WDG_PROXY_AUTHZ_TOKEN`.
- `500 Proxy auth mode is token but WDG_PROXY_AUTHZ_TOKEN is empty`:
	- Set `WDG_PROXY_AUTHZ_TOKEN` when token mode is enabled.
- `FATAL: production startup policy violations: ...`:
	- Set `WDG_DEPLOYMENT_PROFILE=production` with `WDG_API_AUTH_MODE=token`, `WDG_API_AUTH_TOKEN`, `WDG_PROXY_AUTHZ_MODE=token`, and `WDG_PROXY_AUTHZ_TOKEN`.
	- Use `WDG_ALLOW_INSECURE_STARTUP=true` only for short-lived break-glass recovery situations.
- `500 Proxy auth_mode=override requires ...`:
	- Set `WDG_UPSTREAM_API_KEY` or `WDG_UPSTREAM_API_KEY_ENV`.
- `413 Proxy request body exceeds configured max bytes`:
	- Increase `WDG_MAX_PROXY_BODY_BYTES` or send smaller payloads.
- `413 JSON body exceeds configured parse limit`:
	- Increase `WDG_MAX_PARSE_BODY_BYTES` or reduce JSON request size.
- `429 Too Many Requests`:
	- Increase `WDG_RATE_LIMIT_MAX_REQUESTS`, raise `WDG_RATE_LIMIT_WINDOW_SECS`, or disable limiting for local-only workflows.
- `502 Upstream request failed`:
	- Verify upstream URL and network path in proxy config.
