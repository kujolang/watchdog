#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/telemetry-trace-v1.schema.json'), 'utf8'));
const server = fs.readFileSync(path.join(root, 'src/dashboard_server.kujo'), 'utf8');
const shared = fs.readFileSync(path.join(root, 'src/watchdog_shared.kujo'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'src/dashboard.html'), 'utf8');

assert.strictEqual(schema.properties.schema_version.const, 'kujo.telemetry.v1');
assert.ok(schema.$defs.span.properties.span_kind.enum.includes('shell'));
assert.ok(schema.$defs.toolCall.required.includes('tool_call_id'));
assert.ok(server.includes('DEFAULT_CONTENT_CAPTURE_MODE := "off"'));
assert.ok(server.includes('get_header(headers, "x-observe-trace-id")'));
assert.ok(server.includes('get_header(headers, "x-observe-parent-span-id")'));
assert.ok(server.includes('Unsupported telemetry schema_version'));
assert.ok(shared.includes('0014_replay_safe_telemetry'));
assert.ok(shared.includes('idx_tool_calls_external_identity'));
assert.ok(dashboard.includes('<option value="shell">Shell</option>'));

console.log('telemetry_schema_contract_check: PASS');
