const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-api-route-'));
const DB_PATH = path.join(TEMP_ROOT, 'watchdog.db');
const PORT = 17700;
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
				port: PORT,
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

function httpPost(pathname, payload) {
	return new Promise((resolve, reject) => {
		const body = JSON.stringify(payload);
		const req = http.request({ host: '127.0.0.1', port: PORT, path: pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
			let responseBody = '';
			res.on('data', chunk => { responseBody += chunk; });
			res.on('end', () => resolve({ status: res.statusCode || 0, body: responseBody, headers: res.headers || {} }));
		});
		req.on('error', reject);
		req.end(body);
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
	const child = spawn(KUJO_BIN, ['run', '--interpreter', 'dashboard_server.kujo'], {
		cwd: ROOT,
		env: { ...process.env, WDG_DB_PATH: DB_PATH, WDG_PORT: String(PORT), WDG_API_AUTH_MODE: 'off', WDG_PROXY_AUTHZ_MODE: 'off' },
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
				child.getCapturedOutput = () => output;
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
	if (!child || child.exitCode != null) return;
	child.kill('SIGTERM');
	for (let i = 0; i < 10 && child.exitCode == null; i += 1) {
		await delay(50);
	}
	if (child.exitCode == null) {
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
		await runCommand(['run', '--interpreter', 'demo.kujo']);
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
			assert.ok(Object.prototype.hasOwnProperty.call(data, 'total_traces'));
			assert.ok(Object.prototype.hasOwnProperty.call(data, 'total_trace_spans'));
		});

		const traceId = 'trace-contract-001';
		const intake = await httpPost('/api/telemetry/requests', {
			source_app: 'contract-client', request_id: 'request-contract-001', session_id: 'session-contract', provider: 'openrouter-work', model: 'anthropic/claude-sonnet-5', status: 'success', input_tokens: 100, output_tokens: 50, total_tokens: 150,
			trace: { trace_id: traceId, model: 'anthropic/claude-sonnet-5', name: 'independent_tool_workflow', status: 'success', started_at_ms: 1000, ended_at_ms: 1400, duration_ms: 400, cached_input_tokens: 10, cache_write_input_tokens: 5, attributes: { transport: 'direct', content_mode: 'off' } },
			spans: [
				{ span_id: 'span-model', parent_span_id: '', span_kind: 'model', name: 'provider_round', status: 'success', started_at_ms: 1000, ended_at_ms: 1200, duration_ms: 200, attributes: { time_to_first_token_ms: 25 } },
				{ span_id: 'span-tool', parent_span_id: 'span-model', span_kind: 'tool', name: 'tool.web_search', status: 'success', started_at_ms: 1200, ended_at_ms: 1350, duration_ms: 150, attributes: { backend: 'searxng' } }
			],
			events: [{ event_id: 'event-tool-start', span_id: 'span-tool', sequence: 1, event_name: 'tool_started', occurred_at_ms: 1200, attributes: { tool_name: 'web_search' } }],
			tool_calls: [{ tool_name: 'web_search', arguments: { query_chars: 12 }, result: { result_count: 3 }, status: 'success', latency_ms: 150 }]
		});
		if (intake.status !== 200) {
			console.error(server.getCapturedOutput().slice(-2000));
		}
		assert.strictEqual(intake.status, 200, 'granular trace intake should succeed: ' + intake.body);

		const append = await httpPost('/api/telemetry/traces', { source_app: 'contract-client', trace_id: traceId, session_id: 'session-contract', events: [{ event_id: 'persistence-contract', sequence: 99, event_name: 'persistence_saved', occurred_at_ms: 1450, attributes: { state: 'committed' } }] });
		assert.strictEqual(append.status, 200, 'independent trace event append should succeed');

		await assertEndpoint('/api/traces', data => {
			const trace = data.find(row => row.trace_id === traceId);
			assert.ok(trace, 'trace should be queryable');
			assert.strictEqual(trace.input_tokens, 100);
			assert.ok(trace.input_cost_usd > 0);
			assert.ok(trace.cached_input_cost_usd > 0);
			assert.ok(trace.cache_write_input_cost_usd > 0);
			assert.strictEqual(trace.pricing_kind, 'catalog');
			assert.match(String(trace.pricing_source || ''), /^openrouter-public-catalog:2026-07-19/);
			assert.strictEqual(trace.priced_model, 'anthropic/claude-sonnet-5');
		});
		await assertEndpoint(`/api/trace-spans?trace_id=${traceId}`, data => assert.strictEqual(data.length, 2));
		await assertEndpoint(`/api/trace-events?trace_id=${traceId}`, data => {
			assert.strictEqual(data.length, 2);
			assert.ok(data.some(row => row.event_name === 'persistence_saved'));
		});

		await assertEndpoint('/api/requests', data => {
			assert.ok(Array.isArray(data), 'requests data should be array');
			assert.ok(data.length >= 1, 'requests should have records after seed');
			const request = data.find(row => row.request_id === 'request-contract-001');
			assert.ok(request, 'contract request should be listed');
			assert.strictEqual(request.pricing_kind, 'catalog');
			assert.match(String(request.pricing_source || ''), /^openrouter-public-catalog:2026-07-19/);
			assert.ok(Number(request.cached_input_rate_per_million || 0) > 0);
			assert.ok(Number(request.cache_write_input_rate_per_million || 0) > 0);
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
			assert.ok(Array.isArray(data.traces), 'export.traces should be array');
			assert.ok(Array.isArray(data.trace_spans), 'export.trace_spans should be array');
			assert.ok(Array.isArray(data.trace_events), 'export.trace_events should be array');
		});

		console.log('watchdog_api_route_suite: PASS');
	} finally {
		await stopServer(server);
		fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
	}
}

run().catch(err => {
	console.error('watchdog_api_route_suite: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
