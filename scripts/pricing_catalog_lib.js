#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_PROVIDER_CATALOG_PATH = path.join(ROOT, 'config', 'provider_pricing_catalog.json');
const DEFAULT_OPENROUTER_CATALOG_PATH = path.join(ROOT, 'config', 'openrouter_pricing_catalog.json');

function normalizeModelId(model) {
	return String(model || '').trim().toLowerCase();
}

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadJsonCatalog(catalogPath, missingCatalogId) {
	const filePath = path.resolve(catalogPath);
	if (!fs.existsSync(filePath)) {
		return { schema_version: 1, catalog_id: missingCatalogId, models: {}, aliases: {} };
	}
	return readJson(filePath);
}

function loadProviderCatalog(catalogPath = DEFAULT_PROVIDER_CATALOG_PATH) {
	return loadJsonCatalog(catalogPath, 'missing-provider-catalog');
}

function loadOpenRouterCatalog(catalogPath = DEFAULT_OPENROUTER_CATALOG_PATH) {
	return loadJsonCatalog(catalogPath, 'missing-openrouter-catalog');
}

function lookupCatalogRecord(model, catalog) {
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
				pricing_source: String(alias.pricing_source || models[target].pricing_source || catalog.catalog_id || ''),
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

function recordFromCatalog(record, fallbackCatalogId) {
	if (!record) return null;
	if (record.has_pricing === false) {
		return {
			requested_model: String(record.requested_model || ''),
			priced_model: String(record.priced_model || record.requested_model || ''),
			pricing_kind: 'unknown',
			pricing_source: String(record.pricing_source || fallbackCatalogId || ''),
			input_rate_per_million: 0,
			output_rate_per_million: 0,
			cached_input_rate_per_million: 0,
			cache_write_input_rate_per_million: 0,
		};
	}
	return {
		requested_model: String(record.requested_model || ''),
		priced_model: String(record.priced_model || record.requested_model || ''),
		pricing_kind: 'catalog',
		pricing_source: String(record.pricing_source || fallbackCatalogId || ''),
		input_rate_per_million: Number(record.input_rate_per_million || 0),
		output_rate_per_million: Number(record.output_rate_per_million || 0),
		cached_input_rate_per_million: Number(record.cached_input_rate_per_million || 0),
		cache_write_input_rate_per_million: Number(record.cache_write_input_rate_per_million || 0),
	};
}

function providerCatalogLookup(model, providerCatalog) {
	const normalized = normalizeModelId(model);
	const direct = lookupCatalogRecord(normalized, providerCatalog);
	if (direct) return direct;
	const ollamaAlias = lookupCatalogRecord(`ollama-cloud/${normalized}`, providerCatalog);
	if (ollamaAlias) return ollamaAlias;
	return null;
}

function resolvePricing(model, options = {}) {
	const normalized = normalizeModelId(model);
	const fallbackSource = String(options.fallbackSource || 'watchdog-fallback-estimate:v1');
	const fallbackInputRate = Number.isFinite(Number(options.fallbackInputRate)) ? Number(options.fallbackInputRate) : 1.0;
	const fallbackOutputRate = Number.isFinite(Number(options.fallbackOutputRate)) ? Number(options.fallbackOutputRate) : 3.0;
	const providerCatalog = options.providerCatalog || loadProviderCatalog(options.providerCatalogPath);
	const openrouterCatalog = options.openrouterCatalog || options.catalog || loadOpenRouterCatalog(options.openrouterCatalogPath || options.catalogPath);

	const providerRecord = providerCatalogLookup(normalized, providerCatalog);
	const providerResolved = recordFromCatalog(providerRecord, providerCatalog.catalog_id);
	if (providerResolved) return providerResolved;

	const openrouterRecord = lookupCatalogRecord(normalized, openrouterCatalog);
	const openrouterResolved = recordFromCatalog(openrouterRecord, openrouterCatalog.catalog_id);
	if (openrouterResolved) return openrouterResolved;

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
	DEFAULT_PROVIDER_CATALOG_PATH,
	DEFAULT_OPENROUTER_CATALOG_PATH,
	normalizeModelId,
	loadProviderCatalog,
	loadOpenRouterCatalog,
	lookupCatalogRecord,
	resolvePricing,
	computeBreakdown,
};
