#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_CATALOG_PATH = path.join(ROOT, 'config', 'openrouter_pricing_catalog.json');

const DIRECT_PROVIDER_TABLE = {
	'gpt-4.1': { pricing_kind: 'catalog', pricing_source: 'watchdog-direct-provider-table:v1', priced_model: 'gpt-4.1', input_rate_per_million: 2.0, output_rate_per_million: 8.0, cached_input_rate_per_million: 0.0, cache_write_input_rate_per_million: 0.0 },
	'gpt-4.1-mini': { pricing_kind: 'catalog', pricing_source: 'watchdog-direct-provider-table:v1', priced_model: 'gpt-4.1-mini', input_rate_per_million: 0.4, output_rate_per_million: 1.6, cached_input_rate_per_million: 0.0, cache_write_input_rate_per_million: 0.0 },
	'gpt-4.1-nano': { pricing_kind: 'catalog', pricing_source: 'watchdog-direct-provider-table:v1', priced_model: 'gpt-4.1-nano', input_rate_per_million: 0.1, output_rate_per_million: 0.4, cached_input_rate_per_million: 0.0, cache_write_input_rate_per_million: 0.0 },
	'gpt-4o': { pricing_kind: 'catalog', pricing_source: 'watchdog-direct-provider-table:v1', priced_model: 'gpt-4o', input_rate_per_million: 2.5, output_rate_per_million: 10.0, cached_input_rate_per_million: 0.0, cache_write_input_rate_per_million: 0.0 },
	'gpt-4o-mini': { pricing_kind: 'catalog', pricing_source: 'watchdog-direct-provider-table:v1', priced_model: 'gpt-4o-mini', input_rate_per_million: 0.15, output_rate_per_million: 0.6, cached_input_rate_per_million: 0.0, cache_write_input_rate_per_million: 0.0 },
	'gpt-3.5-turbo': { pricing_kind: 'catalog', pricing_source: 'watchdog-direct-provider-table:v1', priced_model: 'gpt-3.5-turbo', input_rate_per_million: 0.5, output_rate_per_million: 1.5, cached_input_rate_per_million: 0.0, cache_write_input_rate_per_million: 0.0 },
	'deepseek-chat': { pricing_kind: 'catalog', pricing_source: 'watchdog-direct-provider-table:v1', priced_model: 'deepseek-chat', input_rate_per_million: 0.07, output_rate_per_million: 1.1, cached_input_rate_per_million: 0.0, cache_write_input_rate_per_million: 0.0 },
	'deepseek-reasoner': { pricing_kind: 'catalog', pricing_source: 'watchdog-direct-provider-table:v1', priced_model: 'deepseek-reasoner', input_rate_per_million: 0.55, output_rate_per_million: 2.19, cached_input_rate_per_million: 0.0, cache_write_input_rate_per_million: 0.0 },
	'openai/gpt-4.1-mini': { pricing_kind: 'catalog', pricing_source: 'watchdog-direct-provider-table:v1', priced_model: 'openai/gpt-4.1-mini', input_rate_per_million: 0.4, output_rate_per_million: 1.6, cached_input_rate_per_million: 0.0, cache_write_input_rate_per_million: 0.0 },
	'glm-5.2': { pricing_kind: 'catalog', pricing_source: 'watchdog-direct-provider-table:v1', priced_model: 'glm-5.2', input_rate_per_million: 1.4, output_rate_per_million: 4.4, cached_input_rate_per_million: 0.0, cache_write_input_rate_per_million: 0.0 },
	'glm-5.2:cloud': { pricing_kind: 'catalog', pricing_source: 'watchdog-direct-provider-table:v1', priced_model: 'glm-5.2:cloud', input_rate_per_million: 1.4, output_rate_per_million: 4.4, cached_input_rate_per_million: 0.0, cache_write_input_rate_per_million: 0.0 },
	'kimi-k2.7-code': { pricing_kind: 'catalog', pricing_source: 'watchdog-direct-provider-table:v1', priced_model: 'kimi-k2.7-code', input_rate_per_million: 0.95, output_rate_per_million: 4.0, cached_input_rate_per_million: 0.0, cache_write_input_rate_per_million: 0.0 },
	'kimi-k2.7-code:cloud': { pricing_kind: 'catalog', pricing_source: 'watchdog-direct-provider-table:v1', priced_model: 'kimi-k2.7-code:cloud', input_rate_per_million: 0.95, output_rate_per_million: 4.0, cached_input_rate_per_million: 0.0, cache_write_input_rate_per_million: 0.0 },
	'minimax-m3': { pricing_kind: 'catalog', pricing_source: 'watchdog-direct-provider-table:v1', priced_model: 'minimax-m3', input_rate_per_million: 0.3, output_rate_per_million: 1.2, cached_input_rate_per_million: 0.0, cache_write_input_rate_per_million: 0.0 },
	'minimax-m3:cloud': { pricing_kind: 'catalog', pricing_source: 'watchdog-direct-provider-table:v1', priced_model: 'minimax-m3:cloud', input_rate_per_million: 0.3, output_rate_per_million: 1.2, cached_input_rate_per_million: 0.0, cache_write_input_rate_per_million: 0.0 },
	'qwen3.5': { pricing_kind: 'catalog', pricing_source: 'watchdog-direct-provider-table:v1', priced_model: 'qwen3.5', input_rate_per_million: 0.6, output_rate_per_million: 3.6, cached_input_rate_per_million: 0.0, cache_write_input_rate_per_million: 0.0 },
	'qwen3.5:397b': { pricing_kind: 'catalog', pricing_source: 'watchdog-direct-provider-table:v1', priced_model: 'qwen3.5:397b', input_rate_per_million: 0.6, output_rate_per_million: 3.6, cached_input_rate_per_million: 0.0, cache_write_input_rate_per_million: 0.0 },
	'qwen3.5:397b-cloud': { pricing_kind: 'catalog', pricing_source: 'watchdog-direct-provider-table:v1', priced_model: 'qwen3.5:397b-cloud', input_rate_per_million: 0.6, output_rate_per_million: 3.6, cached_input_rate_per_million: 0.0, cache_write_input_rate_per_million: 0.0 },
	'qwen3.5-397b-a17b': { pricing_kind: 'catalog', pricing_source: 'watchdog-direct-provider-table:v1', priced_model: 'qwen3.5-397b-a17b', input_rate_per_million: 0.6, output_rate_per_million: 3.6, cached_input_rate_per_million: 0.0, cache_write_input_rate_per_million: 0.0 }
};

function normalizeModelId(model) {
	return String(model || '').trim().toLowerCase();
}

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadCatalog(catalogPath = DEFAULT_CATALOG_PATH) {
	const filePath = path.resolve(catalogPath);
	if (!fs.existsSync(filePath)) {
		return { schema_version: 1, catalog_id: 'missing-openrouter-catalog', models: {}, aliases: {} };
	}
	return readJson(filePath);
}

function lookupCatalogRecord(model, catalog = loadCatalog()) {
	const normalized = normalizeModelId(model);
	const models = catalog.models || {};
	const aliases = catalog.aliases || {};
	if (Object.prototype.hasOwnProperty.call(aliases, normalized)) {
		const alias = aliases[normalized] || {};
		const target = normalizeModelId(alias.target_model_id || alias.target || '');
		if (target && Object.prototype.hasOwnProperty.call(models, target)) {
			return {
				...models[target],
				requested_model: normalized,
				priced_model: target,
				alias_target_model_id: target,
				pricing_source: String(alias.pricing_source || models[target].pricing_source || catalog.catalog_id || 'openrouter-public-catalog'),
			};
		}
	}
	if (Object.prototype.hasOwnProperty.call(models, normalized)) {
		return {
			...models[normalized],
			requested_model: normalized,
			priced_model: String(models[normalized].priced_model || models[normalized].model_id || normalized),
		};
	}
	return null;
}

function resolvePricing(model, options = {}) {
	const normalized = normalizeModelId(model);
	const fallbackSource = String(options.fallbackSource || 'watchdog-fallback-estimate:v1');
	const fallbackInputRate = Number.isFinite(Number(options.fallbackInputRate)) ? Number(options.fallbackInputRate) : 1.0;
	const fallbackOutputRate = Number.isFinite(Number(options.fallbackOutputRate)) ? Number(options.fallbackOutputRate) : 3.0;
	const catalog = options.catalog || loadCatalog(options.catalogPath);
	const direct = DIRECT_PROVIDER_TABLE[normalized];
	if (direct) {
		return { requested_model: normalized, ...direct };
	}
	const catalogRecord = lookupCatalogRecord(normalized, catalog);
	if (catalogRecord) {
		if (catalogRecord.has_pricing === false) {
			return {
				requested_model: normalized,
				priced_model: String(catalogRecord.priced_model || normalized),
				pricing_kind: 'unknown',
				pricing_source: String(catalogRecord.pricing_source || catalog.catalog_id || 'openrouter-public-catalog'),
				input_rate_per_million: 0,
				output_rate_per_million: 0,
				cached_input_rate_per_million: 0,
				cache_write_input_rate_per_million: 0,
			};
		}
		return {
			requested_model: normalized,
			priced_model: String(catalogRecord.priced_model || normalized),
			pricing_kind: 'catalog',
			pricing_source: String(catalogRecord.pricing_source || catalog.catalog_id || 'openrouter-public-catalog'),
			input_rate_per_million: Number(catalogRecord.input_rate_per_million || 0),
			output_rate_per_million: Number(catalogRecord.output_rate_per_million || 0),
			cached_input_rate_per_million: Number(catalogRecord.cached_input_rate_per_million || 0),
			cache_write_input_rate_per_million: Number(catalogRecord.cache_write_input_rate_per_million || 0),
		};
	}
	return {
		requested_model: normalized,
		priced_model: normalized,
		pricing_kind: normalized ? 'fallback' : 'unknown',
		pricing_source: normalized ? fallbackSource : 'watchdog-pricing-unavailable:v1',
		input_rate_per_million: normalized ? fallbackInputRate : 0,
		output_rate_per_million: normalized ? fallbackOutputRate : 0,
		cached_input_rate_per_million: 0,
		cache_write_input_rate_per_million: 0,
	};
}

function computeBreakdown(model, usage, options = {}) {
	const pricing = resolvePricing(model, options);
	const inputTokens = Number(usage.input_tokens || 0);
	const outputTokens = Number(usage.output_tokens || 0);
	const cachedInputTokens = Number(usage.cached_input_tokens || 0);
	const cacheWriteInputTokens = Number(usage.cache_write_input_tokens || 0);
	const inputCost = (inputTokens / 1e6) * Number(pricing.input_rate_per_million || 0);
	const outputCost = (outputTokens / 1e6) * Number(pricing.output_rate_per_million || 0);
	const cachedInputCost = (cachedInputTokens / 1e6) * Number(pricing.cached_input_rate_per_million || 0);
	const cacheWriteInputCost = (cacheWriteInputTokens / 1e6) * Number(pricing.cache_write_input_rate_per_million || 0);
	return {
		...pricing,
		input_tokens: inputTokens,
		output_tokens: outputTokens,
		cached_input_tokens: cachedInputTokens,
		cache_write_input_tokens: cacheWriteInputTokens,
		input_cost_usd: Number(inputCost.toFixed(12)),
		output_cost_usd: Number(outputCost.toFixed(12)),
		cached_input_cost_usd: Number(cachedInputCost.toFixed(12)),
		cache_write_input_cost_usd: Number(cacheWriteInputCost.toFixed(12)),
		total_cost_usd: Number((inputCost + outputCost + cachedInputCost + cacheWriteInputCost).toFixed(12)),
	};
}

module.exports = {
	DEFAULT_CATALOG_PATH,
	DIRECT_PROVIDER_TABLE,
	normalizeModelId,
	loadCatalog,
	lookupCatalogRecord,
	resolvePricing,
	computeBreakdown,
};
