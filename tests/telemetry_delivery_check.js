const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {resolveKujoBin} = require('./_kujo_bin');

const root = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-delivery-'));
const configPath = path.join(tempDir, 'exporters.json');
fs.writeFileSync(configPath, JSON.stringify({exporters: [{id: 'active', type: 'otlp_http', enabled: true}, {id: 'active-two', type: 'otlp_http', enabled: true}, {id: 'disabled', type: 'otlp_http', enabled: false}, {id: 'wrong-type', type: 'webhook', enabled: true}]}));
const result = spawnSync(resolveKujoBin(root), ['run', '--interpreter', 'tests/fixtures/telemetry_delivery_check.kujo'], {cwd: root, encoding: 'utf8', env: {...process.env, WDG_TEST_DB_PATH: path.join(tempDir, 'delivery.db'), WDG_TEST_EXPORTERS_PATH: configPath}, timeout: 30000});
fs.rmSync(tempDir, {recursive: true, force: true});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`delivery fixture failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
if (!String(result.stdout).includes('telemetry_delivery_check: PASS')) throw new Error(`delivery fixture did not report PASS\n${result.stdout}`);
console.log('telemetry_delivery_check: PASS');
