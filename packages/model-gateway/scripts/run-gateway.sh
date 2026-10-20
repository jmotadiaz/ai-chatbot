#!/usr/bin/env bash
# Carga $CREDENTIALS_DIRECTORY (inyectado por systemd vía LoadCredentialEncrypted=)
# a variables de entorno efímeras del proceso y lanza uvicorn en 127.0.0.1:4000.
#
# Convención de nombres: el nombre del fichero .cred en minúsculas_con_guiones_bajos
# se exporta en MAYÚSCULAS (model_gateway_api_key -> MODEL_GATEWAY_API_KEY).
set -euo pipefail

cd "$(dirname "$0")/.."

# El Gateway es stateless por diseño (ADR 0010): sin DB. Si el shell del
# operador arrastra un DATABASE_URL (p. ej. el de prod en :5435), LiteLLM
# intentaría montar Prisma contra esa base en el arranque — nunca debe pasar.
unset DATABASE_URL DATABASE_URL_UNPOOLED POSTGRES_URL POSTGRES_URL_NON_POOLING POSTGRES_URL_NO_SSL

if [[ -z "${CREDENTIALS_DIRECTORY:-}" ]]; then
  echo "error: CREDENTIALS_DIRECTORY no está definido (ejecuta bajo systemd con LoadCredentialEncrypted=)" >&2
  exit 1
fi

# LiteLLM lee el YAML de esta variable al importar proxy_server. Sin ella el
# proxy arranca sin model_list ni master_key (GET /v1/models/catalog seguiría
# funcionando porque lo lee catalog.py, de ahí que el fallo pase desapercibido).
export CONFIG_FILE_PATH="${CONFIG_FILE_PATH:-$PWD/config.yaml}"

shopt -s nullglob
for cred in "$CREDENTIALS_DIRECTORY"/*; do
  name="$(basename "$cred")"
  var="$(echo "$name" | tr '[:lower:]-' '[:upper:]_')"
  # El fichero .cred desencriptado por systemd ES el valor plano del secreto.
  export "$var=$(cat "$cred")"
done
shopt -u nullglob

# Traza de despliegue: qué commit está corriendo sale en `journalctl -u model-gateway`.
if [[ -f "$PWD/DEPLOYED" ]]; then
  echo "model-gateway $(tr '\n' ' ' < "$PWD/DEPLOYED")"
fi

# El despliegue instala un venv propio en /opt/model-gateway/.venv; en el
# checkout del repo (arranque manual) se usa el uvicorn del entorno activo.
UVICORN="$PWD/.venv/bin/uvicorn"
if [[ ! -x "$UVICORN" ]]; then
  UVICORN="$(command -v uvicorn || true)"
fi
if [[ -z "$UVICORN" ]]; then
  echo "error: no se encontró uvicorn (crea .venv con scripts/deploy.sh o activa el entorno)" >&2
  exit 1
fi

exec "$UVICORN" server:app --host 127.0.0.1 --port 4000
