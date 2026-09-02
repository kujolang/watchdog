const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

const EXPECTED_PAIRS = [
	['src/dashboard_server.kujo', 'dashboard_server.kujo'],
	['src/watchdog_shared.kujo', 'watchdog_shared.kujo'],
	['src/telemetry_v2.kujo', 'telemetry_v2.kujo'],
	['src/telemetry_repository.kujo', 'telemetry_repository.kujo'],
	['src/telemetry_delivery.kujo', 'telemetry_delivery.kujo'],
	['src/telemetry_otlp.kujo', 'telemetry_otlp.kujo'],
	['src/export_worker.kujo', 'export_worker.kujo'],
	['src/watchdog.kujo', 'watchdog.kujo'],
	['src/dashboard.html', 'dashboard.html'],
];

function assertFilesExistAndMatch() {
	for (const [srcPath, rootPath] of EXPECTED_PAIRS) {
		const srcAbs = path.join(ROOT, srcPath);
		const rootAbs = path.join(ROOT, rootPath);
		assert.ok(fs.existsSync(srcAbs), srcPath + ' should exist');
		assert.ok(fs.existsSync(rootAbs), rootPath + ' should exist');

		const srcText = fs.readFileSync(srcAbs, 'utf8');
		const rootText = fs.readFileSync(rootAbs, 'utf8');
		assert.strictEqual(rootText, srcText, rootPath + ' should mirror ' + srcPath);
	}
}

function assertSyncScriptCheckPasses() {
	const result = spawnSync(process.execPath, ['scripts/sync_compat_entrypoints.js', '--check'], {
		cwd: ROOT,
		encoding: 'utf8',
	});

	if (result.status !== 0) {
		throw new Error('sync_compat_entrypoints check failed\n' + String(result.stdout || '') + '\n' + String(result.stderr || ''));
	}

	assert.ok(String(result.stdout || '').includes('CHECK PASS'), 'sync script should report CHECK PASS');
}

function run() {
	assertFilesExistAndMatch();
	assertSyncScriptCheckPasses();
	console.log('src_layout_compatibility_check: PASS');
}

try {
	run();
} catch (err) {
	console.error('src_layout_compatibility_check: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
}
