const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DB_PATH = path.join(ROOT, 'data', 'watchdog.db');
const { resolveKujoBinOrThrow } = require('./_kujo_bin');
const KUJO_BIN = resolveKujoBinOrThrow(__filename);

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function runCommand(args, extraEnv = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(KUJO_BIN, args, {
			cwd: ROOT,
			env: { ...process.env, WDG_DB_PATH: DB_PATH, ...extraEnv },
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let output = '';
		child.stdout.on('data', chunk => {
			output += chunk.toString();
		});
		child.stderr.on('data', chunk => {
			output += chunk.toString();
		});
		child.on('error', reject);
		child.on('close', code => {
			if (code === 0) {
				resolve(output);
				return;
			}
			reject(new Error('Command failed with code ' + code + '\n' + output));
		});
	});
}

function httpGet(pathname) {
	return new Promise((resolve, reject) => {
		const req = http.request(
			{
				host: '127.0.0.1',
				port: 7700,
				path: pathname,
				method: 'GET',
			},
			res => {
				let body = '';
				res.on('data', chunk => {
					body += chunk;
				});
				res.on('end', () => {
					resolve({ status: res.statusCode || 0, body, headers: res.headers || {} });
				});
			}
		);
		req.on('error', reject);
		req.end();
	});
}

function parseJson(text, context) {
	try {
		return JSON.parse(text);
	} catch (err) {
		throw new Error(context + ' returned invalid JSON: ' + err.message + '\nBody: ' + text.slice(0, 400));
	}
}

async function startServer() {
	const child = spawn(KUJO_BIN, ['run', 'dashboard_server.kujo', '--interpreter'], {
		cwd: ROOT,
		env: { ...process.env, WDG_DB_PATH: DB_PATH },
		stdio: ['ignore', 'pipe', 'pipe'],
	});

	let output = '';
	child.stdout.on('data', chunk => {
		output += chunk.toString();
	});
	child.stderr.on('data', chunk => {
		output += chunk.toString();
	});

	for (let i = 0; i < 60; i += 1) {
		try {
			const result = await httpGet('/api/stats');
			if (result.status === 200) {
				return child;
			}
		} catch (err) {
			if (child.exitCode != null) {
				throw new Error('Server exited before ready.\n' + output);
			}
		}
		await delay(150);
	}

	child.kill('SIGTERM');
	throw new Error('Server did not become ready in time.\n' + output);
}

async function stopServer(child) {
	if (!child || child.killed) return;
	child.kill('SIGTERM');
	await delay(250);
	if (!child.killed) {
		child.kill('SIGKILL');
	}
}

async function assertEndpoint(pathname, schemaCheck) {
	const result = await httpGet(pathname);
	assert.strictEqual(result.status, 200, pathname + ' should return HTTP 200');
	const parsed = parseJson(result.body, pathname);
	assert.strictEqual(parsed.ok, true, pathname + ' should return ok=true');
	assert.ok(Object.prototype.hasOwnProperty.call(parsed, 'data'), pathname + ' should include data key');
	schemaCheck(parsed.data);
}

async function run() {

	let server = null;
	try {
		await runCommand(['run', 'demo.kujo', '--interpreter']);
		server = await startServer();

		const health = await httpGet('/healthz');
		assert.strictEqual(health.status, 200, '/healthz should return HTTP 200');
		const healthParsed = parseJson(health.body, '/healthz');
		assert.strictEqual(healthParsed.ok, true, '/healthz should return ok=true');

		const ready = await httpGet('/readyz');
		assert.strictEqual(ready.status, 200, '/readyz should return HTTP 200');
		const readyParsed = parseJson(ready.body, '/readyz');
		assert.strictEqual(readyParsed.ok, true, '/readyz should return ok=true');

		const statsHeadersResp = await httpGet('/api/stats');
		assert.strictEqual(String(statsHeadersResp.headers['x-content-type-options'] || ''), 'nosniff', 'API responses should set X-Content-Type-Options');
		assert.strictEqual(String(statsHeadersResp.headers['x-frame-options'] || ''), 'DENY', 'API responses should set X-Frame-Options');
		assert.strictEqual(String(statsHeadersResp.headers['referrer-policy'] || ''), 'no-referrer', 'API responses should set Referrer-Policy');

		const dashboardResp = await httpGet('/');
		assert.strictEqual(dashboardResp.status, 200, '/ should return HTTP 200');
		assert.strictEqual(String(dashboardResp.headers['x-content-type-options'] || ''), 'nosniff', 'Dashboard response should set X-Content-Type-Options');

		await assertEndpoint('/api/stats', data => {
			assert.ok(data.total_requests >= 1, 'stats.total_requests should be populated after demo seed');
			assert.ok(Object.prototype.hasOwnProperty.call(data, 'total_tool_calls'));
			assert.ok(Object.prototype.hasOwnProperty.call(data, 'total_agent_steps'));
		});

		await assertEndpoint('/api/requests', data => {
			assert.ok(Array.isArray(data), 'requests data should be array');
			assert.ok(data.length >= 1, 'requests should have records after seed');
		});

		await assertEndpoint('/api/tool-calls', data => {
			assert.ok(Array.isArray(data), 'tool-calls data should be array');
		});

		await assertEndpoint('/api/agent-steps', data => {
			assert.ok(Array.isArray(data), 'agent-steps data should be array');
		});

		await assertEndpoint('/api/errors', data => {
			assert.ok(Array.isArray(data), 'errors data should be array');
		});

		await assertEndpoint('/api/sessions', data => {
			assert.ok(Array.isArray(data), 'sessions data should be array');
			assert.ok(data.length >= 1, 'sessions should have records after seed');
		});

		await assertEndpoint('/api/charts/requests-over-time', data => {
			assert.ok(Array.isArray(data), 'requests-over-time data should be array');
		});

		await assertEndpoint('/api/charts/cost-over-time', data => {
			assert.ok(Array.isArray(data), 'cost-over-time data should be array');
		});

		await assertEndpoint('/api/charts/latency-hist', data => {
			assert.ok(Object.prototype.hasOwnProperty.call(data, 'lt200'));
			assert.ok(Object.prototype.hasOwnProperty.call(data, 'gt3000'));
		});

		await assertEndpoint('/api/charts/status-breakdown', data => {
			assert.ok(Array.isArray(data), 'status-breakdown data should be array');
		});

		await assertEndpoint('/api/charts/provider-breakdown', data => {
			assert.ok(Array.isArray(data), 'provider-breakdown data should be array');
		});

		await assertEndpoint('/api/export', data => {
			assert.ok(Array.isArray(data.requests), 'export.requests should be array');
			assert.ok(Array.isArray(data.tool_calls), 'export.tool_calls should be array');
			assert.ok(Array.isArray(data.agent_steps), 'export.agent_steps should be array');
		});

		console.log('watchdog_api_route_suite: PASS');
	} finally {
		await stopServer(server);
	}
}

run().catch(err => {
	console.error('watchdog_api_route_suite: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
