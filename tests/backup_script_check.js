const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function run(args) {
	return spawnSync(process.execPath, ['scripts/watchdog_backup.js', ...args], {
		cwd: ROOT,
		encoding: 'utf8',
	});
}

function parseResult(result) {
	return JSON.parse(String(result.stdout || '').trim());
}

function runTest() {
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-backup-'));
	const db = path.join(temp, 'data', 'watchdog.db');
	const backups = path.join(temp, 'Dropbox', 'Watchdog Backups');
	const key = path.join(temp, 'backup.key');
	fs.mkdirSync(path.dirname(db), { recursive: true });
	let sqlite = spawnSync('sqlite3', [db, 'CREATE TABLE proof(value TEXT); INSERT INTO proof VALUES (\'preserved\');'], { encoding: 'utf8' });
	assert.strictEqual(sqlite.status, 0, sqlite.stderr);

	try {
		let result = run(['--db', db, '--out-dir', backups, '--retention-count', '2']);
		assert.strictEqual(result.status, 0, result.stderr || result.stdout);
		let payload = parseResult(result);
		assert.strictEqual(payload.ok, true);
		assert.strictEqual(payload.encrypted, false);
		assert.ok(fs.existsSync(payload.path));
		assert.ok(fs.existsSync(payload.checksum_path));
		sqlite = spawnSync('sqlite3', [payload.path, 'SELECT value FROM proof;'], { encoding: 'utf8' });
		assert.strictEqual(sqlite.stdout.trim(), 'preserved');

		fs.writeFileSync(key, 'test-only-backup-passphrase\n', { mode: 0o600 });
		result = run(['--db', db, '--out-dir', backups, '--retention-count', '2', '--encryption-key-file', key]);
		assert.strictEqual(result.status, 0, result.stderr || result.stdout);
		payload = parseResult(result);
		assert.strictEqual(payload.encrypted, true);
		assert.ok(payload.path.endsWith('.db.enc'));
		assert.ok(fs.existsSync(payload.path));
		const decrypted = path.join(temp, 'restored.db');
		const decrypt = spawnSync('openssl', [
			'enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-md', 'sha256',
			'-in', payload.path, '-out', decrypted, '-pass', 'file:' + key,
		], { encoding: 'utf8' });
		assert.strictEqual(decrypt.status, 0, decrypt.stderr);
		sqlite = spawnSync('sqlite3', [decrypted, 'PRAGMA quick_check; SELECT value FROM proof;'], { encoding: 'utf8' });
		assert.strictEqual(sqlite.stdout.trim(), 'ok\npreserved');

		const resultFile = path.join(temp, 'backup-result.json');
		result = run(['--db', db, '--out-dir', backups, '--retention-count', '2', '--result-file', resultFile]);
		assert.strictEqual(result.status, 0, result.stderr || result.stdout);
		assert.strictEqual(result.stdout, '');
		assert.strictEqual(JSON.parse(fs.readFileSync(resultFile, 'utf8')).ok, true);
		const retained = fs.readdirSync(backups).filter(name => /^watchdog-backup-.*\.db(?:\.enc)?$/.test(name));
		assert.strictEqual(retained.length, 2);
		console.log('backup_script_check: PASS');
	} finally {
		fs.rmSync(temp, { recursive: true, force: true });
	}
}

try {
	runTest();
} catch (err) {
	console.error('backup_script_check: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
}
