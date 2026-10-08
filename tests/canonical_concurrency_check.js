const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {DatabaseSync} = require('node:sqlite');
const {resolveKujoBinOrThrow} = require('./_kujo_bin');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'watchdog-concurrency-'));
const db=path.join(temp,'telemetry.sqlite');
const port=17739;
const token='test-canonical-concurrency-token';
const base=`http://127.0.0.1:${port}`;
let child,log='';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 try {
  try{await fetch(base+'/healthz',{signal:AbortSignal.timeout(300)});throw Error('Test port occupied');}catch(e){if(e.message==='Test port occupied')throw e;}
  child=spawn(resolveKujoBinOrThrow(__filename),['run','--interpreter','dashboard_server.kujo'],{cwd:root,env:{...process.env,WDG_HOST:'127.0.0.1',WDG_PORT:String(port),WDG_DB_PATH:db,WDG_API_AUTH_MODE:'token',WDG_API_AUTH_TOKEN:token,WDG_BACKUP_ENABLED:'false',WDG_PROXY_CONFIG_PATH:path.join(temp,'proxy.json'),WDG_SOURCES_CONFIG_PATH:path.join(temp,'sources.json'),WDG_EXPORTERS_CONFIG_PATH:path.join(temp,'exporters.json')},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>log=(log+b).slice(-5000));child.stderr.on('data',b=>log=(log+b).slice(-5000));
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz',{signal:AbortSignal.timeout(500)})).ok){ready=true;break;}}catch{}await delay(100);}assert(ready,log);
  const template=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/telemetry-v2/canonical-minimal.json'),'utf8'));
  const batches=Array.from({length:4},(_,i)=>({...template,batch_id:`parallel-${i}`,records:Array.from({length:40},(_,j)=>({...template.records[0],record_id:`parallel-${i}-${j}`,attributes:{...template.records[0].attributes,authorization:'secret-canary'},content:[{class:'prompt',media_type:'text/plain',value:'private-canary',truncated:false}]}))}));
  const post=batch=>fetch(base+'/telemetry/v2/batches',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(batch),signal:AbortSignal.timeout(30000)});
  for(const response of await Promise.all(batches.map(post)))assert.equal(response.status,200,await response.text());
  const retries=await Promise.all(Array.from({length:4},()=>post(batches[0])));
  for(const response of retries){assert.equal(response.status,200);assert.equal((await response.json()).data.deduplicated,true);}
  const conflicting=structuredClone(batches[0]);conflicting.records[0].name='changed-identity';
  const responses=await Promise.all([post(batches[0]),post(conflicting)]);assert.deepEqual(responses.map(r=>r.status),[200,409]);
  // Bulk identity lookup must preserve overlap, producer scoping and atomic conflicts.
  const overlap=structuredClone(batches[0]);overlap.batch_id='partial-overlap';
  overlap.records.push(...batches[0].records.map((r,i)=>({...r,record_id:`new-${i}`})));
  let reply=await post(overlap);assert.equal(reply.status,200,await reply.text());
  reply=await post(overlap);assert.equal(reply.status,200);assert.equal((await reply.json()).data.deduplicated,true);
  const otherProducer=structuredClone(batches[0]);otherProducer.producer.name='other-producer';
  reply=await post(otherProducer);assert.equal(reply.status,200,await reply.text());
  const mixedConflict=structuredClone(batches[0]);mixedConflict.batch_id='atomic-conflict';
  mixedConflict.records[0].name='different';mixedConflict.records[1].record_id='must-not-be-inserted';
  reply=await post(mixedConflict);assert.equal(reply.status,409);
  const sql=new DatabaseSync(db,{readOnly:true});try{assert.equal(sql.prepare('SELECT count(*) n FROM telemetry_records_v2').get().n,240);assert.equal(sql.prepare('SELECT count(*) n FROM telemetry_batches_v2').get().n,6);for(const row of sql.prepare('SELECT canonical_json FROM telemetry_records_v2').all()){assert(!row.canonical_json.includes('secret-canary'));assert(!row.canonical_json.includes('private-canary'));}}finally{sql.close();}
  console.log('canonical_concurrency_check: PASS (240 retained; overlap retries; producer scope; atomic identity conflicts; privacy preserved)');
 }catch(e){e.message+='\n'+log;throw e;}finally{if(child && child.exitCode===null){child.kill('SIGTERM');await delay(300);if(child.exitCode===null)child.kill('SIGKILL');await delay(100);}fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
