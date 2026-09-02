const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {resolveKujoBinOrThrow} = require('./_kujo_bin');

const root = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-telemetry-v2-api-'));
const dbPath = path.join(tempDir, 'watchdog.db');
const port = 17718;
const kujoBin = resolveKujoBinOrThrow(__filename);

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function request(method, pathname, payload) {
	return new Promise((resolve, reject) => {
		const body = payload == null ? '' : JSON.stringify(payload);
		const req = http.request({host: '127.0.0.1', port, method, path: pathname, headers: body ? {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body)} : {}}, (res) => {
			let text = '';
			res.on('data', (chunk) => { text += chunk; });
			res.on('end', () => resolve({status: res.statusCode || 0, body: text}));
		});
		req.on('error', reject);
		if (body) req.write(body);
		req.end();
	});
}

async function startServer() {
	const child = spawn(kujoBin, ['run', '--interpreter', 'dashboard_server.kujo'], {
		cwd: root,
		env: {...process.env, WDG_DB_PATH: dbPath, WDG_PORT: String(port), WDG_API_AUTH_MODE: 'off', WDG_PROXY_AUTHZ_MODE: 'off', WDG_MAX_PARSE_BODY_BYTES: '65536'},
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let output = '';
	child.stdout.on('data', (chunk) => { output += chunk; });
	child.stderr.on('data', (chunk) => { output += chunk; });
	for (let attempt = 0; attempt < 80; attempt += 1) {
		try {
			if ((await request('GET', '/readyz')).status === 200) return {child, output: () => output};
		} catch (error) {
			if (child.exitCode != null) break;
		}
		await delay(100);
	}
	child.kill('SIGTERM');
	throw new Error(`Watchdog did not start\n${output}`);
}

async function stopServer(child) {
	if (!child || child.exitCode != null) return;
	child.kill('SIGTERM');
	await delay(200);
	if (child.exitCode == null) child.kill('SIGKILL');
}

async function run() {
	let server;
	try {
		server = await startServer();
		const batch = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/telemetry-v2/canonical-minimal.json'), 'utf8'));
		batch.batch_id = 'fixture:api:privacy';
		batch.records[0].attributes.authorization = 'Bearer secret-canary-value';
		batch.records[0].content = [{class: 'prompt', media_type: 'text/plain', value: 'raw-content-canary', truncated: false}];
		batch.records[0].privacy = {content_mode: 'full', policy_version: 'producer-policy', transformations: []};

		const first = await request('POST', '/telemetry/v2/batches', batch);
		assert.strictEqual(first.status, 200, first.body);
		assert.strictEqual(JSON.parse(first.body).data.deduplicated, false);
		const replay = await request('POST', '/telemetry/v2/batches', batch);
		assert.strictEqual(replay.status, 200, replay.body);
		assert.strictEqual(JSON.parse(replay.body).data.deduplicated, true);

		const invalid = structuredClone(batch);
		invalid.batch_id = 'fixture:api:invalid';
		invalid.records[0].record_id = 'trace:invalid';
		invalid.records[0].trace_id = '00000000000000000000000000000000';
		assert.strictEqual((await request('POST', '/telemetry/v2/batches', invalid)).status, 400, 'zero trace ID must be rejected');

		const recordsResponse = await request('GET', '/api/telemetry/v2/records?producer=fixture');
		assert.strictEqual(recordsResponse.status, 200, recordsResponse.body);
		const records = JSON.parse(recordsResponse.body).data.records;
		assert.strictEqual(records.length, 1, 'canonical replay duplicated persisted records');
		const stored = records[0].record;
		assert.deepStrictEqual(stored.content, [], 'authoritative policy retained raw content');
		assert.strictEqual(stored.privacy.content_mode, 'off');
		assert.ok(stored.privacy.transformations.includes('content_dropped_by_watchdog_policy'));
		assert.ok(!JSON.stringify(stored).includes('raw-content-canary'), 'content canary leaked');
		assert.ok(!JSON.stringify(stored).includes('secret-canary-value'), 'credential canary leaked');

		const v1 = await request('POST', '/api/telemetry/traces', {
			schema_version: 'kujo.telemetry.v1', source_app: 'v1-client', trace_id: 'v1-trace', session_id: 'v1-session',
			trace: {trace_id: 'v1-trace', name: 'compatibility', status: 'success', started_at_ms: 1000, ended_at_ms: 1200},
			events: [{event_id: 'v1-event', event_name: 'completed', sequence: 1, occurred_at_ms: 1200}],
		});
		assert.strictEqual(v1.status, 200, v1.body);
		const appendBundle = {schema_version: 'kujo.telemetry.v1', source_app: 'v1-client', trace_id: 'v1-trace', session_id: 'v1-session', events: [{event_id: 'v1-event-2', event_name: 'persisted', sequence: 2, occurred_at_ms: 1300}]};
		assert.strictEqual((await request('POST', '/api/telemetry/traces', appendBundle)).status, 200);
		assert.strictEqual((await request('POST', '/api/telemetry/traces', appendBundle)).status, 200, 'v1 replay must remain accepted');
		const v1Records = JSON.parse((await request('GET', '/api/telemetry/v2/records?producer=v1-client')).body).data.records;
		assert.strictEqual(v1Records.length, 3, 'v1 append/replay did not preserve canonical records idempotently');
		assert.ok(v1Records.every((item) => item.record.privacy.content_mode === 'off'));
	} catch (error) {
		if (server) error.message += `\nServer output:\n${server.output().slice(-4000)}`;
		throw error;
	} finally {
		await stopServer(server && server.child);
		fs.rmSync(tempDir, {recursive: true, force: true});
	}
}

run().then(() => console.log('telemetry_v2_api_suite: PASS')).catch((error) => {
	console.error(error.stack || error);
	process.exit(1);
});
