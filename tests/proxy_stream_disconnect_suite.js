const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {resolveKujoBinOrThrow} = require('./_kujo_bin');

const root = path.resolve(__dirname, '..');
const kujoBin = resolveKujoBinOrThrow(__filename);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-proxy-stream-disconnect-'));
const upstreamPort = 18933;
const watchdogPort = 18934;
const dbPath = path.join(temp, 'watchdog.db');
const configPath = path.join(temp, 'proxy.json');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function getJson(pathname) {
	return new Promise((resolve, reject) => {
		http.get({host: '127.0.0.1', port: watchdogPort, path: pathname}, res => {
			let text = '';
			res.on('data', chunk => { text += chunk; });
			res.on('end', () => resolve({status: res.statusCode, json: JSON.parse(text)}));
		}).on('error', reject);
	});
}

function disconnectAfterFirstChunk() {
	return new Promise((resolve, reject) => {
		const body = JSON.stringify({model: 'disconnect-fixture', stream: true, messages: []});
		const req = http.request({host: '127.0.0.1', port: watchdogPort, method: 'POST', path: '/proxy/v1/chat/completions', headers: {'content-type': 'application/json', 'content-length': Buffer.byteLength(body)}}, res => {
			res.once('data', () => {
				res.destroy();
				req.destroy();
				resolve();
			});
		});
		req.on('error', error => {
			if (error.code === 'ECONNRESET') resolve();
			else reject(error);
		});
		req.end(body);
	});
}

async function run() {
	let upstream;
	let watchdog;
	const timers = new Set();
	try {
		upstream = http.createServer((req, res) => {
			res.writeHead(200, {'content-type': 'text/event-stream'});
			let index = 0;
			const timer = setInterval(() => {
				index += 1;
				const content = `${index}:` + 'x'.repeat(32768);
				res.write(`data: ${JSON.stringify({id: 'disconnect-1', choices: [{delta: {content}}]})}\n\n`);
				if (index >= 100) {
					clearInterval(timer);
					timers.delete(timer);
					res.end('data: [DONE]\n\n');
				}
			}, 20);
			timers.add(timer);
			res.on('close', () => { clearInterval(timer); timers.delete(timer); });
		});
		await new Promise((resolve, reject) => { upstream.once('error', reject); upstream.listen(upstreamPort, '127.0.0.1', resolve); });
		fs.writeFileSync(configPath, JSON.stringify({upstream_base_url: `http://127.0.0.1:${upstreamPort}/v1`, auth_mode: 'passthrough'}));
		watchdog = spawn(kujoBin, ['run', '--interpreter', 'dashboard_server.kujo'], {cwd: root, env: {...process.env, WDG_PORT: String(watchdogPort), WDG_DB_PATH: dbPath, WDG_PROXY_CONFIG_PATH: configPath, WDG_API_AUTH_MODE: 'off', WDG_PROXY_AUTHZ_MODE: 'off', WDG_BACKUP_ENABLED: 'false'}, stdio: ['ignore', 'pipe', 'pipe']});
		let output = '';
		watchdog.stdout.on('data', chunk => { output = (output + chunk).slice(-8192); });
		watchdog.stderr.on('data', chunk => { output = (output + chunk).slice(-8192); });
		let ready = false;
		for (let i = 0; i < 100; i++) {
			try { if ((await getJson('/readyz')).status === 200) { ready = true; break; } } catch {}
			await delay(100);
		}
		if (!ready) throw new Error(`Watchdog failed to start\n${output}`);

		await disconnectAfterFirstChunk();
		let row;
		for (let i = 0; i < 100; i++) {
			const requests = (await getJson('/api/requests?limit=20')).json.data;
			row = requests.find(item => item.model === 'disconnect-fixture');
			if (row) break;
			await delay(50);
		}
		assert.ok(row, `disconnect request was not persisted\n${output}`);
		assert.equal(row.status, 'error');
		assert.equal(row.error_code, 'client_disconnect');
		console.log('proxy_stream_disconnect_suite: PASS');
	} finally {
		for (const timer of timers) clearInterval(timer);
		if (watchdog && watchdog.exitCode == null) { watchdog.kill('SIGTERM'); await delay(200); if (watchdog.exitCode == null) watchdog.kill('SIGKILL'); }
		if (upstream) await new Promise(resolve => upstream.close(resolve));
		fs.rmSync(temp, {recursive: true, force: true});
	}
}

run().catch(error => { console.error(error.stack || error); process.exit(1); });
