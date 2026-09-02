const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {DatabaseSync} = require('node:sqlite');
const {resolveKujoBinOrThrow} = require('./_kujo_bin');

const root = path.resolve(__dirname, '..');
const kujoBin = resolveKujoBinOrThrow(__filename);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-identity-conflict-'));
const fixtureDb = path.join(temp, 'fixture.db');
const fixture = spawnSync(kujoBin, ['run', '--interpreter', 'tests/fixtures/telemetry_v2_identity_conflict_check.kujo'], {cwd: root, encoding: 'utf8', env: {...process.env, WDG_TEST_DB_PATH: fixtureDb}, timeout: 30000});
assert.strictEqual(fixture.status, 0, `${fixture.stdout}\n${fixture.stderr}`);
assert.match(fixture.stdout, /telemetry_v2_identity_conflict_check: PASS/);

const dbPath = path.join(temp, 'api.db');
const exportersPath = path.join(temp, 'exporters.json');
const port = 18871;
fs.writeFileSync(exportersPath, JSON.stringify({schema_version: 'watchdog.exporters.v1', exporters: [{id: 'fixture', type: 'otlp_http', enabled: true, endpoint: 'http://127.0.0.1:4318/v1/traces'}]}));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function request(payload) {
	const body = JSON.stringify(payload);
	return new Promise((resolve, reject) => {
		const req = http.request({host: '127.0.0.1', port, method: 'POST', path: '/telemetry/v2/batches', headers: {'content-type': 'application/json', 'content-length': Buffer.byteLength(body)}}, res => {
			let text = ''; res.on('data', chunk => { text += chunk; }); res.on('end', () => resolve({status: res.statusCode, body: text}));
		});
		req.on('error', reject); req.end(body);
	});
}
async function run() {
	let child;
	try {
		child = spawn(kujoBin, ['run', '--interpreter', 'dashboard_server.kujo'], {cwd: root, env: {...process.env, WDG_DB_PATH: dbPath, WDG_PORT: String(port), WDG_API_AUTH_MODE: 'off', WDG_BACKUP_ENABLED: 'false', WDG_EXPORTERS_CONFIG_PATH: exportersPath}, stdio: ['ignore', 'pipe', 'pipe']});
		let output = ''; child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { output += value; });
		let ready = false;
		for (let i = 0; i < 100; i++) { try { await request({}); ready = true; break; } catch {} await delay(100); }
		if (!ready) throw new Error(`Watchdog did not start\n${output}`);
		const batch = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/telemetry-v2/canonical-minimal.json'), 'utf8'));
		assert.strictEqual((await request(batch)).status, 200);
		const conflict = structuredClone(batch); conflict.batch_id = 'api-conflict'; conflict.records[0].status = 'error';
		const rejected = await request(conflict);
		assert.strictEqual(rejected.status, 409, rejected.body);
		assert.strictEqual(JSON.parse(rejected.body).error, 'record_identity_conflict');
		const db = new DatabaseSync(dbPath);
		assert.strictEqual(db.prepare('SELECT status FROM telemetry_records_v2').get().status, batch.records[0].status || 'unset');
		assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM telemetry_export_deliveries').get().n, 1, 'conflict duplicated exporter delivery');
		const journal = db.prepare('SELECT * FROM telemetry_record_conflicts_v2').get();
		assert.strictEqual(journal.batch_id, 'api-conflict');
		assert.ok(!JSON.stringify(journal).includes('mutated'));
		db.close();
	} finally {
		if (child && child.exitCode == null) { child.kill('SIGTERM'); await delay(200); if (child.exitCode == null) child.kill('SIGKILL'); }
		fs.rmSync(temp, {recursive: true, force: true});
	}
}
run().then(() => console.log('telemetry_v2_identity_conflict_suite: PASS')).catch(error => { console.error(error.stack || error); process.exit(1); });
