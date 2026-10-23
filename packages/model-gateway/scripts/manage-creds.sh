#!/usr/bin/env bash
# Credentials wizard for the Model Gateway on top of systemd-creds.
#
# Usage:
#   manage-creds.sh              # setup: walks the 7 credentials one by one
#   manage-creds.sh set <key>    # updates a single secret
#   manage-creds.sh list         # lists the .cred files present
#
# Each secret is encrypted with:
#   sudo systemd-creds encrypt --name=<key> - /etc/model-gateway/creds/<key>.cred
# (it always overwrites the previous .cred). The value is prompted for silently.
set -euo pipefail

CREDS_DIR="/etc/model-gateway/creds"

# 1 own (MODEL_GATEWAY_API_KEY) + 6 active providers (spec §2.5).
REQUIRED_KEYS=(
  model_gateway_api_key
  opencode_api_key
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
  # /etc belongs to root: the directory and the .cred are created with sudo (the
  # .cred ends up 600: it is encrypted and bound to this machine, but it does not
  # need to be readable).
  sudo mkdir -p "$CREDS_DIR"
  printf '%s' "$value" | sudo systemd-creds encrypt --name="$key" - "$CREDS_DIR/$key.cred"
  sudo chmod 600 "$CREDS_DIR/$key.cred"
  echo "ok: $CREDS_DIR/$key.cred"
}

ask_and_encrypt() {
  local key="$1" value=""
  printf 'Value for %s: ' "$key" >&2
  read -rs value
  echo >&2
  if [[ -z "$value" ]]; then
    echo "error: empty value for $key" >&2
    exit 1
  fi
  encrypt_cred "$key" "$value"
}

cmd_setup() {
  echo "== Model Gateway: credentials setup ($CREDS_DIR) =="
  for key in "${REQUIRED_KEYS[@]}"; do
    ask_and_encrypt "$key"
  done
  echo "== Done. Restart the unit: sudo systemctl restart model-gateway =="
}

cmd_set() {
  local key="${1:-}"
  if [[ -z "$key" ]]; then
    echo "usage: $0 set <key>  (valid keys: ${REQUIRED_KEYS[*]})" >&2
    exit 1
  fi
  if ! is_required_key "$key"; then
    echo "error: unknown key '$key'. Valid: ${REQUIRED_KEYS[*]}" >&2
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
    echo "(no credentials in $CREDS_DIR)"
  fi
}

case "${1:-setup}" in
  setup) cmd_setup ;;
  set) shift; cmd_set "$@" ;;
  list) cmd_list ;;
  *) echo "usage: $0 [setup | set <key> | list]" >&2; exit 1 ;;
esac
