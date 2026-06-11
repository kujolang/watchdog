const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT_PATH = path.join(ROOT, 'tmp', 'benchmark-schema-fixture.json');

function runScript() {
	if (fs.existsSync(OUT_PATH)) {
		fs.unlinkSync(OUT_PATH);
	}

	const child = spawnSync(
		process.execPath,
		['scripts/benchmark_profiles.js', '--fixture', '--profiles=quick,soak', '--json-out=' + OUT_PATH],
		{
			cwd: ROOT,
			encoding: 'utf8',
		}
	);

	if (child.status !== 0) {
		throw new Error('benchmark_profiles.js failed\n' + String(child.stdout || '') + '\n' + String(child.stderr || ''));
	}

	assert.ok(String(child.stdout || '').includes('Watchdog benchmark summary'), 'script should print human-readable summary');
	assert.ok(String(child.stdout || '').includes('json_summary='), 'script should print machine-readable summary line');
}

function readJsonReport() {
	assert.ok(fs.existsSync(OUT_PATH), 'json output file should be created');
	const text = fs.readFileSync(OUT_PATH, 'utf8');
	return JSON.parse(text);
}

function assertSchema(report) {
	assert.strictEqual(typeof report.generated_at, 'string', 'generated_at should be a string');
	assert.strictEqual(typeof report.source, 'string', 'source should be a string');
	assert.strictEqual(report.baseline_profile, 'quick', 'baseline profile should default to first requested profile');
	assert.ok(Array.isArray(report.profiles), 'profiles should be an array');
	assert.strictEqual(report.profiles.length, 2, 'fixture run should include two profiles');

	report.profiles.forEach(entry => {
		assert.strictEqual(typeof entry.profile, 'string', 'profile name should be string');
		assert.strictEqual(entry.status, 'ok', 'fixture run should have ok status');
		assert.ok(entry.metrics && typeof entry.metrics === 'object', 'metrics should be object when status=ok');
		assert.strictEqual(typeof entry.metrics.rps, 'number', 'rps should be number');
		assert.strictEqual(typeof entry.metrics.p95_ms, 'number', 'p95_ms should be number');
		assert.strictEqual(typeof entry.metrics.growth_per_request, 'number', 'growth_per_request should be number');
	});

	assert.ok(report.trend && Array.isArray(report.trend.comparisons), 'trend.comparisons should be array');
	assert.strictEqual(report.trend.comparisons.length, 1, 'quick->soak comparison should be emitted');

	const comparison = report.trend.comparisons[0];
	assert.strictEqual(comparison.profile, 'soak', 'comparison should target soak profile');
	assert.strictEqual(typeof comparison.delta_rps_pct, 'number', 'delta_rps_pct should be number');
	assert.strictEqual(typeof comparison.delta_p95_ms_pct, 'number', 'delta_p95_ms_pct should be number');
	assert.strictEqual(typeof comparison.delta_growth_per_request_pct, 'number', 'delta_growth_per_request_pct should be number');
}

function run() {
	runScript();
	const report = readJsonReport();
	assertSchema(report);
	console.log('benchmark_script_schema_check: PASS');
}

try {
	run();
} catch (err) {
	console.error('benchmark_script_schema_check: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
}
