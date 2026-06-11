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

async function waitForServer(port, child) {
	for (let i = 0; i < 80; i += 1) {
		try {
			const probe = await httpRequest(port, 'GET', '/healthz');
			if (probe.status === 200) {
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
	const child = spawn(KUJO_BIN, ['run', '--interpreter', 'dashboard_server.kujo'], {
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

async function expectStartupFailure(port, dbPath, extraEnv = {}) {
	const child = spawn(KUJO_BIN, ['run', '--interpreter', 'dashboard_server.kujo'], {
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

	for (let i = 0; i < 80; i += 1) {
		if (child.exitCode != null) {
			assert.notStrictEqual(child.exitCode, 0, 'startup policy failure should exit non-zero');
			assert.ok(
				output.includes('FATAL: production startup policy violations:'),
				'startup output should include policy violation summary\n' + output
			);
			return;
		}

		try {
			const probe = await httpRequest(port, 'GET', '/healthz');
			if (probe.status === 200) {
				child.kill('SIGTERM');
				throw new Error('Server unexpectedly started when startup guard should fail.\n' + output);
			}
		} catch (err) {
			if (err.message.includes('unexpectedly started')) {
				throw err;
			}
		}

		await delay(100);
	}

	child.kill('SIGTERM');
	throw new Error('Expected startup failure but process remained alive.\n' + output);
}

async function stopServer(child) {
	if (!child || child.killed) return;
	child.kill('SIGTERM');
	await delay(200);
	if (child.exitCode == null) {
		child.kill('SIGKILL');
	}
}

function parseJSON(text, label) {
	try {
		return JSON.parse(text);
	} catch (err) {
		throw new Error(label + ' returned invalid JSON: ' + err.message + '\n' + text.slice(0, 250));
	}
}

async function run() {

	ensureTmpDir();

	await expectStartupFailure(7721, path.join(TMP_DIR, 'startup-guard-fail.db'), {
		WDG_DEPLOYMENT_PROFILE: 'production',
		WDG_API_AUTH_MODE: 'off',
		WDG_API_AUTH_TOKEN: '',
		WDG_PROXY_AUTHZ_MODE: 'off',
		WDG_PROXY_AUTHZ_TOKEN: '',
	});

	let secureHandle = null;
	let overrideHandle = null;
	try {
		secureHandle = await startServer(7722, path.join(TMP_DIR, 'startup-guard-secure.db'), {
			WDG_DEPLOYMENT_PROFILE: 'production',
			WDG_API_AUTH_MODE: 'token',
			WDG_API_AUTH_TOKEN: 'startup-api-token',
			WDG_PROXY_AUTHZ_MODE: 'token',
			WDG_PROXY_AUTHZ_TOKEN: 'startup-proxy-token',
		});

		const secureNoToken = await httpRequest(7722, 'GET', '/api/stats');
		assert.strictEqual(secureNoToken.status, 401, 'production profile should enforce API token auth when configured securely');

		const secureWithToken = await httpRequest(7722, 'GET', '/api/stats', {
			'X-Watchdog-Token': 'startup-api-token',
		});
		assert.strictEqual(secureWithToken.status, 200, 'token-authenticated API request should succeed');
		const secureJson = parseJSON(secureWithToken.body, 'secure /api/stats');
		assert.strictEqual(secureJson.ok, true);

		overrideHandle = await startServer(7723, path.join(TMP_DIR, 'startup-guard-override.db'), {
			WDG_DEPLOYMENT_PROFILE: 'production',
			WDG_ALLOW_INSECURE_STARTUP: 'true',
			WDG_API_AUTH_MODE: 'off',
			WDG_API_AUTH_TOKEN: '',
			WDG_PROXY_AUTHZ_MODE: 'off',
			WDG_PROXY_AUTHZ_TOKEN: '',
		});

		const overrideStats = await httpRequest(7723, 'GET', '/api/stats');
		assert.strictEqual(overrideStats.status, 200, 'break-glass override should allow startup for controlled scenarios');
		const overrideJson = parseJSON(overrideStats.body, 'override /api/stats');
		assert.strictEqual(overrideJson.ok, true);

		console.log('production_startup_guard_check: PASS');
	} finally {
		if (secureHandle && secureHandle.child) {
			await stopServer(secureHandle.child);
		}
		if (overrideHandle && overrideHandle.child) {
			await stopServer(overrideHandle.child);
		}
	}
}

run().catch(err => {
	console.error('production_startup_guard_check: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
