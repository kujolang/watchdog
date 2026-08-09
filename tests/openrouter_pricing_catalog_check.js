#!/usr/bin/env node

const assert = require('assert');
const path = require('path');
const {
	loadProviderCatalog,
	loadOpenRouterCatalog,
	resolvePricing,
	computeBreakdown
} = require('../scripts/pricing_catalog_lib');

const root = path.join(__dirname, '..');
const providerCatalog = loadProviderCatalog(path.join(root, 'config', 'provider_pricing_catalog.json'));
const openrouterCatalog = loadOpenRouterCatalog(path.join(root, 'config', 'openrouter_pricing_catalog.json'));

const gpt54 = resolvePricing('openai/gpt-5.4', { providerCatalog, openrouterCatalog });
assert.equal(gpt54.pricing_kind, 'catalog');
assert.equal(gpt54.input_rate_per_million, 2.5);
assert.equal(gpt54.output_rate_per_million, 15);
assert.equal(gpt54.cached_input_rate_per_million, 0.25);

const opus5 = resolvePricing('anthropic/claude-opus-5', { providerCatalog, openrouterCatalog });
assert.equal(opus5.pricing_kind, 'catalog');
assert.equal(opus5.input_rate_per_million, 5);
assert.equal(opus5.output_rate_per_million, 25);
assert.equal(opus5.cache_write_input_rate_per_million, 6.25);

const glm52 = resolvePricing('z-ai/glm-5.2', { providerCatalog, openrouterCatalog });
assert.equal(glm52.input_rate_per_million, 0.07);
assert.equal(glm52.output_rate_per_million, 0.22);
assert.equal(glm52.cached_input_rate_per_million, 0.013);

const alias = resolvePricing('~anthropic/claude-haiku-latest', { providerCatalog, openrouterCatalog });
assert.equal(alias.pricing_kind, 'catalog');
assert.equal(alias.priced_model, 'anthropic/claude-haiku-4.5');
assert.equal(alias.input_rate_per_million, 1);
assert.equal(alias.output_rate_per_million, 5);

const openaiDirect = resolvePricing('gpt-4.1', { providerCatalog, openrouterCatalog });
assert.equal(openaiDirect.pricing_kind, 'catalog');
assert.equal(openaiDirect.pricing_source, 'openai-api-pricing:2026-07-19');
assert.equal(openaiDirect.cached_input_rate_per_million, 0.5);

const deepSeekChat = resolvePricing('deepseek-chat', { providerCatalog, openrouterCatalog });
assert.equal(deepSeekChat.pricing_kind, 'catalog');
assert.equal(deepSeekChat.priced_model, 'deepseek-chat');
assert.equal(deepSeekChat.pricing_source, 'deepseek-pricing:2026-08-02');
assert.equal(deepSeekChat.input_rate_per_million, 0.27);
assert.equal(deepSeekChat.cached_input_rate_per_million, 0.07);
assert.equal(deepSeekChat.output_rate_per_million, 1.1);

const deepSeekReasoner = resolvePricing('deepseek-reasoner', { providerCatalog, openrouterCatalog });
assert.equal(deepSeekReasoner.priced_model, 'deepseek-reasoner');
assert.equal(deepSeekReasoner.input_rate_per_million, 0.55);
assert.equal(deepSeekReasoner.cached_input_rate_per_million, 0.14);
assert.equal(deepSeekReasoner.output_rate_per_million, 2.19);

const ollamaKimiK3 = resolvePricing('kimi-k3:cloud', { providerCatalog, openrouterCatalog });
assert.equal(ollamaKimiK3.pricing_kind, 'unknown');
assert.equal(ollamaKimiK3.priced_model, 'kimi-k3');
assert.match(ollamaKimiK3.pricing_source, /^ollama-cloud-unpriced:/);

const ollamaEquivalent = resolvePricing('kimi-k2.6', { providerCatalog, openrouterCatalog });
assert.equal(ollamaEquivalent.pricing_kind, 'catalog');
assert.equal(ollamaEquivalent.input_rate_per_million, 0.95);
assert.equal(ollamaEquivalent.cached_input_rate_per_million, 0.16);

const sonnetBreakdown = computeBreakdown('anthropic/claude-sonnet-5', {
	input_tokens: 1000,
	output_tokens: 200,
	cached_input_tokens: 500,
	cache_write_input_tokens: 250
}, { providerCatalog, openrouterCatalog });
assert.equal(sonnetBreakdown.input_cost_usd, 0.002);
assert.equal(sonnetBreakdown.output_cost_usd, 0.002);
assert.equal(sonnetBreakdown.cached_input_cost_usd, 0.0001);
assert.equal(sonnetBreakdown.cache_write_input_cost_usd, 0.000625);

const unpricedAudio = resolvePricing('whisper-1', { providerCatalog, openrouterCatalog });
assert.equal(unpricedAudio.pricing_kind, 'unknown');
assert.equal(unpricedAudio.pricing_source, 'openai-api-pricing:2026-07-19#audio-minute-pricing');

const unpricedDeepSeek = resolvePricing('deepseek-v3.1-pro', { providerCatalog, openrouterCatalog });
assert.equal(unpricedDeepSeek.pricing_kind, 'unknown');
assert.equal(unpricedDeepSeek.pricing_source, 'deepseek-pricing:2026-07-19:not-listed-on-current-public-pricing-page');

const fallback = resolvePricing('unknown/provider-model', { providerCatalog, openrouterCatalog });
assert.equal(fallback.pricing_kind, 'fallback');
assert.equal(fallback.pricing_source, 'watchdog-fallback-estimate:v1');

const unknown = resolvePricing('openrouter/auto-beta', { providerCatalog, openrouterCatalog });
assert.equal(unknown.pricing_kind, 'unknown');
assert.equal(unknown.input_rate_per_million, 0);
assert.equal(unknown.output_rate_per_million, 0);

console.log('openrouter_pricing_catalog_check: PASS');
