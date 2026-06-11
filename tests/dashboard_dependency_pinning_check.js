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

assertContains(
	'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
	'dashboard should pin the primary Chart.js CDN URL to an explicit version'
);
assertContains(
	'integrity="sha384-bs/nf9FbdNouRbMiFcrcZfLXYPKiPaGVGplVbv7dLGECccEXDW+S3zjqSKR5ZEaD"',
	'primary Chart.js asset should use strict SRI pinning'
);
assertContains('crossorigin="anonymous"', 'Chart.js asset loads should specify crossorigin=anonymous for SRI enforcement');

assertContains(
	'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
	'dashboard should define a version-pinned fallback Chart.js URL'
);
assertContains(
	'integrity="sha384-9nhczxUqK87bcKHh20fSQcTGD4qq5GhayNYSYWqwBkINBhOfQLg/P5HG5lF1urn4"',
	'fallback Chart.js asset should use strict SRI pinning'
);
assertContains("if (typeof window.Chart === 'undefined')", 'dashboard should only load fallback asset when the primary CDN fails');
assertContains('/assets/vendor/chart.umd.min.js', 'dashboard should include a local vendored Chart.js fallback path for restricted-network deployments');

console.log('dashboard_dependency_pinning_check: PASS');
