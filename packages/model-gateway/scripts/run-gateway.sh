#!/usr/bin/env bash
# Loads $CREDENTIALS_DIRECTORY (injected by systemd via LoadCredentialEncrypted=)
# into ephemeral process environment variables and launches uvicorn on 127.0.0.1:4000.
#
# Naming convention: the .cred file name in lowercase_with_underscores is
# exported in UPPERCASE (model_gateway_api_key -> MODEL_GATEWAY_API_KEY).
set -euo pipefail

cd "$(dirname "$0")/.."

# The Gateway is stateless by design (ADR 0010): no DB. If the operator's shell
# drags along a DATABASE_URL (e.g. prod's on :5435), LiteLLM would try to mount
# Prisma against that database on startup — that must never happen.
unset DATABASE_URL DATABASE_URL_UNPOOLED POSTGRES_URL POSTGRES_URL_NON_POOLING POSTGRES_URL_NO_SSL

if [[ -z "${CREDENTIALS_DIRECTORY:-}" ]]; then
  echo "error: CREDENTIALS_DIRECTORY is not set (run under systemd with LoadCredentialEncrypted=)" >&2
  exit 1
fi

# LiteLLM reads the YAML from this variable when importing proxy_server. Without it
# the proxy starts without model_list or master_key (GET /v1/models/catalog would
# still work because catalog.py reads it, which is why the failure goes unnoticed).
export CONFIG_FILE_PATH="${CONFIG_FILE_PATH:-$PWD/config.yaml}"

shopt -s nullglob
for cred in "$CREDENTIALS_DIRECTORY"/*; do
  name="$(basename "$cred")"
  var="$(echo "$name" | tr '[:lower:]-' '[:upper:]_')"
  # The .cred file decrypted by systemd IS the secret's plaintext value.
  export "$var=$(cat "$cred")"
done
shopt -u nullglob

# Deployment trace: which commit is running shows up in `journalctl -u model-gateway`.
if [[ -f "$PWD/DEPLOYED" ]]; then
  echo "model-gateway $(tr '\n' ' ' < "$PWD/DEPLOYED")"
fi

# The deployment installs its own venv in /opt/model-gateway/.venv; in the repo
# checkout (manual start) the uvicorn of the active environment is used.
UVICORN="$PWD/.venv/bin/uvicorn"
if [[ ! -x "$UVICORN" ]]; then
  UVICORN="$(command -v uvicorn || true)"
fi
if [[ -z "$UVICORN" ]]; then
  echo "error: uvicorn not found (create .venv with scripts/deploy.sh or activate the environment)" >&2
  exit 1
fi

exec "$UVICORN" server:app --host 127.0.0.1 --port 4000
