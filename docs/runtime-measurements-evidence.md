# Runtime measurement integration validation — 2026-09-26

Unreleased source integration; no runtime summary version change.

Starting main: Watchdog `4e07223fdff6195ab03fb03658b9f0edd99db580`,
RunLedger `e0187ea353a912247eca455e984f27893e270fd0`, Kujo
`5d72aab4b99e7f8c01e4c208d6c97061934c7447` (all fetched, clean and equal
to origin/main). Dispatch `73e7a87` was verified and unchanged.

Release runtime: default features, locked dependencies, opt-level 3, thin LTO,
one codegen unit, rustc 1.96.0, macOS 26.6.2 x86_64. Candidate executable SHA-256:
`4ef726d0020b6df0be78da4b7e96a79d099d414efa83874676038da501a72a93`.

Commands and results:

- `KUJO_BIN=<release candidate> node tests/runtime_measurements_adapter_check.js
  --integration`: PASS, 76 input cases plus observation limits/conflicts,
  provenance and duplicate checks. The workload moves a private-looking canary
  through a closure capture, generator and async result. Actual observed counters
  include one capture cell, one generator state and one admitted task.
- Same command without `--integration`: PASS as part of the full suite.
- `KUJO_BIN=<release candidate>` with `for f in tests/*.js; do node "$f" || exit 1;
  done`: PASS, all 67 JavaScript entrypoints (includes the binary helper).
- `KUJO=<release candidate> bash tests/run.sh` in RunLedger: PASS, 81 module checks,
  existing CLI/concurrency coverage and new artifact-reference regression.

The public `/telemetry/v2/batches` path receives the real normalized report,
acknowledges an identical retry as deduplicated, then the server exits. A new
server process loads the same database; API retrieval returns one execution
record, the exact digest, unchanged numeric fields and null usage/empty costs.
Separate RunLedger CLI processes create a receipt, correlate that exact canonical
trace, attach the same artifact twice, and read one note with null usage/cost.
Caller timestamps bracket the real runtime process; the adapter does not derive
them from runtime elapsed time.

One recorded proof artifact has digest
`sha256:04f0df0bbf037b0b9f84e2518b4ad939328d91ba8db9506cd1ac85d98ca72439`,
1231 bytes, `wall_ns=9972825`, `cpu_seconds=0.011219`. Its receipt is
`2026-09-27-unavailable-wave-a-fixture-001` (UTC date), and canonical trace
`66acf206f387a0490b977825fb3727ac`. This is fixture evidence, not a performance
claim. Raw report, batch, repository/API records and receipt are retained under
Kujo `benchmarks/results/wave-a-release-2026-09-26/integration/`.

Review covered cardinality, privacy, null semantics, byte identity, caller-owned
context, symlink/path bounds, replay deduplication, scope and unit confusion.
No provider pricing or workflow/control state was introduced.

Two pre-existing boundaries remain explicit:

- The dev-profile runtime can overflow an interpreter HTTP worker stack on this
  host. The unchanged existing API suite reproduced it using the pre-measurement
  runtime; a 16 MiB debug worker-stack setting passed the new fixture. The release
  candidate passed without an override. This patch does not change stack policy.
- The full suite's existing proxy benchmark reports latency budgets as advisory
  (nonstream/stream latency flags were false); no thresholds or strictness flags
  were changed. Those proxy transport results are not the Kujo instrumentation
  campaign, and passing the canonical gate is not a claim those budgets passed.

The CI full-regression job additionally checks out pinned RunLedger source and
runs the real HTTP/restart/receipt fixture. The importer remains a library adapter;
it does not expose an unauthenticated server file-reader endpoint.
