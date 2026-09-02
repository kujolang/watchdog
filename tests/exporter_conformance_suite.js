const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
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

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function createCollector(port, status) {
	const received = [];
	const server = http.createServer((req, res) => {
		let body = '';
		req.on('data', (chunk) => { body += chunk; });
		req.on('end', () => {
			received.push({method: req.method, url: req.url, headers: req.headers, body});
			res.writeHead(status, {'Content-Type': 'application/json', ...(status === 429 ? {'Retry-After': '1'} : {})});
			res.end(status === 200 ? '{}' : JSON.stringify({error: 'rate limited'}));
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
			env: {...process.env, WDG_DB_PATH: dbPath, WDG_EXPORTERS_CONFIG_PATH: configPath, WDG_TEST_OTLP_AUTH: 'Bearer exporter-secret-canary'},
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
	try {
		successCollector = await createCollector(successPort, 200);
		retryCollector = await createCollector(retryPort, 429);
		fs.writeFileSync(configPath, JSON.stringify({schema_version: 'watchdog.exporters.v1', exporters: [
			{id: 'success', type: 'otlp_http', enabled: true, endpoint: `http://127.0.0.1:${successPort}/v1/traces`, mapping_profile: 'openinference.v1', headers_from_env: {Authorization: 'WDG_TEST_OTLP_AUTH'}, batch_records: 32, timeout_seconds: 3, max_attempts: 3},
			{id: 'retry', type: 'otlp_http', enabled: true, endpoint: `http://127.0.0.1:${retryPort}/v1/traces`, mapping_profile: 'otel.genai.v1', batch_records: 32, timeout_seconds: 3, max_attempts: 3},
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
		assert.strictEqual(successCollector.received.length, 1, 'success collector delivery count drift');
		assert.strictEqual(retryCollector.received.length, 1, 'retry collector delivery count drift');
		const delivered = successCollector.received[0];
		assert.strictEqual(delivered.method, 'POST');
		assert.strictEqual(delivered.url, '/v1/traces');
		assert.strictEqual(delivered.headers.authorization, 'Bearer exporter-secret-canary');
		assert.ok(JSON.parse(delivered.body).resourceSpans, 'OTLP request shape missing resourceSpans');
		assert.ok(delivered.body.includes('openinference.span.kind'), 'OpenInference mapping profile was not applied');
		assert.ok(!delivered.body.includes('export-content-canary'), 'exporter bypassed authoritative content policy');
		assert.ok(!workerOutput.includes('exporter-secret-canary'), 'worker output leaked exporter credential');

		const statusResponse = await request('GET', '/api/telemetry/v2/export-status');
		assert.strictEqual(statusResponse.status, 200, statusResponse.body);
		const rows = JSON.parse(statusResponse.body).data.deliveries;
		assert.ok(rows.some((row) => row.profile_id === 'success' && row.status === 'sent' && row.records === 1));
		assert.ok(rows.some((row) => row.profile_id === 'retry' && row.status === 'retry' && row.records === 1));
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
		fs.rmSync(tempDir, {recursive: true, force: true});
	}
}

run().then(() => console.log('exporter_conformance_suite: PASS')).catch((error) => {
	console.error(error.stack || error);
	process.exit(1);
});
