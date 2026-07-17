const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'dashboard_server.kujo');
const source = fs.readFileSync(filePath, 'utf8');

function assertContains(snippet, message) {
	if (!source.includes(snippet)) {
		throw new Error(message + '\nMissing: ' + snippet);
	}
}

assertContains('func request_query_map(req)', 'Query map helper should exist');
assertContains('func request_query_text(req, key, fallback_value)', 'Query text helper should exist');
assertContains('func request_query_int(req, key, fallback_value, min_value, max_value)', 'Query int helper should exist');
assertContains('func where_clause_from_conditions(conditions)', 'WHERE clause helper should exist');

assertContains('server := server.route("GET", "/api/requests", func(req)', 'Requests endpoint should be present');
assertContains('LIMIT ? OFFSET ?', 'Endpoints should use parameterized pagination');
assertContains('request_query_int(req, "page"', 'Page support should be parsed');
assertContains('request_query_int(req, "page_size"', 'Page size support should be parsed');
assertContains('request_query_int(req, "since_ms"', 'since_ms support should be parsed');
assertContains('request_query_int(req, "until_ms"', 'until_ms support should be parsed');

assertContains('server := server.route("GET", "/api/tool-calls", func(req)', 'Tool calls endpoint should support query params');
assertContains('server := server.route("GET", "/api/agent-steps", func(req)', 'Agent steps endpoint should support query params');
assertContains('server := server.route("GET", "/api/sessions", func(req)', 'Sessions endpoint should support query params');
assertContains('server := server.route("GET", "/api/insights", func(req)', 'Agent insights endpoint should be present');
assertContains('AS failure_stage', 'Agent insights should expose failure stages');
assertContains('"tool_effectiveness":', 'Agent insights should expose tool effectiveness');
assertContains('"context_pressure":', 'Agent insights should expose context pressure');

console.log('api_query_support_static_check: PASS');
