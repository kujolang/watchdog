const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', 'dashboard_server.kujo');
const source = fs.readFileSync(serverPath, 'utf8');

function assertContains(snippet, message) {
	if (!source.includes(snippet)) {
		throw new Error(message + '\nMissing snippet: ' + snippet);
	}
}

assertContains('DEFAULT_CHARTJS_LOCAL_PATH := "vendor/chart.umd.min.js"', 'server should define a default local Chart.js vendor path');
assertContains('DASHBOARD_CHARTJS_LOCAL_PATH := env_or_many(["WDG_CHARTJS_LOCAL_PATH"], DEFAULT_CHARTJS_LOCAL_PATH)', 'server should allow local Chart.js path override via env');
assertContains('server := server.route("GET", "/assets/vendor/chart.umd.min.js"', 'server should expose local Chart.js vendor route');
assertContains('file_exists(DASHBOARD_CHARTJS_LOCAL_PATH)', 'local Chart.js route should check file existence before serving');
assertContains('"application/javascript; charset=utf-8"', 'local Chart.js route should return JavaScript content-type');

console.log('dashboard_local_vendor_asset_route_check: PASS');
