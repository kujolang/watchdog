# Proxy streaming timing limitation

## Decision

Proxy-native time to first output and client-disconnect attribution are blocked
by the current Kujo HTTP transport. Watchdog records buffered SSE responses as
`watchdog.response.streamed=true`, sets
`watchdog.timing.source=unavailable_buffered_transport`, and stores null for
first-output latency, generation duration, and throughput. It does not derive
those values while parsing an already-buffered SSE body.

## Capability evidence

The installed validation runtime reports Kujo 1.0.0. The current Kujo source
implements `http_request` with the blocking reqwest client, calls
`read_http_response_bytes_bounded`, and only constructs the result dictionary
after the body is fully read. `network_policy::read_http_response_bytes_bounded`
uses `read_to_end`. The separate `ai_stream_chat` callback replays parsed chunks
for the AI helper contract and is not a transparent arbitrary HTTP response
stream suitable for `/proxy/v1/*` pass-through. The experimental
`http_get_stream` implementation also says it fetches the entire response.

`tests/proxy_stream_timing_suite.js` uses a delayed SSE stub to prove the direct
client sees an early chunk while the Watchdog client receives no response bytes
until the upstream stream ends. The suite also verifies that canonical proxy
timing fields remain null with the explicit buffered-transport reason.

## Required runtime dependency

Kujo must expose incremental response headers and body chunks for
`http_request`, bounded backpressure, and client-disconnect/cancellation state.
After that dependency exists, Watchdog can add pass-through forwarding with no
more than one chunk of buffering and can run meaningful-content, partial-stream,
slow-client, and cancellation timing tests. This repository does not edit the
Kujo runtime or claim those metrics before that capability is available.
