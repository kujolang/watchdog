#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createWatchdogTelemetryClient} from '../../clients/javascript/watchdog-telemetry.mjs';

const MAX_STDIN_BYTES = 256 * 1024;
const ALLOWED_EVENTS = new Set([
	'SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
	'PostToolUseFailure', 'PermissionRequest', 'SubagentStart', 'SubagentStop',
	'Stop', 'PreCompact', 'PostModelSwitch',
]);

function boundedString(value, max = 160) {
	return typeof value === 'string' && value.length ? value.slice(0, max) : null;
}

function idHex(namespace, value, length) {
	const result = createHash('sha256').update(`${namespace}\0${value}`).digest('hex').slice(0, length);
	return /^0+$/.test(result) ? `${result.slice(0, -1)}1` : result;
}

function byteSize(value) {
	if (value === undefined) return null;
	try { return Buffer.byteLength(JSON.stringify(value)); } catch { return null; }
}

function boundedEnum(value, allowed) {
	const normalized = boundedString(value, 40)?.toLowerCase();
	return normalized && allowed.has(normalized) ? normalized : null;
}

function eventName(argv) {
	const index = argv.indexOf('--event');
	const value = index >= 0 ? argv[index + 1] : null;
	if (!ALLOWED_EVENTS.has(value)) throw new Error('Unsupported or missing --event');
	return value;
}

async function readBoundedStdin() {
	const chunks = [];
	let total = 0;
	for await (const chunk of process.stdin) {
		total += chunk.length;
		if (total > MAX_STDIN_BYTES) throw new Error('Claude hook input exceeds 256 KiB');
		chunks.push(chunk);
	}
	const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Claude hook input must be an object');
	return value;
}

function mapEvent(event, input, now = new Date()) {
	const session = boundedString(input.session_id);
	if (!session) throw new Error('Claude hook input is missing session_id');
	const observedAt = now.toISOString();
	const traceId = idHex('watchdog.claude-code.session', session, 32);
	const promptId = boundedString(input.prompt_id);
	const toolUseId = boundedString(input.tool_use_id);
	const agentId = boundedString(input.agent_id);
	const references = [{type: 'session', id: session, namespace: 'claude-code', relation: 'source'}];
	if (promptId) references.push({type: 'turn', id: promptId, namespace: 'claude-code', relation: 'source'});
	if (toolUseId) references.push({type: 'tool_call', id: toolUseId, namespace: 'claude-code', relation: 'source'});
	if (agentId) references.push({type: 'agent', id: agentId, namespace: 'claude-code', relation: 'source'});

	let kind = 'agent';
	let status = 'unset';
	if (event.includes('Tool')) kind = 'tool';
	if (event.includes('Permission')) kind = 'approval';
	if (event.includes('Compact')) kind = 'internal';
	if (event.includes('Model')) kind = 'model';
	if (event === 'PostToolUse') status = 'ok';
	if (event === 'PostToolUseFailure') status = 'error';
	if (event === 'SessionEnd' || event === 'Stop' || event === 'SubagentStop') status = 'ok';

	const durationMs = Number.isFinite(input.duration_ms) && input.duration_ms >= 0 ? Math.min(input.duration_ms, 86_400_000) : null;
	const attributes = {
		'watchdog.source.event': event,
		'gen_ai.operation.name': event.includes('Tool') ? 'execute_tool' : event.toLowerCase(),
	};
	const toolName = boundedString(input.tool_name, 120);
	if (toolName) attributes['gen_ai.tool.name'] = toolName;
	if (durationMs !== null) attributes['watchdog.duration_ms'] = durationMs;
	const inputBytes = byteSize(input.tool_input);
	const outputBytes = byteSize(input.tool_response ?? input.error);
	if (inputBytes !== null) attributes['watchdog.tool.input_bytes'] = inputBytes;
	if (outputBytes !== null) attributes['watchdog.tool.output_bytes'] = outputBytes;
	const reason = boundedString(input.reason, 80);
	if (reason) attributes['watchdog.lifecycle.reason'] = reason;
	const model = boundedString(input.model ?? input.to_model, 120);
	if (model) attributes['gen_ai.request.model'] = model;
	const sourceType = boundedString(input.source, 80);
	if (sourceType) attributes['watchdog.source.lifecycle_source'] = sourceType;
	if (agentId) attributes['watchdog.agent.type'] = boundedString(input.agent_type, 120);
	const fallbackFrom = boundedString(input.fallback_from_request_id);
	if (event === 'PostModelSwitch' && reason && fallbackFrom) {
		attributes['watchdog.fallback.dimension'] = 'model';
		attributes['watchdog.fallback.reason_code'] = boundedEnum(input.reason_code ?? input.reason, new Set(['rate_limit', 'timeout', 'transport', 'provider_error', 'invalid_response', 'capacity', 'policy', 'operator', 'quality', 'unknown'])) || 'unknown';
		const fromModel = boundedString(input.from_model, 120);
		const toModel = boundedString(input.to_model ?? input.model, 120);
		if (fromModel) attributes['watchdog.fallback.from_model'] = fromModel;
		if (toModel) attributes['watchdog.fallback.to_model'] = toModel;
		references.push({type: 'request', id: fallbackFrom, namespace: 'claude-code', relation: 'fallback_from'});
	}
	const recoveryOutcome = boundedEnum(input.recovery_outcome, new Set(['succeeded', 'failed', 'partial', 'unknown']));
	const recoveredRequest = boundedString(input.recovered_request_id);
	if (recoveryOutcome && recoveredRequest) {
		attributes['watchdog.recovery.outcome'] = recoveryOutcome;
		references.push({type: 'request', id: recoveredRequest, namespace: 'claude-code', relation: 'recovers'});
	}

	const isTerminal = event === 'Stop' || event === 'SessionEnd';
	if (isTerminal) {
		attributes['watchdog.outcome.terminal'] = true;
		attributes['watchdog.outcome.code'] = 'success';
	}
	const isCompletedTool = event === 'PostToolUse' || event === 'PostToolUseFailure';
	const spanId = isCompletedTool && toolUseId ? idHex('watchdog.claude-code.tool', toolUseId, 16) : null;
	const stableEventSource = boundedString(input.hook_event_id) || [session, event, promptId || '', toolUseId || '', agentId || '', boundedString(input.timestamp, 80) || '', model || '', reason || ''].join('\0');
	const stableEventId = idHex('watchdog.claude-code.event', stableEventSource, 32);
	const source = {
		'watchdog.semantic_profile': 'watchdog.observability.v1',
		'application.name': boundedString(input.application_name, 80) || 'claude-code',
		'harness.name': 'claude-code',
		'instrumentation.name': 'watchdog.claude-code-hooks',
		'instrumentation.version': '1.1.0',
		adapter_id: 'watchdog.claude-code-hooks', adapter_version: '1.1.0', original_schema: 'claude-code.hook-input', source_event_id: stableEventId,
	};
	const applicationVersion = boundedString(input.application_version ?? input.version, 40);
	if (applicationVersion) source['application.version'] = applicationVersion;
	return {
		record_id: `claude-code:${event}:${stableEventId}`,
		record_type: isCompletedTool ? 'span' : 'event', trace_id: traceId, span_id: spanId, parent_span_id: null,
		observed_at: observedAt,
		started_at: durationMs !== null ? new Date(now.getTime() - durationMs).toISOString() : null,
		ended_at: isCompletedTool ? observedAt : null,
		kind, name: recoveryOutcome && recoveredRequest ? 'watchdog.operation.recovered' : (isTerminal ? 'watchdog.operation.completed' : `claude_code.${event}`), status,
		source,
		references, attributes, usage: null, costs: [],
		error: event === 'PostToolUseFailure' ? {class: null, category: 'tool', code: null, retryable: null, message: null} : null,
		content: [], privacy: {content_mode: 'off', policy_version: 'watchdog.privacy.v1', transformations: ['claude_hook_content_dropped']},
	};
}

export function createClaudeHookBatch(event, input, now = new Date()) {
	const record = mapEvent(event, input, now);
	return {
		schema_version: 'watchdog.telemetry.v2', batch_id: `claude-code:${record.record_id}`, sent_at: now.toISOString(),
		producer: {name: 'claude-code', version: boundedString(input.version, 40) || 'unknown', adapter_id: 'watchdog.claude-code-hooks', adapter_version: '1.1.0', original_schema: 'claude-code.hook-input'},
		records: [record],
	};
}

async function main() {
	try {
		const event = eventName(process.argv.slice(2));
		const input = await readBoundedStdin();
		if (boundedString(input.hook_event_name) !== event) throw new Error('Hook event does not match --event');
		const client = createWatchdogTelemetryClient({
			baseUrl: process.env.WATCHDOG_TELEMETRY_URL || 'http://127.0.0.1:7700',
			token: process.env.WATCHDOG_TELEMETRY_TOKEN || '', timeoutMs: Number(process.env.WATCHDOG_TELEMETRY_TIMEOUT_MS || 750),
			spoolDirectory: process.env.WATCHDOG_TELEMETRY_SPOOL || join(homedir(), '.local', 'state', 'watchdog', 'claude-code-spool'),
		});
		await client.submit(createClaudeHookBatch(event, input));
	} catch (error) {
		if (process.env.WATCHDOG_TELEMETRY_DEBUG === '1') process.stderr.write(`watchdog telemetry: ${String(error).slice(0, 500)}\n`);
	}
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
