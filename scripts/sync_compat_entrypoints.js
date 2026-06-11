#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const ENTRYPOINTS = [
	{ src: 'src/dashboard_server.kujo', root: 'dashboard_server.kujo' },
	{ src: 'src/watchdog_shared.kujo', root: 'watchdog_shared.kujo' },
	{ src: 'src/watchdog.kujo', root: 'watchdog.kujo' },
	{ src: 'src/dashboard.html', root: 'dashboard.html' },
];

function readText(filePath) {
	return fs.readFileSync(filePath, 'utf8');
}

function writeText(filePath, content) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content);
}

function runCheckMode() {
	let failed = false;
	for (const entry of ENTRYPOINTS) {
		const srcPath = path.join(ROOT, entry.src);
		const rootPath = path.join(ROOT, entry.root);
		if (!fs.existsSync(srcPath) || !fs.existsSync(rootPath)) {
			console.error('Missing compatibility entrypoint pair: ' + entry.src + ' <-> ' + entry.root);
			failed = true;
			continue;
		}

		const srcText = readText(srcPath);
		const rootText = readText(rootPath);
		if (srcText !== rootText) {
			console.error('Out-of-sync compatibility entrypoint: ' + entry.root + ' (source ' + entry.src + ')');
			failed = true;
		}
	}

	if (failed) {
		process.exit(1);
	}

	console.log('sync_compat_entrypoints: CHECK PASS');
}

function runSyncMode() {
	for (const entry of ENTRYPOINTS) {
		const srcPath = path.join(ROOT, entry.src);
		const rootPath = path.join(ROOT, entry.root);
		if (!fs.existsSync(srcPath)) {
			throw new Error('Missing source file: ' + entry.src);
		}
		writeText(rootPath, readText(srcPath));
		console.log('synced ' + entry.src + ' -> ' + entry.root);
	}
	console.log('sync_compat_entrypoints: SYNC PASS');
}

function main() {
	const checkOnly = process.argv.includes('--check');
	if (checkOnly) {
		runCheckMode();
		return;
	}
	runSyncMode();
}

try {
	main();
} catch (err) {
	console.error('sync_compat_entrypoints: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
}
