import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createWatchdogTelemetryClient} from '../clients/javascript/watchdog-telemetry.mjs';

const temp = await mkdtemp(join(tmpdir(), 'watchdog-client-lifecycle-'));
const originalFetch = globalThis.fetch;
const batch = JSON.parse(await readFile(new URL('./fixtures/telemetry-v2/canonical-minimal.json', import.meta.url), 'utf8'));
try {
	const client = createWatchdogTelemetryClient({spoolDirectory: temp});
	globalThis.fetch = async () => { throw new Error('offline fixture'); };
	assert.equal((await client.submit(batch)).spooled, true);
	let sends = 0;
	let release;
	let entered;
	const started = new Promise(resolve => { entered = resolve; });
	const barrier = new Promise(resolve => { release = resolve; });
	globalThis.fetch = async (_url, options) => {
		sends++;
		entered();
		await barrier;
		return {ok: true, status: 200};
	};
	const first = client.flush();
	await started;
	const second = client.flush();
	release();
	assert.deepEqual(await first, {sent: 1, retained: 0});
	assert.deepEqual(await second, {sent: 1, retained: 0});
	assert.equal(sends, 1, 'concurrent flushes sent the same durable batch twice');
	assert.equal((await client.spool.files()).length, 0);

	let signal;
	globalThis.fetch = async (_url, options) => {
		signal = options.signal;
		const body = JSON.parse(options.body);
		assert.deepEqual(body.records[0].content, []);
		return {ok: true, status: 200};
	};
	const original = structuredClone(batch);
	batch.records[0].content = [{value: 'private-content'}];
	const result = await client.submit(batch);
	assert.equal(result.ok, true);
	assert.equal(signal.aborted, true, 'status-only delivery left response resources alive');
	assert.equal(batch.records[0].content[0].value, 'private-content', 'caller input mutated');
	assert.deepEqual(batch.producer, original.producer);
	assert.deepEqual(await client.flush(), {sent: 0, retained: 0}, 'completed flush was not reset');
	console.log('shared_client_lifecycle_check: PASS');
} finally {
	globalThis.fetch = originalFetch;
	await rm(temp, {recursive: true, force: true});
}
