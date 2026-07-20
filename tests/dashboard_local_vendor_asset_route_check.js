const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', 'dashboard_server.kujo');
const source = fs.readFileSync(serverPath, 'utf8');

function assertContains(snippet, message) {
	if (!source.includes(snippet)) {
		throw new Error(message + '\nMissing snippet: ' + snippet);
	}
}

assertContains('DEFAULT_DITHER_CHARTS_JS_PATH := "vendor/dither-charts.js"', 'server should define the default Dither Kit JavaScript path');
assertContains('DEFAULT_DITHER_CHARTS_CSS_PATH := "vendor/dither-charts.css"', 'server should define the default Dither Kit stylesheet path');
assertContains('DASHBOARD_DITHER_CHARTS_JS_PATH := env_or_many(["WDG_DITHER_CHARTS_JS_PATH"]', 'server should allow the Dither Kit JavaScript path to be overridden');
assertContains('DASHBOARD_DITHER_CHARTS_CSS_PATH := env_or_many(["WDG_DITHER_CHARTS_CSS_PATH"]', 'server should allow the Dither Kit stylesheet path to be overridden');
assertContains('server := server.route("GET", "/assets/vendor/dither-charts.js"', 'server should expose the Dither Kit JavaScript route');
assertContains('server := server.route("GET", "/assets/vendor/dither-charts.css"', 'server should expose the Dither Kit stylesheet route');
assertContains('file_exists(DASHBOARD_DITHER_CHARTS_JS_PATH)', 'Dither Kit JavaScript route should check file existence');
assertContains('file_exists(DASHBOARD_DITHER_CHARTS_CSS_PATH)', 'Dither Kit stylesheet route should check file existence');
assertContains('"application/javascript; charset=utf-8"', 'Dither Kit JavaScript route should return JavaScript content-type');
assertContains('"text/css; charset=utf-8"', 'Dither Kit stylesheet route should return CSS content-type');

console.log('dashboard_local_vendor_asset_route_check: PASS');
