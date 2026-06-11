const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'watchdog-ci.yml');
const source = fs.readFileSync(workflowPath, 'utf8');

function assertContains(snippet, message) {
	if (!source.includes(snippet)) {
		throw new Error(message + '\nMissing snippet: ' + snippet);
	}
}

assertContains('name: Watchdog CI', 'workflow should have expected name');
assertContains('full-regression:', 'workflow should define full-regression job');
assertContains('matrix-auth-rate-limit:', 'workflow should define matrix job for auth/rate-limit modes');
assertContains('api_auth_mode: [off, token]', 'matrix should cover API auth off/token modes');
assertContains('rate_limit_mode: [off, basic]', 'matrix should cover rate limit off/basic modes');
assertContains('for f in tests/*.js; do', 'full-regression job should run full local parity test loop');
assertContains('node tests/api_auth_mode_check.js', 'matrix job should include api auth contract test');
assertContains('node tests/rate_limit_controls_check.js', 'matrix job should include rate limit contract test');

console.log('ci_workflow_static_check: PASS');
