const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn, spawnSync} = require('node:child_process');
const {resolveKujoBin} = require('./_kujo_bin');
const root = path.resolve(__dirname, '..');
const kujo = resolveKujoBin(root);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-a-measurements-'));
const secret = 'PRIVATE_PAYLOAD_sk-123_personal-document_prompt_tool-output';
// Required counters in the published v1 contract. Later runtimes may add
// optional counters; removing an extension must not invalidate a v1 report.
const requiredCounters = new Set([
    'vm_entries', 'vm_inclusive_wall_ns', 'vm_call_opcodes',
    'vm_return_opcodes', 'vm_native_call_opcodes', 'scheduler_rounds',
    'vm_closures_created', 'vm_capture_cells_created', 'vm_capture_value_shallow_bytes',
    'vm_generator_states_created', 'vm_generator_state_drops', 'vm_generator_state_shallow_bytes',
    'vm_generator_resume_attempts', 'tasks_admitted', 'tasks_admission_rejected',
    'tasks_started', 'task_bodies_exited', 'task_completions_published',
    'task_cancellations_published', 'task_queue_wall_ns', 'detached_tasks_observed',
    'promise_polls', 'promise_pending_polls', 'promise_ready_polls',
    'jit_compile_entries', 'jit_compile_inclusive_wall_ns', 'jit_cache_lookup_hits',
    'jit_cache_lookup_misses', 'jit_type_guard_passes', 'jit_type_guard_failures',
]);
const hash = body => 'sha256:' + crypto.createHash('sha256').update(body).digest('hex');
function run(args, cwd = root, env = {}) {
    const r = spawnSync(kujo, args, {cwd, encoding: 'utf8', env: {...process.env, ...env}, timeout: 120000});
    assert.ifError(r.error);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    return r.stdout;
}
async function main() {
let server;
let serverLogs = "";
try {
    const integration = process.argv.includes('--integration');
    const ledgerRoot = path.resolve(process.env.RUNLEDGER_REPO || path.join(root, '../runledger'));
    const ledger = path.join(temp, 'ledger');
    const cli = (...args) => run(['run', path.join(ledgerRoot,'runledger.kujo'), '--', ...args, '--ledger', ledger], ledgerRoot);
    let id = 'wave-a-receipt';
    if (integration) {
        cli('start', '--provider', 'unavailable', '--model', 'unavailable', '--task', 'wave-a-fixture', '--repo', temp);
        id = fs.readdirSync(path.join(ledger,'runs'))[0].replace(/\.json$/, '');
    }
    fs.writeFileSync(path.join(temp, 'workload.kujo'), `func factory(value) { func captured() { return value } return captured } let private_value := factory("${secret}") assert(len(private_value()) > 0) func* private_values() { yield "${secret}" } for value in private_values() { assert(len(value) > 0) } async func private_task() { return "${secret}" } assert(len(await private_task()) > 0) func plus(n) { return n + 1 } print(plus(1))`);
    const startedAt = Date.now();
    run(['run', '--measurements', path.join(temp, 'report.json'), path.join(temp, 'workload.kujo')]);
    const endedAt = Date.now();
    fs.writeFileSync(path.join(temp,'caller-observation.json'), JSON.stringify({schema_version:'watchdog.native-event.v1',event_kind:'execution',event_id:'execution-1',trace_id:'wave-a-trace',span_id:'execution-1',started_at_ms:startedAt,ended_at_ms:endedAt,status:'ok',usage:null,costs:[],references:[{type:'run',id,namespace:'runledger',relation:'groups'}]}));
    const raw = fs.readFileSync(path.join(temp, 'report.json'), 'utf8');
    const report = JSON.parse(raw);
    assert.equal(report.schema, 'kujo.runtime-measurements/v1');
    assert(!raw.includes(secret));
    const cases = [];
    function add(name, body, ok, artifact = hash(body)) {
        const file = name + '.json'; fs.writeFileSync(path.join(temp, file), body);
        cases.push({name, file, artifact, ok});
    }
    function alter(name, mutate, ok = false) { const value = JSON.parse(raw); mutate(value); add(name, JSON.stringify(value), ok); }
    add('valid', raw, true);
    add('exact-bound', raw + ' '.repeat(8192-Buffer.byteLength(raw)), true);
    add('utf8-byte-bound', raw + 'é'.repeat(4096), false);
    for (const field of Object.keys(report)) alter('missing-'+field, x=>delete x[field]);
    for (const counter of requiredCounters) assert(Object.hasOwn(report.counters, counter), 'runtime omitted v1 required counter ' + counter);
    for (const counter of Object.keys(report.counters)) alter('missing-counter-'+counter,x=>delete x.counters[counter], !requiredCounters.has(counter));
    add('oversized', ' '.repeat(8193), false);
    add('invalid-json', '{"private":"' + secret, false);
    add('tampered', raw + ' ', false, hash(raw));
    add('wrong-digest', raw, false, 'sha256:' + '0'.repeat(64));
    add('wrong-artifact-identity', raw, false, 'file:report.json');
    alter('wrong-schema', x => x.schema = 'other/v1');
    alter('future-version', x => x.schema = 'kujo.runtime-measurements/v2');
    alter('missing-field', x => delete x.cpu_seconds);
    alter('wrong-unit', x => { x.wall_ms = x.wall_ns; delete x.wall_ns; });
    alter('wrong-counter-unit', x => { x.counters.vm_inclusive_wall_ms = x.counters.vm_inclusive_wall_ns; delete x.counters.vm_inclusive_wall_ns; });
    alter('numeric-string', x => x.wall_ns = '1');
    alter('numeric-bool', x => x.counters.vm_entries = true);
    alter('negative', x => x.counters.vm_entries = -1);
    alter('fractional-counter', x => x.counters.vm_entries = 0.5);
    alter('unsafe-integer', x => x.wall_ns = 9007199254740992);
    alter('malformed-nullable', x => x.cpu_seconds = 'unavailable');
    alter('negative-cpu', x=>x.cpu_seconds=-1);
    alter('fractional-rss', x=>x.process_peak_rss_bytes=0.5);
    alter('too-many-counters', x=>{for(let i=0;i<65;i++)x.counters['extra'+i]=0;});
    alter('too-many-properties', x=>{for(let i=0;i<33;i++)x['extra'+i]=0;});
    alter('bad-rss', x => x.process_peak_rss_bytes = {});
    alter('unknown-counter-invalid', x => x.counters.extension = 'bytes');
    alter('unknown-counter-valid', x => x.counters[secret] = 4, true);
    alter('nulls', x => { x.cpu_seconds = null; x.process_peak_rss_bytes = null; }, true);
    alter('extensions-private', x => { x.prompt = secret; x.runtime_version = secret; x.unsupported = [secret]; }, true);
    alter('duplicate-unsupported', x => x.unsupported = ['x','x']);
    alter('bad-detached', x => x.waited_for_detached = 0);
    fs.symlinkSync(path.join(temp, 'report.json'), path.join(temp, 'symlink.json'));
    cases.push({name:'symlink', file:'symlink.json', artifact:hash(raw), ok:false});
    cases.push({name:'traversal', file:'../report.json', artifact:hash(raw), ok:false});
    cases.push({name:'absolute', file:path.join(temp,'report.json'), artifact:hash(raw), ok:false});
    cases.push({name:'directory', file:'.', artifact:hash(raw), ok:false});
    fs.writeFileSync(path.join(temp, 'cases.json'), JSON.stringify(cases));
    const logs = run(['run', '--interpreter', 'tests/fixtures/runtime_measurements_check.kujo'], root, {WDG_MEASUREMENT_TEST_ROOT:temp});
    assert(!logs.includes(secret));
    const storedRaw = fs.readFileSync(path.join(temp, 'stored.json'), 'utf8');
    const stored = JSON.parse(storedRaw);
    assert(!storedRaw.includes(secret));
    assert(!storedRaw.includes(temp));
    assert.equal(stored.attributes['kujo.runtime.wall_ns'], report.wall_ns);
    assert.equal(stored.attributes['kujo.runtime.vm_call_opcodes'], report.counters.vm_call_opcodes);
    assert.equal(stored.usage, null);
    assert.deepEqual(stored.costs, []);
    assert(stored.references.some(x => x.id === hash(raw)));
    const cpu = stored.attributes['kujo.runtime.cpu_seconds'];
    if (report.cpu_seconds === null) assert.equal(cpu, null);
    else assert(Math.abs(cpu-report.cpu_seconds) <= 2*Number.EPSILON*Math.max(Math.abs(report.cpu_seconds),Number.MIN_VALUE), 'CPU float roundtrip exceeds two ULPs');
    assert.equal(stored.attributes['kujo.runtime.process_peak_rss_bytes'], report.process_peak_rss_bytes);
    if (integration) {
        // Exercise the public intake, authoritative privacy policy and a server
        // restart in addition to the production repository path above.
        const net = require('node:net');
        const probe = net.createServer();
        await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
        const port = probe.address().port;
        await new Promise(resolve => probe.close(resolve));
        const url = 'http://127.0.0.1:' + port;
        const request = (url, options = {}) => new Promise((resolve,reject) => {
            const http = require('node:http');
            const body = options.body || '';
            const req = http.request(url, {method:options.method || 'GET', agent:false, headers:{...options.headers, ...(body ? {'content-length':Buffer.byteLength(body)} : {})}}, res => {
                let text=''; res.on('data',x=>text+=x); res.on('end',()=>resolve({status:res.statusCode,ok:res.statusCode===200,json:async()=>JSON.parse(text)}));
            });
            req.on('error',reject); req.setTimeout(10000,()=>req.destroy(new Error('request timeout'))); req.end(body);
        });

        const startServer = async () => {
            server = spawn(kujo, ['run','--interpreter','dashboard_server.kujo'], {cwd:root, env:{...process.env, WDG_HOST:'127.0.0.1', WDG_PORT:String(port), WDG_DB_PATH:path.join(temp,'api.db'), WDG_API_AUTH_MODE:'off', WDG_PROXY_AUTHZ_MODE:'off', WDG_BACKUP_ENABLED:'false', WDG_SOURCES_CONFIG_PATH:path.join(temp,'sources.json'), WDG_PROXY_CONFIG_PATH:path.join(temp,'proxy.json'), WDG_EXPORTERS_CONFIG_PATH:path.join(temp,'exporters.json')}, stdio:['ignore','pipe','pipe']});
            server.stdout.on('data',x=>serverLogs+=x); server.stderr.on('data',x=>serverLogs+=x);
            for (let i=0;i<150;i++) {
                try { if ((await request(url+'/readyz')).ok) return; } catch {}
                if (server.exitCode !== null) break;
                await new Promise(r=>setTimeout(r,100));
            }
            throw new Error('Watchdog readiness failed: '+serverLogs);
        };
        const stopServer = async () => {
            if (server && server.exitCode === null) {
                const child = server;
                const exited = new Promise(resolve=>child.once('exit',resolve));
                child.kill('SIGTERM');
                const timer=setTimeout(()=>child.kill('SIGKILL'),2000);
                await exited; clearTimeout(timer);
            }
            server = null;
        };
        await startServer();
        const batch = fs.readFileSync(path.join(temp,'batch.json'),'utf8');
        for (const duplicate of [false,true]) {
            const response = await request(url+'/telemetry/v2/batches',{method:'POST',headers:{'content-type':'application/json'},body:batch});
            assert.equal(response.status,200);
            assert.equal((await response.json()).data.deduplicated,duplicate);
        }
        await stopServer(); await startServer();
        const response = await request(url+'/api/telemetry/v2/records?producer=runtime-fixture');
        assert.equal(response.status,200);
        const records=(await response.json()).data.records;
        assert.equal(records.length,1);
        const persisted=records[0].record;
        assert.equal(persisted.attributes['kujo.runtime.wall_ns'],report.wall_ns);
        assert.equal(persisted.usage,null); assert.deepEqual(persisted.costs,[]);
        assert(persisted.references.some(x=>x.id===hash(raw)));
        assert(persisted.references.some(x=>x.id===id && x.namespace==='runledger'));
        assert(!JSON.stringify(persisted).includes(secret));
        fs.writeFileSync(path.join(temp,'api-record.json'),JSON.stringify(persisted,null,2));
        await stopServer(); assert(!serverLogs.includes(secret));
        cli('correlate', id, '--watchdog-trace', stored.trace_id, '--watchdog-run', 'execution-1', '--dispatch-run', 'caller-owned-run');
        const attachArgs = ['runtime-measurement', id, '--root', temp, '--file', 'report.json', '--artifact', hash(raw)];
        cli(...attachArgs); cli(...attachArgs);
        const receiptRaw = cli('show', id, '--json');
        const receipt = JSON.parse(receiptRaw);
        assert.equal(receipt.notes.length, 1);
        assert.equal(JSON.parse(receipt.notes[0].text).artifact, hash(raw));
        assert.equal(receipt.correlation.watchdog_trace_id, stored.trace_id);
        assert.equal(receipt.status, 'in_progress');
        assert(Object.values(receipt.usage).every(x => x === null));
        assert.equal(receipt.cost.total_cost, null);
        assert(!receiptRaw.includes(secret));
        fs.writeFileSync(path.join(temp, 'receipt.json'), receiptRaw);
        console.log('runtime_measurements_e2e: PASS');
    }
    if (process.env.WAVE_A_EVIDENCE_DIR) {
        fs.mkdirSync(process.env.WAVE_A_EVIDENCE_DIR, {recursive:true});
        for (const name of ['report.json','batch.json','stored.json','api-record.json','receipt.json']) {
            if (fs.existsSync(path.join(temp,name))) fs.copyFileSync(path.join(temp,name),path.join(process.env.WAVE_A_EVIDENCE_DIR,name));
        }
    }
    console.log('runtime_measurements_adapter_check: PASS (' + cases.length + ' input cases)');
} catch (error) { console.error(serverLogs); throw error; } finally { if (server && server.exitCode === null) server.kill('SIGKILL'); fs.rmSync(temp, {recursive:true, force:true}); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
