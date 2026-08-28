#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
KUJO_BIN=${KUJO_BIN:-kujo}

# Hermes' Nous provider honors NOUS_INFERENCE_BASE_URL. This instance keeps the
# existing Watchdog listener (and its Ollama upstream) untouched while sending
# Hermes' Nous OAuth bearer through the same telemetry database.
export WDG_PORT=${WDG_PORT:-7701}
export WDG_DB_PATH=${WDG_DB_PATH:-"$ROOT_DIR/data/hermes-watchdog.db"}
export WDG_PROXY_CONFIG_PATH=${WDG_PROXY_CONFIG_PATH:-"$ROOT_DIR/config/hermes_watchdog_proxy_config.json"}
export WDG_DEPLOYMENT_PROFILE=${WDG_DEPLOYMENT_PROFILE:-local}
export WDG_PROXY_AUTH_MODE=${WDG_PROXY_AUTH_MODE:-passthrough}
export WDG_PROXY_AUTHZ_MODE=${WDG_PROXY_AUTHZ_MODE:-off}
export WDG_API_AUTH_MODE=${WDG_API_AUTH_MODE:-off}
export WDG_REDACTION_MODE=${WDG_REDACTION_MODE:-basic}
export WDG_PROXY_TIMEOUT_SECS=${WDG_PROXY_TIMEOUT_SECS:-240}

# Do not inherit the existing Watchdog deployment's upstream override when
# this helper is launched from a shell that already runs the Ollama instance.
export WDG_UPSTREAM_BASE_URL=https://inference-api.nousresearch.com/v1
unset WDG_UPSTREAM_API_KEY WDG_UPSTREAM_API_KEY_ENV

cd "$ROOT_DIR"
exec "$KUJO_BIN" run --interpreter dashboard_server.kujo
