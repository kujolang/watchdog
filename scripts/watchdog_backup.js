#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
	const args = { db: '', outDir: '', retentionCount: 30, encryptionKeyFile: '', opensslBin: 'openssl', resultFile: '' };
	for (let i = 0; i < argv.length; i += 1) {
		const token = String(argv[i] || '');
		if (token === '--db') args.db = String(argv[++i] || '');
		else if (token === '--out-dir') args.outDir = String(argv[++i] || '');
		else if (token === '--retention-count') args.retentionCount = Number(argv[++i]);
		else if (token === '--encryption-key-file') args.encryptionKeyFile = String(argv[++i] || '');
		else if (token === '--openssl-bin') args.opensslBin = String(argv[++i] || 'openssl');
		else if (token === '--result-file') args.resultFile = String(argv[++i] || '');
	}
	return args;
}

function emitResult(payload, resultFile) {
	const text = JSON.stringify(payload) + '\n';
	if (resultFile) {
		fs.writeFileSync(path.resolve(resultFile), text, { mode: 0o600 });
		return;
	}
	fs.writeSync(1, text);
}

function run(program, args, label) {
	const result = spawnSync(program, args, { encoding: 'utf8', windowsHide: true });
	if (result.error || result.status !== 0) {
		const detail = String(result.stderr || result.stdout || result.error || '').trim();
		throw new Error(label + ' failed' + (detail ? ': ' + detail.slice(0, 500) : ''));
	}
	return String(result.stdout || '').trim();
}

function sqliteStringLiteral(value) {
	return "'" + String(value).replace(/'/g, "''") + "'";
}

function utcStamp(date = new Date()) {
	return date.toISOString().replace(/[-:]/g, '').replace('.', '');
}

function sha256(filePath) {
	const hash = crypto.createHash('sha256');
	hash.update(fs.readFileSync(filePath));
	return hash.digest('hex');
}

function assertSecureKeyFile(keyPath) {
	const stat = fs.statSync(keyPath);
	if (!stat.isFile()) throw new Error('Encryption key path is not a file');
	if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
		throw new Error('Encryption key file must not be accessible by group or others (use chmod 600)');
	}
}

function pruneOldBackups(outDir, retentionCount, latestPath) {
	const manifestPath = path.join(outDir, '.watchdog-backups.json');
	let candidates = [];
	try {
		const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
		if (Array.isArray(parsed)) candidates = parsed.map(String);
	} catch (err) {}
	const knownPattern = /^watchdog-backup-\d{8}T\d{9}Z-[a-f0-9]{6}\.db(?:\.enc)?$/;
	candidates = [...new Set([...candidates, latestPath])]
		.filter(target => path.dirname(target) === outDir && knownPattern.test(path.basename(target)))
		.sort();
	const removeCount = Math.max(0, candidates.length - retentionCount);
	const removed = [];
	for (const target of candidates.slice(0, removeCount)) {
		fs.rmSync(target, { force: true });
		fs.rmSync(target + '.sha256', { force: true });
		removed.push(target);
	}
	const retained = candidates.slice(removeCount);
	const manifestTemp = manifestPath + '.tmp';
	fs.writeFileSync(manifestTemp, JSON.stringify(retained, null, 2) + '\n', { mode: 0o600 });
	fs.renameSync(manifestTemp, manifestPath);
	return removed;
}

function main(args) {
	if (!args.db || !args.outDir) throw new Error('--db and --out-dir are required');
	if (!Number.isInteger(args.retentionCount) || args.retentionCount < 1 || args.retentionCount > 3650) {
		throw new Error('--retention-count must be an integer from 1 to 3650');
	}

	const dbPath = path.resolve(args.db);
	const outDir = path.resolve(args.outDir);
	if (!fs.existsSync(dbPath) || !fs.statSync(dbPath).isFile()) throw new Error('Watchdog database does not exist');
	if (outDir === path.dirname(dbPath)) throw new Error('Backup directory must be separate from the database directory');
	fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });

	const stamp = utcStamp();
	const baseName = 'watchdog-backup-' + stamp + '-' + crypto.randomBytes(3).toString('hex') + '.db';
	const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-backup-'));
	const plainTemp = path.join(workDir, baseName);
	const encryptedTemp = path.join(workDir, baseName + '.enc');
	const finalPath = path.join(outDir, baseName + (args.encryptionKeyFile ? '.enc' : ''));
	const destinationTemp = path.join(outDir, '.' + path.basename(finalPath) + '.upload.tmp');
	const checksumTemp = finalPath + '.sha256.tmp';
	const checksumPath = finalPath + '.sha256';
	let resultPayload = null;

	if (fs.existsSync(finalPath)) throw new Error('A backup with this timestamp already exists');
	try {
		run('sqlite3', [dbPath, '.timeout 10000', 'VACUUM INTO ' + sqliteStringLiteral(plainTemp) + ';'], 'SQLite online backup');
		const quickCheck = run('sqlite3', [plainTemp, 'PRAGMA quick_check;'], 'Backup integrity check');
		if (quickCheck.trim().toLowerCase() !== 'ok') throw new Error('Backup integrity check did not return ok');

		if (args.encryptionKeyFile) {
			const keyPath = path.resolve(args.encryptionKeyFile);
			assertSecureKeyFile(keyPath);
			run(args.opensslBin, [
				'enc', '-aes-256-cbc', '-salt', '-pbkdf2', '-iter', '200000', '-md', 'sha256',
				'-in', plainTemp, '-out', encryptedTemp, '-pass', 'file:' + keyPath,
			], 'Backup encryption');
		}
		const completedTemp = args.encryptionKeyFile ? encryptedTemp : plainTemp;
		fs.copyFileSync(completedTemp, destinationTemp, fs.constants.COPYFILE_EXCL);
		fs.chmodSync(destinationTemp, 0o600);
		fs.renameSync(destinationTemp, finalPath);

		const digest = sha256(finalPath);
		fs.writeFileSync(checksumTemp, digest + '  ' + path.basename(finalPath) + '\n', { mode: 0o600 });
		fs.renameSync(checksumTemp, checksumPath);
		const removed = pruneOldBackups(outDir, args.retentionCount, finalPath);
		const stat = fs.statSync(finalPath);
		resultPayload = {
			ok: true,
			path: finalPath,
			checksum_path: checksumPath,
			sha256: digest,
			size_bytes: stat.size,
			encrypted: Boolean(args.encryptionKeyFile),
			retention_removed: removed.length,
		};
	} finally {
		fs.rmSync(destinationTemp, { force: true });
		fs.rmSync(checksumTemp, { force: true });
		fs.rmSync(workDir, { recursive: true, force: true });
	}
	return resultPayload;
}

const cliArgs = parseArgs(process.argv.slice(2));
try {
	emitResult(main(cliArgs), cliArgs.resultFile);
	process.exit(0);
} catch (err) {
	emitResult({ ok: false, error: String(err && err.message ? err.message : err || 'Backup failed') }, cliArgs.resultFile);
	process.exit(1);
}
