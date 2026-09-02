const assert = require('assert');
const {spawnSync} = require('child_process');
const path = require('path');
const {resolveKujoBin} = require('./_kujo_bin');
const root = path.resolve(__dirname, '..');

const result = spawnSync(resolveKujoBin(root), ['run', '--interpreter', 'tests/fixtures/telemetry_otlp_protobuf_check.kujo'], {cwd: root, encoding: 'utf8', env: process.env, timeout: 30000});
if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}`);
const payload = Buffer.from(result.stdout.trim().split(/\n/).pop(), 'base64');

function varint(buffer, offset) {
  let value = 0n, shift = 0n, index = offset;
  while (index < buffer.length) {
    const byte = buffer[index++];
    value |= BigInt(byte & 127) << shift;
    if ((byte & 128) === 0) return {value, offset: index};
    shift += 7n;
  }
  throw new Error('truncated varint');
}
function fields(buffer) {
  const values = [];
  let offset = 0;
  while (offset < buffer.length) {
    const key = varint(buffer, offset); offset = key.offset;
    const number = Number(key.value >> 3n), wire = Number(key.value & 7n);
    if (wire === 0) { const item = varint(buffer, offset); offset = item.offset; values.push({number, wire, value: item.value}); continue; }
    if (wire === 1) { values.push({number, wire, value: buffer.subarray(offset, offset + 8)}); offset += 8; continue; }
    if (wire === 2) { const size = varint(buffer, offset); offset = size.offset; const length = Number(size.value); values.push({number, wire, value: buffer.subarray(offset, offset + length)}); offset += length; continue; }
    throw new Error(`unsupported wire type ${wire}`);
  }
  return values;
}

const request = fields(payload);
assert(request.some((field) => field.number === 1 && field.wire === 2), 'missing resource_spans');
const resourceSpans = fields(request.find((field) => field.number === 1).value);
const scopeSpans = fields(resourceSpans.find((field) => field.number === 2).value);
const spanField = scopeSpans.find((field) => field.number === 2);
assert(spanField, `missing span field; request=${request.map(f=>f.number)} resource=${resourceSpans.map(f=>f.number)} scope=${scopeSpans.map(f=>f.number)}`);
const span = fields(spanField.value);
const traceField = span.find((field) => field.number === 1);
assert(traceField, `missing trace id; span fields=${span.map(f=>`${f.number}/${f.wire}`)}`);
assert.strictEqual(traceField.value.length, 16, 'trace id is not 16-byte protobuf bytes');
assert.strictEqual(span.find((field) => field.number === 2).value.length, 8, 'span id is not 8-byte protobuf bytes');
assert.strictEqual(span.find((field) => field.number === 5).value.toString(), 'chat fixture-model', 'span name lost');
assert(span.some((field) => field.number === 7 && field.wire === 1), 'start time is not fixed64');
assert(span.filter((field) => field.number === 9).length > 4, 'span attributes missing');
assert(payload.includes(Buffer.from('gen_ai.usage.input_tokens')), 'GenAI token semantics missing');
assert(payload.includes(Buffer.from('watchdog.cost.kind')), 'cost provenance missing');
console.log('telemetry_otlp_protobuf_check: PASS');
