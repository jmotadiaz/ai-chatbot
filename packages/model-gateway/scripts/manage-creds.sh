#!/usr/bin/env bash
# Wizard de credenciales del Model Gateway sobre systemd-creds.
#
# Uso:
#   manage-creds.sh              # setup: recorre las 7 credenciales una a una
#   manage-creds.sh set <key>    # actualiza un único secreto
#   manage-creds.sh list         # lista los .cred presentes
#
# Cada secreto se cifra con:
#   sudo systemd-creds encrypt --name=<key> - /etc/model-gateway/creds/<key>.cred
# (sobrescribe siempre el .cred previo). El valor se pide en silencio.
set -euo pipefail

CREDS_DIR="/etc/model-gateway/creds"

# 1 propia (MODEL_GATEWAY_API_KEY) + 6 proveedores activos (spec §2.5).
REQUIRED_KEYS=(
  model_gateway_api_key
  opencode_zen_api_key
  ai_gateway_api_key
  openrouter_api_key
  google_generative_ai_api_key
  cohere_api_key
  openai_api_key
)

is_required_key() {
  local key="$1" k
  for k in "${REQUIRED_KEYS[@]}"; do
    [[ "$k" == "$key" ]] && return 0
  done
  return 1
}

encrypt_cred() {
  local key="$1" value="$2"
  mkdir -p "$CREDS_DIR"
  printf '%s' "$value" | sudo systemd-creds encrypt --name="$key" - "$CREDS_DIR/$key.cred"
  echo "ok: $CREDS_DIR/$key.cred"
}

ask_and_encrypt() {
  local key="$1" value=""
  printf 'Valor para %s: ' "$key" >&2
  read -rs value
  echo >&2
  if [[ -z "$value" ]]; then
    echo "error: valor vacío para $key" >&2
    exit 1
  fi
  encrypt_cred "$key" "$value"
}

cmd_setup() {
  echo "== Model Gateway: setup de credenciales ($CREDS_DIR) =="
  for key in "${REQUIRED_KEYS[@]}"; do
    ask_and_encrypt "$key"
  done
  echo "== Hecho. Reinicia la unidad: sudo systemctl restart model-gateway =="
}

cmd_set() {
  local key="${1:-}"
  if [[ -z "$key" ]]; then
    echo "uso: $0 set <key>  (claves válidas: ${REQUIRED_KEYS[*]})" >&2
    exit 1
  fi
  if ! is_required_key "$key"; then
    echo "error: clave desconocida '$key'. Válidas: ${REQUIRED_KEYS[*]}" >&2
    exit 1
  fi
  ask_and_encrypt "$key"
}

cmd_list() {
  shopt -s nullglob
  local found=0
  for cred in "$CREDS_DIR"/*.cred; do
    echo "$(basename "$cred" .cred)"
    found=1
  done
  shopt -u nullglob
  if [[ "$found" -eq 0 ]]; then
    echo "(sin credenciales en $CREDS_DIR)"
  fi
}

case "${1:-setup}" in
  setup) cmd_setup ;;
  set) shift; cmd_set "$@" ;;
  list) cmd_list ;;
  *) echo "uso: $0 [setup | set <key> | list]" >&2; exit 1 ;;
esac
