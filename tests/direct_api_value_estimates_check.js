#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const shared = fs.readFileSync(path.join(root, 'src/watchdog_shared.kujo'), 'utf8');
const server = fs.readFileSync(path.join(root, 'src/dashboard_server.kujo'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'src/dashboard.html'), 'utf8');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'config/openrouter_pricing_catalog.json'), 'utf8'));

function contains(text, expected, message) {
	if (!text.includes(expected)) throw new Error(message + ': missing ' + expected);
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

contains(shared, 'DEFAULT_OPENROUTER_PRICING_CATALOG_PATH := "config/openrouter_pricing_catalog.json"', 'Shared module should load a checked-in OpenRouter catalog');
contains(shared, 'watchdog-fallback-estimate:v1', 'Fallback pricing should be explicitly marked');
contains(shared, '"pricing_kind": "fallback"', 'Unknown models should remain explicit fallback estimates');
contains(shared, '"pricing_kind": "unknown"', 'Known-but-unpriced models should remain explicit unknowns');
contains(shared, 'ALTER TABLE requests ADD COLUMN cached_input_rate_per_million REAL NOT NULL DEFAULT 0.0', 'Request pricing provenance should persist cache read rates');
contains(shared, 'ALTER TABLE traces ADD COLUMN cache_write_input_rate_per_million REAL NOT NULL DEFAULT 0.0', 'Trace pricing provenance should persist cache write rates');
contains(shared, 'CREATE TABLE IF NOT EXISTS pricing_reprice_runs', 'Reprice runs should be auditable');
contains(shared, 'CREATE TABLE IF NOT EXISTS pricing_reprice_changes', 'Reprice changes should preserve before/after records');
contains(server, 'usage["cached_input_tokens"]', 'Proxy intake should persist cached token counts');
contains(server, 'pricing_kind_override == "provider_reported"', 'Provider-reported costs should remain distinguishable');
contains(server, 'pricing_source = "provider-reported-cost"', 'Provider-reported provenance should be explicit');
contains(server, 'cached_input_cost_usd', 'Request persistence should store cache-cost components');
contains(dashboard, 'Est. API Value', 'Dashboard summary label should remain present');

assert(catalog.catalog_id === 'openrouter-public-catalog:2026-07-18', 'Catalog snapshot should be versioned with the refresh date');
assert(catalog.models['openai/gpt-5.4'].input_rate_per_million === 2.5, 'GPT-5.4 prompt pricing should come from the catalog');
assert(catalog.models['anthropic/claude-sonnet-5'].cache_write_input_rate_per_million === 2.5, 'Claude Sonnet 5 cache write pricing should come from the catalog');
assert(catalog.aliases['~anthropic/claude-haiku-latest'].target_model_id === 'anthropic/claude-haiku-4.5', 'Alias map should normalize Claude Haiku latest');

console.log('direct_api_value_estimates_check: PASS');
