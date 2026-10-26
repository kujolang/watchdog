# Hermes integration

Hermes Discord gateways use the `nous` provider through the shared Watchdog
listener. Keep the model choice in Hermes and select the named `hermes` upstream
with a request header. Watchdog records requests in its normal database.

## Authenticated route

The supported local route is:

```text
Hermes gateway -> Watchdog :7700 -> Hermes OAuth proxy :8645 -> Nous Portal
```

Run the Hermes OAuth proxy independently of the Discord gateway. Its Nous
adapter must use `https://inference-api.nousresearch.com/v1` as its upstream,
not Watchdog, to prevent a routing loop. The adapter refreshes Nous credentials.
Verify that this service is running before enabling the route.

Merge this profile into the private `watchdog_proxy_config.json`, preserving
other profiles and the listener's default upstream:

```json
{
  "upstream_profiles": {
    "hermes": {
      "upstream_base_url": "http://127.0.0.1:8645/v1",
      "auth_mode": "passthrough"
    }
  }
}
```

Named profile edits apply to new requests without restarting Watchdog. The
proxy configuration is runtime state and is not checked into this repository.

In the selected Hermes profile's private `.env`, set:

```dotenv
NOUS_INFERENCE_BASE_URL=http://127.0.0.1:7700/proxy/v1
TWIN_WATCHDOG_PROXY_TOKEN=<the existing Watchdog proxy token>
```

Use the value configured by `WDG_PROXY_AUTHZ_TOKEN`, not the dashboard/API token
or a Nous bearer. Protect the environment file with mode `0600`; never commit
it. If the Watchdog proxy token rotates, update this value and restart the
Hermes gateway.

Merge these fields into the profile's `config.yaml`, retaining its chosen
`model.default`:

```yaml
model:
  provider: nous
  base_url: http://127.0.0.1:7700/proxy/v1
  default_headers:
    X-Watchdog-Upstream-Profile: hermes
    X-Watchdog-Proxy-Token: ${TWIN_WATCHDOG_PROXY_TOKEN}
```

Hermes expands the environment reference at runtime. The dedicated header
satisfies Watchdog's local access check while leaving `Authorization` available
for provider authentication. Watchdog does not forward its proxy token to the
provider. Keep production token authentication enabled.

Restart the selected gateway after changing its environment or configuration.
Per-conversation model overrides can select another endpoint; inspect those
when a conversation does not follow the default route.

## Verification and diagnosis

Use authenticated `/api/proxy-config` to confirm the `hermes` profile points to
port `8645`. Make a small completion through the configured Hermes client,
including its expanded default headers, and confirm the matching successful
row in `/api/requests`. Check both buffered and streaming responses. A listening
port or a successful `/healthz` response alone does not verify inference.

- Connection refused means the listener or OAuth proxy is unavailable.
- `401 missing proxy token` or `403 invalid proxy token` comes from Watchdog's
  local access check. Send `X-Watchdog-Proxy-Token` separately from the Nous
  bearer; replacing the provider bearer with the Watchdog token does not
  authenticate a direct Nous request.
- An HTML Cloudflare `403` is an upstream rejection. On 2026-10-26 the direct
  Watchdog-to-Nous route failed even with a valid provider bearer, while the
  same request through the Hermes OAuth proxy succeeded. The exact Cloudflare
  rule was not exposed. Keep Watchdog in the request path and use the OAuth
  adapter as its upstream transport.
- A provider `429` indicating temporary model capacity is distinct from either
  authentication failure; preserve the error and retry according to provider
  guidance.

`scripts/start_hermes_watchdog.sh` is a local development launcher. If a shared
listener already exists, it only detects the listener; it does not validate
its credentials, upstream route, or model availability. Use the existing
production service rather than starting an unauthenticated replacement.
