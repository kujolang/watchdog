const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const {resolveKujoBinOrThrow} = require('./_kujo_bin');
const root = path.resolve(__dirname,'..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'watchdog-canonical-'));
const script = path.join(root,`.canonical-equivalence-${process.pid}.kujo`);
// Frozen prior serializer is the byte contract for retained identity hashes.
const reference = `func old_json(value) {
 t := type(value)
 if t == "dict" {
  parts := []
  for key in sort(keys(value)) {parts = push(parts, to_json(to_string(key)) + ":" + old_json(value[key]))}
  return "{" + join(parts, ",") + "}"
 }
 if t == "array" {parts := []\n for item in value {parts=push(parts,old_json(item))}\n return "["+join(parts,",")+"]"}
 return to_json(value)
}`;
const cases=[null,true,false,0,-1,1.5,1e-100,1e100,'quote" slash\\ newline\n\t unicode é 😀',[],{}, {z:[{z:2,a:1}],a:0}];
for (let i=0;i<100;i++) cases.push({z:i, nested:{'😀':i,'é':[null,false,'\u0000'],a:-i},a:[i,i+.125],empty:{}});
for (const name of fs.readdirSync(path.join(root,'tests/fixtures/telemetry-v2'))) {
 if(name.endsWith('.json')) {try{cases.push(JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/telemetry-v2',name),'utf8')));}catch{}}
}
try {
 fs.writeFileSync(path.join(temp,'cases.json'),JSON.stringify(cases));
 fs.writeFileSync(script,`from telemetry_repository import watchdog_telemetry_repository_canonical_json\n${reference}\ncases := parse_json(read_file(env("CANONICAL_CASES")))\nfor value in cases {if old_json(value) != watchdog_telemetry_repository_canonical_json(value) {print("canonical mismatch");exit(1)}}\nprint("equivalent:"+to_string(len(cases)))\n`);
 const r=spawnSync(resolveKujoBinOrThrow(__filename),['run','--interpreter',script],{cwd:root,env:{...process.env,CANONICAL_CASES:path.join(temp,'cases.json')},encoding:'utf8',timeout:30000});
 assert.equal(r.status,0,r.stdout+r.stderr);assert(r.stdout.includes(`equivalent:${cases.length}`),r.stdout);
 console.log(`canonical_serialization_equivalence: PASS (${cases.length} cases)`);
}finally {fs.rmSync(script,{force:true});fs.rmSync(temp,{recursive:true,force:true});}
