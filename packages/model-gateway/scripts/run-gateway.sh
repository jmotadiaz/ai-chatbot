#!/usr/bin/env bash
# Carga $CREDENTIALS_DIRECTORY (inyectado por systemd vía LoadCredentialEncrypted=)
# a variables de entorno efímeras del proceso y lanza uvicorn en 127.0.0.1:4000.
#
# Convención de nombres: el nombre del fichero .cred en minúsculas_con_guiones_bajos
# se exporta en MAYÚSCULAS (model_gateway_api_key -> MODEL_GATEWAY_API_KEY).
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -z "${CREDENTIALS_DIRECTORY:-}" ]]; then
  echo "error: CREDENTIALS_DIRECTORY no está definido (ejecuta bajo systemd con LoadCredentialEncrypted=)" >&2
  exit 1
fi

shopt -s nullglob
for cred in "$CREDENTIALS_DIRECTORY"/*; do
  name="$(basename "$cred")"
  var="$(echo "$name" | tr '[:lower:]-' '[:upper:]_')"
  # El fichero .cred desencriptado por systemd ES el valor plano del secreto.
  export "$var=$(cat "$cred")"
done
shopt -u nullglob

exec uvicorn server:app --host 127.0.0.1 --port 4000
