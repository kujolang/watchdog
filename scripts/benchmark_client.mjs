#!/usr/bin/env node
// Advisory CPU benchmark of metadata-only projection; no network or disk writes.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const modulePath = process.argv[2] || 'clients/javascript/watchdog-telemetry.mjs';
const {createWatchdogTelemetryClient} = await import(pathToFileURL(resolve(modulePath)));
const fixture = JSON.parse(await readFile(new URL('../tests/fixtures/telemetry-v2/canonical-minimal.json', import.meta.url), 'utf8'));
const batch = {...fixture, records: Array.from({length: 100}, (_, i) => ({...fixture.records[0], record_id: `bench:${i}`, content: [{value: 'x'.repeat(4096)}]}))};
let encoded;
globalThis.fetch = async (_url, options) => { encoded = options.body; return {ok: true, status: 200}; };
const client = createWatchdogTelemetryClient();
for (let i = 0; i < 10; i++) await client.submit(batch);
const samples = [];
for (let i = 0; i < 100; i++) {
	const start = performance.now();
	await client.submit(batch);
	samples.push(performance.now() - start);
}
samples.sort((a,b) => a-b);
console.log(JSON.stringify({records: 100, input_bytes: Buffer.byteLength(JSON.stringify(batch)), output_bytes: Buffer.byteLength(encoded), samples: samples.length, p50_ms: samples[49], p95_ms: samples[94], output_sha256: createHash('sha256').update(encoded).digest('hex')}));
