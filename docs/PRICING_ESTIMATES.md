# Direct API value estimates

Watchdog records `cost_usd` as one of four clearly labeled kinds:

- `catalog`: estimated from a versioned provider or catalog rate table
- `fallback`: estimated from Watchdog's generic fallback rate for an unknown model
- `provider_reported`: copied from trusted upstream telemetry that supplied its own cost
- `unknown`: model recognized but unpriced, so Watchdog records provenance without a cost estimate

For direct provider traffic and provider-backed aliases, Watchdog loads rates from the checked-in local catalog at [`config/provider_pricing_catalog.json`](../config/provider_pricing_catalog.json). That catalog currently covers direct OpenAI, Anthropic, Google Gemini, Moonshot Kimi, Z.AI GLM, MiniMax, DeepSeek, and a bounded set of Ollama Cloud aliases whose closest public per-token pricing basis is known.

For OpenRouter traffic, Watchdog loads rates from the checked-in public catalog snapshot at [`config/openrouter_pricing_catalog.json`](../config/openrouter_pricing_catalog.json). The snapshot is refreshed from OpenRouter's public, unauthenticated Models API and can include input, output, cached-input, and cache-write rates when OpenRouter publishes them. Historical data is not silently repriced during startup.

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

Common `pricing_source` patterns:

- `openai-api-pricing:2026-07-19`
- `anthropic-pricing:2026-07-19:intro-through-2026-08-31-assume-5m-cache-write`
- `google-gemini-pricing:2026-07-19`
- `moonshot-kimi-pricing:2026-07-19`
- `ollama-cloud-equivalent:*`
- `deepseek-pricing:2026-08-16`
- `openai-api-pricing:2026-08-23:standard-short-context`
- `openrouter-public-catalog:2026-08-23`
- `watchdog-fallback-estimate:v1`

## Reprice historical records

Use the explicit repricing script. It is dry-run by default and requires at least one bounded selector such as a date range, model list, or source app.

Dry-run:

```bash
node scripts/reprice_watchdog_requests.js \
  --db=data/watchdog.db \
  --provider-catalog=config/provider_pricing_catalog.json \
  --source-app=ai-chat \
  --from-ms=1784332800000 \
  --until-ms=1784419199999
```

Apply:

```bash
node scripts/reprice_watchdog_requests.js \
  --db=data/watchdog.db \
  --provider-catalog=config/provider_pricing_catalog.json \
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
  --provider-catalog=config/provider_pricing_catalog.json \
  --source-app=ai-chat \
  --from-ms=1784332800000 \
  --until-ms=1784419199999 \
  --models='openai/gpt-5.4,openai/gpt-5.3-codex,openai/gpt-5.5,openai/gpt-5.6-terra,openai/gpt-5.4-mini,anthropic/claude-sonnet-5,anthropic/claude-opus-4.8,~anthropic/claude-haiku-latest,google/gemini-2.5-pro,google/gemini-3.5-flash,google/gemini-3.1-flash-lite,deepseek/deepseek-v4-pro,minimax/minimax-m3,z-ai/glm-5.2,x-ai/grok-4.5,moonshotai/kimi-k2.7-code,moonshotai/kimi-k2.6,mistralai/devstral-2512,mistralai/mistral-medium-3-5,nvidia/nemotron-3-ultra-550b-a55b'
```

Apply the same command with `--apply` once the dry-run output looks correct.

## Provider catalog coverage

The local provider catalog is intentionally versioned and explicit. As of August 23, 2026 it includes:

- direct OpenAI text-token models used by AI Chat such as `gpt-4.1`, `gpt-4.1-mini`, and `o4-mini`, plus the current Codex inventory models `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.4`, and `gpt-5.4-mini`; `gpt-daybreak-blue-latest` uses OpenAI's documented `gpt-5.6-sol` alias basis, while non-public-API `gpt-5.3-codex-spark` remains explicitly `unknown`
- direct Anthropic models such as `claude-sonnet-5`, `claude-opus-4.8`, and `claude-haiku-4.5`
- direct Google Gemini models such as `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3-flash-preview`, `gemini-3.5-flash`, and `gemini-3.5-flash-lite`
- direct Moonshot Kimi models such as `kimi-k2.7-code`, `kimi-k2.6`, and `kimi-k2.5`
- direct Z.AI, MiniMax, and DeepSeek model IDs already surfaced by AI Chat; deprecated DeepSeek `deepseek-chat` and `deepseek-reasoner` now resolve to the public `deepseek-v4-flash` non-thinking and thinking compatibility modes, while `deepseek-v4-pro` uses the current $0.435/M cache-miss input rate
- Ollama Cloud aliases only when there is a defensible public per-token equivalent from the underlying model provider

Current direct-provider gaps are also explicit. `deepseek-v3.1-pro` and `deepseek-v3.1-flash` are recognized in the provider catalog but intentionally remain `unknown` because DeepSeek's current public pricing page no longer lists public rates for those model IDs.

AI Chat now includes Ollama Cloud's `kimi-k3:cloud`. Ollama publishes it as
subscription usage and the public OpenRouter catalog publishes an OpenRouter
route, but Moonshot does not currently publish a direct Kimi K3 per-token API
rate. Watchdog therefore records the Ollama route as `unknown` instead of
borrowing OpenRouter pricing or applying the generic fallback estimate.

Ollama itself does not publish a public per-model token price table. When Watchdog uses an `ollama-cloud-equivalent:*` source, the estimate is based on the underlying provider's public pricing, not on an Ollama invoice or GPU-time statement.

The current AI Chat Ollama Cloud inventory records `kimi-k3:cloud` as explicitly
unknown and still falls back to Watchdog's generic estimate for `gpt-oss:120b`, `gpt-oss:20b`,
`mistral-large-3:675b`, `gemma4:31b`, `nemotron-3-ultra`,
`nemotron-3-nano:30b`, `nemotron-3-super`, and `qwen3.5:397b`. Their
Ollama-hosted deployments do not have a trustworthy public per-token price or
an exact documented upstream-equivalent mapping, so Watchdog does not assign a
model-specific catalog rate.

## Limitations

- Catalog pricing is still an estimate, not an invoice.
- Some direct-provider features still cannot be priced exactly from token counts alone. Examples include OpenAI audio-minute billing, Anthropic cache-write TTL selection, and provider pages that publish prompt-length breakpoints Watchdog's static snapshot cannot yet encode. The GPT-5.4, GPT-5.5, and GPT-5.6 rows therefore use standard short-context rates; requests above OpenAI's documented long-context threshold can cost more than Watchdog estimates.
- OpenRouter routing, workspace discounts, negotiated rates, and future price changes may differ from the snapshot Watchdog used at ingest time.
- Ollama Cloud usage is measured by Ollama infrastructure utilization, not a public per-token invoice schedule, so `ollama-cloud-equivalent:*` rows are best-effort comparability estimates.
- Historical prices are not reconstructed automatically; a reprice run uses the current local catalog snapshot and records that provenance.
- Some OpenRouter models are intentionally left `unknown` when the public catalog marks pricing as unavailable.
- Google Gemini and MiniMax catalog rows use the currently published lower prompt-length tier when providers publish multiple token-price tiers for longer prompts.

## Benchmark reporting guidance

Future AI Chat benchmark reports should separate:

- clean final-response cost: the successful terminal response for each pane or benchmark test
- retry-inclusive spend: every attempt, including failed, cancelled, or retried provider rounds

In Watchdog terms, `successful_cost_usd` is the cleaner "final answer landed" view, while `total_cost_usd` remains the full retry-inclusive spend number.
