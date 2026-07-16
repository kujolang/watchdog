const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'dashboard.html');
const source = fs.readFileSync(htmlPath, 'utf8');

function assertContains(snippet, message) {
	if (!source.includes(snippet)) {
		throw new Error(message + '\nMissing snippet: ' + snippet);
	}
}

assertContains('function safeText(value)', 'safeText helper must exist');
assertContains('function safeStepType(value)', 'safeStepType helper must exist');

assertContains('title="${safeText(r.session_id)}"', 'request session_id title should be escaped');
assertContains('${safeText(r.session_id)}</span>', 'request session_id content should be escaped');
assertContains('${safeText(r.user_id || \'—\')}', 'request user_id should be escaped');
assertContains('${safeText(r.provider || \'—\')}', 'request provider should be escaped');
assertContains('${safeText(r.model || \'—\')}', 'request model should be escaped');

assertContains('${safeText(r.tool_name)}', 'tool name should be escaped');
assertContains('${safeText(e.error_code || \'unknown\')}', 'error code should be escaped');
assertContains('${safeText(e.provider || \'—\')}', 'error provider should be escaped');
assertContains('${safeText(r.session_id)}', 'session table session_id should be escaped');
assertContains('${safeText(r.user_id || \'—\')}', 'session table user_id should be escaped');
assertContains("showRecordDetails('requests', ${index})", 'request rows should expose full record details');
assertContains("showRecordDetails('toolCalls', ${index})", 'tool call rows should expose full record details');
assertContains("showRecordDetails('sessions', ${index})", 'session rows should expose full record details');
assertContains(".hidden { display: none !important; }", 'shared hidden utility must suppress populated table empty states');

assertContains('const stepType = safeStepType(step.step_type);', 'trace step type must be normalized through whitelist helper');
assertContains('${safeText(step.content)}', 'trace content should be escaped through safeText');

console.log('dashboard_xss_regression_check: PASS');
