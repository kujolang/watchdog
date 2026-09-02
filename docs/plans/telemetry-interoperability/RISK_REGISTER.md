# Risk register

| ID | Risk | Likelihood / impact | Mitigation | Release evidence |
|---|---|---|---|---|
| R1 | OTel GenAI/OpenInference field churn leaks into core | high / high | independent canonical schema; pin mapping versions; golden fixtures | two mapping versions can coexist without DB migration |
| R2 | new adapters silently capture content | medium / critical | central policy after normalization; canary fixtures inspect DB/export/spool/log/backup | metadata-only privacy suite |
| R3 | OTLP ingest turns Watchdog into generic collector | medium / high | traces only, AI marker/semantic gate, loopback/auth, quotas; reject logs/metrics | generic trace/log/metric rejection tests |
| R4 | proxy claims semantics for opaque endpoints | high / medium | endpoint decoder registry; opaque transport records; fixtures | unknown endpoint has no fake usage/tool/agent data |
| R5 | exporter outage slows/fails applications | medium / high | asynchronous queue, no network in request transaction, circuit breaker | outage latency benchmark and recovery test |
| R6 | queue/database grows without bound | medium / critical | bytes/count/age/attempt caps, admission limits, chunked retention | fill/expiry/drop/restart tests |
| R7 | duplicate facts during v1/v2 migration | high / medium | one repository path, compatibility views, idempotency, finite dual-write window | migration reconciliation counts |
| R8 | source ID collision or poisoned parentage | medium / high | W3C validation, source namespace, conflicting replay rejection | collision/replay fixtures |
| R9 | cost estimates presented as billed cost | medium / high | typed observations/provenance; conservative exporter mapping | provider vs estimate golden mappings |
| R10 | exporter credentials leak to rows/spool/JSONL | low / critical | reference/resolve at send time, redaction, canary scans | disk/log/backup scan |
| R11 | webhook enables SSRF/exfiltration | high / critical | defer; exact allowlist, HTTPS, DNS/IP validation, no redirects, HMAC | adversarial endpoint suite before enablement |
| R12 | SQLite write contention under swarms | medium / high | batches, short transactions, one writer, explicit envelope/429, measured limits | 10/50/200 EPS and burst benchmarks |
| R13 | streaming remains buffered and harms TTFT/memory | high / high | incremental proxy forwarding/parser before expansion | paired direct/proxy stream benchmark |
| R14 | host API/version churn breaks adapters | high / medium | external packages, pinned versions, conformance fixtures, declared capability matrix | supported-version CI matrix |
| R15 | cross-tenant source claims bypass isolation | medium / critical | bind tenant/source at auth, ignore producer-selected authority | adversarial multi-tenant tests |
| R16 | platform OTLP accepts data but loses AI semantics | medium / medium | destination golden fixtures and documented loss matrix | UI/API verification for prioritized profiles |
| R17 | optional strict mode becomes proxy dependency | low / high | prohibit exporter health from proxy success semantics | exporter-down proxy tests |
| R18 | old direct DB wrapper bypasses policy | high / high | migrate/deprecate `src/watchdog.kujo`; forbid direct producer writes | code search + integration test |

No risk here justifies Kafka, Kubernetes, Postgres, Redis, Elasticsearch, or ClickHouse in the local gateway.

## Open release risks (2026-09-01)

- **R12 remains open:** the quick reference run sustained the 10 EPS case but
  achieved only about 20–24 EPS for the nominal 50/200 cases. The 30-minute
  qualification has not passed. The advertised envelope is therefore 10 EPS.
- **R13 remains open and blocks production promotion:** Kujo's current POST
  client buffers the complete upstream response. Streaming TTFT and nonstream
  proxy overhead miss the target budgets; see the measured release decision.
- **R5 remains performance-open:** destination failure never changes model
  success and network delivery stays off-path, but quick runs have not
  consistently held the <=2 ms proxy p95 delta when queueing is enabled.
- **R15 is constrained, not implemented as in-database multitenancy:** Watchdog
  supports one operator/auth trust boundary per database. Tenant/project filters
  prevent accidental query mixing, but are not row-level authorization. Shared
  untrusted tenants must use separate Watchdog instances.
- Agents SDK canonical records now pass through the shared JavaScript client's
  offline/flush proof; Pi independently verifies its native bounded fail-open v2
  spool. Packaging the client directly into future `kujo agent` distributions is
  a distribution task, not a schema or delivery-contract gap.
