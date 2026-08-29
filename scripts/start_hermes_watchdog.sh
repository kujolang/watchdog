#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
KUJO_BIN=${KUJO_BIN:-kujo}

# Hermes' Nous provider honors NOUS_INFERENCE_BASE_URL. Use the existing
# Watchdog listener and database so Hermes appears alongside other AI traffic.
export WDG_PORT=${WDG_PORT:-7700}
export WDG_DB_PATH=${WDG_DB_PATH:-"$ROOT_DIR/data/watchdog.db"}
export WDG_PROXY_CONFIG_PATH=${WDG_PROXY_CONFIG_PATH:-"$ROOT_DIR/watchdog_proxy_config.json"}
export WDG_DEPLOYMENT_PROFILE=${WDG_DEPLOYMENT_PROFILE:-local}
export WDG_PROXY_AUTH_MODE=${WDG_PROXY_AUTH_MODE:-passthrough}
export WDG_PROXY_AUTHZ_MODE=${WDG_PROXY_AUTHZ_MODE:-off}
export WDG_API_AUTH_MODE=${WDG_API_AUTH_MODE:-off}
export WDG_REDACTION_MODE=${WDG_REDACTION_MODE:-basic}
export WDG_PROXY_TIMEOUT_SECS=${WDG_PROXY_TIMEOUT_SECS:-240}

# The Hermes route selects the named `hermes` profile via its request header;
# leave the shared listener's default upstream and credentials untouched.
unset WDG_UPSTREAM_BASE_URL WDG_UPSTREAM_API_KEY WDG_UPSTREAM_API_KEY_ENV

cd "$ROOT_DIR"

if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$WDG_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Watchdog is already listening on port $WDG_PORT; Hermes will use that shared instance."
  exit 0
fi

exec "$KUJO_BIN" run --interpreter dashboard_server.kujo
