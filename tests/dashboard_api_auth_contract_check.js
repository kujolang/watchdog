const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'dashboard.html');
const source = fs.readFileSync(htmlPath, 'utf8');

function assertContains(snippet, message) {
	if (!source.includes(snippet)) {
		throw new Error(message + '\nMissing snippet: ' + snippet);
	}
}

assertContains('id="authGate"', 'dashboard should provide an API authentication gate');
assertContains('id="apiToken" type="password"', 'API token input should be a password field');
assertContains("headers['X-Watchdog-Token'] = apiToken", 'dashboard requests should send the configured API token');
assertContains("sessionStorage.setItem('watchdogApiToken', apiToken)", 'token should persist only for the browser session');
assertContains("sessionStorage.removeItem('watchdogApiToken')", 'dashboard should support clearing its session token');
assertContains("e.status === 401 || e.status === 403", 'missing or invalid API tokens should open the authentication gate');
assertContains("setLoadError('Watchdog could not load telemetry:", 'non-auth failures should be visible instead of leaving a blank dashboard');
assertContains('const initialLoad = !state.hasLoaded;', 'dashboard should distinguish the first load from background refreshes');
assertContains('if (initialLoad) {', 'full-screen loading UI should be limited to the initial load');
assertContains('state.hasLoaded = true;', 'dashboard should remember that visible data has already rendered');
assertContains('if (refreshInFlight) {', 'overlapping automatic and manual refreshes should be detected');
assertContains('refreshQueued = true;', 'a range change during refresh should queue a follow-up load');
assertContains("setConnection(true, 'Refreshing data…');", 'background refresh should expose a non-blocking status');

console.log('dashboard_api_auth_contract_check: PASS');
