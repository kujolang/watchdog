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

function httpGet(port, pathname) {
	return new Promise((resolve, reject) => {
		const req = http.request(
			{
				host: '127.0.0.1',
				port,
				method: 'GET',
				path: pathname,
			},
			res => {
				let body = '';
				res.on('data', chunk => {
					body += chunk.toString();
				});
				res.on('end', () => {
					resolve({ status: res.statusCode || 0, body, headers: res.headers || {} });
				});
			}
		);
		req.on('error', reject);
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
	const child = spawn(KUJO_BIN, ['run', '--interpreter', 'dashboard_server.kujo'], {
		cwd: ROOT,
		env: {
			...process.env,
			WDG_PORT: String(port),
			WDG_DB_PATH: dbPath,
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
			const probe = await httpGet(port, '/api/stats');
			if (probe.status === 200) {
				return { child, outputRef: () => output };
			}
		} catch (err) {
			if (child.exitCode != null) break;
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
	const port = 7801;
	const dbPath = path.join(TMP_DIR, 'api-version-contract-check.db');
	[dbPath, dbPath + '-shm', dbPath + '-wal'].forEach(filePath => {
		if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
	});

	let watchdog = null;
	try {
		watchdog = await startWatchdog(port, dbPath);

		const versionResp = await httpGet(port, '/api/version');
		assert.strictEqual(versionResp.status, 200, '/api/version should return HTTP 200');
		assert.strictEqual(String(versionResp.headers['x-watchdog-api-version'] || ''), 'v1', '/api/version should include API version header');
		const versionJson = parseJson(versionResp.body, '/api/version');
		assert.strictEqual(versionJson.ok, true, '/api/version should return ok=true');
		assert.strictEqual(String(versionJson.data.current_version || ''), 'v1', 'version payload should expose current_version=v1');
		assert.strictEqual(String(versionJson.data.versioning_mode || ''), 'metadata', 'version payload should expose metadata versioning mode');

		const statsResp = await httpGet(port, '/api/stats');
		assert.strictEqual(statsResp.status, 200, '/api/stats should continue to work');
		assert.strictEqual(String(statsResp.headers['x-watchdog-api-version'] || ''), 'v1', '/api/stats should expose API version header');

		const exportResp = await httpGet(port, '/api/export');
		assert.strictEqual(exportResp.status, 200, '/api/export should continue to work');
		assert.strictEqual(String(exportResp.headers['x-watchdog-api-version'] || ''), 'v1', '/api/export should expose API version header');

		console.log('api_version_contract_check: PASS');
	} finally {
		await stopWatchdog(watchdog && watchdog.child ? watchdog.child : null);
	}
}

run().catch(err => {
	console.error('api_version_contract_check: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
