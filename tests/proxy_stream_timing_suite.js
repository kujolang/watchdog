const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {resolveKujoBinOrThrow} = require('./_kujo_bin');

const root = path.resolve(__dirname, '..');
const kujoBin = resolveKujoBinOrThrow(__filename);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-proxy-stream-timing-'));
const upstreamPort = 18931;
const watchdogPort = 18932;
const dbPath = path.join(temp, 'watchdog.db');
const configPath = path.join(temp, 'proxy.json');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function timedRequest(port, pathname) {
	return new Promise((resolve, reject) => {
		const started = performance.now();
		let firstByte = null;
		const body = JSON.stringify({model: 'timing-fixture', stream: true, messages: []});
		const req = http.request({host: '127.0.0.1', port, method: 'POST', path: pathname, headers: {'content-type': 'application/json', 'content-length': Buffer.byteLength(body)}}, res => {
			let text = '';
			res.on('data', chunk => { if (firstByte === null) firstByte = performance.now() - started; text += chunk; });
			res.on('end', () => resolve({status: res.statusCode, firstByteMs: firstByte, totalMs: performance.now() - started, body: text}));
		});
		req.on('error', reject); req.end(body);
	});
}

function getJson(pathname) {
	return new Promise((resolve, reject) => {
		http.get({host: '127.0.0.1', port: watchdogPort, path: pathname}, res => { let text = ''; res.on('data', c => { text += c; }); res.on('end', () => resolve({status: res.statusCode, json: JSON.parse(text)})); }).on('error', reject);
	});
}

async function run() {
	let upstream;
	let watchdog;
	try {
		upstream = http.createServer((req, res) => {
			res.writeHead(200, {'content-type': 'text/event-stream'});
			setTimeout(() => res.write(': heartbeat\n\n'), 40);
			setTimeout(() => res.write('data: {"id":"timing-1","choices":[{"delta":{"content":"hello"}}]}\n\n'), 100);
			setTimeout(() => res.end('data: {"id":"timing-1","choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\ndata: [DONE]\n\n'), 360);
		});
		await new Promise((resolve, reject) => { upstream.once('error', reject); upstream.listen(upstreamPort, '127.0.0.1', resolve); });
		fs.writeFileSync(configPath, JSON.stringify({upstream_base_url: `http://127.0.0.1:${upstreamPort}/v1`, auth_mode: 'passthrough'}));
		watchdog = spawn(kujoBin, ['run', '--interpreter', 'dashboard_server.kujo'], {cwd: root, env: {...process.env, WDG_PORT: String(watchdogPort), WDG_DB_PATH: dbPath, WDG_PROXY_CONFIG_PATH: configPath, WDG_API_AUTH_MODE: 'off', WDG_PROXY_AUTHZ_MODE: 'off', WDG_BACKUP_ENABLED: 'false'}, stdio: ['ignore', 'pipe', 'pipe']});
		let output = ''; watchdog.stdout.on('data', c => { output += c; }); watchdog.stderr.on('data', c => { output += c; });
		let ready = false;
		for (let i = 0; i < 100; i++) { try { if ((await getJson('/readyz')).status === 200) { ready = true; break; } } catch {} await delay(100); }
		if (!ready) throw new Error(`Watchdog failed to start\n${output}`);
		const direct = await timedRequest(upstreamPort, '/v1/chat/completions');
		const proxied = await timedRequest(watchdogPort, '/proxy/v1/chat/completions');
		assert.ok(direct.firstByteMs < 180, `direct first chunk was unexpectedly late: ${direct.firstByteMs}ms`);
		assert.ok(proxied.firstByteMs < proxied.totalMs - 100, `proxy did not expose a chunk before completion: first=${proxied.firstByteMs}ms total=${proxied.totalMs}ms`);
		let records = [];
		let model;
		for (let i = 0; i < 30; i++) {
			records = (await getJson('/api/telemetry/v2/records?producer=watchdog-proxy&limit=20')).json.data.records.map(item => item.record);
			model = records.find(record => record.kind === 'model');
			if (model) break;
			await delay(50);
		}
		const requests = await getJson('/api/requests?limit=20');
		const proxyLogs = output.split('\n').filter(line => line.includes('Proxy canonical')).join('\n');
		assert.ok(model, `proxy model telemetry was not persisted after stream completion: proxied=${JSON.stringify(proxied)} records=${JSON.stringify(records)} requests=${JSON.stringify(requests.json)} logs=${proxyLogs}`);
		assert.equal(model.attributes['watchdog.timing.source'], 'watchdog_proxy_clock');
		assert.equal(model.attributes['watchdog.first_output.unit'], 'content_delta');
		assert.ok(Number.isFinite(model.attributes['watchdog.time_to_first_output_ms']));
		assert.ok(model.attributes['watchdog.time_to_first_output_ms'] >= 60, 'heartbeat must not count as meaningful first output');
		assert.ok(Number.isFinite(model.attributes['watchdog.output_generation_duration_ms']));
		assert.ok(model.attributes['watchdog.output_generation_duration_ms'] >= 150);
		assert.ok(Number.isFinite(model.attributes['watchdog.output_tokens_per_second']));
		assert.ok(records.some(record => record.name === 'watchdog.output.first'), 'first-output lifecycle event should be persisted');
		console.log('proxy_stream_timing_suite: PASS');
	} finally {
		if (watchdog && watchdog.exitCode == null) { watchdog.kill('SIGTERM'); await delay(200); if (watchdog.exitCode == null) watchdog.kill('SIGKILL'); }
		if (upstream) await new Promise(resolve => upstream.close(resolve));
		fs.rmSync(temp, {recursive: true, force: true});
	}
}
run().catch(error => { console.error(error.stack || error); process.exit(1); });
