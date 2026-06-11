const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function readText(relPath) {
	const fullPath = path.join(ROOT, relPath);
	assert.ok(fs.existsSync(fullPath), relPath + ' should exist');
	return fs.readFileSync(fullPath, 'utf8');
}

function run() {
	const scout = readText('docs/WATCHDOG_SCOUT_CHECKLIST.md');
	assert.strictEqual(
		scout.includes('## Current Findings Snapshot'),
		false,
		'scout checklist should no longer present stale findings snapshot as current status'
	);
	assert.strictEqual(
		scout.includes('No implementation items completed yet.'),
		false,
		'scout checklist should not claim no items were completed'
	);
	assert.ok(
		scout.includes('historical implementation ledger') || scout.includes('historical execution evidence'),
		'scout checklist should explicitly indicate historical status'
	);
	assert.ok(
		scout.includes('ENTERPRISE_RELEASE_LOOP_CHECKLIST.md'),
		'scout checklist should point to active enterprise loop checklist'
	);

	const loop = readText('docs/ENTERPRISE_RELEASE_LOOP_CHECKLIST.md');
	assert.ok(loop.includes('## Consolidated Open Backlog (Post-Loop)'), 'enterprise loop checklist should include consolidated open backlog section');
	assert.ok(loop.includes('Owner:'), 'consolidated backlog items should define owner');
	assert.ok(loop.includes('Acceptance criteria:'), 'consolidated backlog items should define acceptance criteria');

	console.log('scout_backlog_alignment_check: PASS');
}

try {
	run();
} catch (err) {
	console.error('scout_backlog_alignment_check: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
}
