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

async function startWatchdog(port, dbPath, extraEnv = {}) {
	const child = spawn(KUJO_BIN, ['run', 'dashboard_server.kujo', '--interpreter'], {
		cwd: ROOT,
		env: {
			...process.env,
			WDG_PORT: String(port),
			WDG_DB_PATH: dbPath,
			WDG_API_AUTH_MODE: 'token',
			WDG_API_AUTH_TOKEN: 'audit-api-token',
			WDG_PROXY_AUTHZ_MODE: 'token',
			WDG_PROXY_AUTHZ_TOKEN: 'audit-proxy-token',
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

function findEvent(rows, action, result) {
	return rows.find(row => String(row.action) === action && String(row.result) === result);
}

async function run() {

	ensureTmpDir();
	const port = 7796;
	const dbPath = path.join(TMP_DIR, 'audit-events-check.db');
	[dbPath, dbPath + '-shm', dbPath + '-wal'].forEach(filePath => {
		if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
	});

	let watchdog = null;
	try {
		watchdog = await startWatchdog(port, dbPath);

		const unauthorizedApi = await httpRequest(port, 'GET', '/api/stats');
		assert.strictEqual(unauthorizedApi.status, 401, 'missing API token should return 401');

		const proxyAuthFailure = await httpRequest(port, 'GET', '/proxy/v1/models');
		assert.strictEqual(proxyAuthFailure.status, 401, 'missing proxy token should return 401');

		const proxyConfig = await httpRequest(port, 'GET', '/api/proxy-config', {
			'X-Watchdog-Token': 'audit-api-token',
		});
		assert.strictEqual(proxyConfig.status, 200, '/api/proxy-config should succeed with valid API token');

		const beforeMs = Date.now() + 1000;
		const pruneResp = await httpRequest(
			port,
			'POST',
			'/api/admin/prune',
			{
				'Content-Type': 'application/json',
				'X-Watchdog-Token': 'audit-api-token',
			},
			JSON.stringify({ before_ms: beforeMs, dry_run: true })
		);
		assert.strictEqual(pruneResp.status, 200, 'prune dry-run should succeed with valid API token');

		const auditResp = await httpRequest(port, 'GET', '/api/audit-events?page_size=100', {
			'X-Watchdog-Token': 'audit-api-token',
		});
		assert.strictEqual(auditResp.status, 200, '/api/audit-events should return 200 with valid token');
		const auditJson = parseJsonSafe(auditResp.body, '/api/audit-events');
		assert.strictEqual(auditJson.ok, true, '/api/audit-events should return ok=true');
		assert.ok(Array.isArray(auditJson.data), 'audit events payload should be an array');

		const apiAuthFailureEvent = findEvent(auditJson.data, 'api_auth_failure', 'denied');
		assert.ok(apiAuthFailureEvent, 'audit events should include denied API auth attempts');

		const proxyAuthFailureEvent = findEvent(auditJson.data, 'proxy_auth_failure', 'denied');
		assert.ok(proxyAuthFailureEvent, 'audit events should include denied proxy auth attempts');

		const proxyConfigEvent = findEvent(auditJson.data, 'proxy_config_view', 'success');
		assert.ok(proxyConfigEvent, 'audit events should include proxy config visibility access');

		const pruneEvent = findEvent(auditJson.data, 'prune_operation', 'success');
		assert.ok(pruneEvent, 'audit events should include prune operation records');
		const pruneMetadata = parseJsonSafe(String(pruneEvent.metadata || '{}'), 'prune event metadata');
		assert.strictEqual(Boolean(pruneMetadata.dry_run), true, 'prune event metadata should include dry_run=true for dry-run requests');

		console.log('audit_events_check: PASS');
	} finally {
		await stopWatchdog(watchdog && watchdog.child ? watchdog.child : null);
	}
}

run().catch(err => {
	console.error('audit_events_check: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
