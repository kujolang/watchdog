const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FORBIDDEN = '/path/to/kujo/target';

function readText(relPath) {
	const fullPath = path.join(ROOT, relPath);
	assert.ok(fs.existsSync(fullPath), relPath + ' should exist');
	return fs.readFileSync(fullPath, 'utf8');
}

function assertNoForbiddenPath(relPath) {
	const text = readText(relPath);
	assert.strictEqual(
		text.includes(FORBIDDEN),
		false,
		relPath + ' should not hardcode local Kujo runtime path: ' + FORBIDDEN
	);
}

function run() {
	const activeDocs = [
		'README.md',
		'docs/DEPLOYMENT_HARDENING_RUNBOOK.md',
		'docs/KENNEL_INTEGRATION_GUIDE.md',
		'docs/ENTERPRISE_DEPLOYMENT_ARCHITECTURE.md',
	];
	for (const relPath of activeDocs) {
		assertNoForbiddenPath(relPath);
	}

	const testFiles = fs
		.readdirSync(path.join(ROOT, 'tests'))
		.filter(name => name.endsWith('.js') && name !== 'runtime_portability_contract_check.js');
	for (const fileName of testFiles) {
		assertNoForbiddenPath(path.join('tests', fileName));
	}

	const helperText = readText('tests/_kujo_bin.js');
	assert.ok(helperText.includes('resolveKujoBinOrThrow'), 'tests/_kujo_bin.js should expose resolver helper');

	console.log('runtime_portability_contract_check: PASS');
}

try {
	run();
} catch (err) {
	console.error('runtime_portability_contract_check: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
}
