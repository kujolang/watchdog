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
					resolve({ status: res.statusCode || 0, body: text, headers: res.headers || {} });
				});
			}
		);
		req.on('error', reject);
		if (body) req.write(body);
		req.end();
	});
}

function parseJsonSafe(text, label) {
	try {
		return JSON.parse(text);
	} catch (err) {
		throw new Error(label + ' returned invalid JSON: ' + err.message + '\nBody: ' + String(text).slice(0, 300));
	}
}

function startUpstreamStub(port) {
	const received = [];
	const server = http.createServer((req, res) => {
		let body = '';
		req.on('data', chunk => {
			body += chunk.toString();
		});
		req.on('end', () => {
			received.push({
				method: req.method || '',
				path: req.url || '',
				authorization: req.headers.authorization || '',
				body,
			});

			const pathname = String(req.url || '').split('?')[0];
			if (pathname === '/v1/models') {
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ data: [{ id: 'stub-model' }] }));
				return;
			}

			if (pathname === '/v1/chat/completions') {
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({
					id: 'proxy-authz-ok',
					model: 'stub-authz-model',
					choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
					usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
				}));
				return;
			}

			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'not found' }));
		});
	});

	return new Promise((resolve, reject) => {
		server.on('error', reject);
		server.listen(port, '127.0.0.1', () => {
			resolve({ server, received });
		});
	});
}

async function stopNodeServer(server) {
	if (!server) return;
	await new Promise(resolve => {
		server.close(() => resolve());
	});
}

function writeProxyConfig(filePath, config) {
	fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
}

async function startWatchdog(port, dbPath, configPath, extraEnv = {}) {
	const child = spawn(KUJO_BIN, ['run', '--interpreter', 'dashboard_server.kujo'], {
		cwd: ROOT,
		env: {
			...process.env,
			WDG_PORT: String(port),
			WDG_DB_PATH: dbPath,
			WDG_PROXY_CONFIG_PATH: configPath,
			WDG_API_AUTH_MODE: 'off',
			...extraEnv,
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
			const probe = await httpRequest(port, 'GET', '/healthz');
			if (probe.status === 200) {
				return { child, outputRef: () => output };
			}
		} catch (err) {
			if (child.exitCode != null) {
				break;
			}
		}
		await delay(100);
	}

	child.kill('SIGTERM');
	throw new Error('Watchdog did not become ready.\n' + output);
}

async function stopWatchdog(child) {
	if (!child || child.killed) return;
	child.kill('SIGTERM');
	await delay(250);
	if (child.exitCode == null) {
		child.kill('SIGKILL');
	}
}

async function run() {

	ensureTmpDir();
	const upstreamPort = 8862;
	const watchdogPort = 7792;
	const dbPath = path.join(TMP_DIR, 'proxy-authz-check.db');
	const cfgPath = path.join(TMP_DIR, 'proxy-authz-check-config.json');

	writeProxyConfig(cfgPath, {
		upstream_base_url: 'http://127.0.0.1:' + upstreamPort + '/v1',
		auth_mode: 'passthrough',
		upstream_api_key: '',
		upstream_api_key_env: '',
	});

	const stub = await startUpstreamStub(upstreamPort);
	let watchdog = null;
	let watchdogMissing = null;

	try {
		watchdog = await startWatchdog(watchdogPort, dbPath, cfgPath, {
			WDG_PROXY_AUTHZ_MODE: 'token',
			WDG_PROXY_AUTHZ_TOKEN: 'proxy-secret',
			WDG_PROXY_AUTHZ_ALLOWLIST: '/healthz,/readyz,/proxy/v1/models',
		});

		const healthResp = await httpRequest(watchdogPort, 'GET', '/healthz');
		assert.strictEqual(healthResp.status, 200, '/healthz should stay open when proxy auth is enabled');

		const allowlistResp = await httpRequest(watchdogPort, 'GET', '/proxy/v1/models');
		assert.strictEqual(allowlistResp.status, 200, 'allowlisted proxy route should bypass proxy token auth');

		const missingTokenResp = await httpRequest(
			watchdogPort,
			'POST',
			'/proxy/v1/chat/completions',
			{ 'Content-Type': 'application/json' },
			JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: 'missing token' }] })
		);
		assert.strictEqual(missingTokenResp.status, 401, 'proxy route should reject requests without token');
		const missingTokenJson = parseJsonSafe(missingTokenResp.body, 'missing token response');
		assert.strictEqual(missingTokenJson.ok, false);

		const invalidTokenResp = await httpRequest(
			watchdogPort,
			'POST',
			'/proxy/v1/chat/completions',
			{
				'Content-Type': 'application/json',
				'X-Watchdog-Proxy-Token': 'bad-token',
			},
			JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: 'bad token' }] })
		);
		assert.strictEqual(invalidTokenResp.status, 403, 'proxy route should reject invalid proxy tokens');

		const validHeaderResp = await httpRequest(
			watchdogPort,
			'POST',
			'/proxy/v1/chat/completions',
			{
				'Content-Type': 'application/json',
				'X-Watchdog-Proxy-Token': 'proxy-secret',
			},
			JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: 'header token' }] })
		);
		assert.strictEqual(validHeaderResp.status, 200, 'proxy route should accept X-Watchdog-Proxy-Token');

		const validBearerResp = await httpRequest(
			watchdogPort,
			'POST',
			'/proxy/v1/chat/completions',
			{
				'Content-Type': 'application/json',
				Authorization: 'Bearer proxy-secret',
			},
			JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: 'bearer token' }] })
		);
		assert.strictEqual(validBearerResp.status, 200, 'proxy route should accept Authorization bearer token');

		assert.strictEqual(stub.received.length, 3, 'only allowlisted and authorized proxy calls should reach upstream');

		watchdogMissing = await startWatchdog(watchdogPort + 1, dbPath + '.missing', cfgPath, {
			WDG_PROXY_AUTHZ_MODE: 'token',
			WDG_PROXY_AUTHZ_TOKEN: '',
			WDG_PROXY_AUTHZ_ALLOWLIST: '/healthz,/readyz',
		});

		const misconfiguredResp = await httpRequest(
			watchdogPort + 1,
			'POST',
			'/proxy/v1/chat/completions',
			{ 'Content-Type': 'application/json' },
			JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: 'misconfigured auth' }] })
		);
		assert.strictEqual(misconfiguredResp.status, 500, 'token mode without configured token should fail closed');
		const misconfiguredJson = parseJsonSafe(misconfiguredResp.body, 'misconfigured response');
		assert.strictEqual(misconfiguredJson.ok, false);

		console.log('proxy_authz_mode_check: PASS');
	} finally {
		await stopWatchdog(watchdog && watchdog.child ? watchdog.child : null);
		await stopWatchdog(watchdogMissing && watchdogMissing.child ? watchdogMissing.child : null);
		await stopNodeServer(stub.server);
	}
}

run().catch(err => {
	console.error('proxy_authz_mode_check: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
