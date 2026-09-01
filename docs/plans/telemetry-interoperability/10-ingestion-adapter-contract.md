# Ingestion adapter contract

Version independently as `watchdog.ingestion-adapter.v1`.

## Interface

```text
normalize(source_batch, adapter_context)
  -> { records[], warnings[], rejects[] }
```

`source_batch` is immutable and bounded. `adapter_context` contains source policy, clock, ID allocator, contract versions, and effective content mode—never a database or exporter. Output records conform to canonical v2 before policy; accepted records then pass through the central policy and repository.

## Adapter responsibilities

- declare source/framework/host and adapter version;
- validate source shape and timestamp units;
- map source IDs and W3C context without inventing causality;
- map lifecycle to trace/span/event semantics;
- normalize status/error categories and usage while retaining provider-native fields;
- label every potential content field and source privacy risk;
- allowlist metadata and report discarded/unknown fields;
- be deterministic and side-effect free.

Adapters must not write SQLite, call exporters, retain queues, retry network delivery, define retention, read secrets, increase content capture, or create destination attributes.

## Admission and limits

Default limits: 1 MiB compressed request, 4 MiB decompressed, 100 records/batch, 128 attributes/record, 32 events/span, 16 links/span, 12 KiB attribute JSON, 64 KiB content block only when explicitly enabled, 5 s timestamp skew warning, and configurable 24 h future/30 d past rejection for live intake. OTLP gets equivalent resource/scope/span limits.

## Conformance suite

Every adapter supplies offline fixtures for minimum valid, full metadata, replay, invalid IDs, mixed timestamp units, nested agent/tool/model, streaming timing, provider usage variants, errors, malicious metadata keys, oversized payload, content-off, content-on, and partial batch failure. Golden canonical output must be deterministic. Tests prove no credentials/raw content survive metadata-only mode and no fixture opens the network.

## Packaging

- Core: proxy decoders, v1 translator, canonical v2, guarded OTLP receiver.
- Official packages: Kujo Agents/Pi/Dispatch/Relay and one or two high-value host hooks.
- Community: fast-moving framework/host adapters that already have standards paths.
- Unsupported: transcript scrapers, credential harvesters, polling integrations, arbitrary in-process plugins.

A CLI scaffold is optional after two external adapters prove repetition. If added, `watchdog adapter validate <fixture-dir>` is valuable; `adapter new` is not required for architecture proof.

