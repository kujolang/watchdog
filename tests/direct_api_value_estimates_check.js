#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const shared = fs.readFileSync(path.join(root, 'src/watchdog_shared.kujo'), 'utf8');
const server = fs.readFileSync(path.join(root, 'src/dashboard_server.kujo'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'src/dashboard.html'), 'utf8');
const providerCatalog = JSON.parse(fs.readFileSync(path.join(root, 'config/provider_pricing_catalog.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'config/openrouter_pricing_catalog.json'), 'utf8'));

function contains(text, expected, message) {
	if (!text.includes(expected)) throw new Error(message + ': missing ' + expected);
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

contains(shared, 'DEFAULT_PROVIDER_PRICING_CATALOG_PATH := "config/provider_pricing_catalog.json"', 'Shared module should load a checked-in provider catalog');
contains(shared, 'DEFAULT_OPENROUTER_PRICING_CATALOG_PATH := "config/openrouter_pricing_catalog.json"', 'Shared module should load a checked-in OpenRouter catalog');
contains(shared, 'lookup_catalog_pricing_record(PROVIDER_PRICING_CATALOG, "ollama-cloud/" + model_key)', 'Ollama cloud aliases should resolve through the provider catalog');
contains(shared, 'watchdog-fallback-estimate:v1', 'Fallback pricing should be explicitly marked');
contains(shared, '"pricing_kind": "fallback"', 'Unknown models should remain explicit fallback estimates');
contains(shared, '"pricing_kind": "unknown"', 'Known-but-unpriced models should remain explicit unknowns');
contains(shared, 'ALTER TABLE requests ADD COLUMN cached_input_rate_per_million REAL NOT NULL DEFAULT 0.0', 'Request pricing provenance should persist cache read rates');
contains(shared, 'ALTER TABLE traces ADD COLUMN cache_write_input_rate_per_million REAL NOT NULL DEFAULT 0.0', 'Trace pricing provenance should persist cache write rates');
contains(shared, 'CREATE TABLE IF NOT EXISTS pricing_reprice_runs', 'Reprice runs should be auditable');
contains(shared, 'CREATE TABLE IF NOT EXISTS pricing_reprice_changes', 'Reprice changes should preserve before/after records');
contains(server, 'cached_tokens := to_int_or_zero(safe_dict_get(trace, "cached_input_tokens", 0))', 'Trace intake should persist cached token counts');
contains(server, 'cache_write_tokens := to_int_or_zero(safe_dict_get(trace, "cache_write_input_tokens", 0))', 'Trace intake should persist cache write token counts');
contains(server, 'cached_input_tokens = traces.cached_input_tokens + excluded.cached_input_tokens', 'Trace persistence should accumulate cached token counts');
contains(server, 'input_cost_usd = traces.input_cost_usd + excluded.input_cost_usd', 'Trace persistence should store cost components');
contains(dashboard, 'Est. API Value', 'Dashboard summary label should remain present');

assert(providerCatalog.catalog_id === 'watchdog-provider-catalog:2026-07-26', 'Provider catalog snapshot should be versioned with the refresh date');
assert(providerCatalog.models['gpt-4.1'].cached_input_rate_per_million === 0.5, 'Direct OpenAI prompt caching should come from the provider catalog');
assert(providerCatalog.models['claude-sonnet-5'].cache_write_input_rate_per_million === 2.5, 'Anthropic cache write assumptions should be explicit in the provider catalog');
assert(providerCatalog.models['gemini-3.5-flash'].output_rate_per_million === 9, 'Current Gemini 3.5 Flash output pricing should come from Google');
assert(providerCatalog.models['gemini-3.5-flash-lite'].cached_input_rate_per_million === 0.03, 'Current Gemini 3.5 Flash-Lite cache pricing should come from Google');
assert(providerCatalog.models['deepseek-v3.1-pro'].has_pricing === false, 'Direct DeepSeek models without current public rates should stay explicitly unknown');
assert(providerCatalog.aliases['ollama-cloud/kimi-k2.6'].target_model_id === 'kimi-k2.6', 'Ollama cloud aliases should point at their pricing basis');
assert(catalog.catalog_id === 'openrouter-public-catalog:2026-07-26', 'Catalog snapshot should be versioned with the refresh date');
assert(catalog.models['openai/gpt-5.4'].input_rate_per_million === 2.5, 'GPT-5.4 prompt pricing should come from the catalog');
assert(catalog.models['anthropic/claude-sonnet-5'].cache_write_input_rate_per_million === 2.5, 'Claude Sonnet 5 cache write pricing should come from the catalog');
assert(catalog.aliases['~anthropic/claude-haiku-latest'].target_model_id === 'anthropic/claude-haiku-4.5', 'Alias map should normalize Claude Haiku latest');

console.log('direct_api_value_estimates_check: PASS');
