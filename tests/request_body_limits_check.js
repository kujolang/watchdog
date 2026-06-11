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
					text += chunk;
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
	const received = [];
	const server = http.createServer((req, res) => {
		let text = '';
		req.on('data', chunk => {
			text += chunk.toString();
		});
		req.on('end', () => {
			received.push({ path: req.url || '', bodyLength: Buffer.byteLength(text) });
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ id: 'ok', model: 'stub', choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
		});
	});

	return new Promise((resolve, reject) => {
		server.on('error', reject);
		server.listen(port, '127.0.0.1', () => resolve({ server, received }));
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

function parseBodyByteLength(jsonBody) {
	return Buffer.byteLength(jsonBody, 'utf8');
}

function buildContentBody(targetMinLen) {
	let content = 'a';
	while (true) {
		const body = JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content }] });
		if (parseBodyByteLength(body) >= targetMinLen) {
			return body;
		}
		content += 'a';
	}
}

async function runThresholdScenario(upstreamPort) {
	const watchdogPort = 7731;
	const dbPath = path.join(TMP_DIR, 'body-limit-threshold.db');
	const cfgPath = path.join(TMP_DIR, 'body-limit-threshold-config.json');
	writeProxyConfig(cfgPath, upstreamPort);

	const wd = await startWatchdog(watchdogPort, dbPath, cfgPath, {
		WDG_MAX_PROXY_BODY_BYTES: '220',
		WDG_MAX_PARSE_BODY_BYTES: '220',
	});

	try {
		const smallBody = JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: 'ok' }] });
		assert.ok(parseBodyByteLength(smallBody) < 220, 'small payload should be below configured limit');
		const smallResp = await httpRequest(
			watchdogPort,
			'POST',
			'/proxy/v1/chat/completions',
			{ 'Content-Type': 'application/json', 'X-Observe-Session-Id': 'sess_body_limit' },
			smallBody
		);
		assert.strictEqual(smallResp.status, 200, 'below-limit JSON request should succeed');

		const nearLimitBody = buildContentBody(205);
		assert.ok(parseBodyByteLength(nearLimitBody) <= 220, 'near-limit payload must stay within limit');
		const nearLimitResp = await httpRequest(
			watchdogPort,
			'POST',
			'/proxy/v1/chat/completions',
			{ 'Content-Type': 'application/json', 'X-Observe-Session-Id': 'sess_body_limit' },
			nearLimitBody
		);
		assert.strictEqual(nearLimitResp.status, 200, 'near-limit JSON request should succeed');

		const oversizedBody = buildContentBody(260);
		assert.ok(parseBodyByteLength(oversizedBody) > 220, 'oversized payload must exceed limit');
		const oversizedResp = await httpRequest(
			watchdogPort,
			'POST',
			'/proxy/v1/chat/completions',
			{ 'Content-Type': 'application/json', 'X-Observe-Session-Id': 'sess_body_limit' },
			oversizedBody
		);
		assert.strictEqual(oversizedResp.status, 413, 'oversized request should return HTTP 413');

		const malformedResp = await httpRequest(
			watchdogPort,
			'POST',
			'/proxy/v1/chat/completions',
			{ 'Content-Type': 'application/json', 'X-Observe-Session-Id': 'sess_body_limit' },
			'{"model":"gpt-4.1-mini"'
		);
		assert.strictEqual(malformedResp.status, 400, 'malformed JSON body should return HTTP 400');
	} finally {
		await stopWatchdog(wd.child);
	}
}

async function runParseLimitScenario(upstreamPort) {
	const watchdogPort = 7732;
	const dbPath = path.join(TMP_DIR, 'body-limit-parse.db');
	const cfgPath = path.join(TMP_DIR, 'body-limit-parse-config.json');
	writeProxyConfig(cfgPath, upstreamPort);

	const wd = await startWatchdog(watchdogPort, dbPath, cfgPath, {
		WDG_MAX_PROXY_BODY_BYTES: '500',
		WDG_MAX_PARSE_BODY_BYTES: '120',
	});

	try {
		const parseLimitedBody = buildContentBody(170);
		assert.ok(parseBodyByteLength(parseLimitedBody) <= 500, 'parse-limit payload should remain below proxy max body size');
		const parseLimitedResp = await httpRequest(
			watchdogPort,
			'POST',
			'/proxy/v1/chat/completions',
			{ 'Content-Type': 'application/json', 'X-Observe-Session-Id': 'sess_body_parse_limit' },
			parseLimitedBody
		);
		assert.strictEqual(parseLimitedResp.status, 413, 'JSON parse-limit overflow should return HTTP 413');
	} finally {
		await stopWatchdog(wd.child);
	}
}

async function run() {

	ensureTmpDir();
	const upstreamPort = 8821;
	const { server, received } = await startStub(upstreamPort);

	try {
		await runThresholdScenario(upstreamPort);
		await runParseLimitScenario(upstreamPort);

		assert.strictEqual(
			received.length,
			2,
			'only accepted payloads should reach upstream stub when body/parse limits reject requests'
		);
		assert.ok(received.every(entry => entry.path === '/v1/chat/completions'));

		console.log('request_body_limits_check: PASS');
	} finally {
		await stopNodeServer(server);
	}
}

run().catch(err => {
	console.error('request_body_limits_check: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
