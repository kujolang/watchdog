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
					resolve({ status: res.statusCode || 0, body: text, headers: res.headers || {} });
				});
			}
		);
		req.on('error', reject);
		if (body) req.write(body);
		req.end();
	});
}

function parseJson(text, label) {
	try {
		return JSON.parse(text);
	} catch (err) {
		throw new Error(label + ' returned invalid JSON: ' + err.message + '\n' + String(text).slice(0, 300));
	}
}

async function startWatchdog(port, dbPath) {
	const child = spawn(KUJO_BIN, ['run', 'dashboard_server.kujo', '--interpreter'], {
		cwd: ROOT,
		env: {
			...process.env,
			WDG_PORT: String(port),
			WDG_DB_PATH: dbPath,
			WDG_API_AUTH_MODE: 'token',
			WDG_API_AUTH_TOKEN: 'super-secret-diagnostics-token',
			WDG_PROXY_AUTHZ_MODE: 'token',
			WDG_PROXY_AUTHZ_TOKEN: 'super-secret-proxy-token',
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
	if (child.exitCode == null) child.kill('SIGKILL');
}

async function run() {

	ensureTmpDir();
	const port = 7804;
	const dbPath = path.join(TMP_DIR, 'admin-diagnostics-check.db');
	[dbPath, dbPath + '-shm', dbPath + '-wal'].forEach(filePath => {
		if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
	});

	let watchdog = null;
	try {
		watchdog = await startWatchdog(port, dbPath);

		const unauthorized = await httpRequest(port, 'GET', '/api/admin/diagnostics');
		assert.strictEqual(unauthorized.status, 401, 'diagnostics should require API auth token');

		const authorized = await httpRequest(port, 'GET', '/api/admin/diagnostics', {
			'X-Watchdog-Token': 'super-secret-diagnostics-token',
		});
		assert.strictEqual(authorized.status, 200, 'diagnostics should return 200 with valid token');
		const payload = parseJson(authorized.body, '/api/admin/diagnostics');
		assert.strictEqual(payload.ok, true, 'diagnostics payload should return ok=true');
		assert.ok(payload.data && typeof payload.data === 'object', 'diagnostics data should be object');
		assert.ok(payload.data.runtime && typeof payload.data.runtime === 'object', 'diagnostics should include runtime summary');
		assert.ok(Array.isArray(payload.data.migrations), 'diagnostics should include migrations array');
		assert.ok(payload.data.db_stats && typeof payload.data.db_stats === 'object', 'diagnostics should include db_stats object');

		assert.strictEqual(String(payload.data.runtime.api_auth_mode || ''), 'token', 'runtime summary should report API auth mode');
		assert.strictEqual(Boolean(payload.data.runtime.api_auth_token_present), true, 'runtime summary should include token presence boolean');
		assert.strictEqual(Boolean(payload.data.runtime.proxy_auth_token_present), true, 'runtime summary should include proxy token presence boolean');

		assert.ok(!authorized.body.includes('super-secret-diagnostics-token'), 'diagnostics response should not expose API auth token value');
		assert.ok(!authorized.body.includes('super-secret-proxy-token'), 'diagnostics response should not expose proxy auth token value');

		console.log('admin_diagnostics_check: PASS');
	} finally {
		await stopWatchdog(watchdog && watchdog.child ? watchdog.child : null);
	}
}

run().catch(err => {
	console.error('admin_diagnostics_check: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
