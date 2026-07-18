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

const alias = resolvePricing('~anthropic/claude-haiku-latest', { providerCatalog, openrouterCatalog });
assert.equal(alias.pricing_kind, 'catalog');
assert.equal(alias.priced_model, 'anthropic/claude-haiku-4.5');
assert.equal(alias.input_rate_per_million, 1);
assert.equal(alias.output_rate_per_million, 5);

const openaiDirect = resolvePricing('gpt-4.1', { providerCatalog, openrouterCatalog });
assert.equal(openaiDirect.pricing_kind, 'catalog');
assert.equal(openaiDirect.pricing_source, 'openai-api-pricing:2026-07-18');
assert.equal(openaiDirect.cached_input_rate_per_million, 0.5);

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
assert.equal(unpricedAudio.pricing_source, 'openai-api-pricing:2026-07-18#audio-minute-pricing');

const fallback = resolvePricing('unknown/provider-model', { providerCatalog, openrouterCatalog });
assert.equal(fallback.pricing_kind, 'fallback');
assert.equal(fallback.pricing_source, 'watchdog-fallback-estimate:v1');

const unknown = resolvePricing('openrouter/auto-beta', { providerCatalog, openrouterCatalog });
assert.equal(unknown.pricing_kind, 'unknown');
assert.equal(unknown.input_rate_per_million, 0);
assert.equal(unknown.output_rate_per_million, 0);

console.log('openrouter_pricing_catalog_check: PASS');
