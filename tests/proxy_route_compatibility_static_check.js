const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'dashboard_server.kujo');
const source = fs.readFileSync(filePath, 'utf8');

function assertContains(snippet, message) {
	if (!source.includes(snippet)) {
		throw new Error(message + '\nMissing: ' + snippet);
	}
}

assertContains('func proxy_route_dispatch(req)', 'Proxy dispatch helper should exist');
assertContains('func joined_proxy_action(params)', 'Proxy action segment join helper should exist');
assertContains('func validate_proxy_path(resource, action)', 'Proxy path validation helper should exist');
assertContains('func build_proxy_query_suffix(req)', 'Proxy query forwarding helper should exist');
assertContains('unsafe_proxy_path', 'Unsafe proxy path rejections should be recorded in telemetry');

assertContains('server := server.route("GET", "/proxy/v1/:resource", func(req)', 'GET should be supported for single-segment resource routes');
assertContains('server := server.route("POST", "/proxy/v1/:resource/:action", func(req)', 'POST should be supported for resource/action routes');
assertContains('server := server.route("DELETE", "/proxy/v1/:resource/:action", func(req)', 'DELETE should be supported for resource/action routes');

assertContains('server := server.route("GET", "/proxy/v1/:resource/:action/:subaction", func(req)', 'Nested 3-segment routes should be supported');
assertContains('server := server.route("POST", "/proxy/v1/:resource/:action/:subaction/:tail", func(req)', 'Nested 4-segment routes should be supported');

console.log('proxy_route_compatibility_static_check: PASS');
