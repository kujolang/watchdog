const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const {spawn, spawnSync} = require('child_process');
const {performance} = require('perf_hooks');
const {resolveKujoBinOrThrow} = require('./_kujo_bin');

const ROOT = path.join(__dirname, '..');
const KUJO_BIN = resolveKujoBinOrThrow(__filename);
const TEMP = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'watchdog-sources-bench-'));
const DB = path.join(TEMP, 'watchdog.db');
const PORT = 17741;
const agent = new http.Agent({keepAlive:true, maxSockets:1});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function get() { return new Promise((resolve, reject) => { const req = http.get({host:'127.0.0.1',port:PORT,path:'/api/sources',agent}, res => { let body=''; res.on('data', c => { body += c; }); res.on('end', () => resolve({status:res.statusCode,body})); }); req.on('error', reject); }); }

async function run() {
	let child;
	try {
		child = spawn(KUJO_BIN, ['run','--interpreter','dashboard_server.kujo'], {cwd:ROOT, env:{...process.env,WDG_PORT:String(PORT),WDG_DB_PATH:DB,WDG_SOURCES_CONFIG_PATH:path.join(TEMP,'sources.json'),WDG_PROXY_CONFIG_PATH:path.join(TEMP,'proxy.json'),WDG_BACKUP_ENABLED:'false'}, stdio:'ignore'});
		for (let i=0;i<100;i+=1) { try { if ((await get()).status === 200) break; } catch {} await wait(100); }
		const firstExit = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM'); await firstExit; child = null;
		const sql = `BEGIN; WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<50000) INSERT INTO requests(source_app,provider,status,tenant_id,project_id,created_at) SELECT CASE WHEN x%10=0 THEN 'watchdog-proxy' ELSE 'app-'||(x%50) END, CASE WHEN x%10=0 THEN 'profile-'||(x%4) ELSE 'provider' END, 'success', 'tenant-'||(x%5), 'project-'||(x%10), CAST(1788537600000+x AS TEXT) FROM n; COMMIT;`;
		const seeded = spawnSync('sqlite3', [DB, sql], {encoding:'utf8'}); assert.strictEqual(seeded.status,0,seeded.stderr);
		child = spawn(KUJO_BIN, ['run','--interpreter','dashboard_server.kujo'], {cwd:ROOT, env:{...process.env,WDG_PORT:String(PORT),WDG_DB_PATH:DB,WDG_SOURCES_CONFIG_PATH:path.join(TEMP,'sources.json'),WDG_PROXY_CONFIG_PATH:path.join(TEMP,'proxy.json'),WDG_BACKUP_ENABLED:'false'}, stdio:'ignore'});
		for (let i=0;i<100;i+=1) { try { if ((await get()).status === 200) break; } catch {} await wait(100); }
		for (let i=0;i<10;i+=1) await get();
		const timings=[]; for (let i=0;i<100;i+=1) { const start=performance.now(); const response=await get(); assert.strictEqual(response.status,200); timings.push(performance.now()-start); }
		timings.sort((a,b)=>a-b); const p95=timings[Math.ceil(timings.length*.95)-1];
		assert.ok(p95<=25,`Connected Sources inventory p95 ${p95.toFixed(2)} ms exceeds 25 ms budget`);
		console.log(`connected_sources_query_benchmark: PASS p95=${p95.toFixed(2)}ms fixture=50000-legacy-rows/50-apps`);
	} finally { agent.destroy(); if (child?.exitCode == null) child.kill('SIGTERM'); fs.rmSync(TEMP,{recursive:true,force:true}); }
}
run().catch(error => { console.error('connected_sources_query_benchmark: FAIL'); console.error(error.stack||error); process.exit(1); });
