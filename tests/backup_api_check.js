const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const { resolveKujoBinOrThrow } = require('./_kujo_bin');
const KUJO_BIN = resolveKujoBinOrThrow(__filename);

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function request(port, method, pathname, token, payload) {
	return new Promise((resolve, reject) => {
		const body = payload == null ? '' : JSON.stringify(payload);
		const headers = token ? { 'X-Watchdog-Token': token } : {};
		if (body) {
			headers['Content-Type'] = 'application/json';
			headers['Content-Length'] = Buffer.byteLength(body);
		}
		const req = http.request({ host: '127.0.0.1', port, method, path: pathname, headers }, res => {
			let text = '';
			res.on('data', chunk => { text += chunk.toString(); });
			res.on('end', () => resolve({ status: res.statusCode || 0, json: JSON.parse(text) }));
		});
		req.on('error', reject);
		if (body) req.write(body);
		req.end();
	});
}

async function run() {
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-backup-api-'));
	const dbPath = path.join(temp, 'data', 'watchdog.db');
	const backupDir = path.join(temp, 'Dropbox', 'Watchdog Backups');
	const keyPath = path.join(temp, 'backup.key');
	const token = 'backup-api-test-token';
	const port = 17808;
	fs.mkdirSync(path.dirname(dbPath), { recursive: true });
	fs.writeFileSync(keyPath, 'backup-api-test-passphrase\n', { mode: 0o600 });

	const child = spawn(KUJO_BIN, ['run', '--interpreter', 'dashboard_server.kujo'], {
		cwd: ROOT,
		env: {
			...process.env,
			WDG_PORT: String(port),
			WDG_DB_PATH: dbPath,
			WDG_API_AUTH_MODE: 'token',
			WDG_API_AUTH_TOKEN: token,
			WDG_PROXY_AUTHZ_MODE: 'off',
			WDG_BACKUP_ENABLED: 'false',
			WDG_BACKUP_ENCRYPTION_KEY_FILE: keyPath,
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let output = '';
	child.stdout.on('data', chunk => { output += chunk.toString(); });
	child.stderr.on('data', chunk => { output += chunk.toString(); });

	try {
		for (let i = 0; i < 100; i += 1) {
			try {
				const ready = await request(port, 'GET', '/healthz', '', null);
				if (ready.status === 200) break;
			} catch (err) {}
			if (child.exitCode != null) throw new Error('Watchdog exited before ready\n' + output);
			await delay(100);
		}

		const unauthorized = await request(port, 'GET', '/api/admin/backups', '', null);
		assert.strictEqual(unauthorized.status, 401);
		const initial = await request(port, 'GET', '/api/admin/backups', token, null);
		assert.strictEqual(initial.status, 200);
		assert.strictEqual(initial.json.data.encryption_key_configured, true);
		assert.deepStrictEqual(initial.json.data.active_runs, []);

		const saved = await request(port, 'PUT', '/api/admin/backups/settings', token, {
			enabled: true,
			interval_minutes: 720,
			backup_dir: backupDir,
			retention_count: 7,
			encryption_enabled: true,
		});
		assert.strictEqual(saved.status, 200, JSON.stringify(saved.json));
		assert.strictEqual(saved.json.data.settings.interval_minutes, 720);
		assert.strictEqual(saved.json.data.settings.encryption_enabled, true);

		const manual = await request(port, 'POST', '/api/admin/backups/run', token, null);
		assert.strictEqual(manual.status, 200, JSON.stringify(manual.json));
		assert.strictEqual(manual.json.data.run.encrypted, true);
		const backupPath = manual.json.data.run.backup_path;
		assert.ok(fs.existsSync(backupPath));
		assert.ok(fs.existsSync(manual.json.data.run.checksum_path));
		assert.strictEqual(manual.json.data.status.active_runs.length, 1);
		assert.strictEqual(manual.json.data.status.active_runs[0].backup_exists, true);
		assert.strictEqual(manual.json.data.status.archived_runs.length, 0);

		const restored = path.join(temp, 'restored.db');
		const decrypt = spawnSync('openssl', [
			'enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-md', 'sha256',
			'-in', backupPath, '-out', restored, '-pass', 'file:' + keyPath,
		], { encoding: 'utf8' });
		assert.strictEqual(decrypt.status, 0, decrypt.stderr);
		const quickCheck = spawnSync('sqlite3', [restored, 'PRAGMA quick_check;'], { encoding: 'utf8' });
		assert.strictEqual(quickCheck.stdout.trim(), 'ok');

		const deleted = await request(port, 'POST', '/api/admin/backups/delete', token, {
			run_id: manual.json.data.run.run_id,
		});
		assert.strictEqual(deleted.status, 200, JSON.stringify(deleted.json));
		assert.strictEqual(fs.existsSync(backupPath), false);
		assert.strictEqual(fs.existsSync(manual.json.data.run.checksum_path), false);
		assert.strictEqual(deleted.json.data.deleted_run_id, manual.json.data.run.run_id);
		assert.strictEqual(deleted.json.data.status.active_runs.length, 0);
		assert.strictEqual(deleted.json.data.status.archived_runs.length, 1);
		assert.strictEqual(deleted.json.data.status.archived_runs[0].missing_from_folder, true);
		console.log('backup_api_check: PASS');
	} finally {
		child.kill('SIGTERM');
		await delay(200);
		if (child.exitCode == null) child.kill('SIGKILL');
		fs.rmSync(temp, { recursive: true, force: true });
	}
}

run().catch(err => {
	console.error('backup_api_check: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
