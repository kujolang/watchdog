const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { resolveKujoBinOrThrow } = require('./_kujo_bin');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'dashboard_server.kujo'), 'utf8');
const start = source.indexOf('func string_has_sensitive_term(value) {');
const end = source.indexOf('\nfunc redact_sensitive_text', start);
assert(start >= 0 && end > start);
const fn = source.slice(start, end);
const defaults = ['api_key','authorization','bearer','password','secret','token','sk-'];
const cases = ['',null,1,false,'safe metadata','SECRET','mytokenizer','SK-123','π😀PASSWORD\n'];
for (const term of [...defaults,'.*','[x]','a+b','x|y','\\d','é']) {
 for (const prefix of ['', 'safe.', '\n😀', 'a'.repeat(100)]) {
  cases.push(prefix+term, prefix+term.toUpperCase(), prefix+term.split('').join('-'));
 }
}
const configs = [defaults, ['.*','[x]','a+b','x|y','\\d','é'], [], ['token'], [...defaults].reverse()];
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'watchdog-match-'));
try {
 let assertions=0;
 for (let i=0;i<configs.length;i++) {
  const terms=configs[i];
  const code=`REDACT_TERMS := parse_json(${JSON.stringify(JSON.stringify(terms))})\nREDACT_DEFAULT_TERMS := join(REDACT_TERMS, ",") == "${defaults.join(',')}"\n${fn}\nvalues := parse_json(${JSON.stringify(JSON.stringify(cases))})\nfor value in values {\n text := to_lower(to_string(value))\n expected := false\n for term in REDACT_TERMS {if term != "" && contains(text,term) {expected = true}}\n if expected != string_has_sensitive_term(value) {print("mismatch");exit(1)}\n}\nprint("PASS")\n`;
  const file=path.join(temp,`${i}.kujo`);fs.writeFileSync(file,code);
  const run=spawnSync(resolveKujoBinOrThrow(__filename),['run','--interpreter',file],{cwd:root,encoding:'utf8',timeout:30000});
  assert.equal(run.status,0,run.stdout+run.stderr);assert(run.stdout.includes('PASS'));assertions+=cases.length;
 }
 console.log(`redaction_match_equivalence: PASS (${assertions} cases including literal custom terms)`);
} finally {fs.rmSync(temp,{recursive:true,force:true});}
