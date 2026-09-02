const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {resolveKujoBin} = require('./_kujo_bin');
const root = path.resolve(__dirname, '..');
const result = spawnSync(resolveKujoBin(root), ['run', '--interpreter', 'tests/fixtures/telemetry_native_adapter_check.kujo'], {cwd: root, encoding: 'utf8', env: process.env, timeout: 30000});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`native adapter fixture failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
if (!String(result.stdout).includes('telemetry_native_adapter_check: PASS')) throw new Error(`native adapter fixture did not report PASS\n${result.stdout}`);
console.log('telemetry_native_adapter_check: PASS');
