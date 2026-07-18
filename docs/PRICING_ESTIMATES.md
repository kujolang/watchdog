# Direct API value estimates

Watchdog records `cost_usd` as one of four clearly labeled kinds:

- `catalog`: estimated from a versioned provider or catalog rate table
- `fallback`: estimated from Watchdog's generic fallback rate for an unknown model
- `provider_reported`: copied from trusted upstream telemetry that supplied its own cost
- `unknown`: model recognized but unpriced, so Watchdog records provenance without a cost estimate

For OpenRouter traffic, Watchdog now loads rates from the checked-in public catalog snapshot at [`config/openrouter_pricing_catalog.json`](../config/openrouter_pricing_catalog.json). The snapshot is refreshed from OpenRouter's public, unauthenticated Models API and can include input, output, cached-input, and cache-write rates when OpenRouter publishes them. Historical data is not silently repriced during startup.

## Refresh the OpenRouter catalog

Run this from the Watchdog repo root:

```bash
node scripts/refresh_openrouter_pricing_catalog.js
```

This fetches `https://openrouter.ai/api/v1/models`, applies the checked-in alias overrides from [`config/openrouter_pricing_aliases.json`](../config/openrouter_pricing_aliases.json), and rewrites the versioned catalog snapshot.

## Inspect pricing provenance

`GET /api/requests` and `GET /api/traces` now expose:

- `pricing_kind`
- `pricing_source`
- `priced_model`
- `input_rate_per_million`
- `output_rate_per_million`
- `cached_input_rate_per_million`
- `cache_write_input_rate_per_million`
- detailed cost components such as `cached_input_cost_usd`

Example:

```bash
curl -s 'http://127.0.0.1:7700/api/requests?source_app=ai-chat&pricing_kind=catalog' \
  | jq '.data[] | {request_id, model, priced_model, pricing_kind, pricing_source, cost_usd}'
```

## Reprice historical records

Use the explicit repricing script. It is dry-run by default and requires at least one bounded selector such as a date range, model list, or source app.

Dry-run:

```bash
node scripts/reprice_watchdog_requests.js \
  --db=data/watchdog.db \
  --source-app=ai-chat \
  --from-ms=1784332800000 \
  --until-ms=1784419199999
```

Apply:

```bash
node scripts/reprice_watchdog_requests.js \
  --db=data/watchdog.db \
  --source-app=ai-chat \
  --from-ms=1784332800000 \
  --until-ms=1784419199999 \
  --apply
```

Every applied run writes:

- `pricing_reprice_runs`: one row per reprice execution
- `pricing_reprice_changes`: before/after JSON for every changed request

That keeps historical replacements auditable instead of silently overwriting estimates.

## RND005 example

The July 18, 2026 RND005 OpenRouter benchmark models can be repriced with an explicit model bound:

```bash
node scripts/refresh_openrouter_pricing_catalog.js

node scripts/reprice_watchdog_requests.js \
  --db=data/watchdog.db \
  --source-app=ai-chat \
  --from-ms=1784332800000 \
  --until-ms=1784419199999 \
  --models='openai/gpt-5.4,openai/gpt-5.3-codex,openai/gpt-5.5,openai/gpt-5.6-terra,openai/gpt-5.4-mini,anthropic/claude-sonnet-5,anthropic/claude-opus-4.8,~anthropic/claude-haiku-latest,google/gemini-2.5-pro,google/gemini-3.5-flash,google/gemini-3.1-flash-lite,deepseek/deepseek-v4-pro,minimax/minimax-m3,z-ai/glm-5.2,x-ai/grok-4.5,moonshotai/kimi-k2.7-code,moonshotai/kimi-k2.6,mistralai/devstral-2512,mistralai/mistral-medium-3-5,nvidia/nemotron-3-ultra-550b-a55b'
```

Apply the same command with `--apply` once the dry-run output looks correct.

## Legacy direct-provider mappings

Watchdog still keeps a small local direct-provider table for older non-OpenRouter model aliases already used in the repository, including:

- `glm-5.2`, `glm-5.2:cloud`
- `kimi-k2.7-code`, `kimi-k2.7-code:cloud`
- `minimax-m3`, `minimax-m3:cloud`
- `qwen3.5`, `qwen3.5:397b`, `qwen3.5:397b-cloud`, `qwen3.5-397b-a17b`

Those rows are labeled as `catalog` estimates, but their `pricing_source` remains `watchdog-direct-provider-table:v1`.

## Limitations

- Catalog pricing is still an estimate, not an invoice.
- OpenRouter routing, workspace discounts, negotiated rates, and future price changes may differ from the snapshot Watchdog used at ingest time.
- Historical prices are not reconstructed automatically; a reprice run uses the current local catalog snapshot and records that provenance.
- Some OpenRouter models are intentionally left `unknown` when the public catalog marks pricing as unavailable.

## Benchmark reporting guidance

Future AI Chat benchmark reports should separate:

- clean final-response cost: the successful terminal response for each pane or benchmark test
- retry-inclusive spend: every attempt, including failed, cancelled, or retried provider rounds

In Watchdog terms, `successful_cost_usd` is the cleaner "final answer landed" view, while `total_cost_usd` remains the full retry-inclusive spend number.
