const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

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
			env: { ...process.env, WDG_DB_PATH: DB_PATH, WDG_API_AUTH_MODE: 'off', ...extraEnv },
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
					body += chunk.toString();
				});
				res.on('end', () => {
					resolve({
						status: res.statusCode || 0,
						body,
						headers: res.headers || {},
					});
				});
			}
		);
		req.on('error', reject);
		req.end();
	});
}

function parseJson(text, label) {
	try {
		return JSON.parse(text);
	} catch (err) {
		throw new Error(label + ' invalid JSON: ' + err.message + '\n' + text.slice(0, 300));
	}
}

async function startServer() {
	const child = spawn(KUJO_BIN, ['run', 'dashboard_server.kujo', '--interpreter'], {
		cwd: ROOT,
		env: { ...process.env, WDG_DB_PATH: DB_PATH, WDG_API_AUTH_MODE: 'off' },
		stdio: ['ignore', 'pipe', 'pipe'],
	});

	let output = '';
	child.stdout.on('data', chunk => {
		output += chunk.toString();
	});
	child.stderr.on('data', chunk => {
		output += chunk.toString();
	});

	for (let i = 0; i < 80; i += 1) {
		try {
			const probe = await httpGet('/api/stats');
			if (probe.status === 200) {
				return child;
			}
		} catch (err) {
			if (child.exitCode != null) {
				throw new Error('Server exited before ready.\n' + output);
			}
		}
		await delay(100);
	}

	child.kill('SIGTERM');
	throw new Error('Server did not become ready in time.\n' + output);
}

async function stopServer(child) {
	if (!child || child.killed) return;
	child.kill('SIGTERM');
	await delay(250);
	if (child.exitCode == null) {
		child.kill('SIGKILL');
	}
}

function parseJsonlLines(body) {
	const lines = body
		.split('\n')
		.map(line => line.trim())
		.filter(Boolean);
	return lines.map((line, idx) => {
		try {
			return JSON.parse(line);
		} catch (err) {
			throw new Error('JSONL line ' + (idx + 1) + ' invalid: ' + err.message + '\n' + line);
		}
	});
}

async function run() {

	let server = null;
	try {
		await runCommand(['run', 'demo.kujo', '--interpreter']);
		server = await startServer();

		const jsonMode = await httpGet('/api/export');
		assert.strictEqual(jsonMode.status, 200, 'default export should return 200');
		const jsonExport = parseJson(jsonMode.body, '/api/export');
		assert.strictEqual(jsonExport.ok, true);
		assert.ok(Array.isArray(jsonExport.data.requests), 'default export should keep requests array');
		assert.ok(Number(jsonExport.data.filters.max_rows) >= 1, 'default export should report max_rows filter');
		assert.ok(Object.prototype.hasOwnProperty.call(jsonExport.data, 'chunk'), 'default export should include chunk metadata');

		const chunkOne = await httpGet('/api/export?format=json&chunk_size=1&cursor=0');
		assert.strictEqual(chunkOne.status, 200, 'chunked json export should return 200');
		const chunkOneJson = parseJson(chunkOne.body, '/api/export?format=json&chunk_size=1&cursor=0');
		assert.strictEqual(chunkOneJson.ok, true);
		assert.strictEqual(Number(chunkOneJson.data.chunk.cursor), 0, 'chunk cursor should reflect request cursor');
		assert.strictEqual(Number(chunkOneJson.data.chunk.chunk_size), 1, 'chunk size should reflect request chunk_size');
		if (chunkOneJson.data.chunk.has_more) {
			assert.strictEqual(Number(chunkOneJson.data.chunk.next_cursor), 1, 'next cursor should advance by chunk size');

			const chunkTwo = await httpGet('/api/export?format=json&chunk_size=1&cursor=' + encodeURIComponent(String(chunkOneJson.data.chunk.next_cursor)));
			assert.strictEqual(chunkTwo.status, 200, 'second chunked json export should return 200');
			const chunkTwoJson = parseJson(chunkTwo.body, 'chunk two export');
			assert.strictEqual(Number(chunkTwoJson.data.chunk.cursor), 1, 'second chunk should reflect advanced cursor');

			const firstChunkRequestId = String((chunkOneJson.data.requests[0] && chunkOneJson.data.requests[0].id) || '');
			const secondChunkRequestId = String((chunkTwoJson.data.requests[0] && chunkTwoJson.data.requests[0].id) || '');
			if (firstChunkRequestId !== '' && secondChunkRequestId !== '') {
				assert.notStrictEqual(secondChunkRequestId, firstChunkRequestId, 'cursor progression should move export window forward');
			}
		}

		const invalidFormat = await httpGet('/api/export?format=xml');
		assert.strictEqual(invalidFormat.status, 400, 'unsupported export format should return 400');
		const invalidParsed = parseJson(invalidFormat.body, '/api/export?format=xml');
		assert.strictEqual(invalidParsed.ok, false, 'unsupported export format should return ok=false');

		const jsonlMode = await httpGet('/api/export?format=jsonl');
		assert.strictEqual(jsonlMode.status, 200, 'jsonl export should return 200');
		assert.ok(String(jsonlMode.headers['content-type'] || '').includes('application/x-ndjson'));
		const records = parseJsonlLines(jsonlMode.body);
		assert.ok(records.length > 0, 'jsonl export should include records');
		records.forEach(record => {
			assert.ok(['request', 'tool_call', 'agent_step'].includes(record.kind), 'jsonl kind should be recognized');
			assert.ok(record.data && typeof record.data === 'object', 'jsonl record should include object payload');
		});

		const sessionId = (jsonExport.data.requests[0] && jsonExport.data.requests[0].session_id) || '';
		assert.ok(sessionId !== '', 'seeded export should include session id for filtering checks');
		const filteredJsonl = await httpGet('/api/export?format=jsonl&session_id=' + encodeURIComponent(sessionId));
		assert.strictEqual(filteredJsonl.status, 200);
		const filteredRecords = parseJsonlLines(filteredJsonl.body);
		assert.ok(filteredRecords.length > 0, 'filtered jsonl export should include records');
		filteredRecords.forEach(record => {
			const data = record.data || {};
			if (Object.prototype.hasOwnProperty.call(data, 'session_id')) {
				assert.strictEqual(String(data.session_id), sessionId, 'filtered jsonl should only include selected session rows');
			}
		});

		const limitedJsonl = await httpGet('/api/export?format=jsonl&max_rows=1');
		assert.strictEqual(limitedJsonl.status, 200, 'jsonl max_rows export should return 200');
		const limitedRecords = parseJsonlLines(limitedJsonl.body);
		assert.ok(limitedRecords.length <= 3, 'max_rows=1 should bound records across request/tool/step kinds');

		const chunkedJsonl = await httpGet('/api/export?format=jsonl&chunk_size=1&cursor=0');
		assert.strictEqual(chunkedJsonl.status, 200, 'chunked jsonl export should return 200');
		assert.strictEqual(String(chunkedJsonl.headers['x-watchdog-cursor'] || ''), '0', 'jsonl cursor header should reflect cursor');
		assert.strictEqual(String(chunkedJsonl.headers['x-watchdog-chunk-size'] || ''), '1', 'jsonl chunk-size header should reflect chunk_size');
		const chunkedJsonlRecords = parseJsonlLines(chunkedJsonl.body);
		assert.ok(chunkedJsonlRecords.length <= 3, 'chunked jsonl should respect chunk sizing per kind');

		console.log('export_jsonl_mode_check: PASS');
	} finally {
		await stopServer(server);
	}
}

run().catch(err => {
	console.error('export_jsonl_mode_check: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
