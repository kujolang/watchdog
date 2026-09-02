# Proxy streaming transport status

## Current decision

Kujo main now exposes bounded incremental generic HTTP response pass-through,
stream lifecycle callbacks, and downstream-disconnect reporting. Watchdog uses
that source capability for OpenAI-compatible streaming chat responses and
records the first meaningful content delta rather than the first byte, SSE
comment, or heartbeat. Published Kujo 1.2.3 binaries predate this addition, so
production deployment requires a later release artifact containing the runtime
change or an explicitly pinned source build.

## Capability evidence

The Kujo runtime change adds `options.response_stream=true` to generic
`http_request`. Response headers return before the body is read; the routed
server pulls at most 16 KiB per read, forwards without assembling the complete
body, and emits bounded `headers`, `chunk`, `complete`, `error`, and `cancelled`
events. Hop-by-hop headers are not forwarded. The existing destination policy,
DNS pinning, redirect, timeout, capability, and maximum-response-byte controls
remain enforced.

`tests/proxy_stream_timing_suite.js` uses a delayed SSE stub to prove the
Watchdog client receives bytes before the upstream response completes, ignores
the earlier heartbeat for first-output timing, and persists canonical timing
plus a `watchdog.output.first` lifecycle event.

## Remaining release dependency

The source dependency is implemented. Before production promotion, publish and
pin a Kujo runtime release containing it, run the cross-repository streaming and
disconnect suites against that artifact, and repeat strict latency/memory
qualification on an otherwise quiet reference machine. Watchdog continues to
leave timing null for non-streaming responses and for any producer path that
does not expose observable first output.
