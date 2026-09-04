# Connected Sources

The dashboard **Sources** tab is Watchdog's inbound source-management view. It
merges observed, policy-approved telemetry with operator-owned registrations
and existing OpenAI-compatible proxy profiles. Exporter destinations remain in
the separate Exporters view.

## Truth and identity model

Source status is derived only from local configuration and accepted telemetry:

- `active`: a matching accepted record was seen in the last five minutes;
- `stale`: a matching record exists, but not in the active window;
- `pending`: configured or registered without matching accepted telemetry;
- `disabled`: the local configuration is disabled;
- `error`: reserved for a persisted, bounded Watchdog admission or configuration failure.

Every row includes the evidence text and observation time used for its status.
Watchdog never pings a producer or upstream provider to manufacture health.
Registrations merge only on exact producer, source-application, or proxy-profile
identifiers. Display-name similarity is never a merge key.

The public source ID is `src_` plus a bounded SHA-256-derived identifier. It
does not expose credentials, paths, tenant identifiers, or raw user values.
Canonical telemetry and legacy tables remain unchanged; the panel is a read
model over those stores.

## Registry ownership and writes

Operator metadata uses `watchdog.sources.v1` in `watchdog_sources.json`, or the
server-controlled path in `WDG_SOURCES_CONFIG_PATH`. Request bodies cannot
select a path. The registry contains display/setup metadata, exact identifiers,
enabled/archive state, non-secret options, and timestamps only.

Writes require normal Watchdog API authentication, validate bounded allowlisted
fields, reject secret-bearing and policy-owned fields, use atomic replacement,
and set the file to mode `0600`. Existing registry and proxy-config symlinks or
non-regular files are refused. Mutations use the returned registry revision for
optimistic conflict protection. A malformed valid-path file is reported and
preserved rather than overwritten.

Deleting a registration removes metadata only. The request must acknowledge
`retain_historical_telemetry: true`; telemetry stays subject to normal retention.

Proxy-profile changes reuse `watchdog_proxy_config.json` and preserve unknown
valid profile fields. Only profile name, normalized upstream base URL,
`passthrough`/`override` mode, an environment-variable name, display name, and
enabled state are accepted. Credential values are never accepted or returned.
The `default` profile is read-only. Profile writes are atomic and private, but
the running server does not safely hot-reload all configuration ownership; the
API therefore returns `restart_required: true` and does not claim activation.

## API

All routes use the independently versioned `watchdog.sources-panel.v1` contract:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/sources` | Bounded, merged inventory and status summary |
| `GET` | `/api/sources/:id` | Safe source detail and bounded evidence |
| `GET` | `/api/sources/setup-templates` | Checked-in non-secret setup guidance |
| `POST` | `/api/sources` | Create a registration or named proxy profile |
| `PATCH` | `/api/sources/:id` | Update allowlisted registration metadata using a revision |
| `DELETE` | `/api/sources/:id` | Remove a registration after retention acknowledgement |
| `POST` | `/api/sources/:id/verify` | Query accepted local telemetry only |
| `POST` | `/api/sources/verify` | Compatibility action route for local verification |
| `POST` | `/api/sources/update` | Compatibility action route for metadata updates |
| `POST` | `/api/sources/delete` | Compatibility action route for metadata deletion |
| `POST` | `/api/sources/proxy/update` | Update a non-default named proxy profile |
| `POST` | `/api/sources/proxy/delete` | Remove a non-default named proxy profile reference |

Tenant/project query parameters scope legacy and proxy observations exactly as
they do in existing dashboard queries. Registrations are operator configuration
inside Watchdog's documented single-operator trust boundary; they do not grant
access to another tenant or project.

## Rollback

Stop Watchdog, restore the prior private registry or proxy configuration, and
restart. Removing `watchdog_sources.json` removes only operator registrations.
It does not modify the database. Never replace the telemetry database as part
of Connected Sources rollback.
