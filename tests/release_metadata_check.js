const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const version = read('VERSION').trim();
assert.match(version, /^\d+\.\d+\.\d+$/);
for (const file of ['kujo.toml', 'kennel.toml']) {
  assert.equal(read(file).match(/^version = "([^"]+)"/m)[1], version);
}
assert.ok(read('README.md').includes('version-' + version + '-black'));
assert.ok(read('CHANGELOG.md').includes('## [' + version + ']'));
assert.ok(read('kennel.toml').includes('minimum_version = "1.6.0"'));
console.log('release_metadata_check: PASS');
