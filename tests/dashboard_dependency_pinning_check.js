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

console.log('dashboard_dependency_pinning_check: PASS');
