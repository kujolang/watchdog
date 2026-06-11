const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'dashboard_server.kujo');
const source = fs.readFileSync(filePath, 'utf8');

function assertContains(snippet, message) {
	if (!source.includes(snippet)) {
		throw new Error(message + '\nMissing: ' + snippet);
	}
}

assertContains('server := server.route("POST", "/api/admin/prune", func(req)', 'Prune endpoint should exist');
assertContains('before_ms is required and must be a positive integer', 'Prune endpoint should validate before_ms');
assertContains('"dry_run": dry_run', 'Prune response should include dry_run status');
assertContains('"affected": counts', 'Prune response should include affected counts');

assertContains('session_id := request_query_text(req, "session_id", "")', 'Export should support session_id filter');
assertContains('since_ms := request_query_int(req, "since_ms"', 'Export should support since_ms filter');
assertContains('until_ms := request_query_int(req, "until_ms"', 'Export should support until_ms filter');
assertContains('"filters": {', 'Export response should include filter metadata');

console.log('retention_export_controls_static_check: PASS');
