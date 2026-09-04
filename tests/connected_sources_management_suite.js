const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const {spawn, spawnSync} = require('child_process');
const {resolveKujoBinOrThrow} = require('./_kujo_bin');

const ROOT = path.join(__dirname, '..');
const KUJO_BIN = resolveKujoBinOrThrow(__filename);
const TEMP = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'watchdog-sources-'));
const DB = path.join(TEMP, 'watchdog.db');
const REGISTRY = path.join(TEMP, 'source-config', 'sources.json');
const PROXY = path.join(TEMP, 'proxy-config', 'proxy.json');
const PORT = 17740;
const TOKEN = 'sources-test-auth-token';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function request(method, pathname, payload, token = TOKEN) {
	return new Promise((resolve, reject) => {
		const body = payload == null ? '' : JSON.stringify(payload);
		const headers = body ? {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body)} : {};
		if (token) headers['X-Watchdog-Token'] = token;
		const req = http.request({host: '127.0.0.1', port: PORT, path: pathname, method, headers}, res => {
			let text = '';
			res.on('data', chunk => { text += chunk; });
			res.on('end', () => { let json = null; try { json = text ? JSON.parse(text) : null; } catch {} resolve({status: res.statusCode || 0, text, json}); });
		});
		req.on('error', reject);
		if (body) req.write(body);
		req.end();
	});
}

async function start() {
	const child = spawn(KUJO_BIN, ['run', '--interpreter', 'dashboard_server.kujo'], {cwd: ROOT, env: {...process.env, WDG_PORT: String(PORT), WDG_DB_PATH: DB, WDG_SOURCES_CONFIG_PATH: REGISTRY, WDG_PROXY_CONFIG_PATH: PROXY, WDG_API_AUTH_MODE: 'token', WDG_API_AUTH_TOKEN: TOKEN, WDG_BACKUP_ENABLED: 'false'}, stdio: ['ignore', 'pipe', 'pipe']});
	let output = '';
	child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
	for (let i = 0; i < 100; i += 1) {
		try { if ((await request('GET', '/readyz', null, '')).status === 200) return {child, output: () => output}; } catch {}
		if (child.exitCode != null) throw new Error('server exited before ready\n' + output);
		await wait(100);
	}
	child.kill('SIGTERM'); throw new Error('server readiness timed out\n' + output);
}

async function run() {
	let server;
	try {
		server = await start();
		assert.strictEqual((await request('GET', '/api/sources', null, '')).status, 401, 'inventory must require API authentication');
		assert.strictEqual((await request('GET', '/api/sources', null, 'wrong')).status, 403, 'inventory must reject invalid authentication');
		let inventory = (await request('GET', '/api/sources')).json.data;
		assert.strictEqual(inventory.contract_version, 'watchdog.sources-panel.v1');
		assert.strictEqual(inventory.registry_version, 'watchdog.sources.v1');
		assert.ok(inventory.sources.some(source => source.kind === 'proxy' && source.profile_name === 'default' && source.status === 'pending' && source.read_only));
		assert.ok(!JSON.stringify(inventory).includes('exporter'), 'inbound inventory must not list exporter destinations');

		const canary = 'sources-secret-canary-value';
		const rejected = await request('POST', '/api/sources', {source:{name:'Unsafe', kind:'native_v2', producer_names:['unsafe'], source_apps:[], api_key:canary}});
		assert.strictEqual(rejected.status, 400, 'secret-bearing source fields must be rejected');
		assert.strictEqual((await request('POST', '/api/sources', {source:{name:'Unsafe', description:canary, kind:'native_v2', producer_names:['unsafe'], source_apps:[]}})).status, 400, 'credential-like values must be rejected');
		assert.ok(!fs.existsSync(REGISTRY), 'rejected input must not create a registry');

		const created = await request('POST', '/api/sources', {revision:'0', source:{name:'Fixture producer', description:'metadata only', kind:'native_v2', producer_names:['fixture-producer'], source_apps:[], enabled:true, archived:false, setup_template_id:'native_v2', options:{lane:'test'}}});
		assert.strictEqual(created.status, 200, created.text + '\n' + server.output().slice(-2000));
		assert.strictEqual(fs.statSync(REGISTRY).mode & 0o777, 0o600, 'source registry must be owner-only');
		assert.strictEqual(fs.statSync(path.dirname(REGISTRY)).mode & 0o777, 0o700, 'created registry parent must be private');
		assert.ok(!fs.readFileSync(REGISTRY, 'utf8').includes(canary));
		const registrationId = created.json.data.source.id;
		const revision = created.json.data.revision;
		assert.match(registrationId, /^src_[0-9a-f]{24}$/);

		const conflict = await request('PATCH', '/api/sources/' + registrationId, {revision:'stale', source:{name:'Wrong'}});
		assert.strictEqual(conflict.status, 409, 'stale registry revisions must conflict');
		const archived = await request('PATCH', '/api/sources/' + registrationId, {revision, source:{archived:true}});
		assert.strictEqual(archived.status, 200, archived.text);
		inventory = (await request('GET', '/api/sources')).json.data;
		const configured = inventory.sources.find(source => source.registration_id === registrationId);
		assert.strictEqual(configured.status, 'pending'); assert.strictEqual(configured.archived, true); assert.strictEqual(configured.observed, false);

		const telemetry = await request('POST', '/api/telemetry/requests', {schema_version:'kujo.telemetry.v1', source_app:'legacy-fixture', request_id:'source-observation-1', tenant_id:'tenant-a', project_id:'project-a', status:'success'});
		assert.strictEqual(telemetry.status, 200, telemetry.text);
		inventory = (await request('GET', '/api/sources?tenant_id=tenant-a&project_id=project-a')).json.data;
		const observed = inventory.sources.find(source => source.source_apps.includes('legacy-fixture'));
		assert.ok(observed && observed.observed && observed.status === 'active', 'accepted local telemetry must produce active evidence');
		const isolated = (await request('GET', '/api/sources?tenant_id=tenant-b&project_id=project-b')).json.data;
		assert.ok(!isolated.sources.some(source => source.source_apps.includes('legacy-fixture')), 'tenant/project filters must isolate legacy observations');
		const staleSeed = spawnSync('sqlite3', [DB, "INSERT INTO requests(source_app,provider,status,created_at) VALUES('stale-fixture','provider','success','1000')"], {encoding:'utf8'});
		assert.strictEqual(staleSeed.status, 0, staleSeed.stderr);
		inventory = (await request('GET', '/api/sources')).json.data;
		assert.strictEqual(inventory.sources.find(source => source.source_apps.includes('stale-fixture')).status, 'stale', 'old accepted telemetry must be stale');
		const disableRevision = inventory.revision;
		assert.strictEqual((await request('PATCH', '/api/sources/' + registrationId, {revision:disableRevision, source:{enabled:false}})).status, 200);
		inventory = (await request('GET', '/api/sources')).json.data;
		assert.strictEqual(inventory.sources.find(source => source.registration_id === registrationId).status, 'disabled', 'disabled configuration must not claim connectivity');

		const profile = await request('POST', '/api/sources', {type:'proxy_profile', profile_name:'fixture-profile', profile:{upstream_base_url:'https://api.example.test/v1', auth_mode:'override', upstream_api_key_env:'FIXTURE_PROVIDER_KEY', display_name:'Fixture profile', enabled:true}});
		assert.strictEqual(profile.status, 200, profile.text); assert.strictEqual(profile.json.data.restart_required, true);
		assert.strictEqual(fs.statSync(PROXY).mode & 0o777, 0o600, 'proxy config must be owner-only');
		assert.strictEqual(fs.statSync(path.dirname(PROXY)).mode & 0o777, 0o700, 'created proxy parent must be private');
		const proxyText = fs.readFileSync(PROXY, 'utf8');
		assert.ok(proxyText.includes('FIXTURE_PROVIDER_KEY')); assert.ok(!proxyText.includes(canary));
		assert.strictEqual((await request('POST', '/api/sources', {type:'proxy_profile', profile_name:'bad', profile:{upstream_base_url:'javascript:alert(1)', auth_mode:'passthrough', upstream_api_key_env:'', display_name:'Bad'}})).status, 400);
		assert.strictEqual((await request('POST', '/api/sources/proxy/update', {profile_name:'default', profile:{upstream_base_url:'https://example.test/v1', auth_mode:'passthrough'}})).status, 403, 'default profile must be protected');
		const proxyConfig = JSON.parse(fs.readFileSync(PROXY, 'utf8')); proxyConfig.upstream_profiles['fixture-profile'].operator_extension = 'preserve-me'; fs.writeFileSync(PROXY, JSON.stringify(proxyConfig), {mode:0o600});
		assert.strictEqual((await request('POST', '/api/sources/proxy/update', {profile_name:'fixture-profile', profile:{upstream_base_url:'https://api.example.test/v2', auth_mode:'passthrough', upstream_api_key_env:'', display_name:'Updated fixture', enabled:true}})).status, 200);
		assert.strictEqual(JSON.parse(fs.readFileSync(PROXY, 'utf8')).upstream_profiles['fixture-profile'].operator_extension, 'preserve-me', 'proxy updates must preserve unknown valid fields');

		const verify = await request('POST', '/api/sources/verify', {id:observed.id});
		assert.strictEqual(verify.status, 200, verify.text); assert.strictEqual(verify.json.data.observed, true, verify.text); assert.strictEqual(verify.json.data.network_contacted, false, verify.text);
		const deletionRevision = (await request('GET', '/api/sources')).json.data.revision;
		assert.strictEqual((await request('DELETE', '/api/sources/' + registrationId, {revision:deletionRevision})).status, 400, 'delete must require retention acknowledgement');
		assert.strictEqual((await request('DELETE', '/api/sources/' + registrationId, {revision:deletionRevision, retain_historical_telemetry:true})).status, 200);
		assert.ok((await request('GET', '/api/requests?source_app=legacy-fixture')).json.data.length === 1, 'registration deletion must not delete telemetry');

		const templates = (await request('GET', '/api/sources/setup-templates')).json.data.templates;
		assert.ok(templates.some(template => template.id === 'native_v2_js')); assert.ok(templates.some(template => template.id === 'otlp'));
		assert.ok(!JSON.stringify(templates).includes(canary), 'copied setup snippets must not contain rejected secrets');
		const responseText = JSON.stringify((await request('GET', '/api/sources')).json);
		assert.ok(!responseText.includes(canary), 'secret canary must not reach source API responses');
		assert.ok(!JSON.stringify((await request('GET', '/api/audit-events')).json).includes(canary), 'secret canary must not reach audit events');
		assert.ok(!fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8').includes(canary), 'secret canary must not reach the DOM source');
		const backupPath = path.join(TEMP, 'privacy-canary-backup.db');
		const backupRun = spawnSync('sqlite3', [DB, '.backup ' + backupPath], {encoding:'utf8'});
		assert.strictEqual(backupRun.status, 0, backupRun.stderr);
		assert.ok(!fs.readFileSync(backupPath).includes(Buffer.from(canary)), 'secret canary must not reach database backups');

		const validProxy = fs.readFileSync(PROXY);
		fs.writeFileSync(PROXY, '{malformed', {mode:0o600});
		assert.strictEqual((await request('POST', '/api/sources/proxy/update', {profile_name:'fixture-profile', profile:{upstream_base_url:'https://api.example.test/v3',auth_mode:'passthrough'}})).status, 409);
		assert.strictEqual(fs.readFileSync(PROXY, 'utf8'), '{malformed', 'malformed proxy config must not be overwritten');
		fs.writeFileSync(PROXY, validProxy, {mode:0o600});

		const validRegistry = fs.readFileSync(REGISTRY);
		const tooMany = {schema_version:'watchdog.sources.v1',revision:1,sources:Array.from({length:257},(_,index)=>({id:'src_'+String(index).padStart(24,'0'),name:'Source '+index,description:'',kind:'observed',producer_names:[],source_apps:[],profile_name:'',enabled:true,archived:false,setup_template_id:'',options:{},created_at:'2026-09-04T00:00:00Z',updated_at:'2026-09-04T00:00:00Z'}))};
		fs.writeFileSync(REGISTRY, JSON.stringify(tooMany), {mode:0o600});
		assert.match((await request('GET', '/api/sources')).json.data.registry_error, /registration limit/);
		fs.writeFileSync(REGISTRY, 'x'.repeat(262145), {mode:0o600});
		assert.match((await request('GET', '/api/sources')).json.data.registry_error, /exceeds 256 KiB/);
		fs.writeFileSync(REGISTRY, validRegistry, {mode:0o600});
		fs.writeFileSync(REGISTRY, '{malformed', {mode:0o600});
		const malformed = await request('GET', '/api/sources');
		assert.match(malformed.json.data.registry_error, /malformed JSON/);
		assert.strictEqual((await request('POST', '/api/sources', {source:{name:'Must not write',kind:'native_v2',producer_names:['blocked'],source_apps:[]}})).status, 409);
		assert.strictEqual(fs.readFileSync(REGISTRY, 'utf8'), '{malformed', 'malformed registry must not be overwritten');
		fs.unlinkSync(REGISTRY); fs.writeFileSync(path.join(TEMP, 'outside.json'), validRegistry, {mode:0o600}); fs.symlinkSync(path.join(TEMP, 'outside.json'), REGISTRY);
		const linked = await request('GET', '/api/sources'); assert.match(linked.json.data.registry_error, /non-symlink/);
		assert.strictEqual((await request('POST', '/api/sources', {source:{name:'Must not follow',kind:'native_v2',producer_names:['blocked'],source_apps:[]}})).status, 409);
		await new Promise(resolve => { server.child.once('exit', resolve); server.child.kill('SIGTERM'); });
		assert.ok(!server.output().includes(canary), 'secret canary must not reach service logs');
		const scanFiles = directory => fs.readdirSync(directory, {withFileTypes:true}).flatMap(entry => entry.isDirectory() ? scanFiles(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
		for (const file of scanFiles(TEMP)) assert.ok(!fs.readFileSync(file).includes(Buffer.from(canary)), 'secret canary found in ' + file);
		server = null;
		console.log('connected_sources_management_suite: PASS');
	} finally {
		if (server?.child && server.child.exitCode == null) server.child.kill('SIGTERM');
		fs.rmSync(TEMP, {recursive:true, force:true});
	}
}

run().catch(error => { console.error('connected_sources_management_suite: FAIL'); console.error(error.stack || error); process.exit(1); });
