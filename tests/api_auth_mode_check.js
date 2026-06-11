const assert = require('assert');
const http = require('http');
const fs = require('fs');
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
	if (!fs.existsSync(TMP_DIR)) {
		fs.mkdirSync(TMP_DIR, { recursive: true });
	}
}

function httpRequest(port, method, pathname, headers = {}, body = '') {
	return new Promise((resolve, reject) => {
		const req = http.request(
			{
				host: '127.0.0.1',
				port,
				path: pathname,
				method,
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

function parseJSON(text, label) {
	try {
		return JSON.parse(text);
	} catch (err) {
		throw new Error(label + ' returned invalid JSON: ' + err.message + '\n' + text.slice(0, 250));
	}
}

async function waitForServer(port, child) {
	for (let i = 0; i < 80; i += 1) {
		try {
			const probe = await httpRequest(port, 'GET', '/api/stats');
			if ([200, 401, 403, 500].includes(probe.status)) {
				return;
			}
		} catch (err) {
			if (child.exitCode != null) {
				throw new Error('Server exited before readiness check completed.');
			}
		}
		await delay(100);
	}
	throw new Error('Server did not become ready in time on port ' + port);
}

async function startServer(port, dbPath, extraEnv = {}) {
	const child = spawn(KUJO_BIN, ['run', 'dashboard_server.kujo', '--interpreter'], {
		cwd: ROOT,
		env: {
			...process.env,
			WDG_PORT: String(port),
			WDG_DB_PATH: dbPath,
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

	try {
		await waitForServer(port, child);
	} catch (err) {
		child.kill('SIGTERM');
		throw new Error(err.message + '\n' + output);
	}

	return { child, outputRef: () => output };
}

async function stopServer(child) {
	if (!child || child.killed) return;
	child.kill('SIGTERM');
	await delay(200);
	if (child.exitCode == null) {
		child.kill('SIGKILL');
	}
}

async function run() {

	ensureTmpDir();

	let handle = null;
	try {
		const offDb = path.join(TMP_DIR, 'auth-off-check.db');
		handle = await startServer(7711, offDb, {
			WDG_API_AUTH_MODE: 'off',
			WDG_API_AUTH_TOKEN: '',
		});

		const offStats = await httpRequest(7711, 'GET', '/api/stats');
		assert.strictEqual(offStats.status, 200, 'auth off should allow /api/stats');
		const offParsed = parseJSON(offStats.body, 'auth off /api/stats');
		assert.strictEqual(offParsed.ok, true);
		await stopServer(handle.child);
		handle = null;

		const tokenDb = path.join(TMP_DIR, 'auth-token-check.db');
		handle = await startServer(7712, tokenDb, {
			WDG_API_AUTH_MODE: 'token',
			WDG_API_AUTH_TOKEN: 'watchdog-test-token',
		});

		const noToken = await httpRequest(7712, 'GET', '/api/stats');
		assert.strictEqual(noToken.status, 401, 'missing token should return 401');

		const wrongToken = await httpRequest(7712, 'GET', '/api/export', {
			'X-Watchdog-Token': 'wrong-token',
		});
		assert.strictEqual(wrongToken.status, 403, 'wrong token should return 403');

		const goodHeader = await httpRequest(7712, 'GET', '/api/sessions', {
			'X-Watchdog-Token': 'watchdog-test-token',
		});
		assert.strictEqual(goodHeader.status, 200, 'x-watchdog-token should authorize');
		const goodHeaderParsed = parseJSON(goodHeader.body, 'token mode /api/sessions');
		assert.strictEqual(goodHeaderParsed.ok, true);

		const goodBearer = await httpRequest(7712, 'GET', '/api/export', {
			Authorization: 'Bearer watchdog-test-token',
		});
		assert.strictEqual(goodBearer.status, 200, 'bearer token should authorize');
		const goodBearerParsed = parseJSON(goodBearer.body, 'token mode /api/export');
		assert.strictEqual(goodBearerParsed.ok, true);
		await stopServer(handle.child);
		handle = null;

		const missingTokenDb = path.join(TMP_DIR, 'auth-token-missing-check.db');
		handle = await startServer(7713, missingTokenDb, {
			WDG_API_AUTH_MODE: 'token',
			WDG_API_AUTH_TOKEN: '',
		});
		const missingTokenResp = await httpRequest(7713, 'GET', '/api/stats');
		assert.strictEqual(missingTokenResp.status, 500, 'token mode without configured token should return 500');

		console.log('api_auth_mode_check: PASS');
	} finally {
		if (handle && handle.child) {
			await stopServer(handle.child);
		}
	}
}

run().catch(err => {
	console.error('api_auth_mode_check: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
