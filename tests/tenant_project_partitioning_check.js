const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TMP_DIR = path.join(ROOT, 'tmp');
const { resolveKujoBinOrThrow } = require('./_kujo_bin');
const KUJO_BIN = resolveKujoBinOrThrow(__filename);

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureTmpDir() {
	if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
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
					resolve({ status: res.statusCode || 0, body: text, headers: res.headers || {} });
				});
			}
		);
		req.on('error', reject);
		if (body) req.write(body);
		req.end();
	});
}

function parseApiData(resp, endpoint) {
	assert.strictEqual(resp.status, 200, endpoint + ' should return 200');
	const parsed = JSON.parse(resp.body);
	assert.strictEqual(parsed.ok, true, endpoint + ' should return ok=true');
	return parsed.data;
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
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ id: 'tenant-ok', model: 'stub-model', choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
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
	await delay(250);
	if (child.exitCode == null) child.kill('SIGKILL');
}

function assertDashboardReferences() {
	const html = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
	assert.ok(html.includes('Tenant'), 'dashboard requests table should include tenant column');
	assert.ok(html.includes('Project'), 'dashboard requests table should include project column');
	assert.ok(html.includes('reqTenantFilter'), 'dashboard should include tenant filter input');
	assert.ok(html.includes('reqProjectFilter'), 'dashboard should include project filter input');
	assert.ok(html.includes('safeText(r.tenant_id ||'), 'dashboard rendering should include tenant_id field');
	assert.ok(html.includes('safeText(r.project_id ||'), 'dashboard rendering should include project_id field');
}

async function run() {

	ensureTmpDir();
	const upstreamPort = 8852;
	const watchdogPort = 7762;
	const dbPath = path.join(TMP_DIR, 'tenant-project-partitioning.db');
	const cfgPath = path.join(TMP_DIR, 'tenant-project-partitioning-config.json');
	if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
	if (fs.existsSync(dbPath + '-shm')) fs.rmSync(dbPath + '-shm', { force: true });
	if (fs.existsSync(dbPath + '-wal')) fs.rmSync(dbPath + '-wal', { force: true });
	writeProxyConfig(cfgPath, upstreamPort);

	const stub = await startStub(upstreamPort);
	const wd = await startWatchdog(watchdogPort, dbPath, cfgPath);

	try {
		const headerScoped = await httpRequest(
			watchdogPort,
			'POST',
			'/proxy/v1/chat/completions',
			{
				'Content-Type': 'application/json',
				'X-Observe-Session-Id': 'sess_part_a',
				'X-Observe-Tenant-Id': 'tenant_alpha',
				'X-Observe-Project-Id': 'project_red',
			},
			JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: 'tenant/project from headers' }] })
		);
		assert.strictEqual(headerScoped.status, 200, 'header-scoped proxy request should succeed');

		const payloadScoped = await httpRequest(
			watchdogPort,
			'POST',
			'/proxy/v1/chat/completions',
			{
				'Content-Type': 'application/json',
				'X-Observe-Session-Id': 'sess_part_b',
			},
			JSON.stringify({
				model: 'gpt-4.1-mini',
				tenant_id: 'tenant_beta',
				project_id: 'project_blue',
				messages: [{ role: 'user', content: 'tenant/project from payload' }],
			})
		);
		assert.strictEqual(payloadScoped.status, 200, 'payload-scoped proxy request should succeed');

		const longTenant = 'tenant_' + 'x'.repeat(220);
		const longProject = 'project_' + 'y'.repeat(220);
		const longScoped = await httpRequest(
			watchdogPort,
			'POST',
			'/proxy/v1/chat/completions',
			{
				'Content-Type': 'application/json',
				'X-Observe-Session-Id': 'sess_part_c',
				'X-Observe-Tenant-Id': longTenant,
				'X-Observe-Project-Id': longProject,
			},
			JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: 'tenant/project truncation check' }] })
		);
		assert.strictEqual(longScoped.status, 200, 'long identifier proxy request should succeed');

		const tenantAlphaRows = parseApiData(
			await httpRequest(watchdogPort, 'GET', '/api/requests?tenant_id=tenant_alpha&page_size=20'),
			'/api/requests?tenant_id=tenant_alpha'
		);
		assert.strictEqual(tenantAlphaRows.length, 1, 'tenant filter should return only matching tenant rows');
		assert.strictEqual(tenantAlphaRows[0].tenant_id, 'tenant_alpha');
		assert.strictEqual(tenantAlphaRows[0].project_id, 'project_red');

		const projectBlueRows = parseApiData(
			await httpRequest(watchdogPort, 'GET', '/api/requests?project_id=project_blue&page_size=20'),
			'/api/requests?project_id=project_blue'
		);
		assert.strictEqual(projectBlueRows.length, 1, 'project filter should return only matching project rows');
		assert.strictEqual(projectBlueRows[0].tenant_id, 'tenant_beta');
		assert.strictEqual(projectBlueRows[0].project_id, 'project_blue');

		const combinedRows = parseApiData(
			await httpRequest(watchdogPort, 'GET', '/api/requests?tenant_id=tenant_alpha&project_id=project_red&page_size=20'),
			'/api/requests combined tenant/project'
		);
		assert.strictEqual(combinedRows.length, 1, 'combined tenant/project filters should return scoped row');

		const mismatchRows = parseApiData(
			await httpRequest(watchdogPort, 'GET', '/api/requests?tenant_id=tenant_alpha&project_id=project_blue&page_size=20'),
			'/api/requests mismatched tenant/project'
		);
		assert.strictEqual(mismatchRows.length, 0, 'mismatched tenant/project filters should not return rows');

		const exportData = parseApiData(
			await httpRequest(watchdogPort, 'GET', '/api/export?tenant_id=tenant_alpha'),
			'/api/export?tenant_id=tenant_alpha'
		);
		assert.ok(Array.isArray(exportData.requests) && exportData.requests.length === 1, 'tenant-scoped export should include only matching request rows');
		assert.strictEqual(exportData.requests[0].tenant_id, 'tenant_alpha');
		assert.strictEqual(exportData.requests[0].project_id, 'project_red');

		const tenantSessionRows = parseApiData(
			await httpRequest(watchdogPort, 'GET', '/api/sessions?tenant_id=tenant_alpha&page_size=20'),
			'/api/sessions?tenant_id=tenant_alpha'
		);
		assert.strictEqual(tenantSessionRows.length, 1, 'tenant-scoped sessions should include only matching session rows');
		assert.strictEqual(String(tenantSessionRows[0].session_id), 'sess_part_a');

		const projectSessionRows = parseApiData(
			await httpRequest(watchdogPort, 'GET', '/api/sessions?project_id=project_blue&page_size=20'),
			'/api/sessions?project_id=project_blue'
		);
		assert.strictEqual(projectSessionRows.length, 1, 'project-scoped sessions should include only matching session rows');
		assert.strictEqual(String(projectSessionRows[0].session_id), 'sess_part_b');

		const requestsChart = parseApiData(
			await httpRequest(watchdogPort, 'GET', '/api/charts/requests-over-time?tenant_id=tenant_alpha'),
			'/api/charts/requests-over-time?tenant_id=tenant_alpha'
		);
		assert.ok(Array.isArray(requestsChart), 'requests-over-time chart should return array');
		const tenantRequestTotal = requestsChart.reduce((sum, row) => sum + Number(row.total || 0), 0);
		assert.strictEqual(tenantRequestTotal, 1, 'tenant-scoped requests-over-time should include only tenant rows');

		const statusBreakdown = parseApiData(
			await httpRequest(watchdogPort, 'GET', '/api/charts/status-breakdown?project_id=project_blue'),
			'/api/charts/status-breakdown?project_id=project_blue'
		);
		const statusTotal = statusBreakdown.reduce((sum, row) => sum + Number(row.count || 0), 0);
		assert.strictEqual(statusTotal, 1, 'project-scoped status breakdown should include only project rows');

		const providerBreakdown = parseApiData(
			await httpRequest(watchdogPort, 'GET', '/api/charts/provider-breakdown?project_id=project_blue'),
			'/api/charts/provider-breakdown?project_id=project_blue'
		);
		const providerTotal = providerBreakdown.reduce((sum, row) => sum + Number(row.count || 0), 0);
		assert.strictEqual(providerTotal, 1, 'project-scoped provider breakdown should include only project rows');

		const latencyHist = parseApiData(
			await httpRequest(watchdogPort, 'GET', '/api/charts/latency-hist?tenant_id=tenant_alpha'),
			'/api/charts/latency-hist?tenant_id=tenant_alpha'
		);
		const latencyTotal = Number(latencyHist.lt200 || 0)
			+ Number(latencyHist.lt500 || 0)
			+ Number(latencyHist.lt1000 || 0)
			+ Number(latencyHist.lt2000 || 0)
			+ Number(latencyHist.lt3000 || 0)
			+ Number(latencyHist.lt5000 || 0)
			+ Number(latencyHist.lt10000 || 0)
			+ Number(latencyHist.lt30000 || 0)
			+ Number(latencyHist.lt60000 || 0)
			+ Number(latencyHist.gte60000 || 0);
		assert.strictEqual(latencyTotal, 1, 'tenant-scoped latency histogram should include only tenant rows');

		const longSessionRows = parseApiData(
			await httpRequest(watchdogPort, 'GET', '/api/requests?session_id=sess_part_c&page_size=20'),
			'/api/requests?session_id=sess_part_c'
		);
		assert.strictEqual(longSessionRows.length, 1, 'long identifier row should be recorded');
		assert.strictEqual(String(longSessionRows[0].tenant_id || '').length, 128, 'tenant id should be bounded to default max length');
		assert.strictEqual(String(longSessionRows[0].project_id || '').length, 128, 'project id should be bounded to default max length');

		assertDashboardReferences();
		console.log('tenant_project_partitioning_check: PASS');
	} finally {
		await stopWatchdog(wd.child);
		await stopNodeServer(stub);
	}
}

run().catch(err => {
	console.error('tenant_project_partitioning_check: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
