const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'dashboard.html');
const source = fs.readFileSync(htmlPath, 'utf8');

function assertContains(snippet, message) {
	if (!source.includes(snippet)) {
		throw new Error(message + '\nMissing snippet: ' + snippet);
	}
}

function assertNotContains(snippet, message) {
	if (source.includes(snippet)) {
		throw new Error(message + '\nUnexpected snippet: ' + snippet);
	}
}

assertNotContains('fonts.googleapis.com', 'dashboard should not fetch remote font stylesheets from Google Fonts');
assertNotContains('Chart.js', 'dashboard should no longer load Chart.js');
assertContains('/assets/vendor/dither-charts.js', 'dashboard should load the local Dither Kit JavaScript bundle');
assertContains('/assets/vendor/dither-charts.css', 'dashboard should load the local Dither Kit stylesheet');
assertContains('<script src="/assets/vendor/dither-charts.js"></script>', 'Dither Kit must load before the inline dashboard boot calls loadAll');
assertNotContains('<script defer src="/assets/vendor/dither-charts.js"></script>', 'deferred loading races the inline dashboard boot');
assertContains('font-family: "Departure Mono"', 'dashboard should define the bundled Departure Mono font');
assertContains('__WATCHDOG_DEPARTURE_MONO_WOFF2__', 'dashboard should expose the server-injected Departure Mono placeholder');
assertContains('.page-title { color: #031b4e; font-family: var(--font-display)', 'page title should use the Departure-compatible display stack');
assertContains('.stat-value { color: #031b4e !important; font-family: var(--font-display)', 'metric numbers should use the Departure-compatible display stack');

console.log('dashboard_dependency_pinning_check: PASS');
