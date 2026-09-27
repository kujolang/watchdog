# Kujo runtime summary adapter (unreleased)

`src/runtime_measurements_adapter.kujo` enriches a **caller-owned, completed native
execution observation**, before native normalization and canonical intake. It
adds no event envelope, lifecycle state, provider attribution, cost calculation,
network delivery or workflow authority.

```kujo
from runtime_measurements_adapter import watchdog_runtime_measurements_attach
from telemetry_native_adapter import watchdog_native_batch_normalize

# Caller obtains this digest independently from the artifact producer/store.
# root is trusted configuration; relative_file is confined beneath it.
attached := watchdog_runtime_measurements_attach(root, relative_file, expected_artifact, observation)
assert(attached["ok"], attached["error"])
batch := watchdog_native_batch_normalize(producer, producer_version, batch_id, [attached["event"]])
# Send batch["batch"] through existing /telemetry/v2/batches intake and its
# authentication, privacy, size and retention controls. Retry identical bytes.
```

The in-memory equivalent is `watchdog_runtime_measurements_attach_bytes(raw,
expected_artifact, observation)`. Both return `{ok, error, event}`. Errors are a
fixed message with no input excerpts, file paths, parser detail or dynamic labels.
The adapter never logs. Neither helper automatically sends or persists anything.
See `tests/runtime_measurements_adapter_check.js --integration` for a complete
executable producer -> HTTP intake -> restart -> RunLedger example.

## Validation and identity

The exact UTF-8 report is limited to **8192 bytes**, before parsing. File reads
use `read_file_beneath`: no absolute/traversing paths, symlink components,
non-regular files, oversized reads or invalid UTF-8. The configured root itself
must be trusted. Inputs do not select a server filesystem root or remote URL.
Requires a source Kujo runtime with bounded filesystem and measurement support;
released npm/native 1.5.0 does not contain `--measurements`.

`expected_artifact` must exactly equal `sha256:` plus lowercase SHA-256 of the
bytes read. The adapter recomputes it; a producer-supplied digest is not trusted
without comparison. The reference is content identity, **not proof of execution,
authenticity or truthful counters**. A trusted caller/store must bind a report
to its execution. Concurrent file replacement cannot split the hashed and parsed
snapshot: both use the same bounded read result. Later reads must verify again.
Artifact retention and authorization belong to the caller's artifact store.
Watchdog retains a reference, not a copy or path.

The adapter checks all required `kujo.runtime-measurements/v1` fields, constants,
enums, bounds and counter names. Units are encoded in fixed field names (`_ns`,
`_bytes`, `cpu_seconds`); alternate units do not substitute for required fields.
The v1 schema is extensible: additional top-level properties and numeric counters
within its limits are accepted but **never projected**, including their names.
Unsupported-label strings and runtime-version strings are validated but omitted
from telemetry. This avoids turning extensions into arbitrary payload labels.

For interoperable exactness, integer measurements must be in `[0, 2^53-1]` and
parsed as integers, not floating representations. CPU seconds must be a finite,
nonnegative number no greater than `2^53-1`, or null. RSS is a nonnegative exact
integer or null. This consumer profile intentionally rejects larger valid core
u64 values instead of rounding them. CPU seconds is a binary float; JSON parsing
and serialization may differ by a final floating-point bit (tests allow two
relative machine epsilons). Integer counters remain exact and the digest always
addresses original bytes. This does not change the core schema.

## Mapping and caller context

| Source | Existing native observation destination |
| --- | --- |
| Exact-byte digest | `references[]`: type `artifact`, namespace `kujo.runtime-measurements/v1`, relation `evidence`, id `sha256:<hex>` |
| wall_ns, cpu_seconds, process_peak_rss_bytes | Same names under fixed `kujo.runtime.` attribute prefix |
| 30 required counters | Same fixed names under `kujo.runtime.` prefix |
| All other report fields/extensions | Validated where required, never copied |
| Provider/model/token/cost | No report mapping; caller's existing usage/cost remain unchanged |

Caller must supply native schema, execution kind, nonempty event/trace/span IDs,
and nonnegative start/end milliseconds with end >= start. The adapter does not
invent identity, derive timestamps from elapsed time, change status, or emit
another execution. The same reference can be attached again without duplication;
a conflicting measurement/reference is rejected. One execution observation can
carry one runtime report; multiple processes need separate caller observations.
The reserved `kujo.runtime.` prefix cannot be overwritten with conflicting data.
Native limits remain 24 references and 128 scalar attributes (one slot is
reserved for native normalization). Overflows reject rather than truncate.
Caller context must itself satisfy existing native/privacy contracts; this helper
minimizes runtime-report data, not arbitrary caller metadata.

Native normalization -> canonical repository/intake retains existing identity
conflict and dedup semantics. Persist/retry the **same normalized batch**; calling
normalization again changes observation time and is not an identical replay.

## Measurement meaning

- Wall time is collector wall duration, not CPU, start/end timestamps or the whole
  CLI lifetime. Process CPU includes threads; peak RSS is process-lifetime peak.
- VM and JIT timings are inclusive and may overlap. Do not sum into total CPU.
- Task queue wall times may overlap. Promise polls are not unique promises or
  completions. Detached work is a prefix observed before exit; no added join.
- Capture cells and shallow bytes are cumulative creations, not retained heap.
  Generator shallow storage excludes buffers/graphs; drops minus creations is
  not a leak detector. JIT entries include failed/nested compilation attempts.
- `null` CPU/RSS stays null. Model usage is absent unless the caller supplies it.
  Missing usage remains null and absent costs remain an empty list. Externally
  supplied estimated/reported/unknown provenance is retained, never relabeled as
  observed. Agents SDK's budget-interface zero defaults are not measurements;
  adapters must supply unavailable provenance rather than infer observed zero.

## Receipt handoff and validation

RunLedger `runtime-measurement` verifies the same byte identity and adds a fixed
structured note; `correlate` links its receipt with the canonical trace and
caller execution ID. It does not duplicate counters or change receipt status.
See RunLedger `docs/RUNTIME_MEASUREMENTS.md` for receipt limitations.

```sh
KUJO_BIN=/path/to/source/kujo node tests/runtime_measurements_adapter_check.js
KUJO_BIN=/path/to/source/kujo RUNLEDGER_REPO=/path/to/runledger \
  node tests/runtime_measurements_adapter_check.js --integration
```

The integration fixture executes a real sensitive-looking Kujo workload, validates
its summary, normalizes and stores it through the production repository, sends
it to the actual HTTP intake, restarts Watchdog, reads persisted telemetry, then
attaches/correlates it through separate RunLedger CLI processes. Input negatives,
content privacy, unavailable values, attribute/reference limits and duplicate
attachment are asserted. `WAVE_A_EVIDENCE_DIR` optionally retains report, batch,
stored/API records and receipt. This is test evidence, not a production exporter.
