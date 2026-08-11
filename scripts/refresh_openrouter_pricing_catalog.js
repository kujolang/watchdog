#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { normalizeModelId } = require('./openrouter_pricing_lib');

const ROOT = path.join(__dirname, '..');
const ALIAS_PATH = path.join(ROOT, 'config', 'openrouter_pricing_aliases.json');
const DEFAULT_OUTPUT_PATH = path.join(ROOT, 'config', 'openrouter_pricing_catalog.json');
const SOURCE_URL = 'https://openrouter.ai/api/v1/models';

function parseArgs(argv) {
	const out = { output: DEFAULT_OUTPUT_PATH, sourceUrl: SOURCE_URL };
	for (let i = 0; i < argv.length; i += 1) {
		const token = String(argv[i] || '');
		if (token.startsWith('--output=')) out.output = path.resolve(token.slice('--output='.length));
		if (token.startsWith('--source-url=')) out.sourceUrl = token.slice('--source-url='.length).trim() || SOURCE_URL;
	}
	return out;
}

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fetchJson(url) {
	return fetch(url, { headers: { Accept: 'application/json' } }).then(async response => {
		if (!response.ok) {
			throw new Error(`OpenRouter catalog request failed with HTTP ${response.status}`);
		}
		return response.json();
	});
}

function toRatePerMillion(value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return 0;
	return Number((parsed * 1e6).toFixed(6));
}

function hasNonNegativeRate(value) {
	if (value === null || value === undefined || String(value).trim() === '') return false;
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0;
}

function buildModelEntry(model, pricingSource) {
	const pricing = model && model.pricing && typeof model.pricing === 'object' ? model.pricing : {};
	const hasBasePricing = hasNonNegativeRate(pricing.prompt) && hasNonNegativeRate(pricing.completion);
	return {
		model_id: normalizeModelId(model.id),
		canonical_slug: String(model.canonical_slug || ''),
		display_name: String(model.name || ''),
		priced_model: normalizeModelId(model.id),
		pricing_source: pricingSource,
		has_pricing: Boolean(hasBasePricing),
		input_rate_per_million: hasBasePricing ? toRatePerMillion(pricing.prompt) : 0,
		output_rate_per_million: hasBasePricing ? toRatePerMillion(pricing.completion) : 0,
		cached_input_rate_per_million: hasBasePricing ? toRatePerMillion(pricing.input_cache_read) : 0,
		cache_write_input_rate_per_million: hasBasePricing ? toRatePerMillion(pricing.input_cache_write) : 0
	};
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const aliasConfig = readJson(ALIAS_PATH);
	const raw = await fetchJson(args.sourceUrl);
	const modelsArray = Array.isArray(raw.data) ? raw.data : [];
	const refreshedAt = new Date().toISOString();
	const catalogDate = refreshedAt.slice(0, 10);
	const pricingSource = `openrouter-public-catalog:${catalogDate}`;
	const models = {};

	for (const model of modelsArray) {
		if (!model || typeof model !== 'object' || !model.id) continue;
		const key = normalizeModelId(model.id);
		models[key] = buildModelEntry(model, pricingSource);
	}

	const aliases = {};
	for (const [aliasId, targetId] of Object.entries((aliasConfig && aliasConfig.aliases) || {})) {
		const aliasKey = normalizeModelId(aliasId);
		const targetKey = normalizeModelId(targetId);
		if (!models[targetKey]) {
			throw new Error(`Alias target missing from OpenRouter catalog: ${aliasId} -> ${targetId}`);
		}
		aliases[aliasKey] = {
			target_model_id: targetKey,
			pricing_source: `${pricingSource}#alias`
		};
	}

	const catalog = {
		schema_version: 1,
		catalog_id: pricingSource,
		source_url: args.sourceUrl,
		refreshed_at: refreshedAt,
		model_count: Object.keys(models).length,
		alias_count: Object.keys(aliases).length,
		models,
		aliases
	};

	fs.mkdirSync(path.dirname(args.output), { recursive: true });
	fs.writeFileSync(args.output, JSON.stringify(catalog, null, 2) + '\n');
	console.log(`openrouter_pricing_catalog refreshed ${args.output} models=${catalog.model_count} aliases=${catalog.alias_count} source=${catalog.catalog_id}`);
}

if (require.main === module) {
	main().catch(err => {
		console.error('refresh_openrouter_pricing_catalog: FAIL');
		console.error(err && err.stack ? err.stack : err);
		process.exit(1);
	});
}

module.exports = { buildModelEntry, hasNonNegativeRate, toRatePerMillion };
