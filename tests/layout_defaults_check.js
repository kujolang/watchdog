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

const serverSource = read('dashboard_server.kujo');
const demoSource = read('demo.kujo');
const gitignore = read('.gitignore');

assertContains(serverSource, 'DEFAULT_DB_PATH := "data/watchdog.db"', 'Server default DB path should use data directory');
assertContains(demoSource, 'DEFAULT_DB_PATH := "data/watchdog-demo.db"', 'Demo default DB path should be isolated from production telemetry');
assertContains(demoSource, 'watchdog_demo_database_isolation_failure', 'Demo seeder should refuse the production database');
assertContains(demoSource, 'ends_with(DB_PATH, "/watchdog/data/watchdog.db")', 'Demo guard should target the repository production database without blocking isolated test databases');
assertContains(demoSource, 'configured_db_path := env("WDG_DB_PATH")', 'Demo should support an isolated DB path override');
assertContains(gitignore, '*.db', '.gitignore should ignore sqlite database files');
assertContains(gitignore, '!data/.gitkeep', '.gitignore should retain data directory placeholder');
assertContains(gitignore, '!tmp/.gitkeep', '.gitignore should retain tmp directory placeholder');

console.log('layout_defaults_check: PASS');
