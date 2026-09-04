const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'dashboard.html'), 'utf8');
for (const required of [
	"switchTab('sources',this)", 'id="tab-sources"', 'id="sourceSearch"', 'id="sourceStatusFilter"', 'id="sourceKindFilter"',
	'id="sourceDialog"', 'aria-labelledby="sourceDialogTitle"', 'id="sourceWizard"', 'aria-labelledby="sourceWizardTitle"',
	'id="sourceMutationStatus" role="status" aria-live="polite"', 'function renderSources()', 'function showSourceDetails(index)',
	'function submitSourceWizard(event)', 'function verifySource(index)', 'function removeSourceRegistration(index)',
	'function editSourceConnection(index)', 'function deleteSourceConnection(index)', 'function sourceIconAction(icon, label, handler, index, danger = false)',
	"endpoint = '/api/sources/proxy/update'", "fetchJSON('/api/sources/proxy/delete'", 'class="btn btn-primary source-add-button"',
	"const sources = await fetchOptionalJSON('/api/sources'", 'navigator.clipboard.writeText(snippet)',
]) assert.ok(html.includes(required), 'missing Connected Sources frontend contract: ' + required);

assert.ok(html.includes('${safeText(source.name'), 'source names must be escaped before table rendering');
assert.ok(html.includes('output.textContent = value'), 'source detail values must use textContent');
assert.ok(html.includes('pre.textContent = template.snippet'), 'setup snippets must use textContent');
assert.ok(!/src=["']https?:\/\//i.test(html), 'dashboard must not load remote script assets');
assert.ok(!/Connected Sources[^<]*[\u{1F300}-\u{1FAFF}]/u.test(html), 'Connected Sources must not introduce emoji');
assert.ok(html.includes('@media (max-width: 700px)'), 'narrow-screen contract must remain present');
assert.ok(html.includes("document.getElementById(source ? 'sourceName' : 'sourceKind')?.focus()"), 'wizard must set keyboard focus');
assert.ok(html.includes("plus: '<path"), 'add connection must use a local Tabler plus icon');
assert.ok(html.includes("pencil: '<path") && html.includes("trash: '<path"), 'edit and delete actions must use local Tabler icons');
assert.ok(html.includes('font:400 18px/1.2 var(--font-display)'), 'Connected Sources heading must use Departure Mono display face');
assert.ok(html.includes('.source-field label,.source-live { font-family:var(--font-mono); }'), 'Connected Sources labels must use Departure Mono');
assert.ok(!html.includes('var(--font-sans)'), 'Connected Sources must not reference an undefined font token');
console.log('connected_sources_frontend_contract_check: PASS');
