const assert = require('node:assert');
const {performance} = require('node:perf_hooks');
const {DatabaseSync} = require('node:sqlite');

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE telemetry_records_v2 (
    id INTEGER PRIMARY KEY, producer_name TEXT NOT NULL, record_id TEXT NOT NULL,
    logical_request_id TEXT, attempt_number INTEGER, terminal_outcome TEXT,
    started_at TEXT, observed_at TEXT NOT NULL, canonical_json TEXT NOT NULL
  );
  CREATE INDEX idx_telemetry_v2_summary
    ON telemetry_records_v2(logical_request_id, attempt_number, observed_at);
`);
const insert = db.prepare('INSERT INTO telemetry_records_v2 VALUES (?,?,?,?,?,?,?,?,?)');
db.exec('BEGIN');
for (let i = 1; i <= 100_000; i += 1) {
  const logical = `request-${String(i % 10_000).padStart(5, '0')}`;
  const attempt = (i % 3) + 1;
  const timestamp = `2026-09-${String((i % 28) + 1).padStart(2, '0')}T12:00:00Z`;
  insert.run(i, 'benchmark', `record-${i}`, logical, attempt, i % 17 === 0 ? 'success' : null, timestamp, timestamp, '{"record_type":"span"}');
}
db.exec('COMMIT');

const sql = `SELECT id, producer_name, record_id, logical_request_id, attempt_number,
 terminal_outcome, started_at, observed_at, canonical_json
 FROM telemetry_records_v2
 WHERE logical_request_id IS NOT NULL AND logical_request_id != ''
 ORDER BY logical_request_id ASC,
 CASE WHEN attempt_number IS NULL THEN 2147483647 ELSE attempt_number END ASC,
 COALESCE(started_at, observed_at) ASC, id ASC LIMIT ?`;
const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(3200);
assert.ok(plan.some(row => String(row.detail).includes('idx_telemetry_v2_summary')), `summary query did not use summary index: ${JSON.stringify(plan)}`);
const query = db.prepare(sql);
const samples = [];
for (let i = 0; i < 60; i += 1) {
  const start = performance.now();
  const rows = query.all(3200);
  samples.push(performance.now() - start);
  assert.strictEqual(rows.length, 3200);
}
samples.sort((a, b) => a - b);
const percentile = p => samples[Math.min(samples.length - 1, Math.ceil(samples.length * p) - 1)];
const result = {rows: 100_000, p50_ms: percentile(0.50), p95_ms: percentile(0.95), p99_ms: percentile(0.99), rss_bytes: process.memoryUsage().rss};
assert.ok(result.p95_ms <= 200, `canonical summary query p95 exceeded 200 ms: ${JSON.stringify(result)}`);
console.log(`canonical_summary_query_benchmark: PASS ${JSON.stringify(result)}`);
db.close();
