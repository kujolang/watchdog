const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const {spawn, spawnSync} = require('node:child_process');
const {DatabaseSync} = require('node:sqlite');
const {resolveKujoBinOrThrow} = require('./_kujo_bin');

const root = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-telemetry-v2-api-'));
const dbPath = path.join(tempDir, 'watchdog.db');
const exportersPath = path.join(tempDir, 'exporters.json');
const port = 17718;
const kujoBin = resolveKujoBinOrThrow(__filename);
fs.writeFileSync(exportersPath, JSON.stringify({schema_version: 'watchdog.exporters.v1', exporters: [{id: 'fixture-collector', type: 'otlp_http', enabled: true, endpoint: 'http://127.0.0.1:4318/v1/traces', mapping_profile: 'otel.genai.v1'}]}));

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function request(method, pathname, payload, extraHeaders = {}) {
	return new Promise((resolve, reject) => {
		const body = payload == null ? '' : (Buffer.isBuffer(payload) ? payload : (typeof payload === 'string' ? payload : JSON.stringify(payload)));
		const req = http.request({host: '127.0.0.1', port, method, path: pathname, headers: body.length ? {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...extraHeaders} : extraHeaders}, (res) => {
			let text = '';
			res.on('data', (chunk) => { text += chunk; });
			res.on('end', () => resolve({status: res.statusCode || 0, body: text, headers: res.headers || {}}));
		});
		req.on('error', reject);
		if (body) req.write(body);
		req.end();
	});
}

async function startServer() {
	const child = spawn(kujoBin, ['run', '--interpreter', 'dashboard_server.kujo'], {
		cwd: root,
		env: {...process.env, WDG_DB_PATH: dbPath, WDG_PORT: String(port), WDG_API_AUTH_MODE: 'off', WDG_PROXY_AUTHZ_MODE: 'off', WDG_MAX_PARSE_BODY_BYTES: '65536', WDG_EXPORTERS_CONFIG_PATH: exportersPath},
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
		const exportStatus = JSON.parse((await request('GET', '/api/telemetry/v2/export-status')).body).data;
		assert.strictEqual(exportStatus.configured_profiles, 1);
		assert.ok(exportStatus.deliveries.some((row) => row.profile_id === 'fixture-collector' && row.status === 'pending' && row.records === 1), 'canonical intake did not enqueue exporter delivery');

		const jsonl = await request('GET', '/telemetry/v2/jsonl?limit=10');
		assert.strictEqual(jsonl.status, 200, jsonl.body);
		assert.strictEqual(jsonl.headers['x-watchdog-jsonl-version'], 'watchdog.jsonl.v2');
		const jsonlLines = jsonl.body.trim().split('\n').filter(Boolean);
		assert.strictEqual(jsonlLines.length, 1, 'JSONL v2 export count drift');
		const envelope = JSON.parse(jsonlLines[0]);
		assert.strictEqual(envelope.record_id, stored.record_id);
		assert.strictEqual(envelope.record.privacy.content_mode, 'off');
		assert.ok(!jsonl.body.includes('raw-content-canary'), 'JSONL exported dropped content');
		const cursor = jsonl.headers['x-watchdog-next-cursor'];
		assert.match(String(cursor), /^v2:\d+:[0-9a-f]{24}$/);
		assert.strictEqual((await request('GET', '/telemetry/v2/jsonl?cursor=v2:1:invalid')).status, 400, 'tampered JSONL cursor was accepted');
		const after = await request('GET', `/telemetry/v2/jsonl?cursor=${cursor}`);
		assert.strictEqual(after.status, 200);
		assert.strictEqual(after.body, '', 'cursor resume repeated records');
		const replayFirst = await request('POST', '/telemetry/v2/jsonl/replay', jsonl.body);
		assert.strictEqual(replayFirst.status, 200, replayFirst.body);
		assert.strictEqual(JSON.parse(replayFirst.body).data.accepted, 1);
		const replaySecond = await request('POST', '/telemetry/v2/jsonl/replay', jsonl.body);
		assert.strictEqual(JSON.parse(replaySecond.body).data.deduplicated, 1, 'JSONL replay was not idempotent');

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
		const modelBatch = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/telemetry-v2/canonical-model-batch.json'), 'utf8'));
		modelBatch.batch_id = 'fixture:model:api';
		const modelIntake = await request('POST', '/telemetry/v2/batches', modelBatch);
		assert.strictEqual(modelIntake.status, 200, modelIntake.body);
		const otlpPayload = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/telemetry-v2/otlp-ai-traces.json'), 'utf8'));
		const otlpIntake = await request('POST', '/telemetry/v2/otlp/v1/traces', otlpPayload);
		assert.strictEqual(otlpIntake.status, 200, otlpIntake.body);
		assert.strictEqual(JSON.parse(otlpIntake.body).partialSuccess.rejectedSpans, 1, 'generic OTLP span was not partially rejected');
		const otlpRecords = JSON.parse((await request('GET', '/api/telemetry/v2/records?producer=fixture-otel-agent')).body).data.records;
		assert.strictEqual(otlpRecords.length, 2, 'guarded OTLP records were not persisted');
		assert.ok(!JSON.stringify(otlpRecords).includes('otlp-raw-prompt-canary'), 'OTLP prompt content leaked into storage');
		const protobufFixture = spawnSync(kujoBin, ['run', '--interpreter', 'tests/fixtures/telemetry_otlp_protobuf_check.kujo'], {cwd: root, encoding: 'utf8', env: process.env, timeout: 30000});
		assert.strictEqual(protobufFixture.status, 0, protobufFixture.stderr);
		const protobufPayload = Buffer.from(protobufFixture.stdout.trim().split(/\n/).pop(), 'base64');
		const protobufIntake = await request('POST', '/telemetry/v2/otlp/v1/traces', protobufPayload, {'Content-Type': 'application/x-protobuf'});
		assert.strictEqual(protobufIntake.status, 200, protobufIntake.body);
		assert.strictEqual(protobufIntake.headers['content-type'], 'application/x-protobuf');
		assert.strictEqual(protobufIntake.body, '', 'successful protobuf intake should return an empty OTLP response');
		assert.strictEqual((await request('POST', '/telemetry/v2/otlp/v1/traces', Buffer.from([255]), {'Content-Type': 'application/x-protobuf'})).status, 400, 'malformed protobuf was accepted');
		assert.strictEqual((await request('POST', '/telemetry/v2/otlp/v1/traces', protobufPayload, {'Content-Type': 'application/x-protobuf', 'Content-Encoding': 'gzip'})).status, 400, 'malformed compressed OTLP was accepted');
		assert.strictEqual((await request('POST', '/telemetry/v2/otlp/v1/traces', zlib.gzipSync(protobufPayload), {'Content-Type': 'application/x-protobuf', 'Content-Encoding': 'gzip'})).status, 200, 'valid gzip protobuf intake failed');
		const frameworkPayload = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/telemetry-v2/otlp-framework-traces.json'), 'utf8'));
		const frameworkIntake = await request('POST', '/telemetry/v2/otlp/v1/traces', frameworkPayload);
		assert.strictEqual(frameworkIntake.status, 200, frameworkIntake.body);
		assert.strictEqual(JSON.parse(frameworkIntake.body).partialSuccess.rejectedSpans, 0);
		const frameworkRecords = JSON.parse((await request('GET', '/api/telemetry/v2/records?producer=framework-interop-fixture&limit=20')).body).data.records;
		assert.strictEqual(frameworkRecords.length, 7, 'framework OTLP fixture should accept all AI spans');
		const frameworkText = JSON.stringify(frameworkRecords);
		for (const scope of ['opentelemetry.instrumentation.langchain', 'openinference.instrumentation.llama_index', 'crewai.telemetry', 'autogen.telemetry', 'pydantic-ai', 'microsoft.semantic_kernel', 'openinference.instrumentation']) assert.ok(frameworkText.includes(scope), `missing framework scope ${scope}`);
		assert.ok(frameworkText.includes('llm.token_count.prompt'), 'OpenInference token provenance was not preserved');
		assert.ok(!frameworkText.includes('sensitive-document-canary'), 'OTLP retrieval content leaked into storage');

		const checkpointDb = new DatabaseSync(dbPath);
		checkpointDb.exec('PRAGMA wal_checkpoint(TRUNCATE)');
		checkpointDb.close();
		for (const candidate of [dbPath, dbPath + '-wal']) {
			if (!fs.existsSync(candidate)) continue;
			const bytes = fs.readFileSync(candidate);
			for (const canary of ['raw-content-canary', 'secret-canary-value', 'otlp-raw-prompt-canary', 'sensitive-document-canary']) assert.ok(!bytes.includes(Buffer.from(canary)), `${path.basename(candidate)} retained ${canary}`);
		}
		const backupDir = path.join(tempDir, 'backups');
		const backup = spawnSync(process.execPath, ['scripts/watchdog_backup.js', '--db', dbPath, '--out-dir', backupDir, '--retention-count', '1'], {cwd: root, encoding: 'utf8'});
		assert.strictEqual(backup.status, 0, backup.stderr || backup.stdout);
		const backupPath = JSON.parse(backup.stdout).path;
		const backupBytes = fs.readFileSync(backupPath);
		for (const canary of ['raw-content-canary', 'secret-canary-value', 'otlp-raw-prompt-canary', 'sensitive-document-canary']) assert.ok(!backupBytes.includes(Buffer.from(canary)), `backup retained ${canary}`);
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
