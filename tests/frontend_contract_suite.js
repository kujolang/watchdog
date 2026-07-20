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
		setAttribute(name, value) {
			this[name] = value;
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
	const renderedCharts = { value: null };
	const requiredIds = [
		'globalRangePreset', 'globalRangeCustomFields', 'globalRangeStartField', 'globalRangeEndField', 'globalRangeStart', 'globalRangeEnd',
		'reqSearch', 'reqTenantFilter', 'reqProjectFilter', 'reqStatusFilter', 'reqProviderFilter', 'reqBody', 'reqEmpty',
		'tcSearch', 'tcStatusFilter', 'tcBody', 'tcEmpty',
		'traceContainer', 'errorGrid', 'sessBody', 'sessEmpty', 'insightsContainer',
		'badgeTraces', 'detailDialog', 'detailTitle', 'detailBody', 'statRequestsSub',
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
		setTimeout(callback) {
			callback();
			return 0;
		},
		navigator: {
			clipboard: {
				async writeText(text) {
					contextClipboard.value = text;
				},
			},
		},
		fetch: async () => ({
			async json() {
				return { data: [] };
			},
		}),
		WatchdogDitherCharts: {
			renderCharts(data) {
				renderedCharts.value = data;
			},
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
	context.window = context;
	const contextClipboard = { value: '' };

	vm.createContext(context);
	vm.runInContext(script, context, { filename: 'dashboard.inline.js' });

	return { context, elements, contextClipboard, renderedCharts };
}

async function testRequestsFiltersSortingAndEscaping() {
	const { context, elements, contextClipboard } = createHarness();
	assert.strictEqual(context.pricingKindBadge('unknown', '', ''), '', 'unknown pricing provenance should not add a contradictory badge beside a cost');

	context.state.rangePreset = 'all';
	context.initializeRangeFilter();
	assert.strictEqual(elements.globalRangeCustomFields.classList.contains('hidden'), true, 'preset mode should keep custom range fields hidden');

	context.state.rangePreset = 'custom';
	context.initializeRangeFilter();
	assert.strictEqual(elements.globalRangeCustomFields.classList.contains('hidden'), false, 'custom range fields should be shown');

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
			metadata_json: '{"prompt":"hello","temperature":0.2}',
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
	assert.ok(elements.reqBody.innerHTML.includes('table-icon-action'), 'request identifiers should append drilldown icons');
	assert.strictEqual(context.state.visibleRows.requests.length, 2, 'request detail rows should match rendered rows');
	context.showRecordDetails('requests', 0);
	assert.strictEqual(elements.detailDialog.open, true, 'request details dialog should open');
	assert.strictEqual(elements.detailTitle.textContent, 'Request details');
	assert.ok(elements.detailBody.children.length > 0, 'request details should include all record fields');
	assert.strictEqual(elements.detailBody.children[0].children.length, 2, 'detail fields should contain a label and value');
	const jsonField = elements.detailBody.children.find(field => field.children[0].textContent === 'metadata json');
	const jsonCodeBlock = jsonField.children[1].children[0].children[0];
	assert.strictEqual(jsonCodeBlock.className, 'detail-code-block', 'detail values should use a copyable code block wrapper');
	assert.ok(jsonCodeBlock.children[0].classList.contains('detail-json'), 'structured detail values should use the JSON viewer');
	assert.ok(jsonCodeBlock.children[0].innerHTML.includes('json-string'), 'JSON viewer should apply syntax classes');
	assert.strictEqual(jsonCodeBlock.children[1].className, 'code-copy-button', 'code blocks should include a copy button');
	await jsonCodeBlock.children[1].onclick();
	assert.strictEqual(contextClipboard.value, '{\n  "prompt": "hello",\n  "temperature": 0.2\n}', 'copy button should copy the unformatted code contents');
	const actionList = context.buildActionList([{ label: 'Open request #934', run() {} }]);
	assert.ok(actionList.children[0].innerHTML.includes('<svg'), 'field actions should render as plain Tabler icons');
	assert.strictEqual(actionList.children[0].title, 'Open request #934', 'icon actions should retain a descriptive tooltip');
	const relatedList = context.buildActionList([{ label: 'Open request #934', run() {} }], { showLabels: true });
	assert.ok(relatedList.children[0].innerHTML.includes('<svg'), 'related actions should include a Tabler icon');
	assert.strictEqual(relatedList.children[0].children[0].textContent, 'Request', 'related actions should include a short text label');
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

	context.state.rangePreset = '30d';
	context.initializeRangeFilter();
	const rangedUrl = context.buildApiUrl('/api/requests');
	assert.ok(rangedUrl.includes('since_ms='), 'range-aware API URLs should include a start bound');
	assert.ok(rangedUrl.includes('until_ms='), 'range-aware API URLs should include an end bound');

	const day = 24 * 60 * 60 * 1000;
	const range = { preset: '7d', sinceMs: 10 * day, untilMs: 17 * day, label: 'Last 7 days' };
	const normalized = context.normalizeRequestSeries([
		{ bucket_start_ms: 10 * day, bucket_size_ms: day, total: 2, errors: 0 },
		{ bucket_start_ms: 16 * day, bucket_size_ms: day, total: 3, errors: 1 },
	], range);
	assert.strictEqual(normalized.length, 7, 'seven-day charts should always render seven daily buckets');
	assert.deepStrictEqual(Array.from(normalized, row => row.total), [2, 0, 0, 0, 0, 0, 3], 'missing dates should render as zero-value buckets');

	const sixMonthRange = { preset: '6m', sinceMs: 100 * day, untilMs: 283 * day, label: 'Last 6 months' };
	const sixMonthSeries = context.normalizeRequestSeries([
		{ bucket_start_ms: 100 * day, bucket_size_ms: 7 * day, total: 922, errors: 0 },
	], sixMonthRange);
	assert.ok(sixMonthSeries.length >= 26, 'six-month charts should preserve the full selected timeline');
	assert.strictEqual(sixMonthSeries.reduce((sum, row) => sum + row.total, 0), 922, 'zero filling must not change request totals');
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
	assert.ok(elements.tcBody.innerHTML.includes('table-icon-action'), 'tool call identifiers should append drilldown icons');
	assert.ok(!elements.tcBody.innerHTML.includes('Find tool'), 'tool table should not repeat a tool search icon beside the tool name');

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

	context.state.traces = [{ trace_id: 'trace-1', session_id: 'session-1', source_app: 'independent-tool', name: 'interactive_chat', status: 'success', started_at_ms: 1000, duration_ms: 200, attributes_json: '{}' }];
	context.state.traceSpans = [{ trace_id: 'trace-1', span_id: 'span-1', parent_span_id: '', span_kind: 'tool\" onclick=alert(1)', name: '<tool-span>', status: 'success', started_at_ms: 1010, duration_ms: 100, attributes_json: '{}' }];
	context.state.traceEvents = [{ trace_id: 'trace-1', span_id: '', event_id: 'persist-1', event_name: 'persistence_saved', sequence: 99, occurred_at_ms: 1200, attributes_json: '{}' }];
	elements.traceKindFilter.value = 'persistence';
	context.renderAgentTraces();
	assert.ok(elements.traceContainer.innerHTML.includes('trace-waterfall'), 'granular traces should render as a waterfall');
	assert.ok(elements.traceContainer.innerHTML.includes('Persisted ✓'), 'persistence events should remain filterable and visible');
	assert.ok(elements.traceContainer.innerHTML.includes('interactive_chat'), 'trace name should remain visible');
	assert.ok(!elements.traceContainer.innerHTML.includes('◫ interactive_chat'), 'trace name should not have a decorative prefix');
	assert.ok(elements.traceContainer.innerHTML.includes('m6 9 6 6 6-6'), 'trace disclosure should use a Tabler chevron');
	assert.ok(elements.traceContainer.innerHTML.includes('&lt;tool-span&gt;'));
	assert.ok(!elements.traceContainer.innerHTML.includes('span-bar tool&quot;'), 'span kind must not be injected into a CSS class');

	context.state.insights = {
		run_outcomes: {
			summary: { total_runs: 1, success_signal_runs: 1, failed_runs: 0, successful_cost_usd: 0.01 },
			runs: [{ run_key: '<run>', request_rounds: 2, error_count: 0, retry_signals: 1, tool_count: 2, total_cost_usd: 0.01, avg_latency_ms: 40 }],
		},
		tool_effectiveness: [{ tool_name: '<tool>', call_count: 2, success_count: 2, error_count: 0, avg_latency_ms: 20, max_latency_ms: 30, total_latency_ms: 40 }],
			latency_waterfall: { by_kind: [{ span_kind: 'tool', span_count: 1, total_duration_ms: 20, avg_duration_ms: 20, max_duration_ms: 20 }], summary: { total_trace_duration_ms: 20, total_span_duration_ms: 20 } },
		workflow_sequences: [{ from_step: 'planning', to_step: 'tool_call', transition_count: 1 }],
		context_pressure: { summary: { trace_count: 1, avg_input_tokens: 10, max_input_tokens: 12, avg_cached_input_tokens: 2 }, trend: [] },
	};
	context.renderInsights();
	assert.ok(elements.insightsContainer.innerHTML.includes('&lt;run&gt;'), 'insight run labels should be escaped');
	assert.ok(elements.insightsContainer.innerHTML.includes('&lt;tool&gt;'), 'insight tool labels should be escaped');
	assert.ok(elements.insightsContainer.innerHTML.includes('Tool effectiveness'));
}

function testToolChartUsesAggregatedCallCounts() {
	const { context, renderedCharts } = createHarness();
	context.renderCharts([], null, [], [
		{ tool_name: 'browser_use', call_count: 27 },
		{ tool_name: 'web_search', call_count: 9 },
	], { preset: 'all', sinceMs: 0, untilMs: 0, label: 'All time' });

	assert.deepStrictEqual(
		JSON.parse(JSON.stringify(renderedCharts.value.tools)),
		[
			{ label: 'browser_use', calls: 27 },
			{ label: 'web_search', calls: 9 },
		],
		'tool chart should render each aggregated call_count instead of counting aggregate rows'
	);
}

async function run() {
	await testRequestsFiltersSortingAndEscaping();
	testToolCallsErrorsSessionsAndTracesContracts();
	testToolChartUsesAggregatedCallCounts();
	console.log('frontend_contract_suite: PASS');
}

run().catch(err => {
	console.error('frontend_contract_suite: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
