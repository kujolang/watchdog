const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'dashboard.html');
const source = fs.readFileSync(htmlPath, 'utf8');
const chartSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'dither-charts.tsx'), 'utf8');

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
assertContains('border-top-color: var(--stat-accent)', 'stat-card hover top borders should use the card chart color');
assertContains('<option value="24h" selected>Last 24 hours</option>', 'dashboard should default to the 24-hour range');
assertContains("rangePreset: '24h'", 'dashboard state should default to the 24-hour range');
assertContains('stat-card orange"><div class="stat-copy"><div class="stat-label">Avg Latency', 'latency stat card should match the orange sparkline');
assertContains('stat-card purple"><div class="stat-copy"><div class="stat-label">Tool Calls', 'tool stat card should match the purple sparkline');
assertContains('.logo-copy,', 'Watchdog wordmark should use the Departure-compatible mono stack');
assertContains('.header-right .btn {', 'header buttons should use the Departure-compatible mono stack');
assertContains('font-family: var(--font-mono);', 'header typography should resolve to the mono stack');
for (const id of ['Requests', 'Cost', 'Latency', 'Errors', 'Tokens', 'Sessions', 'Tools', 'Traces']) {
	assertContains(`id="statDither${id}"`, `stat card ${id} should include a decorative Dither Kit mount`);
	if (!chartSource.includes(`id: "statDither${id}"`)) {
		throw new Error(`Dither Kit chart entry should render the ${id} stat-card sparkline`);
	}
}
if (!chartSource.includes('import { Sparkline } from "../components/dither-kit/sparkline"')) {
	throw new Error('stat-card decorations should use the installed Dither Kit Sparkline component');
}

console.log('dashboard_dependency_pinning_check: PASS');
