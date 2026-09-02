import assert from 'node:assert/strict';
import {mkdtemp, readFile, readdir, stat} from 'node:fs/promises';
import http from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createWatchdogTelemetryClient} from '../clients/javascript/watchdog-telemetry.mjs';

const spoolRoot = await mkdtemp(join(tmpdir(), 'watchdog-shared-client-'));
const port = 17738;
const batch = JSON.parse(await readFile(new URL('./fixtures/telemetry-v2/canonical-minimal.json', import.meta.url), 'utf8'));
batch.batch_id = 'shared-client-offline';
batch.records[0].content = [{class: 'prompt', media_type: 'text/plain', value: 'shared-client-content-canary', truncated: false}];
batch.records[0].privacy.content_mode = 'full';

const client = createWatchdogTelemetryClient({baseUrl: `http://127.0.0.1:${port}`, spoolDirectory: spoolRoot, token: 'shared-client-secret-canary', timeoutMs: 200, maxSpoolFiles: 10, maxSpoolBytes: 1024 * 1024});
const offline = await client.submit(batch);
assert.equal(offline.spooled, true, 'offline telemetry was not durably spooled');
const spoolDirs = await readdir(spoolRoot);
assert.equal(spoolDirs.length, 1);
const spoolDir = join(spoolRoot, spoolDirs[0]);
assert.equal((await stat(spoolDir)).mode & 0o777, 0o700);
const queued = (await readdir(spoolDir)).filter((name) => name.endsWith('.json'));
assert.equal(queued.length, 1);
const queuedPath = join(spoolDir, queued[0]);
assert.equal((await stat(queuedPath)).mode & 0o777, 0o600);
const queuedText = await readFile(queuedPath, 'utf8');
assert.doesNotMatch(queuedText, /shared-client-content-canary|shared-client-secret-canary/);
assert.match(queuedText, /content_dropped_by_shared_client/);

const received = [];
const server = http.createServer((req, res) => {
	let body = '';
	req.on('data', (chunk) => { body += chunk; });
	req.on('end', () => { received.push({headers: req.headers, body}); res.writeHead(200, {'Content-Type': 'application/json'}); res.end('{"ok":true}'); });
});
await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
const flushed = await client.flush();
assert.equal(flushed.sent, 1);
assert.equal((await client.spool.files()).length, 0);
assert.equal(received.length, 1);
assert.equal(received[0].headers.authorization, 'Bearer shared-client-secret-canary');
assert.doesNotMatch(received[0].body, /shared-client-content-canary/);
server.closeAllConnections?.();
await new Promise((resolve) => server.close(resolve));

assert.throws(() => createWatchdogTelemetryClient({baseUrl: 'http://169.254.169.254'}), /HTTPS or explicit loopback/);
assert.throws(() => createWatchdogTelemetryClient({baseUrl: 'https://user:pass@example.com'}), /credentials/);
console.log('shared_telemetry_client_suite: PASS');
