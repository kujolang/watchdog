# Hermes integration

The active Discord profiles in this environment use Hermes' `nous` provider.
Hermes exposes a supported `NOUS_INFERENCE_BASE_URL` override, so Watchdog can
sit between every Discord gateway and the Nous inference API without changing
Hermes' OAuth refresh flow. Hermes continues to send its short-lived bearer;
Watchdog forwards it in passthrough mode and records the request in SQLite.

Keep the existing Watchdog listener running on port `7700`. Hermes uses a
named upstream profile on that listener, so its requests share the normal
Watchdog database and dashboard with other AI traffic.

```bash
scripts/start_hermes_watchdog.sh
```

Set this in `~/.hermes/.env` and restart the Hermes Discord gateways:

```dotenv
NOUS_INFERENCE_BASE_URL=http://127.0.0.1:7700/proxy/v1
```

The shared listener uses `data/watchdog.db`. Hermes' `model.default_headers`
configuration sends `X-Watchdog-Upstream-Profile: hermes`, selecting the Nous
passthrough route without changing the default upstream used by other clients.
The checked-in config also preserves the existing OpenRouter and Ollama
profiles.

This integration intentionally uses loopback-only client configuration and
basic redaction. The current Kujo HTTP server binds all interfaces, so keep
the Hermes listener on a trusted machine or put an external firewall/reverse
proxy boundary in front of it before using it beyond the local host.

Verify the route with:

```bash
curl -s http://127.0.0.1:7700/api/proxy-config
curl -s http://127.0.0.1:7700/api/stats
```
