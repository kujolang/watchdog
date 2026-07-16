const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TMP_DIR = path.join(ROOT, 'tmp');
const { resolveKujoBinOrThrow } = require('./_kujo_bin');
const KUJO_BIN = resolveKujoBinOrThrow(__filename);

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureTmpDir() {
	if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

function httpRequest(port, method, pathname, headers = {}, body = '') {
	return new Promise((resolve, reject) => {
		const req = http.request(
			{
				host: '127.0.0.1',
				port,
				method,
				path: pathname,
				headers,
			},
			res => {
				let text = '';
				res.on('data', chunk => {
					text += chunk.toString();
				});
				res.on('end', () => {
					resolve({ status: res.statusCode || 0, body: text });
				});
			}
		);
		req.on('error', reject);
		if (body) req.write(body);
		req.end();
	});
}

function parseApiData(resp, endpoint) {
	assert.strictEqual(resp.status, 200, endpoint + ' should return 200');
	const parsed = JSON.parse(resp.body);
	assert.strictEqual(parsed.ok, true, endpoint + ' should return ok=true');
	return parsed.data;
}

function writeProxyConfig(filePath, upstreamPort) {
	fs.writeFileSync(
		filePath,
		JSON.stringify(
			{
				upstream_base_url: 'http://127.0.0.1:' + upstreamPort + '/v1',
				auth_mode: 'passthrough',
				upstream_api_key: '',
				upstream_api_key_env: '',
			},
			null,
			2
		)
	);
}

function startStub(port) {
	const server = http.createServer((req, res) => {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ id: 'corr-ok', model: 'stub-model', choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
	});

	return new Promise((resolve, reject) => {
		server.on('error', reject);
		server.listen(port, '127.0.0.1', () => resolve(server));
	});
}

async function stopNodeServer(server) {
	if (!server) return;
	await new Promise(resolve => server.close(() => resolve()));
}

async function startWatchdog(port, dbPath, cfgPath) {
	const child = spawn(KUJO_BIN, ['run', '--interpreter', 'dashboard_server.kujo'], {
		cwd: ROOT,
		env: {
			...process.env,
			WDG_PORT: String(port),
			WDG_DB_PATH: dbPath,
			WDG_PROXY_CONFIG_PATH: cfgPath,
			WDG_API_AUTH_MODE: 'off',
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	});

	let output = '';
	child.stdout.on('data', chunk => {
		output += chunk.toString();
	});
	child.stderr.on('data', chunk => {
		output += chunk.toString();
	});

	for (let i = 0; i < 120; i += 1) {
		try {
			const probe = await httpRequest(port, 'GET', '/api/stats');
			if (probe.status === 200) return { child, outputRef: () => output };
		} catch (err) {
			if (child.exitCode != null) break;
		}
		await delay(100);
	}

	child.kill('SIGTERM');
	throw new Error('Watchdog failed to start.\n' + output);
}

async function stopWatchdog(child) {
	if (!child || child.killed) return;
	child.kill('SIGTERM');
	await delay(250);
	if (child.exitCode == null) child.kill('SIGKILL');
}

function assertDashboardReferences() {
	const html = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
	assert.ok(html.includes('Workflow'), 'dashboard requests table should include workflow column');
	assert.ok(html.includes('Correlation'), 'dashboard requests table should include correlation column');
	assert.ok(html.includes('safeText(r.workflow_id ||'), 'dashboard rendering should include workflow_id field');
	assert.ok(html.includes('safeText(r.task_id ||'), 'dashboard rendering should include task_id field');
	assert.ok(html.includes('safeText(r.correlation_id ||'), 'dashboard rendering should include correlation_id field');
}

async function run() {

	ensureTmpDir();
	const upstreamPort = 8851;
	const watchdogPort = 7761;
	const dbPath = path.join(TMP_DIR, 'kennel-correlation.db');
	const cfgPath = path.join(TMP_DIR, 'kennel-correlation-config.json');
	writeProxyConfig(cfgPath, upstreamPort);

	const stub = await startStub(upstreamPort);
	const wd = await startWatchdog(watchdogPort, dbPath, cfgPath);

	try {
		const proxyResp = await httpRequest(
			watchdogPort,
			'POST',
			'/proxy/v1/chat/completions',
			{
				'Content-Type': 'application/json',
				'X-Observe-Session-Id': 'sess_corr_1',
				'X-Observe-Project-Id': 'ai-chat',
				'X-Observe-Workflow-Id': 'wf_alpha',
				'X-Observe-Task-Id': 'task_beta',
				'X-Observe-Correlation-Id': 'corr_gamma',
			},
			JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: 'capture correlation metadata' }] })
		);
		assert.strictEqual(proxyResp.status, 200, 'proxy request should succeed');

		const reqRows = parseApiData(
			await httpRequest(watchdogPort, 'GET', '/api/requests?session_id=sess_corr_1&page_size=20'),
			'/api/requests?session_id'
		);
		assert.ok(reqRows.length >= 1, 'session-filtered rows should include request');
		const row = reqRows[0];
		assert.strictEqual(row.workflow_id, 'wf_alpha');
		assert.strictEqual(row.project_id, 'ai-chat');
		assert.strictEqual(row.source_app, 'ai-chat');
		assert.strictEqual(row.data_class, 'live');
		assert.strictEqual(row.task_id, 'task_beta');
		assert.strictEqual(row.correlation_id, 'corr_gamma');

		const wfRows = parseApiData(
			await httpRequest(watchdogPort, 'GET', '/api/requests?workflow_id=wf_alpha&page_size=20'),
			'/api/requests?workflow_id'
		);
		assert.ok(wfRows.length >= 1, 'workflow_id filter should return matching rows');

		const noWfRows = parseApiData(
			await httpRequest(watchdogPort, 'GET', '/api/requests?workflow_id=wf_missing&page_size=20'),
			'/api/requests?workflow_id=wf_missing'
		);
		assert.strictEqual(noWfRows.length, 0, 'workflow_id filter should exclude non-matching rows');

		const taskRows = parseApiData(
			await httpRequest(watchdogPort, 'GET', '/api/requests?task_id=task_beta&page_size=20'),
			'/api/requests?task_id'
		);
		assert.ok(taskRows.length >= 1, 'task_id filter should return matching rows');

		const corrRows = parseApiData(
			await httpRequest(watchdogPort, 'GET', '/api/requests?correlation_id=corr_gamma&page_size=20'),
			'/api/requests?correlation_id'
		);
		assert.ok(corrRows.length >= 1, 'correlation_id filter should return matching rows');

		const exportData = parseApiData(
			await httpRequest(watchdogPort, 'GET', '/api/export?session_id=sess_corr_1'),
			'/api/export'
		);
		assert.ok(Array.isArray(exportData.requests) && exportData.requests.length >= 1, 'export should include request rows');
		assert.ok(Object.prototype.hasOwnProperty.call(exportData.requests[0], 'workflow_id'));
		assert.ok(Object.prototype.hasOwnProperty.call(exportData.requests[0], 'task_id'));
		assert.ok(Object.prototype.hasOwnProperty.call(exportData.requests[0], 'correlation_id'));

		assertDashboardReferences();
		console.log('kennel_correlation_fields_check: PASS');
	} finally {
		await stopWatchdog(wd.child);
		await stopNodeServer(stub);
	}
}

run().catch(err => {
	console.error('kennel_correlation_fields_check: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
