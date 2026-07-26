const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TMP_DIR = path.join(ROOT, 'tmp');
const { resolveKujoBinOrThrow } = require('./_kujo_bin');
const KUJO_BIN = resolveKujoBinOrThrow(__filename);

const PROFILES = {
	quick: {
		totalRequests: 60,
		concurrency: 6,
		minRps: 4,
		maxP95Ms: 1200,
		maxStatsMs: 900,
		maxRequestsMs: 1200,
		maxChartsMs: 1200,
		maxBytesPerRequest: 22000,
		maxDbSizeBytes: 12 * 1024 * 1024,
	},
	soak: {
		totalRequests: 240,
		concurrency: 8,
		minRps: 3,
		maxP95Ms: 1600,
		maxStatsMs: 1200,
		maxRequestsMs: 1600,
		maxChartsMs: 1600,
		maxBytesPerRequest: 26000,
		maxDbSizeBytes: 30 * 1024 * 1024,
	},
};

function minRpsFor(profileName, settings) {
	const profileEnvName = 'WDG_LOAD_MIN_RPS_' + profileName.toUpperCase();
	const raw = process.env[profileEnvName] || process.env.WDG_LOAD_MIN_RPS || '';
	const parsed = Number.parseFloat(String(raw).trim());
	return Number.isFinite(parsed) && parsed > 0 ? parsed : settings.minRps;
}

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureTmpDir() {
	if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

function parseJson(text, label) {
	try {
		return JSON.parse(text);
	} catch (err) {
		throw new Error(label + ' invalid JSON: ' + err.message + '\n' + text.slice(0, 300));
	}
}

function httpRequest(port, method, pathname, headers = {}, body = '') {
	return new Promise((resolve, reject) => {
		const req = http.request(
			{
				host: '127.0.0.1',
				port,
				method,
				path: pathname,
				headers,
			},
			res => {
				let text = '';
				res.on('data', chunk => {
					text += chunk.toString();
				});
				res.on('end', () => {
					resolve({
						status: res.statusCode || 0,
						body: text,
						headers: res.headers || {},
					});
				});
			}
		);
		req.on('error', reject);
		if (body) req.write(body);
		req.end();
	});
}

function writeProxyConfig(filePath, upstreamPort) {
	fs.writeFileSync(
		filePath,
		JSON.stringify(
			{
				upstream_base_url: 'http://127.0.0.1:' + upstreamPort + '/v1',
				auth_mode: 'passthrough',
				upstream_api_key: '',
				upstream_api_key_env: '',
			},
			null,
			2
		)
	);
}

function startStub(port) {
	const server = http.createServer((req, res) => {
		if (req.url !== '/v1/chat/completions') {
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: { message: 'not found' } }));
			return;
		}

		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(
			JSON.stringify({
				id: 'load-ok',
				model: 'stub-model',
				choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
				usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
			})
		);
	});

	return new Promise((resolve, reject) => {
		server.on('error', reject);
		server.listen(port, '127.0.0.1', () => resolve(server));
	});
}

async function stopNodeServer(server) {
	if (!server) return;
	await new Promise(resolve => server.close(() => resolve()));
}

async function startWatchdog(port, dbPath, cfgPath) {
	const child = spawn(KUJO_BIN, ['run', '--interpreter', 'dashboard_server.kujo'], {
		cwd: ROOT,
		env: {
			...process.env,
			WDG_PORT: String(port),
			WDG_DB_PATH: dbPath,
			WDG_PROXY_CONFIG_PATH: cfgPath,
			WDG_API_AUTH_MODE: 'off',
			WDG_RATE_LIMIT_MODE: 'off',
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	});

	let output = '';
	child.stdout.on('data', chunk => {
		output += chunk.toString();
	});
	child.stderr.on('data', chunk => {
		output += chunk.toString();
	});

	for (let i = 0; i < 120; i += 1) {
		try {
			const probe = await httpRequest(port, 'GET', '/api/stats');
			if (probe.status === 200) return { child, outputRef: () => output };
		} catch (err) {
			if (child.exitCode != null) break;
		}
		await delay(100);
	}

	child.kill('SIGTERM');
	throw new Error('Watchdog failed to start.\n' + output);
}

async function stopWatchdog(child) {
	if (!child || child.killed) return;
	child.kill('SIGTERM');
	await delay(300);
	if (child.exitCode == null) child.kill('SIGKILL');
}

function percentile(values, p) {
	if (!values.length) return 0;
	const sorted = values.slice().sort((a, b) => a - b);
	const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
	return sorted[idx];
}

async function timedGetJson(port, pathname) {
	const started = Date.now();
	const resp = await httpRequest(port, 'GET', pathname);
	const elapsed = Date.now() - started;
	assert.strictEqual(resp.status, 200, pathname + ' should return 200');
	const parsed = parseJson(resp.body, pathname);
	assert.strictEqual(parsed.ok, true, pathname + ' should return ok=true');
	return { elapsed, data: parsed.data };
}

async function runLoad(profileName, settings, port) {
	let nextId = 0;
	const latencies = [];

	async function worker(workerId) {
		for (;;) {
			const id = nextId;
			nextId += 1;
			if (id >= settings.totalRequests) return;

			const tenantId = id % 2 === 0 ? 'tenant_a' : 'tenant_b';
			const projectId = id % 3 === 0 ? 'project_web' : 'project_worker';
			const body = JSON.stringify({
				model: 'gpt-4.1-mini',
				tenant_id: tenantId,
				project_id: projectId,
				messages: [{ role: 'user', content: 'load-run-' + profileName + '-' + workerId + '-' + id }],
			});

			const started = Date.now();
			const resp = await httpRequest(
				port,
				'POST',
				'/proxy/v1/chat/completions',
				{
					'Content-Type': 'application/json',
					'X-Observe-Session-Id': profileName + '_sess_' + Math.floor(id / 10),
					'X-Observe-Tenant-Id': tenantId,
					'X-Observe-Project-Id': projectId,
				},
				body
			);
			const elapsed = Date.now() - started;
			if (resp.status !== 200) {
				throw new Error('Proxy request failed with status ' + resp.status + ' for id=' + id + '\n' + resp.body.slice(0, 300));
			}
			latencies.push(elapsed);
		}
	}

	const started = Date.now();
	const workers = [];
	for (let i = 0; i < settings.concurrency; i += 1) {
		workers.push(worker(i));
	}
	await Promise.all(workers);
	const elapsedTotalMs = Date.now() - started;

	const rps = settings.totalRequests / Math.max(0.001, elapsedTotalMs / 1000);
	const p95 = percentile(latencies, 95);

	return {
		latencies,
		rps,
		p95,
		elapsedTotalMs,
	};
}

async function runProfile(profileName) {
	const settings = PROFILES[profileName];
	if (!settings) {
		throw new Error('Unknown profile: ' + profileName);
	}
	const minRps = minRpsFor(profileName, settings);

	ensureTmpDir();
	const upstreamPort = profileName === 'soak' ? 8854 : 8853;
	const watchdogPort = profileName === 'soak' ? 7764 : 7763;
	const dbPath = path.join(TMP_DIR, 'load-soak-' + profileName + '.db');
	const cfgPath = path.join(TMP_DIR, 'load-soak-' + profileName + '-config.json');

	if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
	if (fs.existsSync(dbPath + '-shm')) fs.rmSync(dbPath + '-shm', { force: true });
	if (fs.existsSync(dbPath + '-wal')) fs.rmSync(dbPath + '-wal', { force: true });

	writeProxyConfig(cfgPath, upstreamPort);

	const stub = await startStub(upstreamPort);
	const wd = await startWatchdog(watchdogPort, dbPath, cfgPath);

	try {
		const baselineSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
		const baselineStatsResp = await timedGetJson(watchdogPort, '/api/stats');
		const baselineReqResp = await timedGetJson(watchdogPort, '/api/requests?page_size=200');
		const baselineChartResp = await timedGetJson(watchdogPort, '/api/charts/requests-over-time');

		const loadStats = await runLoad(profileName, settings, watchdogPort);

		const statsResp = await timedGetJson(watchdogPort, '/api/stats');
		const reqResp = await timedGetJson(watchdogPort, '/api/requests?page_size=200');
		const chartResp = await timedGetJson(watchdogPort, '/api/charts/requests-over-time');

		const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
		const growthBytes = Math.max(0, dbSize - baselineSize);
		const bytesPerRequest = growthBytes / Math.max(1, settings.totalRequests);

		assert.ok(loadStats.rps >= minRps, profileName + ' throughput below threshold: ' + loadStats.rps.toFixed(2) + ' < ' + minRps);
		assert.ok(loadStats.p95 <= settings.maxP95Ms, profileName + ' p95 latency above threshold: ' + loadStats.p95 + ' > ' + settings.maxP95Ms);
		assert.ok(statsResp.elapsed <= settings.maxStatsMs, profileName + ' /api/stats latency above threshold: ' + statsResp.elapsed + ' > ' + settings.maxStatsMs);
		assert.ok(reqResp.elapsed <= settings.maxRequestsMs, profileName + ' /api/requests latency above threshold: ' + reqResp.elapsed + ' > ' + settings.maxRequestsMs);
		assert.ok(chartResp.elapsed <= settings.maxChartsMs, profileName + ' /api/charts/requests-over-time latency above threshold: ' + chartResp.elapsed + ' > ' + settings.maxChartsMs);
		assert.ok(statsResp.elapsed <= baselineStatsResp.elapsed + settings.maxStatsMs, profileName + ' /api/stats regressed too far from baseline');
		assert.ok(reqResp.elapsed <= baselineReqResp.elapsed + settings.maxRequestsMs, profileName + ' /api/requests regressed too far from baseline');
		assert.ok(chartResp.elapsed <= baselineChartResp.elapsed + settings.maxChartsMs, profileName + ' /api/charts/requests-over-time regressed too far from baseline');
		assert.ok(bytesPerRequest <= settings.maxBytesPerRequest, profileName + ' DB growth/request above threshold: ' + bytesPerRequest.toFixed(2) + ' > ' + settings.maxBytesPerRequest);
		assert.ok(dbSize <= settings.maxDbSizeBytes, profileName + ' DB size above threshold: ' + dbSize + ' > ' + settings.maxDbSizeBytes);

		const totalRequests = Number((statsResp.data && statsResp.data.total_requests) || 0);
		assert.ok(totalRequests >= settings.totalRequests, profileName + ' total_requests should include load data');

		console.log(
			'load_soak_suite profile=' + profileName +
			' total=' + settings.totalRequests +
			' concurrency=' + settings.concurrency +
			' rps=' + loadStats.rps.toFixed(2) +
			' p95_ms=' + loadStats.p95 +
			' baseline_stats_ms=' + baselineStatsResp.elapsed +
			' baseline_requests_ms=' + baselineReqResp.elapsed +
			' baseline_charts_ms=' + baselineChartResp.elapsed +
			' stats_ms=' + statsResp.elapsed +
			' requests_ms=' + reqResp.elapsed +
			' charts_ms=' + chartResp.elapsed +
			' db_size=' + dbSize +
			' growth_per_request=' + bytesPerRequest.toFixed(2)
		);
	} finally {
		await stopWatchdog(wd.child);
		await stopNodeServer(stub);
	}
}

async function run() {

	const profile = (process.env.WDG_LOAD_PROFILE || 'quick').toLowerCase();
	if (profile === 'all') {
		await runProfile('quick');
		await runProfile('soak');
		console.log('load_soak_suite: PASS (all profiles)');
		return;
	}

	await runProfile(profile);
	console.log('load_soak_suite: PASS (' + profile + ')');
}

run().catch(err => {
	console.error('load_soak_suite: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
