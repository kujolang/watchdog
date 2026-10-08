const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {resolveKujoBinOrThrow} = require('./_kujo_bin');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-hex-'));
const script = path.join(root, `.hex-equivalence-${process.pid}.kujo`);
const old = `func prior(value, expected_len) {
 text := to_lower(trim(to_string(value)))
 if len(text) != expected_len { return false }
 i := 0
 while i < len(text) {
  ch := substring(text, i, i + 1)
  if contains("0123456789abcdef", ch) == 0 { return false }
  i = i + 1
 }
 if text == substring("00000000000000000000000000000000", 0, expected_len) { return false }
 return true
}`;
const cases=[];
for(const size of [0,8,16,32,40]) {
 for(const value of [null,true,123,{},[], '', '0'.repeat(size), 'F'.repeat(size), ' '.repeat(2)+'Ab'.repeat(size/2)+'\n', '1'.repeat(size+1)]) cases.push({value,size});
 for(const bad of ['g','z','é','😀','\n','\t','\u0000',' '])
  for(const i of [0,Math.floor(size/2),Math.max(0,size-1)]) cases.push({value:'a'.repeat(i)+bad+'a'.repeat(Math.max(0,size-i-1)),size});
 for(let i=0;i<32;i++) cases.push({value:i.toString(16).padStart(size,'0'),size});
}
try {
 fs.writeFileSync(path.join(temp,'cases.json'),JSON.stringify(cases));
 fs.writeFileSync(script,`from telemetry_v2 import watchdog_telemetry_v2_is_hex_id\n${old}\ncases := parse_json(read_file(env("HEX_CASES")))\nfor c in cases { if prior(c["value"], c["size"]) != watchdog_telemetry_v2_is_hex_id(c["value"], c["size"]) { print("hex mismatch:"+to_json(c)); exit(1) } }\nprint("equivalent:"+to_string(len(cases)))\n`);
 const r=spawnSync(resolveKujoBinOrThrow(__filename),['run','--interpreter',script],{cwd:root,env:{...process.env,HEX_CASES:path.join(temp,'cases.json')},encoding:'utf8',timeout:30000});
 assert.equal(r.status,0,r.stdout+r.stderr);
 assert(r.stdout.includes(`equivalent:${cases.length}`),r.stdout);
 console.log(`hex_id_equivalence: PASS (${cases.length} cases)`);
} finally { fs.rmSync(script,{force:true});fs.rmSync(temp,{recursive:true,force:true}); }
