#!/usr/bin/env node
const {spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const kujo = process.env.KUJO_BIN || path.resolve(ROOT, '../kujo/target/debug/kujo');
if (!fs.existsSync(kujo)) throw new Error(`KUJO_BIN is required and was not found: ${kujo}`);
const checks = [
  'tests/contract_manifest_check.js',
  'tests/telemetry_v2_schema_check.js',
  'tests/telemetry_v2_module_check.js',
  'tests/telemetry_v2_repository_check.js',
  'tests/telemetry_v2_identity_conflict_suite.js',
  'tests/telemetry_observability_semantics_check.js',
  'tests/telemetry_native_adapter_check.js',
  'tests/telemetry_otlp_mapper_check.js',
  'tests/telemetry_otlp_ingest_check.js',
  'tests/telemetry_otlp_protobuf_check.js',
  'tests/telemetry_v2_api_suite.js',
  'tests/proxy_stream_timing_suite.js',
  'tests/exporter_conformance_suite.js',
  'tests/telemetry_migration_restart_suite.js',
  'tests/shared_telemetry_client_suite.mjs',
  'tests/claude_code_adapter_suite.mjs',
  'tests/frontend_contract_suite.js',
  'tests/canonical_summary_query_benchmark.js',
  'tests/docs_link_check.js',
  'tests/backup_script_check.js',
];
if (process.env.AGENTS_SDK_PATH && fs.existsSync(process.env.AGENTS_SDK_PATH)) checks.splice(checks.length - 3, 0, 'tests/agents_sdk_shared_client_integration.mjs');
for (const test of checks) {
  const result = spawnSync(process.execPath, [test], {cwd: ROOT, env: {...process.env, KUJO_BIN: kujo}, encoding: 'utf8', stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('verify_telemetry_interoperability: PASS');
