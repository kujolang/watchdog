# Shared native telemetry client

`clients/javascript/watchdog-telemetry.mjs` is the reference producer client for JavaScript hosts and adapters. It submits `watchdog.telemetry.v2` batches to `/telemetry/v2/batches` and provides a bounded atomic local spool when Watchdog is unavailable.

The client is deliberately not an instrumentation SDK. Producers own lifecycle hooks and map them through the versioned ingestion-adapter contract. The client owns only endpoint validation, timeout, authenticated delivery, metadata-only enforcement, private spool files, replay, and byte/file/age bounds.

Content is removed before network or disk by default. Tokens/credentials are held only in memory and never written to the spool. Spool directories are mode `0700`; batch files are atomically published with mode `0600`. Oldest files are removed when configured bounds are exceeded.

HTTP is allowed only to explicit loopback; remote endpoints require HTTPS. Redirects are not followed. Retryable network, timeout, `408`, `429`, `5xx`, and authentication failures remain spooled. Permanent malformed-request failures are dropped because replay cannot repair them; Watchdog's local audit and producer diagnostics should surface the rejection.

This reference implementation is suitable for Pi and JavaScript host adapters. Kujo-native systems should implement the same fixtures and wire contract rather than shelling out to JavaScript or injecting telemetry into model context.
