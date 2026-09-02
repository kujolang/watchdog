const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveKujoBin } = require('./_kujo_bin');

const root = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-telemetry-v2-'));
const dbPath = path.join(tempDir, 'repository.db');
const result = spawnSync(resolveKujoBin(root), ['run', '--interpreter', 'tests/fixtures/telemetry_v2_repository_check.kujo'], {
	cwd: root,
	encoding: 'utf8',
	env: {...process.env, WDG_TEST_DB_PATH: dbPath},
	timeout: 30000,
});

fs.rmSync(tempDir, {recursive: true, force: true});
if (result.error) throw result.error;
if (result.status !== 0) {
	throw new Error(`telemetry v2 repository fixture failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}
if (!String(result.stdout).includes('telemetry_v2_repository_check: PASS')) {
	throw new Error(`telemetry v2 repository fixture did not report PASS\n${result.stdout}`);
}

console.log('telemetry_v2_repository_check: PASS');
