import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createClaudeHookBatch} from '../adapters/claude-code/watchdog-claude-hook.mjs';

const now = new Date('2026-09-01T12:00:00.000Z');
const secret = 'never-store-this-command-or-output';
const input = {
	session_id: 'session-1', prompt_id: 'prompt-1', hook_event_name: 'PostToolUse',
	tool_name: 'Bash', tool_use_id: 'toolu_1', duration_ms: 12,
	transcript_path: '/secret/repo/transcript.jsonl', cwd: '/secret/repo',
	tool_input: {command: secret}, tool_response: {stdout: secret, success: true},
};
const batch = createClaudeHookBatch('PostToolUse', input, now);
const record = batch.records[0];
assert.equal(record.record_type, 'span');
assert.equal(record.kind, 'tool');
assert.equal(record.status, 'ok');
assert.equal(record.references.find((item) => item.type === 'session').id, 'session-1');
assert.equal(record.references.find((item) => item.type === 'tool_call').id, 'toolu_1');
assert.equal(record.attributes['watchdog.tool.input_bytes'] > 0, true);
assert.equal(record.attributes['watchdog.tool.output_bytes'] > 0, true);
assert.equal(JSON.stringify(batch).includes(secret), false);
assert.equal(JSON.stringify(batch).includes('/secret/repo'), false);
assert.deepEqual(record.content, []);
assert.equal(record.privacy.content_mode, 'off');

const failure = createClaudeHookBatch('PostToolUseFailure', {...input, hook_event_name: 'PostToolUseFailure', error: secret}, now);
assert.equal(JSON.stringify(failure).includes(secret), false);
assert.equal(failure.records[0].status, 'error');

const mismatch = spawnSync(process.execPath, ['adapters/claude-code/watchdog-claude-hook.mjs', '--event', 'SessionStart'], {
	cwd: new URL('..', import.meta.url), input: JSON.stringify({...input, hook_event_name: 'Stop'}), encoding: 'utf8',
	env: {...process.env, WATCHDOG_TELEMETRY_DEBUG: '1'},
});
assert.equal(mismatch.status, 0, 'telemetry hook must never block the host');
assert.match(mismatch.stderr, /does not match/);
console.log('claude code adapter suite passed');
