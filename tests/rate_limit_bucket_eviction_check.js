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

function httpGet(port, pathname, headers = {}) {
	return new Promise((resolve, reject) => {
		const req = http.request(
			{
				host: '127.0.0.1',
				port,
				method: 'GET',
				path: pathname,
				headers,
			},
			res => {
				let body = '';
				res.on('data', chunk => {
					body += chunk.toString();
				});
				res.on('end', () => {
					resolve({ status: res.statusCode || 0, body });
				});
			}
		);
		req.on('error', reject);
		req.end();
	});
}

async function startWatchdog(port, dbPath) {
	const child = spawn(KUJO_BIN, ['run', 'dashboard_server.kujo', '--interpreter'], {
		cwd: ROOT,
		env: {
			...process.env,
			WDG_PORT: String(port),
			WDG_DB_PATH: dbPath,
			WDG_API_AUTH_MODE: 'off',
			WDG_RATE_LIMIT_MODE: 'basic',
			WDG_RATE_LIMIT_MAX_REQUESTS: '1',
			WDG_RATE_LIMIT_WINDOW_SECS: '60',
			WDG_RATE_LIMIT_MAX_BUCKETS: '3',
			WDG_RATE_LIMIT_BUCKET_TTL_SECS: '1',
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

async function requestForSession(port, sessionId) {
	return httpGet(port, '/api/stats', {
		'X-Observe-Session-Id': sessionId,
	});
}

async function run() {

	ensureTmpDir();
	const port = 7799;
	const dbPath = path.join(TMP_DIR, 'rate-limit-bucket-eviction-check.db');
	[dbPath, dbPath + '-shm', dbPath + '-wal'].forEach(filePath => {
		if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
	});

	let watchdog = null;
	try {
		watchdog = await startWatchdog(port, dbPath);

		assert.strictEqual((await requestForSession(port, 'evict-s1')).status, 200, 'first s1 request should succeed');
		assert.strictEqual((await requestForSession(port, 'evict-s2')).status, 200, 'first s2 request should succeed');
		assert.strictEqual((await requestForSession(port, 'evict-s3')).status, 200, 'first s3 request should succeed');
		assert.strictEqual((await requestForSession(port, 'evict-s4')).status, 200, 'first s4 request should succeed and force bucket eviction');

		const s1AfterEviction = await requestForSession(port, 'evict-s1');
		assert.strictEqual(s1AfterEviction.status, 200, 's1 should be evicted when bucket cap is exceeded and then re-accepted');

		const ttlFirst = await requestForSession(port, 'ttl-session');
		assert.strictEqual(ttlFirst.status, 200, 'ttl-session initial request should succeed');
		await delay(1300);
		const ttlAfter = await requestForSession(port, 'ttl-session');
		assert.strictEqual(ttlAfter.status, 200, 'ttl-session should be evicted after ttl and accepted again within same window');

		console.log('rate_limit_bucket_eviction_check: PASS');
	} finally {
		await stopWatchdog(watchdog && watchdog.child ? watchdog.child : null);
	}
}

run().catch(err => {
	console.error('rate_limit_bucket_eviction_check: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
