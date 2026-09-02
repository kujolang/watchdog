const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/telemetry-v2.schema.json'), 'utf8'));
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/telemetry-v2/canonical-minimal.json'), 'utf8'));
const usage = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/telemetry-v2/provider-usage-variants.json'), 'utf8'));
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/telemetry-v2/v1-baseline-manifest.json'), 'utf8'));
const jsonlSchema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/watchdog-jsonl-v2.schema.json'), 'utf8'));

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

assert(schema.$schema.endsWith('/2020-12/schema'), 'v2 must use JSON Schema 2020-12');
assert(schema.properties.schema_version.const === 'watchdog.telemetry.v2', 'v2 schema version drift');
assert(schema.properties.records.maxItems === 100, 'batch bound drift');
assert(schema.$defs.record.additionalProperties === false, 'canonical records must reject undeclared fields');
assert(schema.$defs.record.properties.trace_id.pattern.includes('0{32}'), 'zero trace IDs must be rejected');
assert(schema.$defs.content.properties.value.maxLength === 65536, 'content bound drift');
assert(schema.$defs.attributeValue && schema.$defs.attributeArray.maxItems === 128, 'bounded nested OTLP attributes must remain representable');
assert(schema.$defs.record.properties.attributes.additionalProperties.$ref === '#/$defs/attributeValue', 'record attributes must use the bounded recursive value contract');
assert(fixture.schema_version === 'watchdog.telemetry.v2', 'canonical fixture version drift');
assert(fixture.records.length === 1 && fixture.records[0].privacy.content_mode === 'off', 'fixture must remain metadata-only');
assert(fixture.records[0].content.length === 0, 'metadata-only fixture leaked content');
assert(new Set(usage.cases.map((item) => item.provider)).size === 4, 'provider usage fixture is incomplete');
assert(usage.cases.every((item) => item.provider_usage && item.normalized), 'provider usage provenance missing');
assert(baseline.baseline_commit === 'c5625d0', 'immutable v1 baseline changed');
assert(baseline.privacy_invariants.length === 3, 'privacy baseline incomplete');
assert(baseline.authoritative_tests.every((file) => fs.existsSync(path.join(root, file))), 'baseline references a missing compatibility test');
assert(jsonlSchema.properties.jsonl_version.const === 'watchdog.jsonl.v2', 'JSONL v2 version drift');
assert(jsonlSchema.properties.record.$ref === 'telemetry-v2.schema.json#/$defs/record', 'JSONL must embed canonical records');

console.log('telemetry_v2_schema_check: PASS');
