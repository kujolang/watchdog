const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {resolveKujoBinOrThrow} = require('./_kujo_bin');

const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-observability-semantics-'));
try {
	const result = spawnSync(resolveKujoBinOrThrow(__filename), ['run', '--interpreter', 'tests/fixtures/telemetry_observability_semantics_check.kujo'], {cwd: root, encoding: 'utf8', env: {...process.env, WDG_TEST_DB_PATH: path.join(temp, 'semantics.db')}, timeout: 30000});
	if (result.error) throw result.error;
	if (result.status !== 0 || !result.stdout.includes('telemetry_observability_semantics_check: PASS')) throw new Error(`${result.stdout}\n${result.stderr}`);
	console.log('telemetry_observability_semantics_check: PASS');
} finally {
	fs.rmSync(temp, {recursive: true, force: true});
}
