const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const {DatabaseSync} = require('node:sqlite');
const {resolveKujoBinOrThrow} = require('./_kujo_bin');
const ROOT = path.resolve(__dirname, '..');
const KUJO_BIN = resolveKujoBinOrThrow(__filename);
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function request(port, method, pathname, payload) { return new Promise((resolve, reject) => { const body = payload == null ? '' : JSON.stringify(payload); const req = http.request({host: '127.0.0.1', port, method, path: pathname, headers: body ? {'content-type': 'application/json', 'content-length': Buffer.byteLength(body)} : {}}, res => { let text = ''; res.on('data', c => { text += c; }); res.on('end', () => resolve({status: res.statusCode || 0, body: text})); }); req.on('error', reject); if (body) req.write(body); req.end(); }); }
async function start(port, dbPath) { const child = spawn(KUJO_BIN, ['run', '--interpreter', 'dashboard_server.kujo'], {cwd: ROOT, env: {...process.env, WDG_PORT: String(port), WDG_DB_PATH: dbPath, WDG_API_AUTH_MODE: 'off', WDG_RATE_LIMIT_MODE: 'off', WDG_BACKUP_ENABLED: 'false'}, stdio: ['ignore', 'pipe', 'pipe']}); let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; }); for (let i = 0; i < 100; i++) { try { const ready = await request(port, 'GET', '/readyz'); if (ready.status === 200) return {child, output: () => output}; } catch (_) {} if (child.exitCode != null) break; await delay(100); } throw new Error('server failed\n' + output); }
async function stop(child) { child.kill('SIGTERM'); await delay(200); if (child.exitCode == null) child.kill('SIGKILL'); }
async function run() { const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-migration-')); const dbPath = path.join(temp, 'watchdog.db'); const port = 18864; let server; try {
  server = await start(port, dbPath); await stop(server.child);
  let db = new DatabaseSync(dbPath); db.exec("INSERT INTO requests (session_id, provider, model, request_id, status, created_at) VALUES ('legacy-session','legacy','legacy-model','legacy-request','success','1700000000000')"); db.exec('DROP TABLE telemetry_export_dead_letters; DROP TABLE telemetry_export_profile_state; DROP TABLE telemetry_export_deliveries; DROP TABLE telemetry_references_v2; DROP TABLE telemetry_records_v2; DROP TABLE telemetry_batches_v2;'); db.exec("DELETE FROM schema_migrations WHERE key IN ('0015_canonical_telemetry_v2','0016_bounded_export_delivery_journal')"); db.close();
  server = await start(port, dbPath); const migrations = new DatabaseSync(dbPath); const migrationKeys = migrations.prepare("SELECT key FROM schema_migrations WHERE key IN ('0015_canonical_telemetry_v2','0016_bounded_export_delivery_journal') ORDER BY key").all().map(row => row.key); migrations.close(); assert.deepStrictEqual(migrationKeys, ['0015_canonical_telemetry_v2', '0016_bounded_export_delivery_journal']);
  const batch = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/telemetry-v2/canonical-minimal.json'), 'utf8')); batch.batch_id = 'migration-restart'; const intake = await request(port, 'POST', '/telemetry/v2/batches', batch); assert.strictEqual(intake.status, 200, intake.body); await stop(server.child);
  server = await start(port, dbPath); const records = await request(port, 'GET', '/api/telemetry/v2/records?limit=10'); assert.strictEqual(records.status, 200); assert(JSON.parse(records.body).data.records.some(item => item.record.record_id === 'trace:fixture:1')); const legacy = await request(port, 'GET', '/api/requests?session_id=legacy-session'); assert.strictEqual(legacy.status, 200); assert(JSON.parse(legacy.body).data.some(item => item.request_id === 'legacy-request'));
  const check = new DatabaseSync(dbPath); assert.strictEqual(check.prepare('PRAGMA quick_check').get().quick_check, 'ok'); check.close(); console.log('telemetry_migration_restart_suite: PASS');
 } finally { if (server && server.child.exitCode == null) await stop(server.child); fs.rmSync(temp, {recursive: true, force: true}); } }
run().catch(error => { console.error('telemetry_migration_restart_suite: FAIL'); console.error(error.stack || error); process.exit(1); });
