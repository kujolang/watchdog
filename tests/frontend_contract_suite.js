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
	script = script.replace(/initializeRangeFilter\(\);\s*loadAll\(\);\s*\/\/ Refresh data in the background[^\n]*\s*setInterval\(\(\) => loadAll\(\{ background: true \}\), 30_000\);/m, '');
	return script;
}

function createHarness() {
	const htmlPath = path.join(__dirname, '..', 'dashboard.html');
	const source = fs.readFileSync(htmlPath, 'utf8');
	const script = extractDashboardScript(source);

	const elements = {};
	const renderedCharts = { value: null, count: 0 };
	const requiredIds = [
		'globalRangePreset', 'globalRangeCustomFields', 'globalRangeStartField', 'globalRangeEndField', 'globalRangeStart', 'globalRangeEnd',
		'reqSearch', 'reqTenantFilter', 'reqProjectFilter', 'reqStatusFilter', 'reqProviderFilter', 'reqBody', 'reqEmpty',
		'tcSearch', 'tcStatusFilter', 'tcBody', 'tcEmpty',
		'traceContainer', 'errorGrid', 'sessBody', 'sessEmpty', 'insightsContainer',
		'badgeTraces', 'detailDialog', 'detailTitle', 'detailBody', 'statRequestsSub',
		'backupDir', 'backupInterval', 'backupRetention', 'backupEnabled', 'backupEncryption', 'backupEncryptionHelp',
		'backupScheduleSummary', 'badgeBackups', 'backupActiveTabCount', 'backupArchivedTabCount',
		'backupActiveBody', 'backupActiveEmpty', 'backupArchivedBody', 'backupArchivedEmpty',
		'backupActivePanel', 'backupArchivedPanel', 'backupActiveTabButton', 'backupArchivedTabButton', 'backupStatus',
	];

	requiredIds.forEach(id => {
		const defaults = (id === 'reqEmpty' || id === 'tcEmpty' || id === 'sessEmpty' || id === 'backupActiveEmpty' || id === 'backupArchivedEmpty' || id === 'backupArchivedPanel') ? ['hidden'] : [];
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
		confirm() {
			return true;
		},
		navigator: {
			clipboard: {
				async writeText(text) {
					contextClipboard.value = text;
				},
			},
		},
		fetch: async () => ({
			ok: true,
			status: 200,
			async text() {
				return JSON.stringify({ data: [] });
			},
		}),
		WatchdogDitherCharts: {
			renderCharts(data) {
				renderedCharts.value = data;
				renderedCharts.count += 1;
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

	context.state.rangePreset = '24h';
	context.initializeRangeFilter();
	assert.strictEqual(elements.globalRangePreset.value, '24h', 'default range should be Last 24 hours');

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
	const scalarField = elements.detailBody.children.find(field => field.children[0].textContent === 'provider');
	const scalarCodeBlock = scalarField.children[1].children[0].children[0];
	assert.strictEqual(scalarCodeBlock.children.length, 1, 'scalar detail values should not render copy buttons');
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
			input_tokens: 7,
			output_tokens: 3,
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
	context.showRecordDetails('sessions', 0);
	assert.strictEqual(elements.detailTitle.textContent, 'Session details');
	assert.ok(elements.detailBody.children.find(field => field.children[0].textContent === 'input tokens'), 'session details should include input token totals');
	assert.ok(elements.detailBody.children.find(field => field.children[0].textContent === 'output tokens'), 'session details should include output token totals');

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

function testStatCardSparklinesUseMetricTrends() {
	const { context, renderedCharts } = createHarness();
	const day = 24 * 60 * 60 * 1000;
	const range = { preset: '7d', sinceMs: 10 * day, untilMs: 17 * day, label: 'Last 7 days' };
	context.renderCharts([], null, [], [], range, {
		request_metrics: [
			{ bucket_start_ms: 10 * day, bucket_size_ms: day, total_requests: 4, total_cost_usd: 0.04, avg_latency_ms: 120, total_errors: 1, total_tokens: 800, total_sessions: 2 },
			{ bucket_start_ms: 16 * day, bucket_size_ms: day, total_requests: 2, total_cost_usd: 0.03, avg_latency_ms: 240, total_errors: 0, total_tokens: 500, total_sessions: 1 },
		],
		tool_metrics: [{ bucket_start_ms: 10 * day, bucket_size_ms: day, total_tool_calls: 7 }],
		trace_span_metrics: [{ bucket_start_ms: 16 * day, bucket_size_ms: day, total_trace_spans: 9 }],
	});

	const sparklines = JSON.parse(JSON.stringify(renderedCharts.value.statSparklines));
	assert.deepStrictEqual(sparklines.requests, [4, 0, 0, 0, 0, 0, 2]);
	assert.deepStrictEqual(sparklines.cost, [0.04, 0, 0, 0, 0, 0, 0.03]);
	assert.deepStrictEqual(sparklines.latency, [120, 0, 0, 0, 0, 0, 240]);
	assert.deepStrictEqual(sparklines.errors, [25, 0, 0, 0, 0, 0, 0]);
	assert.deepStrictEqual(sparklines.tokens, [800, 0, 0, 0, 0, 0, 500]);
	assert.deepStrictEqual(sparklines.sessions, [2, 0, 0, 0, 0, 0, 1]);
	assert.deepStrictEqual(sparklines.tools, [7, 0, 0, 0, 0, 0, 0]);
	assert.deepStrictEqual(sparklines.traces, [0, 0, 0, 0, 0, 0, 9]);
}

function testBackgroundRefreshPreservesInteractiveView() {
	const { context, elements, renderedCharts } = createHarness();
	context.state.visibleRows.traces = [{ trace_id: 'trace-stays-open' }];
	elements['trace-0'] = makeElement('trace-0');
	elements['trace-0'].style.display = 'flex';
	elements['trace-toggle-0'] = makeElement('trace-toggle-0');

	const view = context.captureDashboardView();
	elements['trace-0'].style.display = 'none';
	context.restoreDashboardView(view);
	assert.strictEqual(elements['trace-0'].style.display, 'flex', 'background refresh should restore an expanded trace');
	assert.ok(elements['trace-toggle-0'].innerHTML.includes('<svg'), 'restored trace should keep its expanded chevron');

	const range = { preset: 'all', sinceMs: 0, untilMs: 0, label: 'All time' };
	context.renderCharts([], null, [], [], range, null);
	context.renderCharts([], null, [], [], range, null);
	assert.strictEqual(renderedCharts.count, 1, 'unchanged chart data should not repaint and flash');

	const source = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');
	assert.ok(source.includes("setInterval(() => loadAll({ background: true }), 30_000)"), 'automatic refresh should use non-disruptive background mode');
	assert.ok(source.includes('class="range-select-shell"'), 'date range should use the custom site select shell');
	assert.ok(source.includes('href="https://github.com/kujolang/watchdog"'), 'footer should link to the Watchdog repository');
	assert.ok(source.includes('class="footer-mark"'), 'footer should include the Kujo SVG mark');
	assert.ok(source.includes('viewBox="0 0 1527 1536"'), 'footer should use the canonical Kujo logomark viewBox');
	assert.ok(source.includes('M178 234 L593 234 L593 700'), 'footer should use the canonical Kujo logomark geometry');
}

async function testApiResponsesAreValidatedAndOptionalStatusDegradesGracefully() {
	const { context } = createHarness();
	context.fetch = async () => ({
		ok: false,
		status: 404,
		async text() {
			return 'Not Found';
		},
	});

	await assert.rejects(
		context.fetchJSON('/api/missing'),
		error => error.status === 404 && error.message.includes('non-JSON response: Not Found'),
		'non-JSON API errors should produce a clear HTTP-aware error',
	);

	const fallback = { unavailable: true, configured_profiles: 0, deliveries: [] };
	const status = await context.fetchOptionalJSON('/api/telemetry/v2/export-status', fallback);
	assert.deepStrictEqual(JSON.parse(JSON.stringify(status)), fallback, 'a missing optional exporter endpoint should not block core telemetry');
}

function testBackupPanelsReflectActiveAndArchivedFiles() {
	const { context, elements } = createHarness();
	context.state.backups = {
		settings: { backup_dir: '/tmp/backups', interval_minutes: 1440, retention_count: 30, enabled: true, encryption_enabled: false },
		encryption_key_configured: true,
		last_success_at_ms: 1700000000000,
		next_due_at_ms: 1700003600000,
		active_runs: [
			{ id: 7, trigger_type: 'manual', encrypted: 1, size_bytes: 2048, backup_path: '/tmp/backups/watchdog-7.db.enc', started_at_ms: 1700000000000, backup_exists: true, status: 'success' },
			{ id: 0, trigger_type: 'folder', encrypted: 1, size_bytes: 1024, backup_path: '/tmp/backups/watchdog-backup-20260722T174540179Z-a71e15.db.enc', started_at_ms: 0, started_label: '2026-07-22 17:45:40 UTC', backup_exists: true, status: 'success', discovered_from_folder: true },
		],
		archived_runs: [
			{ id: 6, trigger_type: 'scheduled', encrypted: 0, size_bytes: 1024, backup_path: '/tmp/backups/watchdog-6.db', started_at_ms: 1699990000000, backup_exists: false, status: 'success', error_message: '' },
			{ id: 5, trigger_type: 'manual', encrypted: 0, size_bytes: 0, backup_path: '', started_at_ms: 1699980000000, backup_exists: false, status: 'failed', error_message: 'OpenSSL failed' },
		],
	};

	context.renderBackups(true);
	assert.ok(elements.backupActiveBody.innerHTML.includes('data-backup-run-id="7"'), 'tracked active backups should expose a delete action');
	assert.ok(elements.backupActiveBody.innerHTML.includes('data-backup-path="/tmp/backups/watchdog-backup-20260722T174540179Z-a71e15.db.enc"'), 'folder-only backups should expose a delete path');
	assert.ok(elements.backupActiveBody.innerHTML.includes('folder scan'), 'folder-only backups should be labeled as discovered from the folder');
	assert.ok(elements.backupActiveBody.innerHTML.includes('2026-07-22 17:45:40 UTC'), 'folder-only backups should expose a readable derived timestamp');
	assert.ok(elements.backupActiveBody.innerHTML.includes('/tmp/backups/watchdog-7.db.enc'));
	assert.ok(elements.backupArchivedBody.innerHTML.includes('Missing from folder'), 'archived backups should call out files removed from the folder');
	assert.ok(elements.backupArchivedBody.innerHTML.includes('OpenSSL failed'), 'archived failures should keep their recorded error');
	assert.strictEqual(elements.badgeBackups.textContent, 2, 'backup badge should reflect active files only');
	assert.strictEqual(elements.backupActiveTabCount.textContent, 2);
	assert.strictEqual(elements.backupArchivedTabCount.textContent, 2);

	context.switchBackupHistoryTab('archived');
	assert.strictEqual(elements.backupArchivedPanel.classList.contains('hidden'), false, 'archived panel should become visible');
	assert.strictEqual(elements.backupActivePanel.classList.contains('hidden'), true, 'active panel should be hidden when archived is selected');
	assert.strictEqual(elements.backupArchivedTabButton.classList.contains('active'), true, 'archived tab should become active');
}

async function run() {
	await testRequestsFiltersSortingAndEscaping();
	testToolCallsErrorsSessionsAndTracesContracts();
	testToolChartUsesAggregatedCallCounts();
	testStatCardSparklinesUseMetricTrends();
	testBackgroundRefreshPreservesInteractiveView();
	await testApiResponsesAreValidatedAndOptionalStatusDegradesGracefully();
	testBackupPanelsReflectActiveAndArchivedFiles();
	console.log('frontend_contract_suite: PASS');
}

run().catch(err => {
	console.error('frontend_contract_suite: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
