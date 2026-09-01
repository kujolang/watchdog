# Target architecture

## Components

```text
proxy decoders   v1 translator   native adapters   guarded OTLP receiver
      \              |                |                    /
       +--------- admission + protocol validation --------+
                               |
                         normalizer registry
             IDs | clocks | semantics | usage | errors | refs
                               |
                    central privacy/content policy
                               |
                    canonical record repository
                  /             |                \
       compatibility views   query/dashboard   export journal
                                                   |
                                    independent profile workers
                                    /        |             \
                                JSONL      OTLP base     OTLP AI profiles
```

### Core modules

1. **Admission:** auth, tenant/source policy, compressed/decompressed body limits, rate limits, schema version.
2. **Normalizer:** pure transformations from a source batch into canonical records and warnings. No persistence, network, retention, or destination logic.
3. **Policy:** one authoritative classification/redaction/bounding pass. It can only reduce data.
4. **Repository:** transactional canonical persistence and compatibility views. SQLite remains authoritative locally.
5. **Export journal:** records immutable canonical record IDs and profile checkpoints, not raw source bodies.
6. **Exporters:** receive approved canonical batches; map and deliver; never query tables directly.

## API surface

Add `POST /telemetry/v2/batches` for canonical/adapted JSON and `POST /telemetry/v2/otlp/v1/traces` for guarded OTLP. Keep `/api/telemetry/*` as v1 compatibility routes. Dashboard/query APIs remain under `/api` until their own versioned migration; ingestion must not reuse them.

`/telemetry/v2/batches` accepts a batch envelope with producer, schema/adapter version, records, and optional valid trace context. It returns per-record accepted/duplicate/rejected status and normalized canonical IDs. Partial acceptance is allowed only when records are independent; broken parentage rejects the affected subgraph.

## Deployment boundary

Default bind remains loopback. Remote intake/export requires existing auth, TLS termination, explicit source allowlist, and tenant isolation. One Watchdog process owns one SQLite database. Scale by deploying one gateway per trust boundary and exporting to shared infrastructure—not by network-sharing SQLite.

## Multi-export

Each enabled profile gets an independent checkpoint and queue state. A record is stored once, referenced by many delivery rows, and mapped at send time from the approved canonical representation. Slow profiles cannot hold queue locks while performing I/O. Per-profile circuit breakers prevent retry amplification.

## Backwards-compatible migration

1. Introduce v2 schema/module and write-path facade without changing proxy/API behavior.
2. Translate current proxy and v1 intake into v2, dual-write only through the repository transaction while compatibility tests run.
3. Move dashboard/query endpoints to compatibility views over v2.
4. Backfill existing records as metadata-only canonical records with `migration` provenance; do not recover/redeliver old content silently.
5. Migrate Pi, Agents SDK, `kujo agent`, Dispatch, and Relay producers.
6. Stop old table writes, retain v1 endpoint translation for at least one documented compatibility window, then remove duplicate tables in a separate major migration.

## Non-goals encoded in architecture

No generic OTLP logs/metrics receiver, polling scheduler, arbitrary plugin code in-process, destination-owned schemas, per-exporter redaction, remote query federation, billing reconciliation, eval execution, or workflow control.

