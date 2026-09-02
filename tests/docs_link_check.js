const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const files = [];
function walk(directory) { for (const entry of fs.readdirSync(directory, {withFileTypes: true})) { const target = path.join(directory, entry.name); if (entry.isDirectory()) walk(target); else if (entry.name.endsWith('.md')) files.push(target); } }
walk(path.join(ROOT, 'docs'));
files.push(path.join(ROOT, 'README.md'));
const missing = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const pattern = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of text.matchAll(pattern)) {
    let target = match[1].trim().replace(/^<|>$/g, '');
    if (!target || /^(?:https?:|mailto:|#)/i.test(target)) continue;
    target = target.split('#')[0].split('?')[0];
    if (!target) continue;
    const resolved = target.startsWith('/') ? path.join(ROOT, target) : path.resolve(path.dirname(file), target);
    if (!fs.existsSync(resolved)) missing.push(`${path.relative(ROOT, file)} -> ${target}`);
  }
}
assert.deepStrictEqual(missing, [], 'broken local documentation links:\n' + missing.join('\n'));
console.log(`docs_link_check: PASS (${files.length} Markdown files)`);
