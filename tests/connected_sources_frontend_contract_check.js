const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'dashboard.html'), 'utf8');
for (const required of [
	"switchTab('sources',this)", 'id="tab-sources"', 'id="sourceSearch"', 'id="sourceStatusFilter"', 'id="sourceKindFilter"',
	'id="sourceDialog"', 'aria-labelledby="sourceDialogTitle"', 'id="sourceWizard"', 'aria-labelledby="sourceWizardTitle"',
	'id="sourceMutationStatus" role="status" aria-live="polite"', 'function renderSources()', 'function showSourceDetails(index)',
	'function submitSourceWizard(event)', 'function verifySource(index)', 'function removeSourceRegistration(index)',
	"const sources = await fetchOptionalJSON('/api/sources'", 'navigator.clipboard.writeText(snippet)',
]) assert.ok(html.includes(required), 'missing Connected Sources frontend contract: ' + required);

assert.ok(html.includes('${safeText(source.name'), 'source names must be escaped before table rendering');
assert.ok(html.includes('output.textContent = value'), 'source detail values must use textContent');
assert.ok(html.includes('pre.textContent = template.snippet'), 'setup snippets must use textContent');
assert.ok(!/src=["']https?:\/\//i.test(html), 'dashboard must not load remote script assets');
assert.ok(!/Connected Sources[^<]*[\u{1F300}-\u{1FAFF}]/u.test(html), 'Connected Sources must not introduce emoji');
assert.ok(html.includes('@media (max-width: 700px)'), 'narrow-screen contract must remain present');
assert.ok(html.includes("document.getElementById('sourceKind')?.focus()"), 'wizard must set keyboard focus');
console.log('connected_sources_frontend_contract_check: PASS');
