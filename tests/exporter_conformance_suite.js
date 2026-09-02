const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const {spawn} = require('node:child_process');
const {DatabaseSync} = require('node:sqlite');
const {resolveKujoBinOrThrow} = require('./_kujo_bin');

const root = path.resolve(__dirname, '..');
const kujoBin = resolveKujoBinOrThrow(__filename);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-exporter-conformance-'));
const dbPath = path.join(tempDir, 'watchdog.db');
const configPath = path.join(tempDir, 'exporters.json');
const watchdogPort = 17728;
const successPort = 17729;
const retryPort = 17730;
const protobufPort = 17732;

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function createCollector(port, status, protobuf = false) {
	const received = [];
	const server = http.createServer((req, res) => {
		const chunks = [];
		req.on('data', (chunk) => { chunks.push(chunk); });
		req.on('end', () => {
			const body = Buffer.concat(chunks);
			received.push({method: req.method, url: req.url, headers: req.headers, body});
			res.writeHead(status, {'Content-Type': protobuf ? 'application/x-protobuf' : 'application/json', ...(status === 429 ? {'Retry-After': '1'} : {})});
			res.end(status === 200 ? (protobuf ? Buffer.alloc(0) : '{}') : JSON.stringify({error: 'rate limited'}));
		});
	});
	return new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(port, '127.0.0.1', () => resolve({server, received}));
	});
}

function request(method, pathname, payload) {
	return new Promise((resolve, reject) => {
		const body = payload == null ? '' : JSON.stringify(payload);
		const req = http.request({host: '127.0.0.1', port: watchdogPort, method, path: pathname, headers: body ? {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body)} : {}}, (res) => {
			let text = '';
			res.on('data', (chunk) => { text += chunk; });
			res.on('end', () => resolve({status: res.statusCode || 0, body: text}));
		});
		req.on('error', reject);
		if (body) req.write(body);
		req.end();
	});
}

async function startWatchdog() {
	const child = spawn(kujoBin, ['run', '--interpreter', 'dashboard_server.kujo'], {
		cwd: root,
		env: {...process.env, WDG_DB_PATH: dbPath, WDG_PORT: String(watchdogPort), WDG_API_AUTH_MODE: 'off', WDG_PROXY_AUTHZ_MODE: 'off', WDG_EXPORTERS_CONFIG_PATH: configPath},
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let output = '';
	child.stdout.on('data', (chunk) => { output += chunk; });
	child.stderr.on('data', (chunk) => { output += chunk; });
	for (let attempt = 0; attempt < 80; attempt += 1) {
		try { if ((await request('GET', '/readyz')).status === 200) return {child, output: () => output}; } catch (error) { if (child.exitCode != null) break; }
		await delay(100);
	}
	child.kill('SIGTERM');
	throw new Error(`Watchdog did not start\n${output}`);
}

function runWorker() {
	return new Promise((resolve, reject) => {
		const child = spawn(kujoBin, ['run', '--interpreter', 'export_worker.kujo'], {
			cwd: root,
			env: {...process.env, WDG_DB_PATH: dbPath, WDG_EXPORTERS_CONFIG_PATH: configPath, WDG_TEST_OTLP_AUTH: 'Bearer exporter-secret-canary', WDG_TEST_DATADOG_KEY: 'datadog-secret-canary', WDG_TEST_HONEYCOMB_KEY: 'honeycomb-secret-canary'},
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let output = '';
		child.stdout.on('data', (chunk) => { output += chunk; });
		child.stderr.on('data', (chunk) => { output += chunk; });
		child.once('error', reject);
		child.once('close', (code) => code === 0 ? resolve(output) : reject(new Error(`worker failed (${code})\n${output}`)));
	});
}

async function closeServer(server) {
	if (!server) return;
	server.closeAllConnections?.();
	await new Promise((resolve) => server.close(resolve));
}

async function run() {
	let watchdog;
	let successCollector;
	let retryCollector;
	let protobufCollector;
	try {
		successCollector = await createCollector(successPort, 200);
		retryCollector = await createCollector(retryPort, 429);
		protobufCollector = await createCollector(protobufPort, 200, true);
		fs.writeFileSync(configPath, JSON.stringify({schema_version: 'watchdog.exporters.v1', exporters: [
			{id: 'success', type: 'otlp_http', enabled: true, endpoint: `http://127.0.0.1:${successPort}/v1/traces`, mapping_profile: 'openinference.v1', headers_from_env: {Authorization: 'WDG_TEST_OTLP_AUTH'}, batch_records: 32, timeout_seconds: 3, max_attempts: 3},
			{id: 'collector', type: 'otlp_http', enabled: true, endpoint: `http://127.0.0.1:${successPort}/collector/v1/traces`, mapping_profile: 'otel.genai.v1', headers_from_env: {Authorization: 'WDG_TEST_OTLP_AUTH'}, batch_records: 32, timeout_seconds: 3, max_attempts: 3},
			{id: 'langfuse', type: 'otlp_http', enabled: true, endpoint: `http://127.0.0.1:${successPort}/langfuse/v1/traces`, mapping_profile: 'otel.genai.v1', headers_from_env: {Authorization: 'WDG_TEST_OTLP_AUTH'}, batch_records: 32, timeout_seconds: 3, max_attempts: 3},
			{id: 'phoenix', type: 'otlp_http', enabled: true, endpoint: `http://127.0.0.1:${successPort}/phoenix/v1/traces`, mapping_profile: 'openinference.v1', headers_from_env: {Authorization: 'WDG_TEST_OTLP_AUTH'}, batch_records: 32, timeout_seconds: 3, max_attempts: 3},
			{id: 'grafana-tempo', type: 'otlp_http', enabled: true, endpoint: `http://127.0.0.1:${successPort}/tempo/v1/traces`, mapping_profile: 'otel.genai.v1', headers_from_env: {Authorization: 'WDG_TEST_OTLP_AUTH'}, batch_records: 32, timeout_seconds: 3, max_attempts: 3},
			{id: 'datadog', type: 'otlp_http', enabled: true, endpoint: `http://127.0.0.1:${successPort}/datadog/v1/traces`, mapping_profile: 'otel.genai.v1', headers_from_env: {'DD-API-KEY': 'WDG_TEST_DATADOG_KEY'}, batch_records: 32, timeout_seconds: 3, max_attempts: 3},
			{id: 'honeycomb', type: 'otlp_http', enabled: true, endpoint: `http://127.0.0.1:${successPort}/honeycomb/v1/traces`, mapping_profile: 'otel.genai.v1', headers_from_env: {'x-honeycomb-team': 'WDG_TEST_HONEYCOMB_KEY'}, batch_records: 32, timeout_seconds: 3, max_attempts: 3},
			{id: 'retry', type: 'otlp_http', enabled: true, endpoint: `http://127.0.0.1:${retryPort}/v1/traces`, mapping_profile: 'otel.genai.v1', batch_records: 32, timeout_seconds: 3, max_attempts: 3},
			{id: 'protobuf', type: 'otlp_http', enabled: true, endpoint: `http://127.0.0.1:${protobufPort}/v1/traces`, mapping_profile: 'otel.genai.v1', encoding: 'protobuf', compression: 'gzip', batch_records: 32, timeout_seconds: 3, max_attempts: 3},
			{id: 'expired', type: 'otlp_http', enabled: true, endpoint: 'http://127.0.0.1:17731/v1/traces', mapping_profile: 'otel.genai.v1', batch_records: 32, timeout_seconds: 1, max_attempts: 3, max_queue_age_seconds: 60},
		]}));
		watchdog = await startWatchdog();
		const batch = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/telemetry-v2/canonical-model-batch.json'), 'utf8'));
		batch.batch_id = 'exporter-conformance-1';
		batch.records[0].content = [{class: 'prompt', media_type: 'text/plain', value: 'export-content-canary', truncated: false}];
		batch.records[0].privacy.content_mode = 'full';
		const intake = await request('POST', '/telemetry/v2/batches', batch);
		assert.strictEqual(intake.status, 200, intake.body);
		const queueDb = new DatabaseSync(dbPath);
		queueDb.prepare("UPDATE telemetry_export_deliveries SET created_at_ms = ? WHERE profile_id = 'expired'").run(Date.now() - 120_000);
		queueDb.close();

		const workerOutput = await runWorker();
		assert.match(workerOutput, /"status":"sent"/);
		assert.match(workerOutput, /"status":"retry"/);
		assert.match(workerOutput, /"profile":"expired"[^}]*"status":"idle"/);
		assert.strictEqual(successCollector.received.length, 7, 'destination-profile delivery count drift');
		assert.strictEqual(retryCollector.received.length, 1, 'retry collector delivery count drift');
		assert.strictEqual(protobufCollector.received.length, 1, 'protobuf collector delivery count drift');
		const delivered = successCollector.received.find((item) => item.url === '/v1/traces');
		assert.strictEqual(delivered.method, 'POST');
		assert.strictEqual(delivered.url, '/v1/traces');
		assert.strictEqual(delivered.headers.authorization, 'Bearer exporter-secret-canary');
		assert.ok(JSON.parse(delivered.body.toString()).resourceSpans, 'OTLP request shape missing resourceSpans');
		assert.ok(delivered.body.includes(Buffer.from('openinference.span.kind')), 'OpenInference mapping profile was not applied');
		assert.ok(!delivered.body.includes(Buffer.from('export-content-canary')), 'exporter bypassed authoritative content policy');
		const protobufDelivery = protobufCollector.received[0];
		assert.strictEqual(protobufDelivery.headers['content-type'], 'application/x-protobuf');
		assert.strictEqual(protobufDelivery.headers['content-encoding'], 'gzip');
		const uncompressedProtobuf = zlib.gunzipSync(protobufDelivery.body);
		assert.strictEqual(uncompressedProtobuf[0], 0x0a, `protobuf request must start with resource_spans field; bytes=${uncompressedProtobuf.length}; worker=${workerOutput}`);
		assert.ok(uncompressedProtobuf.includes(Buffer.from('gen_ai.usage.input_tokens')), 'protobuf GenAI mapping was not applied');
		assert.ok(!uncompressedProtobuf.includes(Buffer.from('export-content-canary')), 'protobuf exporter bypassed authoritative content policy');
		assert.ok(!workerOutput.includes('exporter-secret-canary'), 'worker output leaked exporter credential');
		assert.ok(!workerOutput.includes('datadog-secret-canary'), 'worker output leaked Datadog credential');
		assert.ok(!workerOutput.includes('honeycomb-secret-canary'), 'worker output leaked Honeycomb credential');
		const byPath = new Map(successCollector.received.map((item) => [item.url, item]));
		for (const pathname of ['/collector/v1/traces', '/langfuse/v1/traces', '/phoenix/v1/traces', '/tempo/v1/traces', '/datadog/v1/traces', '/honeycomb/v1/traces']) assert.ok(byPath.has(pathname), `missing destination profile ${pathname}`);
		assert.strictEqual(byPath.get('/datadog/v1/traces').headers['dd-api-key'], 'datadog-secret-canary');
		assert.strictEqual(byPath.get('/honeycomb/v1/traces').headers['x-honeycomb-team'], 'honeycomb-secret-canary');
		assert.ok(byPath.get('/phoenix/v1/traces').body.includes(Buffer.from('openinference.span.kind')), 'Phoenix profile did not apply OpenInference');
		assert.ok(byPath.get('/langfuse/v1/traces').body.includes(Buffer.from('gen_ai.usage.input_tokens')), 'Langfuse OTLP profile lost GenAI usage');

		const statusResponse = await request('GET', '/api/telemetry/v2/export-status');
		assert.strictEqual(statusResponse.status, 200, statusResponse.body);
		const rows = JSON.parse(statusResponse.body).data.deliveries;
		assert.ok(rows.some((row) => row.profile_id === 'success' && row.status === 'sent' && row.records === 1));
		assert.ok(rows.some((row) => row.profile_id === 'retry' && row.status === 'retry' && row.records === 1));
		assert.ok(rows.some((row) => row.profile_id === 'protobuf' && row.status === 'sent' && row.records === 1));
		for (const profileId of ['collector', 'langfuse', 'phoenix', 'grafana-tempo', 'datadog', 'honeycomb']) assert.ok(rows.some((row) => row.profile_id === profileId && row.status === 'sent' && row.records === 1), `profile ${profileId} was not sent`);
		const canaryDb = new DatabaseSync(dbPath);
		canaryDb.exec('PRAGMA wal_checkpoint(TRUNCATE)');
		canaryDb.close();
		for (const candidate of [dbPath, dbPath + '-wal']) {
			if (!fs.existsSync(candidate)) continue;
			const bytes = fs.readFileSync(candidate);
			for (const canary of ['export-content-canary', 'exporter-secret-canary', 'datadog-secret-canary', 'honeycomb-secret-canary']) assert.ok(!bytes.includes(Buffer.from(canary)), `${path.basename(candidate)} retained ${canary}`);
		}
		assert.ok(rows.some((row) => row.profile_id === 'expired' && row.status === 'dropped' && row.records === 1));
	} catch (error) {
		if (watchdog) error.stack += `\nWatchdog output:\n${watchdog.output().slice(-4000)}`;
		throw error;
	} finally {
		if (watchdog && watchdog.child.exitCode == null) {
			watchdog.child.kill('SIGTERM');
			await delay(200);
			if (watchdog.child.exitCode == null) watchdog.child.kill('SIGKILL');
		}
		await closeServer(successCollector && successCollector.server);
		await closeServer(retryCollector && retryCollector.server);
		await closeServer(protobufCollector && protobufCollector.server);
		fs.rmSync(tempDir, {recursive: true, force: true});
	}
}

run().then(() => console.log('exporter_conformance_suite: PASS')).catch((error) => {
	console.error(error.stack || error);
	process.exit(1);
});
