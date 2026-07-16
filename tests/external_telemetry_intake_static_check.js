'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'src', 'dashboard_server.kujo'), 'utf8');
const shared = fs.readFileSync(path.join(root, 'src', 'watchdog_shared.kujo'), 'utf8');
const demo = fs.readFileSync(path.join(root, 'demo.kujo'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'src', 'dashboard.html'), 'utf8');

function includes(haystack, needle, message) {
  if (!haystack.includes(needle)) throw new Error(`${message}\nMissing: ${needle}`);
}

includes(server, 'server := server.route("POST", "/api/telemetry/requests"', 'External telemetry endpoint should exist');
includes(server, 'source_app = ? AND request_id = ?', 'External telemetry should be idempotent per source');
includes(server, 'server := server.route("POST", "/api/admin/prune-fixtures"', 'Fixture-only cleanup endpoint should exist');
includes(shared, '0006_source_classification', 'Source classification migration should be recorded');
includes(demo, '"watchdog-demo", "fixture"', 'Demo records should be explicitly classified');
includes(dashboard, "r.source_app || 'legacy'", 'Dashboard should render telemetry source');
includes(dashboard, "r.data_class || 'legacy'", 'Dashboard should render telemetry class');

console.log('external_telemetry_intake_static_check: PASS');
