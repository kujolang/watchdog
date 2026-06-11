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

function startStub(port) {
	const server = http.createServer((req, res) => {
		const pathname = String(req.url || '').split('?')[0];
		if (pathname === '/v1/chat/completions') {
			res.writeHead(429, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: { message: 'secret token raw-secret-value from upstream failure' } }));
			return;
		}

		res.writeHead(404, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: { message: 'not found' } }));
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

async function startWatchdog(port, dbPath, cfgPath, envExtras) {
	const child = spawn(KUJO_BIN, ['run', '--interpreter', 'dashboard_server.kujo'], {
		cwd: ROOT,
		env: {
			...process.env,
			WDG_PORT: String(port),
			WDG_DB_PATH: dbPath,
			WDG_PROXY_CONFIG_PATH: cfgPath,
			WDG_API_AUTH_MODE: 'off',
			...envExtras,
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

function parseApiData(resp, endpoint) {
	assert.strictEqual(resp.status, 200, endpoint + ' should return 200');
	const parsed = JSON.parse(resp.body);
	assert.strictEqual(parsed.ok, true, endpoint + ' should return ok=true');
	return parsed.data;
}

async function exerciseProxyTraffic(port, sessionId) {
	const secretPrompt = 'authorization bearer sk-live-123 with token raw-secret-value';
	const first = await httpRequest(
		port,
		'POST',
		'/proxy/v1/chat/completions',
		{
			'Content-Type': 'application/json',
			'X-Observe-Session-Id': sessionId,
		},
		JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: secretPrompt }] })
	);
	assert.strictEqual(first.status, 429, 'upstream error should pass through');

	const second = await httpRequest(
		port,
		'POST',
		'/proxy/v1/api_key/leak-secret',
		{
			'Content-Type': 'application/json',
			'X-Observe-Session-Id': sessionId,
		},
		JSON.stringify({ message: 'path secret probe' })
	);
	assert.strictEqual(second.status, 404, 'secondary proxy route should execute for tool_args logging path');
}

async function runRedactionOnScenario(upstreamPort) {
	const port = 7741;
	const dbPath = path.join(TMP_DIR, 'redaction-on.db');
	const cfgPath = path.join(TMP_DIR, 'redaction-on-config.json');
	writeProxyConfig(cfgPath, upstreamPort);

	const wd = await startWatchdog(port, dbPath, cfgPath, {
		WDG_REDACTION_MODE: 'basic',
	});

	try {
		await exerciseProxyTraffic(port, 'sess_redact_on');

		const reqResp = await httpRequest(port, 'GET', '/api/requests?session_id=sess_redact_on&page_size=50');
		const reqRows = parseApiData(reqResp, '/api/requests');
		assert.ok(reqRows.length >= 2, 'redaction-on scenario should log requests');

		reqRows.forEach(row => {
			const prompt = String(row.prompt_summary || '');
			const errorMessage = String(row.error_message || '');
			assert.ok(!prompt.includes('sk-live-123'), 'prompt summary should not contain raw key when redaction is on');
			assert.ok(!prompt.includes('raw-secret-value'), 'prompt summary should not contain raw secret when redaction is on');
			assert.ok(!errorMessage.includes('raw-secret-value'), 'error message should not contain raw secret when redaction is on');
		});

		assert.ok(reqRows.some(row => String(row.prompt_summary || '').includes('[REDACTED')));
		assert.ok(reqRows.some(row => String(row.error_message || '').includes('[REDACTED')));

		const toolResp = await httpRequest(port, 'GET', '/api/tool-calls?session_id=sess_redact_on&page_size=50');
		const toolRows = parseApiData(toolResp, '/api/tool-calls');
		assert.ok(toolRows.length >= 2, 'redaction-on scenario should log tool calls');
		toolRows.forEach(row => {
			const toolArgs = String(row.tool_args || '');
			assert.ok(!toolArgs.includes('leak-secret'), 'tool args should redact sensitive path values');
			assert.ok(!toolArgs.includes('api_key'), 'tool args should redact sensitive key markers');
		});
	} finally {
		await stopWatchdog(wd.child);
	}
}

async function runRedactionOffScenario(upstreamPort) {
	const port = 7742;
	const dbPath = path.join(TMP_DIR, 'redaction-off.db');
	const cfgPath = path.join(TMP_DIR, 'redaction-off-config.json');
	writeProxyConfig(cfgPath, upstreamPort);

	const wd = await startWatchdog(port, dbPath, cfgPath, {
		WDG_REDACTION_MODE: 'off',
	});

	try {
		await exerciseProxyTraffic(port, 'sess_redact_off');
		const reqResp = await httpRequest(port, 'GET', '/api/requests?session_id=sess_redact_off&page_size=50');
		const reqRows = parseApiData(reqResp, '/api/requests');
		assert.ok(reqRows.length >= 2, 'redaction-off scenario should log requests');
		assert.ok(
			reqRows.some(row => String(row.prompt_summary || '').includes('sk-live-123')),
			'redaction off should preserve original prompt secret content'
		);
		assert.ok(
			reqRows.some(row => String(row.error_message || '').includes('raw-secret-value')),
			'redaction off should preserve original error content'
		);
	} finally {
		await stopWatchdog(wd.child);
	}
}

async function run() {

	ensureTmpDir();
	const upstreamPort = 8831;
	const stub = await startStub(upstreamPort);

	try {
		await runRedactionOnScenario(upstreamPort);
		await runRedactionOffScenario(upstreamPort);
		console.log('telemetry_redaction_check: PASS');
	} finally {
		await stopNodeServer(stub);
	}
}

run().catch(err => {
	console.error('telemetry_redaction_check: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
