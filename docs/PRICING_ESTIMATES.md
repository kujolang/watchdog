# Direct API value estimates

Watchdog's cost fields represent an estimated direct-API equivalent value. They are not an Ollama Cloud invoice and do not change what a subscription account is charged.

When trusted external telemetry, including AI Chat telemetry, omits `cost_usd`, Watchdog calculates the estimate from reported input and output tokens for known models. An explicitly supplied `cost_usd` is preserved. Existing zero-cost rows for known models are backfilled once by schema migration `0007_direct_api_cost_estimates`; historical AI Chat rows are repriced once by `0008_ai_chat_direct_api_reprice` because that integration previously omitted cost and could receive the generic fallback rate.

## Ollama Cloud model mappings

Rates are USD per million tokens and were verified on 2026-07-16.

| Watchdog model aliases | Direct provider model | Input | Output | Source |
| --- | --- | ---: | ---: | --- |
| `glm-5.2`, `glm-5.2:cloud` | GLM-5.2 | $1.40 | $4.40 | [Z.ai pricing](https://docs.z.ai/guides/overview/pricing) |
| `kimi-k2.7-code`, `kimi-k2.7-code:cloud` | Kimi K2.7 Code | $0.95 | $4.00 | [Kimi pricing](https://platform.kimi.ai/docs/pricing/chat-k27-code) |
| `minimax-m3`, `minimax-m3:cloud` | MiniMax-M3, current direct PAYG rate | $0.30 | $1.20 | [MiniMax pricing](https://platform.minimax.io/subscribe/token-plan?tab=api-enterprise) |
| `qwen3.5`, `qwen3.5:397b`, `qwen3.5:397b-cloud`, `qwen3.5-397b-a17b` | Qwen3.5-397B-A17B, international deployment up to 256K context | $0.60 | $3.60 | [Alibaba Cloud Model Studio pricing](https://www.alibabacloud.com/help/en/model-studio/model-pricing) |

Request totals use standard input and output rates. Granular traces also store reported cached-input and cache-write token counts for visibility; the current estimate still applies the standard input rate because provider-specific cache discounts are not yet represented in the pricing table. Qwen's generic aliases assume the 397B Ollama Cloud model. Provider pricing can change, so update the shared pricing table and this document together.
