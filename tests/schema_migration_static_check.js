const fs = require('fs');
const path = require('path');

const sharedPath = path.join(__dirname, '..', 'watchdog_shared.kujo');
const source = fs.readFileSync(sharedPath, 'utf8');

function assertContains(snippet, message) {
	if (!source.includes(snippet)) {
		throw new Error(message + '\nMissing: ' + snippet);
	}
}

assertContains('CREATE TABLE IF NOT EXISTS schema_migrations', 'Schema migrations table should be created');
assertContains('INSERT OR IGNORE INTO schema_migrations', 'Baseline migration record should be inserted');

assertContains('idx_requests_created_at', 'requests.created_at index should exist');
assertContains('idx_requests_session_id', 'requests.session_id index should exist');
assertContains('idx_requests_status', 'requests.status index should exist');
assertContains('idx_requests_provider_model', 'requests.provider/model index should exist');

assertContains('idx_tool_calls_created_at', 'tool_calls.created_at index should exist');
assertContains('idx_tool_calls_session_id', 'tool_calls.session_id index should exist');

assertContains('idx_agent_steps_session_step', 'agent_steps(session_id, step_number) index should exist');
assertContains('idx_agent_steps_created_at', 'agent_steps.created_at index should exist');

console.log('schema_migration_static_check: PASS');
