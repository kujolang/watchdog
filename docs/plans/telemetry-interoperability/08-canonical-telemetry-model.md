# Canonical telemetry model

The durable contract is `watchdog.telemetry.v2`; the machine proposal is [TELEMETRY_SCHEMA_PROPOSAL.json](TELEMETRY_SCHEMA_PROPOSAL.json). It is deliberately smaller than OTel and OpenInference.

## Record types

| Type | Purpose | Examples |
|---|---|---|
| `trace` | root/group metadata and final rollup reference | chat turn, agent run fragment, workflow execution |
| `span` | timed operation with parentage | model, agent, tool, retrieval, workflow, handoff, approval wait, execution, persistence, evaluation |
| `event` | point-in-time fact attached to trace/span | stream first byte, retry, approval decision, artifact produced, score observed, error detail |

Kinds are a constrained semantic enum on spans, not separate database tables: `model`, `agent`, `tool`, `retrieval`, `workflow`, `handoff`, `approval`, `execution`, `persistence`, `evaluation`, `internal`. A model response and stream are not independent top-level event types: one model span contains request/response metadata, optional stream timing events, usage, and finish/error state.

## Common envelope

- `schema_version`, `record_id`, `record_type`
- `trace_id`, optional `span_id`/`parent_span_id`
- normalized `observed_at` and operation start/end timestamps
- `source`: producer, adapter ID/version, original schema, provider/framework/host, bounded source IDs
- `references`: typed `{type,id,relation}` for session/run/turn/workflow/task/agent/tool-call/request/artifact/eval
- `attributes`: bounded metadata-only scalar/list map
- `content`: separately classified blocks, absent by default
- `privacy`: effective capture mode, transformations, policy version

## Usage

Keep normalized fields nullable: `input_tokens`, `output_tokens`, `total_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `reasoning_tokens`. Never infer zero from absence. Preserve a bounded `provider_usage` object plus `usage_source` so distinctions survive.

Provider examples prove flattening is unsafe:

- OpenAI reports prompt/completion totals plus cached, reasoning, audio, and prediction-token details.
- Anthropic reports input/output plus cache creation and cache read.
- Gemini’s prompt count includes cached effective prompt, while it separately reports cached content, candidates, thoughts, tools, and modalities.
- Bedrock Converse says `inputTokens` can exclude cache read/write and provides both separately.

Normalized totals are copied only when their semantics match. Otherwise retain the provider total and document `total_semantics`.

## Cost

`costs` is an array of observations:

- `provider_reported`: amount asserted by provider/account API.
- `catalog_estimated`: model/rate catalog calculation with catalog version and rates.
- `subscription_value_estimate`: comparison/value estimate, never billed cost.
- `unknown`: explicit absence when a consumer needs state.

Each observation includes currency, amount, source, calculated time, and optional token/rate components. Export mappings label estimates; they must never populate a destination’s billed-cost field unless that field supports provenance.

## Content

Content blocks are typed (`prompt`, `response`, `tool_input`, `tool_output`, `retrieval_document`, `shell_input`, `shell_output`, `artifact`, `error_detail`), media-typed, size bounded, and carry capture decision. Metadata-only summaries are attributes only if non-reversible and policy-approved. No adapter can set an effective mode above the gateway configuration.

## Error

An operation has status `unset|ok|error|cancelled|timeout|denied`. Optional error fields are class/category/code/retryable and a bounded redacted message. Stack traces, provider bodies, tool output, and shell stderr are `error_detail` content and therefore opt-in.

## Artifacts and evaluations

Artifacts are references plus an `artifact.produced` event containing type, safe name/hash, size, and external URI only if allowed. Eval results become an `evaluation` span for executed evaluation work or `evaluation.score` event for an externally produced score. Full datasets/results stay in Eval or referenced artifact storage.

