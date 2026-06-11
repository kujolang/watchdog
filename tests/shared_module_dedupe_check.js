const fs = require('fs');
const path = require('path');

function read(relPath) {
	return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

function assertContains(haystack, needle, message) {
	if (!haystack.includes(needle)) {
		throw new Error(message + '\nMissing: ' + needle);
	}
}

function assertNotContains(haystack, needle, message) {
	if (haystack.includes(needle)) {
		throw new Error(message + '\nUnexpected: ' + needle);
	}
}

const server = read('dashboard_server.kujo');
const wrapper = read('watchdog.kujo');
const shared = read('watchdog_shared.kujo');

assertContains(server, 'from watchdog_shared import watchdog_estimate_cost, watchdog_ensure_schema', 'Server should import shared helpers');
assertContains(wrapper, 'from watchdog_shared import watchdog_estimate_cost, watchdog_ensure_schema', 'Wrapper should import shared helpers');
assertContains(shared, 'func cost_per_million(model)', 'Shared module should define pricing table');
assertContains(shared, 'func ensure_schema(db)', 'Shared module should define schema setup');

assertNotContains(server, 'func cost_per_million(model)', 'Server should not keep local pricing table implementation');
assertNotContains(wrapper, 'func cost_per_million(model)', 'Wrapper should not keep local pricing table implementation');
assertNotContains(server, 'CREATE TABLE IF NOT EXISTS requests', 'Server should not inline schema SQL after dedupe');
assertNotContains(wrapper, 'CREATE TABLE IF NOT EXISTS requests', 'Wrapper should not inline schema SQL after dedupe');

console.log('shared_module_dedupe_check: PASS');
