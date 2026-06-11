# Kennel Integration Guide

This guide documents an end-to-end integration path from Kennel-driven agent traffic to Watchdog telemetry, filters, and dashboard views.

## 1) Configure Watchdog as a proxy target

Use a normal Watchdog startup flow:

```bash
export WATCHDOG_ROOT=/path/to/kujo-watchdog
cd "$WATCHDOG_ROOT"
export KUJO_BIN=${KUJO_BIN:-kujo}
"$KUJO_BIN" run --interpreter dashboard_server.kujo
```

Use `WDG_API_AUTH_MODE=token` and `WDG_API_AUTH_TOKEN=<token>` for non-local deployments.

Kennel/OpenAI-compatible clients should point base URL to:

```text
http://127.0.0.1:7700/proxy/v1
```

## 2) Send Kennel correlation headers

Attach these headers on agent-originated proxy calls:

- `X-Observe-Session-Id`
- `X-Observe-User-Id`
- `X-Observe-Tenant-Id`
- `X-Observe-Project-Id`
- `X-Observe-Workflow-Id`
- `X-Observe-Task-Id`
- `X-Observe-Correlation-Id`

If headers are not available, you can still provide `tenant_id`, `project_id`, `workflow_id`, `task_id`, and `correlation_id` in JSON payloads.

## 3) Verify ingestion and filtering end-to-end

The commands below run a local stub upstream, start Watchdog, send a Kennel-like request, and validate filterable telemetry fields.

1. Start a local OpenAI-compatible stub:

```bash
cd "$WATCHDOG_ROOT"
node -e "const http=require('http');const s=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({id:'kennel-guide',model:'stub-model',choices:[{message:{content:'ok'},finish_reason:'stop'}],usage:{prompt_tokens:3,completion_tokens:2,total_tokens:5}}));});s.listen(8860,'127.0.0.1');setInterval(()=>{},1<<30);"
```

2. Configure Watchdog proxy routing for that stub:

```bash
cd "$WATCHDOG_ROOT"
cat > tmp/kennel-guide-proxy.json <<'JSON'
{
  "upstream_base_url": "http://127.0.0.1:8860/v1",
  "auth_mode": "passthrough",
  "upstream_api_key": "",
  "upstream_api_key_env": ""
}
JSON
```

3. Start Watchdog with isolated runtime paths:

```bash
cd "$WATCHDOG_ROOT"
WDG_PORT=7780 \
WDG_API_AUTH_MODE=off \
WDG_DB_PATH=tmp/kennel-guide.db \
WDG_PROXY_CONFIG_PATH=tmp/kennel-guide-proxy.json \
KUJO_BIN=${KUJO_BIN:-kujo} "$KUJO_BIN" run --interpreter dashboard_server.kujo
```

4. Send a Kennel-style proxy request with correlation headers:

```bash
curl -s -X POST http://127.0.0.1:7780/proxy/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'X-Observe-Session-Id: kennel_sess_1' \
  -H 'X-Observe-User-Id: user_demo' \
  -H 'X-Observe-Tenant-Id: tenant_blue' \
  -H 'X-Observe-Project-Id: project_checkout' \
  -H 'X-Observe-Workflow-Id: wf_orders' \
  -H 'X-Observe-Task-Id: task_ranker' \
  -H 'X-Observe-Correlation-Id: corr_123' \
  -d '{"model":"gpt-4.1-mini","messages":[{"role":"user","content":"integration test"}]}'
```

5. Verify API filters and exports:

```bash
curl -s 'http://127.0.0.1:7780/api/requests?tenant_id=tenant_blue&project_id=project_checkout&workflow_id=wf_orders'
curl -s 'http://127.0.0.1:7780/api/export?tenant_id=tenant_blue&project_id=project_checkout&format=jsonl' | head -n 5
```

6. Open dashboard and confirm request row metadata:

```text
http://127.0.0.1:7780/
```

In the Requests tab, use Tenant ID and Project ID filters to scope rows.

## 4) Recommended Kennel field mapping

| Kennel context | Watchdog header/payload field |
|---|---|
| Run/session identifier | `X-Observe-Session-Id` or `session_id` |
| End-user identifier | `X-Observe-User-Id` or `user_id` |
| Tenant/org scope | `X-Observe-Tenant-Id` or `tenant_id` |
| Project/workspace scope | `X-Observe-Project-Id` or `project_id` |
| Workflow name/id | `X-Observe-Workflow-Id` or `workflow_id` |
| Task/step name/id | `X-Observe-Task-Id` or `task_id` |
| Trace correlation id | `X-Observe-Correlation-Id` or `correlation_id` |

## 5) Troubleshooting

- Symptom: `401 Unauthorized` from `/api/*`.
  - Check: `WDG_API_AUTH_MODE` and `WDG_API_AUTH_TOKEN`; include `X-Watchdog-Token` if token mode is enabled.

- Symptom: Proxy returns `500` with `auth_mode=override requires ...`.
  - Check: set `WDG_UPSTREAM_API_KEY` (or `WDG_UPSTREAM_API_KEY_ENV`) when proxy config uses override mode.

- Symptom: Tenant/project filters return no rows.
  - Check: header spelling (`X-Observe-Tenant-Id`, `X-Observe-Project-Id`) and payload fallback fields (`tenant_id`, `project_id`).

- Symptom: Dashboard shows expected row but export is missing records.
  - Check: `since_ms`/`until_ms` filter bounds and `session_id`/tenant/project query filters used on `/api/export`.

- Symptom: Proxy calls fail during local validation.
  - Check: stub process is running on expected port and `WDG_PROXY_CONFIG_PATH` points to matching `upstream_base_url`.
