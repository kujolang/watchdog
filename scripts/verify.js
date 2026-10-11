#!/usr/bin/env node
// Keep detailed per-check evidence off the console; emit a compact receipt.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const out = path.resolve(root, process.env.WDG_VERIFICATION_DIR || 'tmp/verification');
fs.mkdirSync(out, {recursive: true});
const tests = fs.readdirSync(path.join(root, 'tests')).filter(name => /\.(?:js|mjs)$/.test(name) && !name.startsWith('_')).sort();
const results = [];
for (const name of tests) {
	if (name === 'agents_sdk_shared_client_integration.mjs' && !process.env.AGENTS_SDK_PATH) {
		results.push({test: name, status: 'skipped', reason: 'Set AGENTS_SDK_PATH to run the external integration'});
		continue;
	}
	const log = path.join(out, name + '.log');
	const fd = fs.openSync(log, 'w');
	const start = performance.now();
	let result;
	try {
		result = spawnSync(process.execPath, [path.join('tests', name)], {cwd: root, env: process.env, stdio: ['ignore', fd, fd]});
	} finally { fs.closeSync(fd); }
	const passed = !result.error && result.status === 0;
	results.push({test: name, status: passed ? 'passed' : 'failed', exit_code: result.status, signal: result.signal, seconds: (performance.now() - start) / 1000, log, ...(result.error ? {error: result.error.message} : {})});
	console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
	if (!passed) console.error(`Details: ${log}${result.error ? ': ' + result.error.message : ''}`);
}
const receipt = {passed: results.filter(x => x.status === 'passed').length, failed: results.filter(x => x.status === 'failed').length, skipped: results.filter(x => x.status === 'skipped').length, results};
const receiptPath = path.join(out, 'receipt.json');
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
console.log(`Verification: ${receipt.passed} passed, ${receipt.failed} failed, ${receipt.skipped} skipped; ${receiptPath}`);
process.exitCode = receipt.failed ? 1 : 0;
