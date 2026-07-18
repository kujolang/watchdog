#!/usr/bin/env node

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { computeBreakdown, loadCatalog, normalizeModelId } = require('./openrouter_pricing_lib');

const ROOT = path.join(__dirname, '..');
const DEFAULT_DB_PATH = path.join(ROOT, 'data', 'watchdog.db');

function parseArgs(argv) {
	const out = {
		dbPath: process.env.WDG_DB_PATH ? path.resolve(process.env.WDG_DB_PATH) : DEFAULT_DB_PATH,
		catalogPath: process.env.WDG_OPENROUTER_PRICING_CATALOG_PATH ? path.resolve(process.env.WDG_OPENROUTER_PRICING_CATALOG_PATH) : path.join(ROOT, 'config', 'openrouter_pricing_catalog.json'),
		apply: false,
		fromMs: 0,
		untilMs: 0,
		sourceApp: '',
		models: [],
		limit: 5000,
	};

	for (const token of argv) {
		if (token === '--apply') out.apply = true;
		else if (token.startsWith('--db=')) out.dbPath = path.resolve(token.slice('--db='.length));
		else if (token.startsWith('--catalog=')) out.catalogPath = path.resolve(token.slice('--catalog='.length));
		else if (token.startsWith('--from-ms=')) out.fromMs = Number(token.slice('--from-ms='.length) || 0);
		else if (token.startsWith('--until-ms=')) out.untilMs = Number(token.slice('--until-ms='.length) || 0);
		else if (token.startsWith('--source-app=')) out.sourceApp = token.slice('--source-app='.length).trim();
		else if (token.startsWith('--models=')) out.models = token.slice('--models='.length).split(',').map(normalizeModelId).filter(Boolean);
		else if (token.startsWith('--limit=')) out.limit = Math.max(1, Math.min(25000, Number(token.slice('--limit='.length) || 5000)));
	}

	return out;
}

function fail(message) {
	console.error(message);
	process.exit(1);
}

function sqlValue(value) {
	if (value == null) return 'NULL';
	if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
	if (typeof value === 'boolean') return value ? '1' : '0';
	return `'${String(value).replace(/'/g, "''")}'`;
}

function sqliteJson(dbPath, sql) {
	const stdout = execFileSync('sqlite3', ['-json', dbPath, sql], { encoding: 'utf8' });
	const trimmed = stdout.trim();
	return trimmed ? JSON.parse(trimmed) : [];
}

function sqliteExec(dbPath, sql) {
	execFileSync('sqlite3', [dbPath, sql], { encoding: 'utf8' });
}

function whereClause(args) {
	const conditions = [];
	if (args.fromMs > 0) conditions.push(`CAST(created_at AS INTEGER) >= ${sqlValue(args.fromMs)}`);
	if (args.untilMs > 0) conditions.push(`CAST(created_at AS INTEGER) <= ${sqlValue(args.untilMs)}`);
	if (args.sourceApp) conditions.push(`source_app = ${sqlValue(args.sourceApp)}`);
	if (args.models.length > 0) conditions.push(`lower(model) IN (${args.models.map(sqlValue).join(', ')})`);
	return conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
}

function buildSelector(args) {
	return {
		from_ms: args.fromMs || 0,
		until_ms: args.untilMs || 0,
		source_app: args.sourceApp || '',
		models: args.models,
		limit: args.limit,
	};
}

function mergeUsage(row) {
	return {
		input_tokens: Number(row.input_tokens || 0),
		output_tokens: Number(row.output_tokens || 0),
		cached_input_tokens: Math.max(Number(row.cached_input_tokens || 0), Number(row.trace_cached_input_tokens || 0)),
		cache_write_input_tokens: Math.max(Number(row.cache_write_input_tokens || 0), Number(row.trace_cache_write_input_tokens || 0))
	};
}

function requestUpdateSql(row, breakdown, nowMs) {
	return [
		`UPDATE requests SET cost_usd = ${sqlValue(breakdown.total_cost_usd)},`,
		`cached_input_tokens = ${sqlValue(breakdown.cached_input_tokens)},`,
		`cache_write_input_tokens = ${sqlValue(breakdown.cache_write_input_tokens)},`,
		`input_cost_usd = ${sqlValue(breakdown.input_cost_usd)},`,
		`output_cost_usd = ${sqlValue(breakdown.output_cost_usd)},`,
		`cached_input_cost_usd = ${sqlValue(breakdown.cached_input_cost_usd)},`,
		`cache_write_input_cost_usd = ${sqlValue(breakdown.cache_write_input_cost_usd)},`,
		`input_rate_per_million = ${sqlValue(breakdown.input_rate_per_million)},`,
		`output_rate_per_million = ${sqlValue(breakdown.output_rate_per_million)},`,
		`cached_input_rate_per_million = ${sqlValue(breakdown.cached_input_rate_per_million)},`,
		`cache_write_input_rate_per_million = ${sqlValue(breakdown.cache_write_input_rate_per_million)},`,
		`pricing_source = ${sqlValue(breakdown.pricing_source)},`,
		`pricing_kind = ${sqlValue(breakdown.pricing_kind)},`,
		`priced_model = ${sqlValue(breakdown.priced_model)}`,
		`WHERE id = ${sqlValue(row.id)};`,
		`UPDATE traces SET`,
		`model = ${sqlValue(row.model)},`,
		`input_cost_usd = ${sqlValue(breakdown.input_cost_usd)},`,
		`output_cost_usd = ${sqlValue(breakdown.output_cost_usd)},`,
		`cached_input_cost_usd = ${sqlValue(breakdown.cached_input_cost_usd)},`,
		`cache_write_input_cost_usd = ${sqlValue(breakdown.cache_write_input_cost_usd)},`,
		`input_rate_per_million = ${sqlValue(breakdown.input_rate_per_million)},`,
		`output_rate_per_million = ${sqlValue(breakdown.output_rate_per_million)},`,
		`cached_input_rate_per_million = ${sqlValue(breakdown.cached_input_rate_per_million)},`,
		`cache_write_input_rate_per_million = ${sqlValue(breakdown.cache_write_input_rate_per_million)},`,
		`pricing_source = ${sqlValue(breakdown.pricing_source)},`,
		`pricing_kind = ${sqlValue(breakdown.pricing_kind)},`,
		`priced_model = ${sqlValue(breakdown.priced_model)}`,
		`WHERE request_dbid = ${sqlValue(row.id)};`,
		`INSERT INTO pricing_reprice_changes (run_id, request_dbid, trace_id, source_app, model, before_record_json, after_record_json, applied, created_at)`,
		`VALUES (${sqlValue(row.run_id)}, ${sqlValue(row.id)}, '', ${sqlValue(row.source_app)}, ${sqlValue(row.model)}, ${sqlValue(row.before_record_json)}, ${sqlValue(row.after_record_json)}, 1, ${sqlValue(String(nowMs))});`
	].join(' ');
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	if (!fs.existsSync(args.dbPath)) fail(`Watchdog DB not found: ${args.dbPath}`);
	if (!fs.existsSync(args.catalogPath)) fail(`Pricing catalog not found: ${args.catalogPath}`);
	if (!(args.fromMs > 0 || args.untilMs > 0 || args.sourceApp || args.models.length > 0)) {
		fail('Pass at least one bounded selector: --from-ms, --until-ms, --source-app, or --models.');
	}

	const catalog = loadCatalog(args.catalogPath);
	const selectorSql = whereClause(args);
	const rows = sqliteJson(
		args.dbPath,
		[
			'SELECT id, source_app, model, request_id, status, input_tokens, output_tokens,',
			'cached_input_tokens, cache_write_input_tokens, cost_usd, input_cost_usd, output_cost_usd,',
			'cached_input_cost_usd, cache_write_input_cost_usd, input_rate_per_million, output_rate_per_million,',
			'cached_input_rate_per_million, cache_write_input_rate_per_million, pricing_source, pricing_kind, priced_model, created_at,',
			'(SELECT COALESCE(MAX(cached_input_tokens),0) FROM traces WHERE request_dbid = requests.id) AS trace_cached_input_tokens,',
			'(SELECT COALESCE(MAX(cache_write_input_tokens),0) FROM traces WHERE request_dbid = requests.id) AS trace_cache_write_input_tokens',
			'FROM requests',
			selectorSql,
			selectorSql ? "AND (pricing_kind IS NULL OR pricing_kind != 'provider_reported')" : "WHERE (pricing_kind IS NULL OR pricing_kind != 'provider_reported')",
			'ORDER BY CAST(created_at AS INTEGER) ASC',
			`LIMIT ${sqlValue(args.limit)};`
		].join(' ')
	);

	const runId = `reprice-${Date.now()}`;
	const selector = buildSelector(args);
	const candidates = [];
	for (const row of rows) {
		const before = {
			cost_usd: Number(row.cost_usd || 0),
			input_cost_usd: Number(row.input_cost_usd || 0),
			output_cost_usd: Number(row.output_cost_usd || 0),
			cached_input_cost_usd: Number(row.cached_input_cost_usd || 0),
			cache_write_input_cost_usd: Number(row.cache_write_input_cost_usd || 0),
			input_rate_per_million: Number(row.input_rate_per_million || 0),
			output_rate_per_million: Number(row.output_rate_per_million || 0),
			cached_input_rate_per_million: Number(row.cached_input_rate_per_million || 0),
			cache_write_input_rate_per_million: Number(row.cache_write_input_rate_per_million || 0),
			pricing_source: String(row.pricing_source || ''),
			pricing_kind: String(row.pricing_kind || ''),
			priced_model: String(row.priced_model || '')
		};
		const usage = mergeUsage(row);
		const after = computeBreakdown(row.model, usage, { catalog });
		const changed = JSON.stringify(before) !== JSON.stringify({
			cost_usd: after.total_cost_usd,
			input_cost_usd: after.input_cost_usd,
			output_cost_usd: after.output_cost_usd,
			cached_input_cost_usd: after.cached_input_cost_usd,
			cache_write_input_cost_usd: after.cache_write_input_cost_usd,
			input_rate_per_million: after.input_rate_per_million,
			output_rate_per_million: after.output_rate_per_million,
			cached_input_rate_per_million: after.cached_input_rate_per_million,
			cache_write_input_rate_per_million: after.cache_write_input_rate_per_million,
			pricing_source: after.pricing_source,
			pricing_kind: after.pricing_kind,
			priced_model: after.priced_model
		});
		if (changed) {
			candidates.push({
				...row,
				run_id: runId,
				before_record_json: JSON.stringify(before),
				after_record_json: JSON.stringify({
					cost_usd: after.total_cost_usd,
					input_cost_usd: after.input_cost_usd,
					output_cost_usd: after.output_cost_usd,
					cached_input_cost_usd: after.cached_input_cost_usd,
					cache_write_input_cost_usd: after.cache_write_input_cost_usd,
					input_rate_per_million: after.input_rate_per_million,
					output_rate_per_million: after.output_rate_per_million,
					cached_input_rate_per_million: after.cached_input_rate_per_million,
					cache_write_input_rate_per_million: after.cache_write_input_rate_per_million,
					pricing_source: after.pricing_source,
					pricing_kind: after.pricing_kind,
					priced_model: after.priced_model
				}),
				breakdown: after
			});
		}
	}

	const summary = {
		run_id: runId,
		dry_run: !args.apply,
		db_path: args.dbPath,
		catalog_path: args.catalogPath,
		catalog_id: catalog.catalog_id || '',
		selector,
		scanned_rows: rows.length,
		candidate_rows: candidates.length,
		changed_request_ids: candidates.map(row => row.id),
	};

	if (!args.apply) {
		console.log(JSON.stringify(summary, null, 2));
		return;
	}

	if (candidates.length === 0) {
		console.log(JSON.stringify(summary, null, 2));
		return;
	}

	const nowMs = Date.now();
	const statements = [
		'BEGIN;',
		`INSERT INTO pricing_reprice_runs (run_id, dry_run, selector_json, pricing_source, candidate_count, applied_change_count, created_at) VALUES (${sqlValue(runId)}, 0, ${sqlValue(JSON.stringify(selector))}, ${sqlValue(String(catalog.catalog_id || ''))}, ${sqlValue(candidates.length)}, ${sqlValue(candidates.length)}, ${sqlValue(String(nowMs))});`
	];
	for (const row of candidates) {
		statements.push(requestUpdateSql(row, row.breakdown, nowMs));
	}
	statements.push('COMMIT;');
	sqliteExec(args.dbPath, statements.join('\n'));
	console.log(JSON.stringify(summary, null, 2));
}

main();
