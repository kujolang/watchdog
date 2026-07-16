const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class FakeClassList {
	constructor(initial = []) {
		this._set = new Set(initial);
	}
	add(name) {
		this._set.add(name);
	}
	remove(name) {
		this._set.delete(name);
	}
	contains(name) {
		return this._set.has(name);
	}
}

function makeElement(id, classes = []) {
	return {
		id,
		value: '',
		innerHTML: '',
		textContent: '',
		className: '',
		children: [],
		open: false,
		style: {},
		classList: new FakeClassList(classes),
		click() {},
		appendChild(child) {
			this.children.push(child);
			return child;
		},
		showModal() {
			this.open = true;
		},
		close() {
			this.open = false;
		},
	};
}

function extractDashboardScript(htmlSource) {
	const matches = htmlSource.match(/<script>([\s\S]*?)<\/script>/g) || [];
	const appScript = matches.find(block => block.includes('const state = {'));
	if (!appScript) {
		throw new Error('Dashboard inline script not found');
	}

	const contentMatch = appScript.match(/<script>([\s\S]*?)<\/script>/);
	if (!contentMatch || !contentMatch[1]) {
		throw new Error('Dashboard inline script content extraction failed');
	}

	let script = contentMatch[1];
	script = script.replace('const state = {', 'var state = {');
	script = script.replace(/loadAll\(\);\s*\/\/ Auto-refresh every 30 s\s*setInterval\(loadAll, 30_000\);/m, '');
	return script;
}

function createHarness() {
	const htmlPath = path.join(__dirname, '..', 'dashboard.html');
	const source = fs.readFileSync(htmlPath, 'utf8');
	const script = extractDashboardScript(source);

	const elements = {};
	const requiredIds = [
		'reqSearch', 'reqTenantFilter', 'reqProjectFilter', 'reqStatusFilter', 'reqProviderFilter', 'reqBody', 'reqEmpty',
		'tcSearch', 'tcStatusFilter', 'tcBody', 'tcEmpty',
		'traceContainer', 'errorGrid', 'sessBody', 'sessEmpty',
		'badgeTraces', 'detailDialog', 'detailTitle', 'detailBody',
	];

	requiredIds.forEach(id => {
		const defaults = (id === 'reqEmpty' || id === 'tcEmpty' || id === 'sessEmpty') ? ['hidden'] : [];
		elements[id] = makeElement(id, defaults);
	});

	const context = {
		console,
		setInterval() {
			return 0;
		},
		clearInterval() {},
		fetch: async () => ({
			async json() {
				return { data: [] };
			},
		}),
		Chart: class FakeChart {
			constructor() {}
			destroy() {}
		},
		Blob: class FakeBlob {
			constructor() {}
		},
		URL: {
			createObjectURL() {
				return 'blob://fake';
			},
			revokeObjectURL() {},
		},
		document: {
			getElementById(id) {
				if (!elements[id]) {
					elements[id] = makeElement(id);
				}
				return elements[id];
			},
			querySelectorAll() {
				return [];
			},
			createElement() {
				return makeElement('dynamic');
			},
		},
	};

	vm.createContext(context);
	vm.runInContext(script, context, { filename: 'dashboard.inline.js' });

	return { context, elements };
}

function testRequestsFiltersSortingAndEscaping() {
	const { context, elements } = createHarness();

	context.state.requests = [
		{
			session_id: '<img src=x onerror=1>',
			user_id: 'user_a',
			tenant_id: '<tenant-danger>',
			project_id: 'proj-alpha',
			provider: '<script>alert(1)</script>',
			model: 'model-z',
			status: 'success',
			latency_ms: 120,
			total_tokens: 9,
			cost_usd: 0.01,
			prompt_summary: '<b>unsafe prompt</b>',
			created_at: '2000',
		},
		{
			session_id: 'safe-session',
			user_id: 'user_b',
			tenant_id: 'tenant-2',
			project_id: 'proj-beta',
			provider: 'openai',
			model: 'model-a',
			status: 'error',
			latency_ms: 333,
			total_tokens: 15,
			cost_usd: 0.02,
			prompt_summary: 'normal prompt',
			created_at: '1000',
		},
	];

	context.populateProviderFilter();
	assert.ok(elements.reqProviderFilter.innerHTML.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));

	context.renderRequestsTable();
	assert.ok(elements.reqBody.innerHTML.includes("showRecordDetails('requests', 0)"), 'request rows should open full details');
	assert.strictEqual(context.state.visibleRows.requests.length, 2, 'request detail rows should match rendered rows');
	context.showRecordDetails('requests', 0);
	assert.strictEqual(elements.detailDialog.open, true, 'request details dialog should open');
	assert.strictEqual(elements.detailTitle.textContent, 'Request details');
	assert.ok(elements.detailBody.children.length > 0, 'request details should include all record fields');
	assert.strictEqual(elements.detailBody.children[0].children.length, 2, 'detail fields should contain a label and value');
	context.closeRecordDetails();
	assert.strictEqual(elements.detailDialog.open, false, 'request details dialog should close');
	assert.ok(elements.reqBody.innerHTML.includes('&lt;img src=x onerror=1&gt;'), 'session id should be escaped');
	assert.ok(!elements.reqBody.innerHTML.includes('<img src=x onerror=1>'), 'unsafe session id must not be injected as HTML');
	assert.ok(elements.reqBody.innerHTML.includes('&lt;tenant-danger&gt;'), 'tenant id should be escaped');
	assert.ok(!elements.reqBody.innerHTML.includes('<tenant-danger>'), 'unsafe tenant id must not be injected as HTML');
	assert.ok(elements.reqBody.innerHTML.indexOf('model-z') < elements.reqBody.innerHTML.indexOf('model-a'), 'default sort should keep newest row first');

	context.sortTable('requests', 'created_at');
	assert.ok(elements.reqBody.innerHTML.indexOf('model-a') < elements.reqBody.innerHTML.indexOf('model-z'), 'sort toggle should reverse order');

	elements.reqStatusFilter.value = 'error';
	context.renderRequestsTable();
	assert.ok(elements.reqBody.innerHTML.includes('model-a'));
	assert.ok(!elements.reqBody.innerHTML.includes('model-z'));
	elements.reqStatusFilter.value = '';

	elements.reqTenantFilter.value = 'tenant-2';
	context.renderRequestsTable();
	assert.ok(elements.reqBody.innerHTML.includes('tenant-2'));
	assert.ok(!elements.reqBody.innerHTML.includes('proj-alpha'));

	elements.reqTenantFilter.value = '';
	elements.reqProjectFilter.value = 'proj-alpha';
	context.renderRequestsTable();
	assert.ok(elements.reqBody.innerHTML.includes('proj-alpha'));
	assert.ok(!elements.reqBody.innerHTML.includes('proj-beta'));

	elements.reqSearch.value = 'no-match-filter';
	context.renderRequestsTable();
	assert.strictEqual(elements.reqBody.innerHTML, '', 'filtered no-result should clear body');
	assert.strictEqual(elements.reqEmpty.classList.contains('hidden'), false, 'empty state should be visible');
}

function testToolCallsErrorsSessionsAndTracesContracts() {
	const { context, elements } = createHarness();

	context.state.toolCalls = [
		{
			created_at: '1234',
			session_id: '<tool-session>',
			tool_name: '<b>tool</b>',
			tool_args: '{"unsafe":"<x>"}',
			tool_result: '<y>',
			status: 'error',
			latency_ms: 44,
		},
	];
	context.renderToolCallsTable();
	assert.ok(elements.tcBody.innerHTML.includes('&lt;b&gt;tool&lt;/b&gt;'));
	assert.ok(!elements.tcBody.innerHTML.includes('<b>tool</b>'));
	assert.ok(elements.tcBody.innerHTML.includes("showRecordDetails('toolCalls', 0)"), 'tool call rows should open full details');

	context.state.toolCalls = [];
	context.renderToolCallsTable();
	assert.strictEqual(elements.tcEmpty.classList.contains('hidden'), false);

	context.state.errors = [];
	context.renderErrors();
	assert.ok(elements.errorGrid.innerHTML.includes('No errors recorded'));

	context.state.errors = [{ error_code: '<err>', count: 2, error_message: '<boom>', provider: '<prov>', last_seen: '1234' }];
	context.renderErrors();
	assert.ok(elements.errorGrid.innerHTML.includes('&lt;err&gt;'));
	assert.ok(!elements.errorGrid.innerHTML.includes('<err>'));

	context.state.sessions = [
		{
			session_id: '<sid>',
			user_id: '<user>',
			request_count: 1,
			error_count: 0,
			total_tokens: 10,
			total_cost_usd: 0.01,
			avg_latency_ms: 30,
			started_at: '100',
			last_seen: '200',
		},
	];
	context.renderSessionsTable();
	assert.ok(elements.sessBody.innerHTML.includes('&lt;sid&gt;'));
	assert.ok(!elements.sessBody.innerHTML.includes('<sid>'));
	assert.ok(elements.sessBody.innerHTML.includes("showRecordDetails('sessions', 0)"), 'session rows should open full details');

	context.state.agentSteps = [
		{
			session_id: '<trace-session>',
			agent_id: '<trace-agent>',
			step_number: 1,
			step_type: '<unknown>',
			content: '<img src=x onerror=trace>',
			created_at: '999',
		},
	];
	context.renderAgentTraces();
	assert.ok(elements.traceContainer.innerHTML.includes('badge-step-planning'), 'unknown step types should normalize to planning style');
	assert.ok(elements.traceContainer.innerHTML.includes('&lt;img src=x onerror=trace&gt;'));
	assert.ok(!elements.traceContainer.innerHTML.includes('<img src=x onerror=trace>'));

	context.state.traces = [{ trace_id: 'trace-1', session_id: 'session-1', source_app: 'independent-tool', name: 'workflow', status: 'success', started_at_ms: 1000, duration_ms: 200, attributes_json: '{}' }];
	context.state.traceSpans = [{ trace_id: 'trace-1', span_id: 'span-1', parent_span_id: '', span_kind: 'tool\" onclick=alert(1)', name: '<tool-span>', status: 'success', started_at_ms: 1010, duration_ms: 100, attributes_json: '{}' }];
	context.state.traceEvents = [{ trace_id: 'trace-1', span_id: '', event_id: 'persist-1', event_name: 'persistence_saved', sequence: 99, occurred_at_ms: 1200, attributes_json: '{}' }];
	elements.traceKindFilter.value = 'persistence';
	context.renderAgentTraces();
	assert.ok(elements.traceContainer.innerHTML.includes('trace-waterfall'), 'granular traces should render as a waterfall');
	assert.ok(elements.traceContainer.innerHTML.includes('Persisted ✓'), 'persistence events should remain filterable and visible');
	assert.ok(elements.traceContainer.innerHTML.includes('&lt;tool-span&gt;'));
	assert.ok(!elements.traceContainer.innerHTML.includes('span-bar tool&quot;'), 'span kind must not be injected into a CSS class');
}

function run() {
	testRequestsFiltersSortingAndEscaping();
	testToolCallsErrorsSessionsAndTracesContracts();
	console.log('frontend_contract_suite: PASS');
}

try {
	run();
} catch (err) {
	console.error('frontend_contract_suite: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
}
