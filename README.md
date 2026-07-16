# Watchdog

[![Version](https://img.shields.io/badge/version-1.0.0-black)](https://github.com/kujolang/watchdog)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)
[![built with Kujo](https://img.shields.io/badge/built%20with-Kujo-white.svg)](https://github.com/kujolang/kujo)

Watchdog is a server-first observability layer for local agent and workflow
telemetry in Kujo applications.

It combines an OpenAI-compatible proxy with a local SQLite telemetry store so
humans and agents can inspect model calls, tool calls, agent steps, latency,
token usage, estimated direct-API value, and failures through a dashboard and JSON APIs.

Point your Kujo AI app at Watchdog's `/proxy/v1` endpoint and keep your normal
OpenAI-style request paths. Watchdog forwards requests upstream, captures
structured traces, and serves a local dashboard plus JSON APIs for debugging,
bounded performance tuning, and usage analysis.

Cost fields are estimated direct-provider equivalents, not subscription invoices. See [Direct API value estimates](docs/PRICING_ESTIMATES.md) for model mappings, rates, and limitations.

Watchdog is part of Kujo’s Control layer: visible state, bounded telemetry,
structured exports, regression signals, and reviewable local monitoring data.

Watchdog is intentionally strong as a local-first reference implementation and
can be deployed behind enterprise controls. Production readiness still depends
on the operator enabling token auth, TLS/reverse-proxy boundaries, firewalling,
retention policy, backups, and secret-management practices appropriate to the
environment.

---

## How it works

1. Your client sends requests to this server at `/proxy/v1/...`.
2. The server forwards them to a configurable upstream base URL.
3. The server logs request metrics and traces in SQLite.
4. The dashboard UI reads those logs from JSON API endpoints.

No changes are required in your app code beyond setting the base URL (and API
key behavior) to use the proxy.

---

## Quick start

### 1) Start the Watchdog server

```bash
cd /path/to/kujo-watchdog
export KUJO_BIN=${KUJO_BIN:-kujo}
"$KUJO_BIN" run --interpreter dashboard_server.kujo
```

If `kujo` is already on your `PATH`, this works too:

```bash
kujo run --interpreter dashboard_server.kujo
```

### 2) Open the dashboard

```text
http://localhost:7700
```

When `WDG_API_AUTH_MODE=token`, the dashboard opens an API access prompt.
Enter the configured `WDG_API_AUTH_TOKEN`; the browser keeps it in
`sessionStorage` for the current tab session and sends it as
`X-Watchdog-Token` on dashboard API requests. A missing or invalid token is
shown explicitly instead of leaving the dashboard in an empty loading state.

### 3) Verify proxy configuration endpoint

```bash
curl -s http://localhost:7700/api/proxy-config
```

Expected response shape:

```json
{
  "ok": true,
  "data": {
    "upstream_base_url": "https://api.openai.com/v1",
    "auth_mode": "passthrough",
    "has_override_api_key": false,
    "api_auth_mode": "off",
    "api_auth_enabled": false,
    "proxy_auth_mode": "off",
    "proxy_auth_enabled": false
  }
}
```

### 4) Optional smoke test (passthrough auth mode)

```bash
curl -i -s \
    -X POST http://localhost:7700/proxy/v1/chat/completions \
    -H 'Content-Type: application/json' \
    -d '{"model":"gpt-4.1-mini","messages":[{"role":"user","content":"proxy smoke"}]}'
```

If no API key header is passed in passthrough mode, you should see an upstream
`401` and a corresponding error row in `/api/requests`.

---

## Canonical examples and generated paths

Use `src/` as the canonical implementation source. The root files
`dashboard_server.kujo`, `dashboard.html`, `watchdog.kujo`, and
`watchdog_shared.kujo` are compatibility mirrors kept in sync from `src/`.

`demo.kujo`, this README, and `docs/KENNEL_INTEGRATION_GUIDE.md` are the
primary copyable examples. Prefer compact, runnable snippets in those files and
keep repeated output formatting behind small local helpers when it improves
scannability.

The demo seeder writes to `data/watchdog-demo.db` and refuses the production
`watchdog.db`. Demo rows are labeled `source_app=watchdog-demo` and
`data_class=fixture`; live proxy and external application telemetry remain in
the production database with distinct classifications.

Treat `tests/` as contract and regression coverage. Do not shorten fixtures or
expected-output checks just to reduce tokens when explicit examples make a test
clearer.

Exclude generated and bulk runtime paths from broad readability sweeps unless a
task explicitly targets them: `tmp/`, `data/`, `vendor/`, SQLite artifacts, and
local proxy config files.

---

## Configuration

Environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `WDG_PORT` | `7700` | HTTP port for Watchdog + proxy |
| `WDG_DB_PATH` | `data/watchdog.db` | SQLite path for logs |
| `WDG_PROXY_CONFIG_PATH` | `watchdog_proxy_config.json` | JSON config file path |
| `WDG_UPSTREAM_BASE_URL` | `https://api.openai.com/v1` | Upstream OpenAI-compatible base URL |
| `WDG_PROXY_AUTH_MODE` | `passthrough` | `passthrough` or `override` |
| `WDG_UPSTREAM_API_KEY` | empty | API key used when auth mode is `override` |
| `WDG_UPSTREAM_API_KEY_ENV` | empty | Name of env var to read API key from when `override` |
| `WDG_API_AUTH_MODE` | `off` | `off` or `token` for `/api/*` endpoints |
| `WDG_API_AUTH_TOKEN` | empty | Shared token required when `WDG_API_AUTH_MODE=token` |
| `WDG_PROXY_AUTHZ_MODE` | `off` | `off` or `token` for `/proxy/*` endpoints |
| `WDG_PROXY_AUTHZ_TOKEN` | empty | Shared token required when `WDG_PROXY_AUTHZ_MODE=token` |
| `WDG_DEPLOYMENT_PROFILE` | `local` | `local` or `production` startup policy profile |
| `WDG_ALLOW_INSECURE_STARTUP` | `false` | `true` allows break-glass startup when production policy checks fail |
| `WDG_PROXY_AUTHZ_ALLOWLIST` | `/healthz,/readyz` | Comma-separated exact-path bypass list for proxy auth checks |
| `WDG_CHARTJS_LOCAL_PATH` | `vendor/chart.umd.min.js` | Optional local vendored Chart.js path served at `/assets/vendor/chart.umd.min.js` |
| `WDG_PROXY_TIMEOUT_SECS` | `120` | Upstream proxy timeout in seconds |
| `WDG_MAX_PROXY_BODY_BYTES` | `1048576` | Reject proxy request bodies larger than this many bytes |
| `WDG_MAX_PARSE_BODY_BYTES` | `524288` | Reject JSON request parsing over this many bytes |
| `WDG_REDACTION_MODE` | `basic` | `basic` or `off` telemetry redaction before persistence/export |
| `WDG_REDACT_TERMS` | `api_key,authorization,bearer,password,secret,token,sk-` | Comma-separated redaction match terms |
| `WDG_RATE_LIMIT_MODE` | `off` | `off` or `basic` SQLite-backed throttling for `/api/*` and `/proxy/*` |
| `WDG_RATE_LIMIT_MAX_REQUESTS` | `60` | Max requests allowed per bucket per window |
| `WDG_RATE_LIMIT_WINDOW_SECS` | `60` | Rate-limit window duration in seconds |
| `WDG_RATE_LIMIT_MAX_BUCKETS` | `5000` | Maximum retained rate-limit buckets after eviction |
| `WDG_RATE_LIMIT_BUCKET_TTL_SECS` | `600` | TTL for idle rate-limit buckets before cleanup |
| `WDG_IDENTIFIER_MAX_LEN` | `128` | Max stored length for session/user/tenant/project/workflow/task/correlation identifiers |
| `WDG_EXPORT_MAX_ROWS` | `10000` | Default per-kind row cap for `/api/export` requests (override via query) |

Optional `watchdog_proxy_config.json` (path controlled by `WDG_PROXY_CONFIG_PATH`):

```json
{
    "upstream_base_url": "https://api.openai.com/v1",
    "auth_mode": "passthrough",
    "upstream_api_key": "",
    "upstream_api_key_env": ""
}
```

Precedence: env vars override file values, and file values override defaults.

---

## Proxy routes

| Method | Path | Notes |
|--------|------|-------|
| `GET,POST,PUT,PATCH,DELETE` | `/proxy/v1/:resource` | Example: `/proxy/v1/models` |
| `GET,POST,PUT,PATCH,DELETE` | `/proxy/v1/:resource/:action` | Example: `/proxy/v1/chat/completions` |
| `GET,POST,PUT,PATCH,DELETE` | `/proxy/v1/:resource/:action/:subaction` | Example: `/proxy/v1/fine_tuning/jobs` |
| `GET,POST,PUT,PATCH,DELETE` | `/proxy/v1/:resource/:action/:subaction/:tail` | Example: `/proxy/v1/fine_tuning/jobs/<id>/cancel` |

The proxy forwards JSON and SSE responses and returns the upstream status/body
to the caller. Safe scalar query parameters are forwarded to upstream list and
retrieve endpoints, while suspicious path/query text such as path traversal,
embedded URL schemes, fragments, and query delimiters in path segments is
rejected before any upstream request is made.

---

## Auth modes

### `passthrough` (default)

- Forwards incoming `Authorization` header to upstream.
- Best when each client profile manages its own key.

### `override`

- Ignores incoming auth and injects a server-side upstream key.
- Set key via `WDG_UPSTREAM_API_KEY` or `WDG_UPSTREAM_API_KEY_ENV`.

## Watchdog API auth mode

### `off` (default)

- Leaves Watchdog API endpoints (`/api/*`) open for local development.

### `token`

- Requires `WDG_API_AUTH_TOKEN` for every `/api/*` request.
- Accepts either `X-Watchdog-Token: <token>` or `Authorization: Bearer <token>`.

Example:

```bash
WDG_API_AUTH_MODE=token \
WDG_API_AUTH_TOKEN='replace-with-long-random-token' \
kujo run --interpreter dashboard_server.kujo
```

Then call protected routes with:

```bash
curl -s http://127.0.0.1:7700/api/stats -H 'X-Watchdog-Token: replace-with-long-random-token'
```

## Proxy route auth mode

### `off` (default)

- Leaves proxy endpoints (`/proxy/*`) open.

### `token`

- Requires `WDG_PROXY_AUTHZ_TOKEN` for non-allowlisted proxy requests.
- Accepts either `X-Watchdog-Proxy-Token: <token>` or `Authorization: Bearer <token>`.
- Uses exact-path allowlist entries from `WDG_PROXY_AUTHZ_ALLOWLIST` (default keeps `/healthz` and `/readyz` open).

Example:

```bash
WDG_PROXY_AUTHZ_MODE=token \
WDG_PROXY_AUTHZ_TOKEN='replace-with-long-random-proxy-token' \
WDG_PROXY_AUTHZ_ALLOWLIST='/healthz,/readyz,/proxy/v1/models' \
kujo run --interpreter dashboard_server.kujo
```

## Non-local deployment hardening

- Kujo `http_server` currently binds all interfaces (`0.0.0.0`) and does not expose host-binding parameters.
- Treat `WDG_API_AUTH_MODE=off` as local-only usage.
- For non-local access, enable `WDG_API_AUTH_MODE=token`, enable `WDG_PROXY_AUTHZ_MODE=token`, and place Watchdog behind firewall rules or a reverse proxy.

## Production startup policy

- Set `WDG_DEPLOYMENT_PROFILE=production` for non-local deployments.
- In production profile mode, Watchdog fails startup unless all of the following are configured:
    - `WDG_API_AUTH_MODE=token`
    - `WDG_API_AUTH_TOKEN` is non-empty
    - `WDG_PROXY_AUTHZ_MODE=token`
    - `WDG_PROXY_AUTHZ_TOKEN` is non-empty
- `WDG_ALLOW_INSECURE_STARTUP=true` acts as break-glass override for controlled emergency scenarios and prints policy warnings at startup.

## Response security headers

Watchdog responses include:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Cache-Control: no-store`

These headers are applied to dashboard, API, and proxy responses.

## Dashboard asset policy

- Remote font stylesheets are not used by default; dashboard typography relies on local/system fonts.
- Chart.js is version-pinned to `4.4.1` with strict Subresource Integrity (SRI).
- A version-pinned SRI fallback URL is included so dashboards still load charts when the primary CDN is unavailable.
- A local fallback route (`/assets/vendor/chart.umd.min.js`) is included for restricted-network deployments that vendor Chart.js locally.

Optional local-vendor setup:

```bash
mkdir -p vendor
# Place a vetted chart.umd.min.js artifact at:
# vendor/chart.umd.min.js
export WDG_CHARTJS_LOCAL_PATH=vendor/chart.umd.min.js
```

## Telemetry redaction policy

- `WDG_REDACTION_MODE=basic` (default) redacts sensitive terms from prompt summaries, tool-call payload fields, step metadata, and error messages before data is stored or exported.
- `WDG_REDACTION_MODE=off` keeps original text for local debugging workflows.
- Extend the matching vocabulary with `WDG_REDACT_TERMS` to include environment-specific secret markers.

## Rate limiting

- `WDG_RATE_LIMIT_MODE=basic` enables lightweight SQLite-backed throttling for both Watchdog API routes and proxy routes. Persisted buckets avoid concurrent dashboard requests corrupting shared process state.
- Buckets are keyed by `X-Observe-Session-Id` when present, otherwise by forwarded IP/host fallbacks.
- Use `WDG_RATE_LIMIT_MAX_REQUESTS` and `WDG_RATE_LIMIT_WINDOW_SECS` to tune burst tolerance for your environment.
- Use `WDG_RATE_LIMIT_MAX_BUCKETS` and `WDG_RATE_LIMIT_BUCKET_TTL_SECS` to bound limiter memory and evict stale buckets in long-running deployments.

---

## Integrating any OpenAI-compatible client

Set the client base URL to:

```text
http://localhost:7700/proxy/v1
```

Keep normal OpenAI-style paths, for example `chat/completions`.

Optional headers for better dashboard grouping:

- `X-Observe-Session-Id`
- `X-Observe-User-Id`
- `X-Observe-Tenant-Id`
- `X-Observe-Project-Id`
- `X-Observe-Workflow-Id`
- `X-Observe-Task-Id`
- `X-Observe-Correlation-Id`

Tenant/project values can also be supplied in JSON request bodies using
`tenant_id` and `project_id` when headers are not available.

If omitted, the proxy auto-generates values.

### Aggregating multiple apps and API keys

One Watchdog server aggregates every app that sends traffic through its
`/proxy/v1` URL into the same telemetry database. API keys do not partition
dashboard data. Give each app a distinct `X-Observe-Project-Id` (for example,
`signalbox` and `ai-chat`) and the unfiltered dashboard stats include both;
the request table can still be filtered by project when needed.

Keep the three credential roles separate:

- `WDG_API_AUTH_TOKEN` protects Watchdog's dashboard JSON APIs.
- `WDG_PROXY_AUTHZ_TOKEN` controls which clients may use the proxy.
- Upstream provider keys authenticate Watchdog to OpenAI-compatible providers.

For several apps using the same upstream account, `override` mode is simplest:
all apps share the Watchdog proxy URL/token while Watchdog injects its single
configured upstream key. For apps with different upstream keys, use
`passthrough` mode so each client sends its own upstream `Authorization` value,
and send the Watchdog access credential separately in
`X-Watchdog-Proxy-Token`. Both modes still write to the same database.

A single Watchdog process currently has one upstream base URL. Routing one
process to several different upstream providers requires named upstream
profiles; that is separate from aggregating several apps against one provider.

---

## AI Chat integration example (no AI Chat code changes)

For a Kennel-focused end-to-end setup and validation flow, see
[docs/KENNEL_INTEGRATION_GUIDE.md](docs/KENNEL_INTEGRATION_GUIDE.md).

In `kujo-ai-chat`:

1. In Settings, choose provider `Custom OpenAI-Compatible`.
2. Set profile `Base URL` to your Watchdog proxy base (for example,
    `https://your-watchdog-host/proxy/v1`).
3. Set the profile API key as usual.
4. Ensure `ALLOWED_CUSTOM_PROVIDER_HOSTS` in AI Chat includes your proxy host.

Important: current AI Chat security validation rejects localhost/private hosts
for custom providers and requires HTTPS. For local testing, use an HTTPS host
that resolves externally (for example, via a secure tunnel) and allowlist that
host in `ALLOWED_CUSTOM_PROVIDER_HOSTS`.

---

## What is logged

| Table | Contents |
|-------|----------|
| `requests` | Session/user/tenant/project/workflow/task/correlation IDs, provider/model, status, latency, tokens, cost, prompt/response summaries, errors |
| `tool_calls` | Proxy forward events linked to request rows |
| `agent_steps` | High-level proxy lifecycle steps (`proxy_received`, `proxy_forwarded`, `proxy_completed`, `proxy_failed`) |
| `audit_events` | Security-sensitive operations (`api_auth_failure`, `proxy_auth_failure`, `proxy_config_view`, `prune_operation`) with actor key, result, and metadata |
| `traces` | End-to-end workflow timing, token breakdown, and direct-API-equivalent cost components |
| `trace_spans` | Provider-neutral workflow, model, tool, persistence, and internal timing spans |
| `trace_events` | Ordered milestones such as connect, first token, thinking, tool execution, and persistence |
| `rate_limit_buckets` | Short-lived request counters used when basic throttling is enabled |

---

## Watchdog API reference

All endpoints return `{ "ok": true, "data": ... }` on success.

API responses include `X-Watchdog-API-Version: v1` so consumers can pin behavior to a stable contract.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Dashboard HTML |
| `GET` | `/healthz` | Liveness probe |
| `GET` | `/readyz` | Readiness probe (DB connectivity) |
| `GET` | `/api/version` | API compatibility/version metadata |
| `GET` | `/api/proxy-config` | Effective proxy config summary |
| `GET` | `/api/stats` | Overview stats |
| `GET` | `/api/requests` | Latest request logs; filter by `source_app` or `data_class` |
| `POST` | `/api/telemetry/requests` | Authenticated, idempotent intake for telemetry from trusted local apps |
| `POST` | `/api/telemetry/traces` | Append independent spans/events to a trace without creating a model-request row |
| `GET` | `/api/traces` | Latest granular traces |
| `GET` | `/api/trace-spans` | Latest spans; filter by `trace_id` |
| `GET` | `/api/trace-events` | Latest events; filter by `trace_id` |
| `GET` | `/api/tool-calls` | Latest tool call logs |
| `GET` | `/api/agent-steps` | Agent step traces |
| `GET` | `/api/audit-events` | Structured security/audit event stream |
| `GET` | `/api/errors` | Error aggregates |
| `GET` | `/api/sessions` | Per-session aggregates |
| `GET` | `/api/charts/requests-over-time` | Hourly request/error counts |
| `GET` | `/api/charts/cost-over-time` | Hourly cost totals |
| `GET` | `/api/charts/latency-hist` | Latency buckets |
| `GET` | `/api/charts/status-breakdown` | Success vs error counts |
| `GET` | `/api/charts/provider-breakdown` | Per-provider/model breakdown |
| `GET` | `/api/admin/diagnostics` | Protected runtime/migration/DB diagnostics summary |
| `POST` | `/api/admin/prune` | Prune old telemetry rows (supports dry-run) |
| `POST` | `/api/admin/prune-fixtures` | Remove only rows explicitly classified as fixture data (supports dry-run) |
| `GET` | `/api/export` | Full export (`json` default or `jsonl`/`ndjson`) |

The granular contract is optional and producer-neutral. Watchdog is a passive collector: applications, model providers, and tool executors remain independently usable, and a tool can append its own telemetry without importing or depending on another tool. See [Granular Tracing](docs/GRANULAR_TRACING.md).

List endpoints now support optional query parameters for pagination and filtering:

- `page` (default `1`)
- `page_size` (default endpoint-specific, capped)
- common filters where applicable: `session_id`, `user_id`, `tenant_id`, `project_id`, `workflow_id`, `task_id`, `correlation_id`, `status`, `provider`, `model`, `tool_name`, `agent_id`, `step_type`
- time window: `since_ms`, `until_ms` (epoch milliseconds)
- export format: `format=json|jsonl|ndjson` (`/api/export`; invalid values return `400`)
- export row bound: `max_rows` (`/api/export`; default from `WDG_EXPORT_MAX_ROWS`, max `50000`)
- export chunk cursor: `cursor` and `chunk_size` (`/api/export`; works for json/jsonl/ndjson; `max_rows` caps the effective chunk size per exported kind)
- tenant/project scoping extends to `/api/sessions` and chart endpoints such as `/api/charts/requests-over-time`, `/api/charts/status-breakdown`, and `/api/charts/provider-breakdown`

Retention and export control examples:

- Dry-run prune before timestamp:
    `curl -s -X POST http://127.0.0.1:7700/api/admin/prune -H 'Content-Type: application/json' -d '{"before_ms": 1700000000000, "dry_run": true}'`
- Filtered export by session/time window:
    `curl -s "http://127.0.0.1:7700/api/export?session_id=sess_123&since_ms=1700000000000&until_ms=1800000000000"`
- Filtered export by tenant/project scope:
    `curl -s "http://127.0.0.1:7700/api/export?tenant_id=team_alpha&project_id=checkout-api"`
- Row-bounded export for controlled payload size:
    `curl -s "http://127.0.0.1:7700/api/export?format=json&max_rows=500"`
- Cursor-based chunk export progression:
    `curl -s "http://127.0.0.1:7700/api/export?format=json&chunk_size=500&cursor=0"`
- JSONL export for pipeline ingestion:
    `curl -s "http://127.0.0.1:7700/api/export?format=jsonl&session_id=sess_123"`

## Benchmark script

Run quick and soak benchmark profiles with human-readable output plus JSON summary output:

`node scripts/benchmark_profiles.js --profiles=quick,soak --json-out=tmp/benchmark-report.json`

Run deterministic fixture mode for local validation/schema checks:

`node scripts/benchmark_profiles.js --fixture --profiles=quick,soak --json-out=tmp/benchmark-fixture.json`

---

## Project structure

```text
watchdog/
├── kujo.toml              # Project metadata
├── src/                   # Canonical implementation sources
│   ├── dashboard_server.kujo
│   ├── dashboard.html
│   ├── watchdog.kujo
│   └── watchdog_shared.kujo
├── dashboard_server.kujo  # Root compatibility entrypoint (mirrors src/dashboard_server.kujo)
├── dashboard.html         # Root compatibility entrypoint (mirrors src/dashboard.html)
├── watchdog.kujo          # Root compatibility entrypoint (mirrors src/watchdog.kujo)
├── watchdog_shared.kujo   # Root compatibility shared module (mirrors src/watchdog_shared.kujo)
├── demo.kujo              # Demo data seeding script
├── scripts/               # Operational scripts (benchmarks, helpers)
├── tests/                 # Contract, static, proxy, and runtime checks
│   └── fixtures/          # Non-product runtime fixtures
├── data/                  # Runtime SQLite files (created at runtime)
└── docs/                  # Backlogs and implementation checklists
```

Keep root compatibility entrypoints synced from `src/`:

`node scripts/sync_compat_entrypoints.js --check`

## Implementation backlog

- Primary execution checklist: [docs/WATCHDOG_SCOUT_CHECKLIST.md](docs/WATCHDOG_SCOUT_CHECKLIST.md)
- Deployment and hardening runbook: [docs/DEPLOYMENT_HARDENING_RUNBOOK.md](docs/DEPLOYMENT_HARDENING_RUNBOOK.md)
- Kennel integration guide: [docs/KENNEL_INTEGRATION_GUIDE.md](docs/KENNEL_INTEGRATION_GUIDE.md)
- Enterprise next-session checklist: [docs/WATCHDOG_ENTERPRISE_NEXT_SESSION_CHECKLIST.md](docs/WATCHDOG_ENTERPRISE_NEXT_SESSION_CHECKLIST.md)
- Enterprise review follow-up checklist: [docs/WATCHDOG_ENTERPRISE_REVIEW_2026-06-19.md](docs/WATCHDOG_ENTERPRISE_REVIEW_2026-06-19.md)
- Enterprise deployment architecture: [docs/ENTERPRISE_DEPLOYMENT_ARCHITECTURE.md](docs/ENTERPRISE_DEPLOYMENT_ARCHITECTURE.md)
- Enterprise release loop checklist: [docs/ENTERPRISE_RELEASE_LOOP_CHECKLIST.md](docs/ENTERPRISE_RELEASE_LOOP_CHECKLIST.md)
- Release checklist and versioning policy: [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)
- Security policy: [SECURITY.md](SECURITY.md)
- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- CI workflow: [.github/workflows/watchdog-ci.yml](.github/workflows/watchdog-ci.yml)
- Use the checklist Item Completion Template and Work Log format when completing backlog items.

---

## Requirements

- Kujo CLI/runtime installed
- No API key required to run the dashboard itself
- API key required only when proxying to an authenticated upstream
