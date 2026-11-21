const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const {DatabaseSync} = require('node:sqlite');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const { resolveKujoBinOrThrow } = require('./_kujo_bin');
const KUJO_BIN = resolveKujoBinOrThrow(__filename);
const API_TOKEN = 'rate-limit-api-token';

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
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
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ id: 'ok', model: 'stub-model', choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
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

	for (const startupDeadline = performance.now() + 30_000; performance.now() < startupDeadline;) {
		try {
			const probe = await httpRequest(port, 'GET', '/readyz');
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
	if (!child || child.exitCode != null) return;
	child.kill('SIGTERM');
	await delay(250);
	if (child.exitCode == null) child.kill('SIGKILL');
}

async function runRateLimitOnScenario(upstreamPort, tempDir) {
	const port = 7751;
	const dbPath = path.join(tempDir, 'rate-limit-on.db');
	const cfgPath = path.join(tempDir, 'rate-limit-on-config.json');
	writeProxyConfig(cfgPath, upstreamPort);

	const wd = await startWatchdog(port, dbPath, cfgPath, {
		WDG_RATE_LIMIT_MODE: 'basic',
		WDG_RATE_LIMIT_MAX_REQUESTS: '3',
		WDG_RATE_LIMIT_WINDOW_SECS: '30',
		WDG_API_AUTH_MODE: 'token',
		WDG_API_AUTH_TOKEN: API_TOKEN,
	});

	try {
		for (let i = 0; i < 3; i += 1) {
			const ok = await httpRequest(port, 'GET', '/api/stats', { 'X-Observe-Session-Id': 'sess_rate_api', 'X-Watchdog-Token': API_TOKEN });
			assert.strictEqual(ok.status, 200, 'within limit API request should succeed');
		}

		const blockedApi = await httpRequest(port, 'GET', '/api/stats', { 'X-Observe-Session-Id': 'sess_rate_api', 'X-Watchdog-Token': API_TOKEN });
		assert.strictEqual(blockedApi.status, 429, 'API should enforce rate limit');

		const differentSession = await httpRequest(port, 'GET', '/api/stats', { 'X-Observe-Session-Id': 'sess_rate_other', 'X-Watchdog-Token': API_TOKEN });
		assert.strictEqual(differentSession.status, 200, 'different session key should get separate bucket');

		const concurrent = await Promise.all(Array.from({ length: 12 }, (_, index) => httpRequest(port, 'GET', '/api/stats', {
			'X-Observe-Session-Id': 'sess_concurrent_' + index,
			'X-Watchdog-Token': API_TOKEN,
		})));
		assert.ok(concurrent.every(result => result.status === 200), 'concurrent authenticated API requests should not corrupt rate-limit state');

		for (let i = 0; i < 3; i += 1) {
			const proxyOk = await httpRequest(
				port,
				'POST',
				'/proxy/v1/chat/completions',
				{ 'Content-Type': 'application/json', 'X-Observe-Session-Id': 'sess_rate_proxy' },
				JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: 'rate limit check' }] })
			);
			assert.strictEqual(proxyOk.status, 200, 'within limit proxy request should succeed');
		}

		const proxyBlocked = await httpRequest(
			port,
			'POST',
			'/proxy/v1/chat/completions',
			{ 'Content-Type': 'application/json', 'X-Observe-Session-Id': 'sess_rate_proxy' },
			JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: 'should block' }] })
		);
		assert.strictEqual(proxyBlocked.status, 429, 'proxy should enforce rate limit');

	} finally {
		await stopWatchdog(wd.child);
	}
}

async function runSharedDatabaseScenario(upstreamPort, tempDir) {
	const dbPath = path.join(tempDir, 'rate-limit-shared.db');
	const cfgPath = path.join(tempDir, 'rate-limit-shared-config.json');
	writeProxyConfig(cfgPath, upstreamPort);
	const ports = [7757, 7758];
	const config = {
		WDG_RATE_LIMIT_MODE: 'basic',
		WDG_RATE_LIMIT_MAX_REQUESTS: '5',
		WDG_RATE_LIMIT_WINDOW_SECS: '30',
		WDG_BACKUP_ENABLED: 'false',
	};
	const servers = [];
	try {
		for (const port of ports) servers.push(await startWatchdog(port, dbPath, cfgPath, config));
		const results = await Promise.all(Array.from({length: 40}, (_, index) =>
			httpRequest(ports[index % ports.length], 'GET', '/api/stats', {'X-Observe-Session-Id': 'shared-bucket'})));
		assert.strictEqual(results.filter(result => result.status === 200).length, 5, 'both listeners must share exactly one quota');
		assert.strictEqual(results.filter(result => result.status === 429).length, 35, 'every excess request must be throttled');
		const db = new DatabaseSync(dbPath, {readOnly: true});
		try {
			assert.strictEqual(db.prepare("SELECT request_count FROM rate_limit_buckets WHERE bucket_key = 'session:shared-bucket'").get().request_count, 40);
		} finally { db.close(); }
	} finally {
		await Promise.all(servers.map(server => stopWatchdog(server.child)));
	}
}

async function runRateLimitResetScenario(upstreamPort, tempDir) {
	const port = 7753;
	const dbPath = path.join(tempDir, 'rate-limit-reset.db');
	const cfgPath = path.join(tempDir, 'rate-limit-reset-config.json');
	writeProxyConfig(cfgPath, upstreamPort);

	const wd = await startWatchdog(port, dbPath, cfgPath, {
		WDG_RATE_LIMIT_MODE: 'basic',
		WDG_RATE_LIMIT_MAX_REQUESTS: '1',
		WDG_RATE_LIMIT_WINDOW_SECS: '2',
		WDG_API_AUTH_MODE: 'token',
		WDG_API_AUTH_TOKEN: API_TOKEN,
	});

	try {
		const first = await httpRequest(port, 'GET', '/api/stats', { 'X-Observe-Session-Id': 'sess_rate_reset', 'X-Watchdog-Token': API_TOKEN });
		assert.strictEqual(first.status, 200, 'first reset-window request should succeed');
		const blocked = await httpRequest(port, 'GET', '/api/stats', { 'X-Observe-Session-Id': 'sess_rate_reset', 'X-Watchdog-Token': API_TOKEN });
		assert.strictEqual(blocked.status, 429, 'reset-window request should block before the window expires');
		await delay(2200);
		const afterWindow = await httpRequest(port, 'GET', '/api/stats', { 'X-Observe-Session-Id': 'sess_rate_reset', 'X-Watchdog-Token': API_TOKEN });
		assert.strictEqual(afterWindow.status, 200, 'bucket should reset after window duration');
	} finally {
		await stopWatchdog(wd.child);
	}
}

async function runRateLimitOffScenario(upstreamPort, tempDir) {
	const port = 7752;
	const dbPath = path.join(tempDir, 'rate-limit-off.db');
	const cfgPath = path.join(tempDir, 'rate-limit-off-config.json');
	writeProxyConfig(cfgPath, upstreamPort);

	const wd = await startWatchdog(port, dbPath, cfgPath, {
		WDG_RATE_LIMIT_MODE: 'off',
		WDG_RATE_LIMIT_MAX_REQUESTS: '1',
		WDG_RATE_LIMIT_WINDOW_SECS: '30',
	});

	try {
		for (let i = 0; i < 3; i += 1) {
			const ok = await httpRequest(port, 'GET', '/api/stats', { 'X-Observe-Session-Id': 'sess_rate_disabled', 'X-Watchdog-Token': API_TOKEN });
			assert.strictEqual(ok.status, 200, 'rate-limit off should not throttle API calls');
		}
	} finally {
		await stopWatchdog(wd.child);
	}
}

async function run() {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-rate-limit-'));
	const upstreamPort = 8841;

	let stub;
	try {
		stub = await startStub(upstreamPort);
		await runRateLimitOnScenario(upstreamPort, tempDir);
		await runSharedDatabaseScenario(upstreamPort, tempDir);
		await runRateLimitResetScenario(upstreamPort, tempDir);
		await runRateLimitOffScenario(upstreamPort, tempDir);
		console.log('rate_limit_controls_check: PASS');
	} finally {
		await stopNodeServer(stub);
		fs.rmSync(tempDir, {recursive: true, force: true});
	}
}

run().catch(err => {
	console.error('rate_limit_controls_check: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
