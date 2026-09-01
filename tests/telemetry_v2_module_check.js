#!/usr/bin/env node

const path = require('path');
const { spawnSync } = require('child_process');
const { resolveKujoBinOrThrow } = require('./_kujo_bin');

const root = path.join(__dirname, '..');
const kujoBin = resolveKujoBinOrThrow(__filename);
const result = spawnSync(kujoBin, ['run', '--interpreter', 'tests/fixtures/telemetry_v2_module_check.kujo'], {
	cwd: root,
	encoding: 'utf8',
});

if (result.error) throw result.error;
if (result.status !== 0) {
	throw new Error(`telemetry v2 module fixture failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}
if (!String(result.stdout).includes('telemetry_v2_module_check: PASS')) {
	throw new Error('telemetry v2 module fixture did not report success');
}

console.log('telemetry_v2_module_check: PASS');
