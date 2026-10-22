#!/usr/bin/env bash
# Despliega (o redespliega) el Model Gateway como unidad systemd endurecida.
#
# Versión mínima: copiar artefacto, dependencias, unidad, reinicio y verificar.
# Sin backups ni rollback automático — volver atrás es `--ref <sha-anterior>`,
# y el sha anterior queda impreso si el arranque falla.
#
# Orden (importa):
#   1. Precondiciones (credenciales, `uv`, árbol del paquete). Si el árbol
#      tiene cambios sin commitear, AVISA y pregunta: con `y` sigue, con `n`
#      (o sin respuesta) cancela. `--allow-dirty` salta el aviso y la
#      pregunta (despliega y lo estampa como dirty=yes).
#   2. Fuente: checkout actual o `--ref <commit|tag>` (`git archive`, sin tocar
#      el worktree). Con `--ref` el worktree no interviene: la revisión
#      desplegada es la commiteada, así que no hay guarda de árbol sucio.
#   3. Solo `pyproject.toml` a /opt y dependencias en el venv. Si esto falla,
#      el servicio sigue corriendo el código anterior intacto.
#   4. Resto del artefacto + sello `DEPLOYED` (commit, rama, fecha, dirty).
#   5. Unidad + daemon-reload + restart (o enable --now la primera vez).
#   6. Health check: 401 sin bearer = app viva y auth enforced; si hay
#      MODEL_GATEWAY_API_KEY en el entorno, además exige modelos.
#
# Uso:
#   scripts/deploy.sh                    # despliega el checkout actual
#   scripts/deploy.sh --ref HEAD~1       # despliega esa revisión (rollback por ref)
#   scripts/deploy.sh --allow-dirty      # despliega con cambios sin commitear, sin preguntar
#   scripts/deploy.sh --no-health-check  # sin verificación post-arranque
#
# Por qué copia a /opt: la unidad corre con DynamicUser (UID transitorio) y
# ProtectHome=yes, así que no puede leer /home/<operador>. /opt/model-gateway
# es el artefacto que ejecuta el servicio; el repo sigue siendo la fuente.
set -euo pipefail

PKG_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG_REL="packages/model-gateway"
DEST="/opt/model-gateway"
UNIT="/etc/systemd/system/model-gateway.service"
SERVICE="model-gateway"
HEALTH_URL="http://127.0.0.1:4000/v1/models/catalog"
PYTHON_VERSION="${PYTHON_VERSION:-3.12}"
RUNTIME_FILES=(server.py catalog.py config.yaml CONTRACT.md README.md)

REF=""
ALLOW_DIRTY=0
HEALTH_CHECK=1

usage() { sed -n '2,27p' "$0" | sed 's/^# \{0,1\}//'; }
log() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref) [[ $# -ge 2 ]] || die "--ref requiere un valor"; REF="$2"; shift 2 ;;
    --ref=*) REF="${1#--ref=}"; shift ;;
    --allow-dirty) ALLOW_DIRTY=1; shift ;;
    --no-health-check) HEALTH_CHECK=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "argumento inesperado: $1 (¿querías --ref $1?)" ;;
  esac
done

if [[ $EUID -eq 0 ]]; then SUDO=(); else SUDO=(sudo); fi
command -v curl >/dev/null 2>&1 || die "falta curl (health check)"

# 401 sin bearer = FastAPI en pie y auth enforced; 200 solo con key válida.
wait_http() {
  local code
  for _ in $(seq 1 30); do
    code="$(curl -s -o /dev/null -m 2 -w '%{http_code}' "$HEALTH_URL" || true)"
    case "$code" in 401|200) return 0 ;; esac
    sleep 1
  done
  return 1
}

health_check() {
  if [[ "$HEALTH_CHECK" -eq 0 ]]; then
    log "health check omitido (--no-health-check)"
    return 0
  fi
  wait_http || { echo "error: $SERVICE no responde en $HEALTH_URL" >&2; return 1; }
  if [[ -n "${MODEL_GATEWAY_API_KEY:-}" ]]; then
    local body models
    body="$(curl -s -m 5 -H "Authorization: Bearer $MODEL_GATEWAY_API_KEY" "$HEALTH_URL")"
    models="$(printf '%s' "$body" | grep -o '"id"' | wc -l | tr -d ' ')"
    if [[ "$models" -lt 1 ]]; then
      echo "error: el catálogo autenticado no devolvió modelos: ${body:0:200}" >&2
      return 1
    fi
    log "catálogo OK: $models modelos"
  else
    log "sin MODEL_GATEWAY_API_KEY en el entorno: solo comprobé 401 (liveness + auth)"
  fi
}

install_dependencies() {
  command -v uv >/dev/null 2>&1 || die "falta 'uv' (pipx install uv): lo usamos para el venv con Python $PYTHON_VERSION"
  local uv_bin; uv_bin="$(command -v uv)"
  "${SUDO[@]}" install -d -m 0755 "$DEST"
  # Solo el manifiesto: si las deps fallan, el artefacto anterior sigue intacto.
  "${SUDO[@]}" install -m 0644 "$SRC/pyproject.toml" "$DEST/pyproject.toml"
  if [[ ! -x "$DEST/.venv/bin/uvicorn" ]]; then
    log "creando venv ($DEST/.venv, Python $PYTHON_VERSION)"
    "${SUDO[@]}" env "PATH=$PATH" UV_PYTHON_INSTALL_DIR="$DEST/.python" \
      "$uv_bin" venv --python "$PYTHON_VERSION" "$DEST/.venv"
  fi
  log "instalando dependencias"
  "${SUDO[@]}" env "PATH=$PATH" UV_CACHE_DIR=/var/cache/uv \
    "$uv_bin" pip install --quiet --python "$DEST/.venv/bin/python" "$DEST"
}

publish_artifact() {
  local f
  "${SUDO[@]}" install -d -m 0755 "$DEST" "$DEST/scripts"
  for f in "${RUNTIME_FILES[@]}"; do
    if [[ -f "$SRC/$f" ]]; then
      "${SUDO[@]}" install -m 0644 "$SRC/$f" "$DEST/$f"
    fi
  done
  "${SUDO[@]}" install -m 0755 "$SRC/scripts/run-gateway.sh" "$DEST/scripts/run-gateway.sh"
  printf '%s\n' "$STAMP" | "${SUDO[@]}" tee "$DEST/DEPLOYED" >/dev/null
  "${SUDO[@]}" chmod 0644 "$DEST/DEPLOYED"
}

install_unit() {
  "${SUDO[@]}" install -m 0644 "$PKG_DIR/systemd/model-gateway.service" "$UNIT"
  "${SUDO[@]}" systemctl daemon-reload
}

restart_service() {
  if systemctl is-enabled --quiet "$SERVICE" 2>/dev/null; then
    log "reiniciando $SERVICE"
    "${SUDO[@]}" systemctl restart "$SERVICE"
  else
    log "habilitando y arrancando $SERVICE"
    "${SUDO[@]}" systemctl enable --now "$SERVICE"
  fi
}

# --------------------------------------------------------------- prechecks ----
compgen -G "/etc/model-gateway/creds/*.cred" >/dev/null 2>&1 \
  || die "faltan credenciales en /etc/model-gateway/creds (bash $PKG_DIR/scripts/manage-creds.sh)"

DIRTY="no"
if [[ -z "$REF" ]]; then
  # Con `--ref` el artefacto sale de `git archive` de una revisión commiteada:
  # el worktree no interviene, así que la guarda de árbol sucio no aplica.
  # shellcheck source=scripts/lib/dirty-guard.sh
  source "$SCRIPT_DIR/lib/dirty-guard.sh"
  if ! dirty_guard_confirm "$PKG_DIR" "$PKG_REL" "$ALLOW_DIRTY"; then
    die "despliegue cancelado: hay cambios sin commitear en $PKG_REL (commitea, usa --allow-dirty o responde 'y' para desplegar así)"
  fi
  DIRTY="${DIRTY_GUARD_DIRTY:-no}"
fi

SHA="$(git -C "$PKG_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
BRANCH="$(git -C "$PKG_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
UTC_NOW="$(date -u +%FT%TZ)"
PREV_DEPLOYED="$(cat "$DEST/DEPLOYED" 2>/dev/null || true)"

# Materializa la fuente: checkout actual o una revisión concreta.
TMP_DIR=""
cleanup() { if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then rm -rf "$TMP_DIR"; fi; }
trap cleanup EXIT

if [[ -n "$REF" ]]; then
  git -C "$PKG_DIR" rev-parse --verify --quiet "$REF^{commit}" >/dev/null || die "ref desconocida: $REF"
  TMP_DIR="$(mktemp -d)"
  git -C "$PKG_DIR" archive "$REF" -- "$PKG_REL" | tar -x -C "$TMP_DIR" || die "no se pudo materializar $REF"
  SRC="$TMP_DIR/$PKG_REL"
  REF_SHA="$(git -C "$PKG_DIR" rev-parse --short "$REF")"
  STAMP="$(printf 'commit=%s\nref=%s\ndeployed_at=%s\ndirty=no\n' "$REF_SHA" "$REF" "$UTC_NOW")"
  log "desplegando la revisión $REF ($REF_SHA)"
else
  SRC="$PKG_DIR"
  STAMP="$(printf 'commit=%s\nbranch=%s\ndeployed_at=%s\ndirty=%s\n' "$SHA" "$BRANCH" "$UTC_NOW" "$DIRTY")"
  log "desplegando el checkout actual ($SHA en $BRANCH, dirty=$DIRTY)"
fi

# ------------------------------------------------------------------ deploy ----
install_dependencies
publish_artifact
install_unit
restart_service

if health_check; then
  echo
  log "desplegado: $(printf '%s' "$STAMP" | tr '\n' ' ')"
  "${SUDO[@]}" systemctl --no-pager --lines=0 status "$SERVICE" 2>/dev/null | head -6 || true
  exit 0
fi

echo "--- journal del intento fallido ---" >&2
"${SUDO[@]}" journalctl -u "$SERVICE" -n 40 --no-pager >&2 || true
echo "-----------------------------------" >&2
if [[ -n "$PREV_DEPLOYED" ]]; then
  echo "artefacto anterior:" >&2
  printf '%s\n' "$PREV_DEPLOYED" >&2
  PREV_SHA="$(printf '%s\n' "$PREV_DEPLOYED" | sed -n 's/^commit=//p' | head -1)"
  [[ -n "$PREV_SHA" ]] && echo "para volver atrás: pnpm run deploy -- --ref $PREV_SHA && sudo systemctl restart $SERVICE" >&2
else
  echo "no había artefacto anterior: primer despliegue fallido" >&2
fi
die "deploy completado pero $SERVICE no está sano"
