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
