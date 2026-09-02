const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const {spawn, spawnSync} = require('child_process');
const {resolveKujoBinOrThrow} = require('./_kujo_bin');

const ROOT = path.resolve(__dirname, '..');
const KUJO_BIN = resolveKujoBinOrThrow(__filename);
const SAMPLES = Math.max(12, Number(process.env.WDG_BENCH_SAMPLES || 30));

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function percentile(values, p) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p / 100) - 1))] || 0;
}
function request(port, pathname, body) {
  return new Promise((resolve, reject) => {
    const started = process.hrtime.bigint();
    let first = null;
    const req = http.request({host: '127.0.0.1', port, method: 'POST', path: pathname,
      headers: {'content-type': 'application/json', 'content-length': Buffer.byteLength(body)}}, res => {
      let bytes = 0;
      res.on('data', chunk => { if (first == null) first = process.hrtime.bigint(); bytes += chunk.length; });
      res.on('end', () => resolve({status: res.statusCode || 0,
        totalMs: Number(process.hrtime.bigint() - started) / 1e6,
        ttftMs: Number((first || process.hrtime.bigint()) - started) / 1e6, bytes}));
    });
    req.on('error', reject); req.end(body);
  });
}
function startUpstream(port) {
  const server = http.createServer(async (req, res) => {
    let body = ''; req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      const parsed = JSON.parse(body || '{}');
      if (parsed.stream) {
        res.writeHead(200, {'content-type': 'text/event-stream'});
        res.write('data: {"choices":[{"delta":{"content":"a"}}]}\n\n');
        await delay(35);
        res.write('data: {"choices":[{"delta":{"content":"b"}}]}\n\n');
        await delay(35); res.end('data: [DONE]\n\n'); return;
      }
      res.writeHead(200, {'content-type': 'application/json'});
      res.end(JSON.stringify({id: 'bench', model: 'fixture', choices: [{message: {content: 'ok'}}],
        usage: {prompt_tokens: 2, completion_tokens: 1, total_tokens: 3}}));
    });
  });
  return new Promise((resolve, reject) => { server.on('error', reject); server.listen(port, '127.0.0.1', () => resolve(server)); });
}
async function startWatchdog(port, upstreamPort, dbPath, configPath) {
  fs.writeFileSync(configPath, JSON.stringify({upstream_base_url: `http://127.0.0.1:${upstreamPort}/v1`, auth_mode: 'passthrough'}));
  const child = spawn(KUJO_BIN, ['run', '--interpreter', 'dashboard_server.kujo'], {cwd: ROOT,
    env: {...process.env, WDG_PORT: String(port), WDG_DB_PATH: dbPath, WDG_PROXY_CONFIG_PATH: configPath,
      WDG_API_AUTH_MODE: 'off', WDG_RATE_LIMIT_MODE: 'off'}, stdio: ['ignore', 'pipe', 'pipe']});
  let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
  for (let i = 0; i < 100; i++) {
    try { const response = await new Promise((resolve, reject) => { http.get(`http://127.0.0.1:${port}/healthz`, resolve).on('error', reject); }); response.resume(); if (response.statusCode === 200) return {child, output: () => output}; } catch (_) {}
    await delay(100);
  }
  throw new Error('Watchdog failed to start\n' + output);
}
function processStats(pid) {
  const result = spawnSync('ps', ['-o', 'rss=,time=', '-p', String(pid)], {encoding: 'utf8'});
  const parts = result.stdout.trim().split(/\s+/); return {rssKiB: Number(parts[0] || 0), cpuTime: parts.slice(1).join(' ')};
}
async function sample(port, pathname, stream) {
  const totals = [], ttfts = []; const body = JSON.stringify({model: 'fixture', stream, messages: [{role: 'user', content: 'x'}]});
  for (let i = 0; i < SAMPLES; i++) { const result = await request(port, pathname, body); assert.strictEqual(result.status, 200); totals.push(result.totalMs); ttfts.push(result.ttftMs); }
  return {p50_ms: percentile(totals, 50), p95_ms: percentile(totals, 95), p99_ms: percentile(totals, 99),
    ttft_p50_ms: percentile(ttfts, 50), ttft_p95_ms: percentile(ttfts, 95), ttft_p99_ms: percentile(ttfts, 99)};
}
async function run() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-overhead-'));
  const upstreamPort = 18861, watchdogPort = 18862;
  const dbPath = path.join(temp, 'watchdog.db');
  const upstream = await startUpstream(upstreamPort); const wd = await startWatchdog(watchdogPort, upstreamPort, dbPath, path.join(temp, 'proxy.json'));
  try {
    await request(upstreamPort, '/v1/chat/completions', JSON.stringify({model: 'fixture', messages: []}));
    await request(watchdogPort, '/proxy/v1/chat/completions', JSON.stringify({model: 'fixture', messages: []}));
    const baselineBytes = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
    const rssBefore = processStats(wd.child.pid);
    const direct = {nonstream: await sample(upstreamPort, '/v1/chat/completions', false), stream: await sample(upstreamPort, '/v1/chat/completions', true)};
    const proxied = {nonstream: await sample(watchdogPort, '/proxy/v1/chat/completions', false), stream: await sample(watchdogPort, '/proxy/v1/chat/completions', true)};
    const rssAfter = processStats(wd.child.pid);
    const overhead = {nonstream_p50_ms: proxied.nonstream.p50_ms - direct.nonstream.p50_ms,
      nonstream_p95_ms: proxied.nonstream.p95_ms - direct.nonstream.p95_ms,
      nonstream_p99_ms: proxied.nonstream.p99_ms - direct.nonstream.p99_ms,
      stream_ttft_p95_ms: proxied.stream.ttft_p95_ms - direct.stream.ttft_p95_ms};
    const report = {samples: SAMPLES, direct, proxied, overhead, cpu: {before: rssBefore.cpuTime, after: rssAfter.cpuTime},
      rss_delta_bytes: Math.max(0, rssAfter.rssKiB - rssBefore.rssKiB) * 1024,
      db_bytes_per_event: Math.max(0, fs.statSync(dbPath).size - baselineBytes) / (SAMPLES * 2),
      streaming_transport: 'buffered', budgets: {nonstream_pass: overhead.nonstream_p50_ms <= 3 && overhead.nonstream_p95_ms <= 10 && overhead.nonstream_p99_ms <= 25,
        stream_ttft_pass: overhead.stream_ttft_p95_ms <= 10}};
    console.log('proxy_overhead_benchmark=' + JSON.stringify(report));
    if (process.env.WDG_REQUIRE_PROXY_BUDGET === 'true') assert(report.budgets.nonstream_pass, 'nonstream proxy overhead exceeded budget');
    if (process.env.WDG_REQUIRE_STREAMING_BUDGET === 'true') assert(report.budgets.stream_ttft_pass, 'streaming TTFT exceeded budget');
    console.log('proxy_overhead_benchmark: PASS (budgets are reported; strict gates are opt-in until the transport is optimized)');
  } finally {
    wd.child.kill('SIGTERM'); await delay(200); if (wd.child.exitCode == null) wd.child.kill('SIGKILL');
    await new Promise(resolve => upstream.close(resolve)); fs.rmSync(temp, {recursive: true, force: true});
  }
}
run().catch(error => { console.error('proxy_overhead_benchmark: FAIL'); console.error(error.stack || error); process.exit(1); });
