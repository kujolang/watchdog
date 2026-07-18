#!/usr/bin/env node

const {
	DEFAULT_OPENROUTER_CATALOG_PATH,
	normalizeModelId,
	loadOpenRouterCatalog,
	lookupCatalogRecord,
	resolvePricing,
	computeBreakdown,
} = require('./pricing_catalog_lib');

function loadCatalog(catalogPath = DEFAULT_OPENROUTER_CATALOG_PATH) {
	return loadOpenRouterCatalog(catalogPath);
}

module.exports = {
	DEFAULT_CATALOG_PATH: DEFAULT_OPENROUTER_CATALOG_PATH,
	normalizeModelId,
	loadCatalog,
	lookupCatalogRecord,
	resolvePricing,
	computeBreakdown,
};
