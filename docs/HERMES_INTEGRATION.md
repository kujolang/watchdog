# Hermes integration

The active Discord profiles in this environment use Hermes' `nous` provider.
Hermes exposes a supported `NOUS_INFERENCE_BASE_URL` override, so Watchdog can
sit between every Discord gateway and the Nous inference API without changing
Hermes' OAuth refresh flow. Hermes continues to send its short-lived bearer;
Watchdog forwards it in passthrough mode and records the request in SQLite.

Start the dedicated Hermes listener from the Watchdog repository:

```bash
scripts/start_hermes_watchdog.sh
```

Set this in `~/.hermes/.env` and restart the Hermes Discord gateways:

```dotenv
NOUS_INFERENCE_BASE_URL=http://127.0.0.1:7701/proxy/v1
```

The dedicated listener uses port `7701` and `data/hermes-watchdog.db` so an
existing Watchdog deployment on port `7700` can continue serving its current
upstream without competing for a SQLite write lock. The default route is Nous;
the checked-in config
also defines passthrough profiles for OpenRouter and Ollama for clients that
send `X-Watchdog-Upstream-Profile`.

This integration intentionally uses loopback-only client configuration and
basic redaction. The current Kujo HTTP server binds all interfaces, so keep
the Hermes listener on a trusted machine or put an external firewall/reverse
proxy boundary in front of it before using it beyond the local host.

Verify the route with:

```bash
curl -s http://127.0.0.1:7701/api/proxy-config
curl -s http://127.0.0.1:7701/api/stats
```
