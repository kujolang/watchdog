# Watchdog JSONL v2

`GET /telemetry/v2/jsonl` exports one policy-approved canonical record per line in ascending ingest order. This is the portable, replayable export contract; the existing `/api/export?format=jsonl` route remains the explicit v1 table-export compatibility surface.

Each line contains `jsonl_version`, `schema_version`, export timestamp, original producer namespace, record ID, monotonic local ingest sequence, and the canonical record. The response includes a signed opaque resume cursor, line count, body SHA-256, and a base64-encoded manifest in headers. Cursors select records after the last returned sequence and are not authorization tokens.

`POST /telemetry/v2/jsonl/replay` accepts at most 100 v2 lines within the configured parse-body limit. Replay reapplies current Watchdog privacy policy, validates the canonical contract, and preserves producer/record identity. Exact line replay is idempotent. An older export cannot restore content that policy removed before export.

Configuration:

- `WDG_JSONL_CURSOR_SECRET` signs resume cursors. In token-auth mode the API token is the default signing secret. Local unauthenticated mode uses a local interoperability default; operators who persist cursors across deployments should configure a stable secret.
- `WDG_MAX_PARSE_BODY_BYTES` bounds replay input.

The cursor and manifest describe an API response, not an atomic filesystem snapshot. Rows committed after a response are available on the next cursor request. The monotonic sequence prevents offset drift under concurrent ingestion.
