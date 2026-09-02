const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const adapterSchema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/watchdog-ingestion-adapter-v1.schema.json'), 'utf8'));
const exporterSchema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/watchdog-exporter-v1.schema.json'), 'utf8'));
const manifests = fs.readdirSync(path.join(root, 'adapters/manifests')).filter((name) => name.endsWith('.json')).map((name) => JSON.parse(fs.readFileSync(path.join(root, 'adapters/manifests', name), 'utf8')));

function assert(condition, message) { if (!condition) throw new Error(message); }
assert(adapterSchema.properties.contract_version.const === 'watchdog.ingestion-adapter.v1', 'ingestion contract version drift');
assert(exporterSchema.properties.type.const === 'otlp_http', 'unsupported exporter transport entered v1 contract');
assert(manifests.length === 3, 'official adapter manifest count drift');
for (const manifest of manifests) {
	assert(manifest.contract_version === 'watchdog.ingestion-adapter.v1', `${manifest.id} contract drift`);
	assert(manifest.output_schema === 'watchdog.telemetry.v2', `${manifest.id} bypasses canonical schema`);
	assert(manifest.content_default === 'off', `${manifest.id} increases content collection`);
	assert(Array.isArray(manifest.supported_kinds) && manifest.supported_kinds.length > 0, `${manifest.id} has no declared coverage`);
}
assert(new Set(manifests.map((item) => item.id)).size === manifests.length, 'adapter IDs must be unique');
console.log('contract_manifest_check: PASS');
