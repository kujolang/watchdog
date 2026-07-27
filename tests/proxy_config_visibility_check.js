const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { resolveKujoBinOrThrow } = require('./_kujo_bin');

const KUJO_BIN = resolveKujoBinOrThrow(__filename);
const ROOT = path.join(__dirname, '..');
const TMP_DIR = path.join(ROOT, 'tmp');

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function httpGetJson(url) {
	return new Promise((resolve, reject) => {
		http.get(url, res => {
			let body = '';
			res.on('data', chunk => {
				body += chunk;
			});
			res.on('end', () => {
				try {
					resolve(JSON.parse(body));
				} catch (err) {
					reject(err);
				}
			});
		}).on('error', reject);
	});
}

function ensureTmpDir() {
	if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

async function startServer(port, visibility, dbPath) {
	const env = {
		...process.env,
		WDG_PORT: String(port),
		WDG_DB_PATH: dbPath,
		WDG_API_AUTH_MODE: 'off',
		WDG_API_AUTH_TOKEN: '',
	};
	if (visibility) {
		env.WDG_PROXY_CONFIG_VISIBILITY = visibility;
	}

	const child = spawn(KUJO_BIN, ['run', '--interpreter', 'dashboard_server.kujo'], {
		cwd: ROOT,
		env,
		stdio: ['ignore', 'pipe', 'pipe'],
	});

	let output = '';
	child.stdout.on('data', chunk => {
		output += chunk.toString();
	});
	child.stderr.on('data', chunk => {
		output += chunk.toString();
	});

	for (let i = 0; i < 40; i += 1) {
		try {
			await httpGetJson(`http://127.0.0.1:${port}/api/stats`);
			return child;
		} catch (err) {
			if (child.exitCode != null) {
				throw new Error('Watchdog server exited early. Output:\n' + output);
			}
		}
		await delay(150);
	}

	child.kill('SIGTERM');
	throw new Error('Watchdog server did not start in time. Output:\n' + output);
}

async function stopServer(child) {
	if (!child || child.exitCode != null) return;
	child.kill('SIGTERM');
	await delay(200);
	if (child.exitCode == null) {
		child.kill('SIGKILL');
	}
}

async function run() {
	ensureTmpDir();
	const safePort = 7781;
	const verbosePort = 7782;
	const safeDbPath = path.join(TMP_DIR, 'proxy-config-safe.db');
	const verboseDbPath = path.join(TMP_DIR, 'proxy-config-verbose.db');
	for (const dbPath of [safeDbPath, verboseDbPath]) {
		for (const filePath of [dbPath, dbPath + '-shm', dbPath + '-wal']) {
			if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
		}
	}
	let safeServer = null;
	let verboseServer = null;

	try {
		safeServer = await startServer(safePort, 'safe', safeDbPath);
		const safeResp = await httpGetJson(`http://127.0.0.1:${safePort}/api/proxy-config`);
		assert.strictEqual(safeResp.ok, true);
		assert.ok(!Object.prototype.hasOwnProperty.call(safeResp.data, 'config_path'));
		assert.ok(!Object.prototype.hasOwnProperty.call(safeResp.data, 'upstream_api_key_env'));

		verboseServer = await startServer(verbosePort, 'verbose', verboseDbPath);
		const verboseResp = await httpGetJson(`http://127.0.0.1:${verbosePort}/api/proxy-config`);
		assert.strictEqual(verboseResp.ok, true);
		assert.ok(Object.prototype.hasOwnProperty.call(verboseResp.data, 'config_path'));
		assert.ok(Object.prototype.hasOwnProperty.call(verboseResp.data, 'upstream_api_key_env'));

		console.log('proxy_config_visibility_check: PASS');
	} finally {
		await stopServer(safeServer);
		await stopServer(verboseServer);
	}
}

run().catch(err => {
	console.error('proxy_config_visibility_check: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
