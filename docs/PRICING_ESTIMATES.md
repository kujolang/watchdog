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

The October 25, 2026 snapshot contains 467 models. It adds newly advertised
routes including Kimi K3.1 Pro, MiniMax M3.1 Flash, Recursive Flint, Inception
Mercury 3, and Liquid LFM2.5 2.6B, removes nine routes no longer advertised by
the catalog, and preserves the current route-specific prices exactly as returned by OpenRouter.
These are OpenRouter route estimates, not direct-provider prices.

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
- `anthropic-pricing:2026-09-06:launch-rate-confirmed-standard-assume-5m-cache-write`
- `google-gemini-pricing:2026-07-19`
- `moonshot-kimi-pricing:2026-07-19`
- `ollama-cloud-equivalent:*`
- `deepseek-pricing:2026-09-20:*`
- `openai-api-pricing:2026-08-23:standard-short-context`
- `openai-api-pricing:2026-08-30:promotional-through-at-least-2026-11-21:standard-short-context`
- `openai-api-pricing:2026-09-27:standard-short-context`
- `openai-api-pricing:2026-10-04:standard-short-context`
- `anthropic-pricing:2026-09-27:standard-assume-5m-cache-write`
- `anthropic-pricing:2026-10-11:standard-assume-5m-cache-write`
- `xai-api-pricing:2026-08-30:standard-short-context`
- `openrouter-public-catalog:2026-10-18`
- `openrouter-public-catalog:2026-10-25`
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

The local provider catalog is intentionally versioned and explicit. As of October 25, 2026 it includes:

- direct OpenAI text-token models used by AI Chat such as `gpt-4.1`, `gpt-4.1-mini`, and `o4-mini`, plus current Codex/API inventory models `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.4`, and `gpt-5.4-mini`; GPT-6.1 Sol uses OpenAI's current $2 input, $10 output, $0.10 cache-read, and $2.50 cache-write standard short-context rates, `gpt-5.6-sol` and the `gpt-daybreak-blue-latest` equivalent retain their documented promotional rates, and non-public-API `gpt-5.3-codex-spark` remains explicitly `unknown`
- direct Anthropic models such as `claude-sonnet-5`, `claude-sonnet-5.5`, `claude-opus-5.5`, `claude-opus-4.8`, `claude-haiku-5.5`, and `claude-haiku-4.5`; Sonnet 5.5 uses Anthropic's current $2 input, $10 output, $0.10 cache-read, and five-minute $2.50 cache-write rates per million tokens, while Haiku 5.5 uses the published short-context tier through 100,000 prompt tokens
- direct Google Gemini models such as `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3-flash-preview`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, and `gemini-3.8-flash`; the Gemini 3.8 Flash row records its introductory rate through December 31, 2026
- direct Moonshot Kimi models such as `kimi-k3`, `kimi-k2.7-code`, `kimi-k2.6`, and `kimi-k2.5`; Kimi K3 includes Moonshot's separately published cache-write rate
- direct Z.AI, MiniMax, and DeepSeek model IDs already surfaced by AI Chat; DeepSeek's current `deepseek-flash` and `deepseek-v4.1-flash` IDs plus the legacy `deepseek-chat`, `deepseek-reasoner`, and `deepseek-v4-flash` IDs resolve to the current V4.1 Flash pricing basis. Because DeepSeek varies rates by UTC schedule and Watchdog does not store a pricing-time tier, these rows use the documented peak rates ($0.30 cache-miss input, $0.006 cache-hit input, and $1.20 output per million tokens); `deepseek-v4-pro` likewise uses its peak $1.32/$0.044/$3.96 rates rather than understating requests made during peak hours
- direct xAI equivalents for the active AI Chat OAuth inventory (`grok-4.20-0309-*`, `grok-4.20-multi-agent-0309`, `grok-4.3`, `grok-4.5`, `grok-4.6`, and `grok-build-0.1`) using xAI's public standard short-context token rates; these are direct-API value estimates, not OAuth subscription invoices
- Ollama Cloud aliases use Ollama's public per-model token table when an exact route is listed, and otherwise use a defensible public upstream equivalent only when the mapping is exact

Current direct-provider gaps are also explicit. `deepseek-v3.1-pro` and
`deepseek-v3.1-flash` remain `unknown` because DeepSeek's current public pricing
page no longer lists those IDs. Z.AI now publishes direct prices for `glm-5.3`
and `glm-5.3-flash`, so those routes have catalog coverage.

AI Chat includes Ollama Cloud's `kimi-k3:cloud`. Moonshot and Ollama both now
publish $3 input, $0.30 cached-input, and $15 output rates per million tokens;
Moonshot also publishes a $3 cache-write rate for its direct API. Watchdog keeps
the Ollama route's source distinct because Ollama's table does not list a
separate cache-write charge.

Ollama now publishes a public per-model token price table. Watchdog uses
dated `ollama-cloud-pricing:*` provenance for exact listed routes. Older
`ollama-cloud-equivalent:*` entries remain only where an exact upstream mapping
is documented but Ollama's table does not list that route.

The current AI Chat Ollama Cloud inventory now has exact published coverage for
`kimi-k3:cloud`, `gpt-oss:120b`, `gpt-oss:20b`, `mistral-large-3:675b`,
`gemma4:31b`, `nemotron-3-ultra`, `nemotron-3-nano:30b`, `nemotron-3-super`,
and `qwen3.5:397b`. Ollama now publishes Qwen 3.5 397B at $0.60 input and
$3.60 output per million tokens without a separate cached-input rate.

AI Chat's Hermes/Nous Portal suggestions are explicitly `unknown` when their
provider-specific IDs do not have a stable, exact mapping in the current public
Nous or OpenRouter catalogs. Although some suggestions are labeled free by the
consumer app, Watchdog does not infer a zero token rate from a stale suggestion
alone. Removed or unlisted OpenRouter suggestions such as `tencent/hy3:free`,
`poolside/laguna-m1:free`, `inclusionai/ling-3.0-flash-fin:free`,
`meituan/longcat-2.5-preview:free`, `anthropic/claude-opus-4.8-fast`, and
`openrouter/owl-alpha` and the Hermes-only `stealth/missingno` are also explicit
unknowns rather than generic paid fallbacks. The Anthropic fast suggestion is not mapped to direct Fast mode
pricing because OpenRouter no longer advertises that route and its routing and
billing semantics cannot be assumed from the name alone.

## Limitations

- Catalog pricing is still an estimate, not an invoice.
- Some direct-provider features still cannot be priced exactly from token counts alone. Examples include OpenAI audio-minute billing, Anthropic cache-write TTL selection, and provider pages that publish prompt-length breakpoints Watchdog's static snapshot cannot yet encode. The GPT-5.4, GPT-5.5, GPT-5.6, GPT-6, GPT-6.1, and xAI Grok rows therefore use standard short-context rates; requests above a provider's documented long-context threshold can cost more than Watchdog estimates.
- Pricing lookup currently receives only the model ID, not the selected upstream profile. When a plain Ollama Cloud model ID exactly collides with a direct-provider ID but the two providers charge different rates, Watchdog uses the direct-provider row. For example, plain `minimax-m3` uses MiniMax's current $0.30/$0.06/$1.20 promotional short-context rates rather than Ollama Cloud's $0.60/$0.12/$2.40 rates. Provider-qualified and non-colliding Ollama aliases retain Ollama provenance.
- Gemini 3.8 Flash's introductory direct rate is documented through December 31, 2026. Refresh the direct provider catalog after that date before treating the current $0.75/$3.75 row as authoritative for new telemetry.
- OpenRouter routing, workspace discounts, negotiated rates, and future price changes may differ from the snapshot Watchdog used at ingest time.
- Ollama Cloud now publishes per-token prices for a bounded model table. Routes not in that table retain documented upstream-equivalent estimates only when the mapping is exact; those `ollama-cloud-equivalent:*` rows are comparability estimates rather than Ollama invoice rates.
- Pricing resolution currently receives the model ID but not the selected upstream profile. For bare Ollama model IDs that also exist as direct-provider IDs, provenance can identify the underlying provider price without identifying the Ollama route; the stored request `provider` field remains the route-level source of truth.
- Historical prices are not reconstructed automatically; a reprice run uses the current local catalog snapshot and records that provenance.
- Some OpenRouter models are intentionally left `unknown` when the public catalog marks pricing as unavailable.
- Google Gemini and MiniMax catalog rows use the currently published lower prompt-length tier when providers publish multiple token-price tiers for longer prompts.

## Benchmark reporting guidance

Future AI Chat benchmark reports should separate:

- clean final-response cost: the successful terminal response for each pane or benchmark test
- retry-inclusive spend: every attempt, including failed, cancelled, or retried provider rounds

In Watchdog terms, `successful_cost_usd` is the cleaner "final answer landed" view, while `total_cost_usd` remains the full retry-inclusive spend number.
