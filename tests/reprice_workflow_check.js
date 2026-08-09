#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-reprice-'));
const dbPath = path.join(tempRoot, 'watchdog.db');
const providerCatalogPath = path.join(root, 'config', 'provider_pricing_catalog.json');
const catalogPath = path.join(root, 'config', 'openrouter_pricing_catalog.json');
const scriptPath = path.join(root, 'scripts', 'reprice_watchdog_requests.js');

function sqlite(sql, json = false) {
	const args = json ? ['-json', dbPath, sql] : [dbPath, sql];
	const stdout = execFileSync('sqlite3', args, { encoding: 'utf8' }).trim();
	return json ? (stdout ? JSON.parse(stdout) : []) : stdout;
}

sqlite(`
CREATE TABLE requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_app TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  request_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_input_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0.0,
  input_cost_usd REAL NOT NULL DEFAULT 0.0,
  output_cost_usd REAL NOT NULL DEFAULT 0.0,
  cached_input_cost_usd REAL NOT NULL DEFAULT 0.0,
  cache_write_input_cost_usd REAL NOT NULL DEFAULT 0.0,
  input_rate_per_million REAL NOT NULL DEFAULT 0.0,
  output_rate_per_million REAL NOT NULL DEFAULT 0.0,
  cached_input_rate_per_million REAL NOT NULL DEFAULT 0.0,
  cache_write_input_rate_per_million REAL NOT NULL DEFAULT 0.0,
  pricing_source TEXT NOT NULL DEFAULT '',
  pricing_kind TEXT NOT NULL DEFAULT '',
  priced_model TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE traces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_dbid INTEGER NOT NULL DEFAULT 0,
  trace_id TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_input_tokens INTEGER NOT NULL DEFAULT 0,
  input_cost_usd REAL NOT NULL DEFAULT 0.0,
  output_cost_usd REAL NOT NULL DEFAULT 0.0,
  cached_input_cost_usd REAL NOT NULL DEFAULT 0.0,
  cache_write_input_cost_usd REAL NOT NULL DEFAULT 0.0,
  input_rate_per_million REAL NOT NULL DEFAULT 0.0,
  output_rate_per_million REAL NOT NULL DEFAULT 0.0,
  cached_input_rate_per_million REAL NOT NULL DEFAULT 0.0,
  cache_write_input_rate_per_million REAL NOT NULL DEFAULT 0.0,
  pricing_source TEXT NOT NULL DEFAULT '',
  pricing_kind TEXT NOT NULL DEFAULT '',
  priced_model TEXT NOT NULL DEFAULT ''
);
CREATE TABLE pricing_reprice_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL UNIQUE,
  dry_run INTEGER NOT NULL DEFAULT 1,
  selector_json TEXT NOT NULL DEFAULT '{}',
  pricing_source TEXT NOT NULL DEFAULT '',
  candidate_count INTEGER NOT NULL DEFAULT 0,
  applied_change_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE pricing_reprice_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL DEFAULT '',
  request_dbid INTEGER NOT NULL DEFAULT 0,
  trace_id TEXT NOT NULL DEFAULT '',
  source_app TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  before_record_json TEXT NOT NULL DEFAULT '{}',
  after_record_json TEXT NOT NULL DEFAULT '{}',
  applied INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT ''
);

INSERT INTO requests (source_app, model, request_id, status, input_tokens, output_tokens, cached_input_tokens, cache_write_input_tokens, cost_usd, pricing_source, pricing_kind, created_at)
VALUES
  ('ai-chat', 'openai/gpt-5.4', 'req-1', 'success', 1000, 100, 0, 0, 0.0040, 'watchdog-fallback-estimate:v1', 'fallback', '1721260800000'),
  ('ai-chat', '~anthropic/claude-haiku-latest', 'req-2', 'success', 1000, 200, 0, 0, 0.0040, 'watchdog-fallback-estimate:v1', 'fallback', '1721260801000'),
  ('other-app', 'unknown/provider-model', 'req-3', 'success', 500, 100, 0, 0, 0.0020, 'watchdog-fallback-estimate:v1', 'fallback', '1721260802000'),
  ('ai-chat', 'openai/gpt-5.4', 'req-4', 'success', 1000, 100, 0, 0, 9.9990, 'provider-reported-cost', 'provider_reported', '1721260803000');

INSERT INTO traces (request_dbid, trace_id, model, cached_input_tokens, cache_write_input_tokens, pricing_source, pricing_kind)
VALUES
  (1, 'trace-1', 'openai/gpt-5.4', 500, 0, 'watchdog-fallback-estimate:v1', 'fallback'),
  (2, 'trace-2', '~anthropic/claude-haiku-latest', 100, 20, 'watchdog-fallback-estimate:v1', 'fallback');
`);

const dryRun = JSON.parse(execFileSync('node', [scriptPath, `--db=${dbPath}`, `--provider-catalog=${providerCatalogPath}`, `--catalog=${catalogPath}`, '--source-app=ai-chat', '--models=openai/gpt-5.4,~anthropic/claude-haiku-latest', '--from-ms=1721260800000', '--until-ms=1721260801999'], { encoding: 'utf8' }));
assert.equal(dryRun.dry_run, true);
assert.equal(dryRun.candidate_rows, 2);
assert.equal(dryRun.provider_catalog_id, 'watchdog-provider-catalog:2026-08-09');
assert.equal(sqlite('SELECT COUNT(*) AS n FROM pricing_reprice_runs', true)[0].n, 0, 'dry-run should not write audit rows');
assert.equal(sqlite('SELECT pricing_kind FROM requests WHERE request_id = "req-1"', true)[0].pricing_kind, 'fallback', 'dry-run should not mutate requests');

const applied = JSON.parse(execFileSync('node', [scriptPath, `--db=${dbPath}`, `--provider-catalog=${providerCatalogPath}`, `--catalog=${catalogPath}`, '--source-app=ai-chat', '--models=openai/gpt-5.4,~anthropic/claude-haiku-latest', '--from-ms=1721260800000', '--until-ms=1721260801999', '--apply'], { encoding: 'utf8' }));
assert.equal(applied.dry_run, false);
assert.equal(applied.candidate_rows, 2);

const req1 = sqlite('SELECT pricing_kind, pricing_source, priced_model, cost_usd, cached_input_rate_per_million FROM requests WHERE request_id = "req-1"', true)[0];
assert.equal(req1.pricing_kind, 'catalog');
assert.match(String(req1.pricing_source), /^openrouter-public-catalog:2026-08-09/);
assert.equal(req1.priced_model, 'openai/gpt-5.4');
assert.equal(Number(req1.cached_input_rate_per_million), 0.25);

const req2 = sqlite('SELECT pricing_kind, priced_model FROM requests WHERE request_id = "req-2"', true)[0];
assert.equal(req2.pricing_kind, 'catalog');
assert.equal(req2.priced_model, 'anthropic/claude-haiku-4.5');

const trace2 = sqlite('SELECT cached_input_cost_usd, cache_write_input_cost_usd, pricing_kind, priced_model FROM traces WHERE trace_id = "trace-2"', true)[0];
assert.equal(trace2.pricing_kind, 'catalog');
assert.equal(trace2.priced_model, 'anthropic/claude-haiku-4.5');
assert.ok(Number(trace2.cached_input_cost_usd) > 0);
assert.ok(Number(trace2.cache_write_input_cost_usd) > 0);

const unchanged = sqlite('SELECT pricing_kind FROM requests WHERE request_id = "req-3"', true)[0];
assert.equal(unchanged.pricing_kind, 'fallback', 'bounded selection should leave other apps untouched');

const providerReported = sqlite('SELECT pricing_kind, cost_usd FROM requests WHERE request_id = "req-4"', true)[0];
assert.equal(providerReported.pricing_kind, 'provider_reported', 'provider-reported rows should be skipped');
assert.equal(Number(providerReported.cost_usd), 9.999);

const auditRun = sqlite('SELECT candidate_count, applied_change_count FROM pricing_reprice_runs', true)[0];
assert.equal(auditRun.candidate_count, 2);
assert.equal(auditRun.applied_change_count, 2);
assert.equal(sqlite('SELECT COUNT(*) AS n FROM pricing_reprice_changes', true)[0].n, 2, 'applied reprices should be auditable');

console.log('reprice_workflow_check: PASS');
