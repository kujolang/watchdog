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
const port=17740;
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
  const locked=structuredClone(template);locked.batch_id='held-writer';locked.records[0].record_id='held-writer-record';
  const holder=new DatabaseSync(db);holder.exec('BEGIN IMMEDIATE');
  let response,settled=false;
  const began=Date.now();
  const pending=fetch(base+'/telemetry/v2/batches',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(locked),signal:AbortSignal.timeout(20000)}).then(async r=>{response={status:r.status,body:await r.text(),ms:Date.now()-began};settled=true;});
  await delay(6500);
  const settledWhileLocked=settled;
  holder.exec('ROLLBACK');holder.close();
  await pending;
  assert.equal(settledWhileLocked,true,'intake must fail within the configured busy timeout');
  assert.equal(response.status,500,'intake must fail closed if transaction acquisition times out');
  const sql=new DatabaseSync(db,{readOnly:true});
  assert.equal(sql.prepare('SELECT count(*) n FROM telemetry_records_v2').get().n,0);
  assert.equal(sql.prepare('SELECT count(*) n FROM telemetry_batches_v2').get().n,0);sql.close();
  const retry=await fetch(base+'/telemetry/v2/batches',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(locked),signal:AbortSignal.timeout(10000)});
  assert.equal(retry.status,200);assert.equal((await retry.json()).data.records,1);
  console.log('canonical_busy_check: PASS (held writer rejected; zero partial rows; same identity retry accepted)');
 }catch(e){e.message+='\n'+log;throw e;}finally{if(child && child.exitCode===null){child.kill('SIGTERM');await delay(300);if(child.exitCode===null)child.kill('SIGKILL');await delay(100);}fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
