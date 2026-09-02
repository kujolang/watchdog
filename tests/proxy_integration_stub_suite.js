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

function parseJsonSafe(text, label) {
	try {
		return JSON.parse(text);
	} catch (err) {
		throw new Error(label + ' invalid JSON: ' + err.message + '\nBody: ' + String(text).slice(0, 300));
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
					text += chunk;
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

function startUpstreamStub(port) {
	const received = [];
	const sockets = new Set();

	const server = http.createServer((req, res) => {
		let body = '';
		req.on('data', chunk => {
			body += chunk.toString();
		});
		req.on('end', () => {
			received.push({
				method: req.method || '',
				path: req.url || '',
				authorization: req.headers.authorization || '',
				contentType: req.headers['content-type'] || '',
				body,
			});

			const pathname = String(req.url || '').split('?')[0];
			if (pathname === '/v1/chat/completions') {
				let payload = {};
				try {
					payload = body ? JSON.parse(body) : {};
				} catch (err) {
					payload = {};
				}

				if (payload.stream === true) {
					res.writeHead(200, { 'Content-Type': 'text/event-stream' });
					res.write('data: {"id":"sse-1","model":"stub-stream-model","choices":[{"delta":{"content":"hello data:"},"finish_reason":null}],"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3}}\n\n');
					res.write('data: {"id":"sse-1","model":"stub-stream-model","choices":[{"delta":{"content":" world"},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":2,"total_tokens":4}}\n\n');
					res.end('data: [DONE]\n\n');
					return;
				}

				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(
					JSON.stringify({
						id: 'resp-ok-1',
						model: 'stub-json-model',
						choices: [{ message: { content: 'stub response' }, finish_reason: 'stop' }],
						usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
					})
				);
				return;
			}

			if (pathname === '/v1/error') {
				res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '7', 'X-Request-Id': 'stub-rate-limit-1' });
				res.end(JSON.stringify({ error: { message: 'rate limited by stub' } }));
				return;
			}

			if (pathname === '/v1/malformed') {
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end('{"broken_json":');
				return;
			}

			if (pathname === '/v1/slow') {
				setTimeout(() => {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ ok: true }));
				}, 2000);
				return;
			}

			if (pathname === '/v1/models') {
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ data: [{ id: 'stub-model' }] }));
				return;
			}

			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'not found' }));
		});
	});

	server.on('connection', socket => {
		sockets.add(socket);
		socket.on('close', () => {
			sockets.delete(socket);
		});
	});

	return new Promise((resolve, reject) => {
		server.on('error', reject);
		server.listen(port, '127.0.0.1', () => {
			resolve({ server, received, sockets });
		});
	});
}

async function stopNodeServer(server, sockets = new Set()) {
	if (!server) return;
	for (const socket of sockets) {
		socket.destroy();
	}
	await new Promise(resolve => {
		const timer = setTimeout(resolve, 1000);
		server.close(() => {
			clearTimeout(timer);
			resolve();
		});
	});
}

async function startWatchdog(port, dbPath, configPath, extraEnv = {}) {
	const child = spawn(KUJO_BIN, ['run', '--interpreter', 'dashboard_server.kujo'], {
		cwd: ROOT,
		env: {
			...process.env,
			WDG_PORT: String(port),
			WDG_DB_PATH: dbPath,
			WDG_PROXY_CONFIG_PATH: configPath,
			WDG_API_AUTH_MODE: 'off',
			...extraEnv,
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
			if (probe.status === 200) {
				return { child, outputRef: () => output };
			}
		} catch (err) {
			if (child.exitCode != null) {
				break;
			}
		}
		await delay(100);
	}

	child.kill('SIGTERM');
	throw new Error('Watchdog did not become ready.\n' + output);
}

async function stopWatchdog(child) {
	if (!child || child.killed) return;
	child.kill('SIGTERM');
	await delay(250);
	if (child.exitCode == null) {
		child.kill('SIGKILL');
	}
}

async function getApiData(port, pathWithQuery) {
	const resp = await httpRequest(port, 'GET', pathWithQuery);
	assert.strictEqual(resp.status, 200, pathWithQuery + ' expected HTTP 200');
	const parsed = parseJsonSafe(resp.body, pathWithQuery);
	assert.strictEqual(parsed.ok, true, pathWithQuery + ' expected ok=true');
	return parsed.data;
}

function writeProxyConfig(filePath, config) {
	fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
}

function countByValue(rows, key, value) {
	return rows.filter(row => String(row[key]) === String(value)).length;
}

async function runPassthroughScenario(stubPort, received) {
	console.log('proxy_integration_stub_suite: passthrough start');
	const watchdogPort = 17921;
	const dbPath = path.join(TMP_DIR, 'proxy-passthrough-check.db');
	const cfgPath = path.join(TMP_DIR, 'proxy-passthrough-config.json');
	fs.rmSync(dbPath, { force: true });

	writeProxyConfig(cfgPath, {
		upstream_base_url: 'http://127.0.0.1:' + stubPort + '/v1',
		auth_mode: 'passthrough',
		upstream_api_key: '',
		upstream_api_key_env: '',
		upstream_profiles: {
			'openrouter-work': {
				upstream_base_url: 'http://127.0.0.1:' + stubPort + '/v1',
				auth_mode: 'override',
				upstream_api_key: 'named-profile-key',
				upstream_api_key_env: '',
			},
		},
	});

	const wd = await startWatchdog(watchdogPort, dbPath, cfgPath, {
		WDG_PROXY_TIMEOUT_SECS: '1',
	});

	try {
		const jsonResp = await httpRequest(
			watchdogPort,
			'POST',
			'/proxy/v1/chat/completions',
			{
				'Content-Type': 'application/json',
				Authorization: 'Bearer passthrough-token',
				'X-Observe-Session-Id': 'sess_proxy_stub_pass',
				'X-Observe-User-Id': 'user_proxy_stub',
				'X-Observe-Correlation-Id': 'trace-pi-proxy',
				'X-Observe-Trace-Id': 'trace-pi-proxy',
				'X-Observe-Parent-Span-Id': 'turn-1',
			},
			JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: 'json path' }] })
		);
		assert.strictEqual(jsonResp.status, 200, 'passthrough JSON proxy call should succeed');
		console.log('proxy_integration_stub_suite: json passthrough ok');

		const namedProfileResp = await httpRequest(
			watchdogPort,
			'POST',
			'/proxy/v1/chat/completions',
			{
				'Content-Type': 'application/json',
				Authorization: 'Bearer should-be-replaced',
				'X-Watchdog-Upstream-Profile': 'openrouter-work',
				'X-Observe-Session-Id': 'sess_proxy_named_profile',
			},
			JSON.stringify({ model: 'named-profile-model', messages: [{ role: 'user', content: 'named profile path' }] })
		);
		assert.strictEqual(namedProfileResp.status, 200, 'named upstream profile proxy call should succeed: ' + namedProfileResp.body);
		assert.strictEqual(received[received.length - 1].authorization, 'Bearer named-profile-key', 'named profile should override Authorization');
		console.log('proxy_integration_stub_suite: named profile ok');

		const receivedBeforeUnknownProfile = received.length;
		const unknownProfileResp = await httpRequest(
			watchdogPort,
			'POST',
			'/proxy/v1/chat/completions',
			{ 'Content-Type': 'application/json', 'X-Watchdog-Upstream-Profile': 'missing-profile' },
			JSON.stringify({ model: 'gpt-4.1-mini', messages: [] })
		);
		assert.strictEqual(unknownProfileResp.status, 400, 'unknown upstream profiles should be rejected cleanly');
		assert.strictEqual(received.length, receivedBeforeUnknownProfile, 'unknown profiles must not reach any upstream');

		const queryResp = await httpRequest(
			watchdogPort,
			'GET',
			'/proxy/v1/models?limit=1&after=model_123',
			{
				Authorization: 'Bearer passthrough-token',
				'X-Observe-Session-Id': 'sess_proxy_stub_pass',
			}
		);
		assert.strictEqual(queryResp.status, 200, 'passthrough GET proxy call with query params should succeed');
		console.log('proxy_integration_stub_suite: query passthrough ok');

		const sseResp = await httpRequest(
			watchdogPort,
			'POST',
			'/proxy/v1/chat/completions',
			{
				'Content-Type': 'application/json',
				Authorization: 'Bearer passthrough-token',
				'X-Observe-Session-Id': 'sess_proxy_stub_pass',
			},
			JSON.stringify({ model: 'gpt-4.1-mini', stream: true, messages: [{ role: 'user', content: 'stream path' }] })
		);
		assert.strictEqual(sseResp.status, 200, 'passthrough SSE proxy call should succeed');
		assert.ok(sseResp.body.includes('data:'), 'SSE proxy body should contain event frames');
		console.log('proxy_integration_stub_suite: sse passthrough ok');

		const errResp = await httpRequest(
			watchdogPort,
			'POST',
			'/proxy/v1/error',
			{
				'Content-Type': 'application/json',
				Authorization: 'Bearer passthrough-token',
				'X-Observe-Session-Id': 'sess_proxy_stub_pass',
			},
			JSON.stringify({ sample: true })
		);
		assert.strictEqual(errResp.status, 429, 'upstream error status should pass through');
		assert.strictEqual(String(errResp.headers['retry-after'] || ''), '7', 'proxy should preserve upstream Retry-After guidance');
		assert.strictEqual(String(errResp.headers['x-request-id'] || ''), 'stub-rate-limit-1', 'proxy should preserve upstream request identifiers');
		console.log('proxy_integration_stub_suite: upstream error ok');

		const malformedResp = await httpRequest(
			watchdogPort,
			'POST',
			'/proxy/v1/malformed',
			{
				'Content-Type': 'application/json',
				Authorization: 'Bearer passthrough-token',
				'X-Observe-Session-Id': 'sess_proxy_stub_pass',
			},
			'{"opaque-provider-extension":'
		);
		assert.strictEqual(malformedResp.status, 200, 'opaque endpoints must forward bodies without deep parsing');
		assert.strictEqual(received[received.length - 1].body, '{"opaque-provider-extension":', 'opaque request bytes should reach upstream unchanged');
		console.log('proxy_integration_stub_suite: malformed upstream ok');

		const timeoutResp = await httpRequest(
			watchdogPort,
			'POST',
			'/proxy/v1/slow',
			{
				'Content-Type': 'application/json',
				Authorization: 'Bearer passthrough-token',
				'X-Observe-Session-Id': 'sess_proxy_stub_pass',
			},
			JSON.stringify({ sample: true })
		);
		assert.strictEqual(timeoutResp.status, 502, 'slow upstream should hit timeout and return 502');
		console.log('proxy_integration_stub_suite: timeout upstream ok');

		const dottedIdResp = await httpRequest(
			watchdogPort,
			'GET',
			'/proxy/v1/files/file..safe/content',
			{
				Authorization: 'Bearer passthrough-token',
				'X-Observe-Session-Id': 'sess_proxy_stub_pass',
			}
		);
		assert.strictEqual(dottedIdResp.status, 404, 'safe dotted paths should preserve the upstream response instead of being rejected locally');
		assert.ok(received.some(entry => entry.path === '/v1/files/file..safe/content'), 'safe dotted resource ids should reach upstream unchanged');

		const receivedBeforeUnsafe = received.length;
		const unsafeResp = await httpRequest(
			watchdogPort,
			'GET',
			'/proxy/v1/chat/%2e%2e',
			{
				Authorization: 'Bearer passthrough-token',
				'X-Observe-Session-Id': 'sess_proxy_stub_pass',
			}
		);
		assert.strictEqual(unsafeResp.status, 400, 'unsafe encoded proxy paths should be rejected');
		assert.strictEqual(received.length, receivedBeforeUnsafe, 'unsafe paths should not reach upstream');
		console.log('proxy_integration_stub_suite: unsafe path ok');

		const requests = await getApiData(watchdogPort, '/api/requests?session_id=sess_proxy_stub_pass&page_size=50');
		assert.ok(Array.isArray(requests) && requests.length >= 6, 'requests log should capture proxy side effects');
		assert.ok(countByValue(requests, 'status', 'success') >= 2, 'requests log should include success rows');
		assert.ok(countByValue(requests, 'status', 'error') >= 2, 'requests log should include error rows');
		assert.ok(
			requests.some(row => String(row.request_id) === 'sse-1' && Number(row.total_tokens) === 4),
			'requests log should preserve streamed request identity and usage'
		);
		assert.ok(requests.every(row => String(row.prompt_summary || '') === ''), 'metadata-only mode should not persist prompt summaries');
		assert.ok(requests.every(row => String(row.response_summary || '') === ''), 'metadata-only mode should not persist response summaries');
		assert.ok(
			requests.some(row => String(row.error_code) === 'unsafe_proxy_path'),
			'requests log should capture unsafe proxy path rejections'
		);

		const namedRequests = await getApiData(watchdogPort, '/api/requests?session_id=sess_proxy_named_profile&page_size=50');
		assert.ok(namedRequests.some(row => String(row.provider) === 'openrouter-work'), 'request log should preserve the selected upstream profile name');

		const toolCalls = await getApiData(watchdogPort, '/api/tool-calls?session_id=sess_proxy_stub_pass&page_size=50');
		assert.ok(Array.isArray(toolCalls) && toolCalls.length >= 6, 'tool call log should capture forwarding events');

		const steps = await getApiData(watchdogPort, '/api/agent-steps?session_id=sess_proxy_stub_pass&page_size=200');
		assert.ok(Array.isArray(steps) && steps.length >= 13, 'agent step log should include lifecycle steps');
		assert.ok(steps.some(step => String(step.step_type) === 'proxy_received'));
		assert.ok(steps.some(step => String(step.step_type) === 'proxy_forwarded'));
		assert.ok(steps.some(step => String(step.step_type) === 'proxy_completed'));
		assert.ok(steps.some(step => String(step.step_type) === 'proxy_failed'));
		const correlatedTraces = await getApiData(watchdogPort, '/api/traces?session_id=sess_proxy_stub_pass&page_size=50');
		assert.ok(correlatedTraces.some(trace => String(trace.trace_id) === 'trace-pi-proxy'), 'proxy request should create or update the producer trace');
		const correlatedSpans = await getApiData(watchdogPort, '/api/trace-spans?trace_id=trace-pi-proxy&page_size=50');
		assert.ok(correlatedSpans.some(span => String(span.span_kind) === 'model' && String(span.parent_span_id) === 'turn-1'), 'proxy model span should attach to the producer turn span');
		console.log('proxy_integration_stub_suite: passthrough done');
	} finally {
		await stopWatchdog(wd.child);
	}
}

async function runOverrideScenario(stubPort, received) {
	console.log('proxy_integration_stub_suite: override start');
	const watchdogPort = 17922;
	const dbPath = path.join(TMP_DIR, 'proxy-override-check.db');
	const cfgPath = path.join(TMP_DIR, 'proxy-override-config.json');
	fs.rmSync(dbPath, { force: true });

	writeProxyConfig(cfgPath, {
		upstream_base_url: 'http://127.0.0.1:' + stubPort + '/v1',
		auth_mode: 'override',
		upstream_api_key: 'override-inline-key',
		upstream_api_key_env: '',
	});

	received.length = 0;
	const wd = await startWatchdog(watchdogPort, dbPath, cfgPath, {
		WDG_PROXY_TIMEOUT_SECS: '2',
		WDG_CONTENT_CAPTURE_MODE: 'summaries',
	});

	try {
		const resp = await httpRequest(
			watchdogPort,
			'POST',
			'/proxy/v1/chat/completions',
			{
				'Content-Type': 'application/json',
				Authorization: 'Bearer should-not-pass-through',
				'X-Observe-Session-Id': 'sess_proxy_stub_override',
			},
			JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: 'override path' }] })
		);
		assert.strictEqual(resp.status, 200, 'override auth request should succeed');

		const latest = received[received.length - 1] || {};
		assert.strictEqual(latest.path, '/v1/chat/completions', 'override request should hit chat endpoint');
		assert.strictEqual(latest.authorization, 'Bearer override-inline-key', 'override auth should replace incoming token');
		const contentRows = await getApiData(watchdogPort, '/api/requests?session_id=sess_proxy_stub_override&page_size=20');
		assert.ok(contentRows.some(row => String(row.prompt_summary) === 'override path' && String(row.response_summary) === 'stub response'), 'summaries mode should persist bounded content only after explicit opt-in');
		console.log('proxy_integration_stub_suite: override done');
	} finally {
		await stopWatchdog(wd.child);
	}
}

async function run() {

	ensureTmpDir();
	const stubPort = 18811;
	const { server, received, sockets } = await startUpstreamStub(stubPort);

	try {
		await runPassthroughScenario(stubPort, received);
		assert.ok(received.length >= 6, 'stub should receive passthrough scenario requests');
		assert.ok(received.some(entry => entry.authorization === 'Bearer passthrough-token'), 'passthrough mode should forward incoming Authorization header');
		assert.ok(
			received.some(entry => {
				const entryPath = String(entry.path || '');
				return entryPath.startsWith('/v1/models?') && entryPath.includes('limit=1') && entryPath.includes('after=model_123');
			}),
			'proxy should forward safe scalar query parameters upstream'
		);
		assert.ok(received.some(entry => entry.path === '/v1/malformed'), 'malformed upstream path should be exercised');
		assert.ok(received.some(entry => entry.path === '/v1/slow'), 'timeout upstream path should be exercised');

		await runOverrideScenario(stubPort, received);

		console.log('proxy_integration_stub_suite: PASS');
	} finally {
		await stopNodeServer(server, sockets);
	}
}

run().catch(err => {
	console.error('proxy_integration_stub_suite: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
