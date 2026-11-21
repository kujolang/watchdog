import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
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
	for (const baseUrl of ['https://example.test?token=discarded', 'https://example.test/#fragment']) {
		assert.throws(() => createWatchdogTelemetryClient({baseUrl}), /credentials, query, or fragment/);
	}

	const bounded = createWatchdogTelemetryClient({spoolDirectory: join(temp, 'bounded'), maxSpoolBytes: 2048, maxSpoolFiles: 1});
	globalThis.fetch = async () => { throw new Error('offline fixture'); };
	const firstBatch = {...original, batch_id: 'first'};
	const secondBatch = {...original, batch_id: 'second'};
	const originalNow = Date.now;
	try {
		Date.now = () => 1795248000000;
		await bounded.submit(firstBatch);
		assert.equal((await bounded.submit(secondBatch)).spooled, true);
	} finally { Date.now = originalNow; }
	const [queued] = await bounded.spool.files();
	assert.equal(JSON.parse(await readFile(join(bounded.spool.directory, queued), 'utf8')).batch_id, 'second');
	const unrelated = join(bounded.spool.directory, 'operator.json');
	await writeFile(unrelated, '{"keep":true}');
	const oversized = structuredClone(original);
	oversized.records[0].attributes = {fixture: 'x'.repeat(2048)};
	await assert.rejects(bounded.submit(oversized), /configured spool byte limit/);
	assert.deepEqual(await bounded.spool.files(), [queued]);
	let networkCalls = 0;
	globalThis.fetch = async () => { networkCalls++; return {ok: true, status: 200}; };
	const overWireLimit = structuredClone(original);
	overWireLimit.records[0].attributes = {fixture: 'é'.repeat(256 * 1024)};
	await assert.rejects(bounded.submit(overWireLimit), /512 KiB client limit/);
	assert.equal(networkCalls, 0, 'over-limit batch reached the HTTP transport');
	assert.deepEqual(await bounded.flush(), {sent: 1, retained: 0}, 'failed append poisoned subsequent flush');
	const replay = createWatchdogTelemetryClient({spoolDirectory: join(temp, 'replay')});
	await replay.spool.initialize();
	const overLimitOnDisk = join(replay.spool.directory, queued);
	await writeFile(overLimitOnDisk, JSON.stringify(overWireLimit));
	assert.deepEqual(await replay.flush(), {sent: 0, retained: 0});
	assert.equal(networkCalls, 1, 'oversized persisted batch reached the HTTP transport');
	assert.deepEqual(await replay.spool.files(), []);
	assert.equal(await readFile(unrelated, 'utf8'), '{"keep":true}');

	const unavailable = createWatchdogTelemetryClient({spoolDirectory: join(temp, 'unavailable')});
	await writeFile(join(temp, 'unavailable'), 'operator data');
	await assert.rejects(unavailable.flush(), {code: 'ENOTDIR'});
	console.log('shared_client_lifecycle_check: PASS');
} finally {
	globalThis.fetch = originalFetch;
	await rm(temp, {recursive: true, force: true});
}
