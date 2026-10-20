#!/usr/bin/env bash
# Despliega (o redespliega) el Model Gateway como unidad systemd endurecida.
#
# Qué hace un redeploy, en orden:
#   1. Comprueba precondiciones (credenciales presentes, árbol limpio del
#      paquete, `uv` disponible).
#   2. Materializa el artefacto: del checkout actual o de un `--ref` de git
#      (`git archive`, sin tocar el worktree).
#   3. Respalda el artefacto anterior en /var/backups/model-gateway/<stamp>/.
#   4. Copia módulos + config.yaml + scripts a /opt/model-gateway y estampa
#      DEPLOYED (commit, rama, fecha, dirty).
#   5. Crea el venv si falta e instala dependencias (litellm[proxy], fastapi…).
#   6. Instala la unidad, daemon-reload y (re)arranca.
#   7. Health check: 401 sin bearer = app viva y auth enforced; si
#      MODEL_GATEWAY_API_KEY está en el entorno, además exige modelos.
#   8. Si algo falla: restaura el backup, rearranca y sale != 0 con el journal
#      del intento fallido.
#
# Uso:
#   scripts/deploy.sh                    # despliega el checkout actual
#   scripts/deploy.sh --ref HEAD~1       # despliega esa revisión (rollback por ref)
#   scripts/deploy.sh --rollback         # restaura el último backup
#   scripts/deploy.sh --allow-dirty      # permite desplegar con cambios sin commitear
#   scripts/deploy.sh --no-health-check  # sin verificación post-arranque
#
# Por qué copia a /opt: la unidad corre con DynamicUser (UID transitorio) y
# ProtectHome=yes, así que no puede leer /home/<operador>. /opt/model-gateway
# es el artefacto que ejecuta el servicio; el repo sigue siendo la fuente.
set -euo pipefail

PKG_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PKG_REL="packages/model-gateway"
DEST="/opt/model-gateway"
UNIT="/etc/systemd/system/model-gateway.service"
SERVICE="model-gateway"
HEALTH_URL="http://127.0.0.1:4000/v1/models/catalog"
BACKUP_ROOT="/var/backups/model-gateway"
KEEP_BACKUPS=5
PYTHON_VERSION="${PYTHON_VERSION:-3.12}"
RUNTIME_FILES=(server.py catalog.py config.yaml pyproject.toml CONTRACT.md README.md)

REF=""
DO_ROLLBACK=0
ALLOW_DIRTY=0
HEALTH_CHECK=1

usage() { sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; }
log() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref) [[ $# -ge 2 ]] || die "--ref requiere un valor"; REF="$2"; shift 2 ;;
    --ref=*) REF="${1#--ref=}"; shift ;;
    --rollback) DO_ROLLBACK=1; shift ;;
    --allow-dirty) ALLOW_DIRTY=1; shift ;;
    --no-health-check) HEALTH_CHECK=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "argumento inesperado: $1 (¿querías --ref $1?)" ;;
  esac
done

if [[ $EUID -eq 0 ]]; then SUDO=(); else SUDO=(sudo); fi
command -v curl >/dev/null 2>&1 || die "falta curl (health check)"

creds_present() { compgen -G "/etc/model-gateway/creds/*.cred" >/dev/null 2>&1; }

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

restart_service() {
  if systemctl is-enabled --quiet "$SERVICE" 2>/dev/null; then
    log "reiniciando $SERVICE"
    "${SUDO[@]}" systemctl restart "$SERVICE"
  else
    log "habilitando y arrancando $SERVICE"
    "${SUDO[@]}" systemctl enable --now "$SERVICE"
  fi
}

install_unit() {
  "${SUDO[@]}" install -m 0644 "$PKG_DIR/systemd/model-gateway.service" "$UNIT"
  "${SUDO[@]}" systemctl daemon-reload
}

copy_artifact() {
  local src="$1" stamp="$2" f
  "${SUDO[@]}" install -d -m 0755 "$DEST" "$DEST/scripts"
  for f in "${RUNTIME_FILES[@]}"; do
    if [[ -f "$src/$f" ]]; then
      "${SUDO[@]}" install -m 0644 "$src/$f" "$DEST/$f"
    fi
  done
  "${SUDO[@]}" install -m 0755 "$src/scripts/run-gateway.sh" "$DEST/scripts/run-gateway.sh"
  printf '%s\n' "$stamp" | "${SUDO[@]}" tee "$DEST/DEPLOYED" >/dev/null
  "${SUDO[@]}" chmod 0644 "$DEST/DEPLOYED"
}

backup_current() {
  local dir="$1" f
  if [[ ! -f "$DEST/server.py" ]]; then
    log "no hay artefacto previo que respaldar"
    return 0
  fi
  "${SUDO[@]}" install -d -m 0755 "$dir"
  for f in "${RUNTIME_FILES[@]}" DEPLOYED; do
    if [[ -f "$DEST/$f" ]]; then
      "${SUDO[@]}" install -m 0644 "$DEST/$f" "$dir/$f"
    fi
  done
  if [[ -f "$DEST/scripts/run-gateway.sh" ]]; then
    "${SUDO[@]}" install -d -m 0755 "$dir/scripts"
    "${SUDO[@]}" install -m 0755 "$DEST/scripts/run-gateway.sh" "$dir/scripts/run-gateway.sh"
  fi
  log "artefacto anterior respaldado en $dir"
}

prune_backups() {
  "${SUDO[@]}" bash -c "ls -1dt '$BACKUP_ROOT'/*/ 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -rf"
}

restore_backup() {
  local dir="$1" stamp
  log "restaurando $dir"
  stamp="$(cat "$dir/DEPLOYED" 2>/dev/null || echo "restored $(date -u +%FT%TZ)")"
  copy_artifact "$dir" "$stamp"
  install_unit
  restart_service
  if wait_http; then
    log "rollback OK: servicio respondiendo"
    return 0
  fi
  echo "error: el rollback tampoco levanta el servicio; revisa:" >&2
  echo "  journalctl -u $SERVICE -n 80 --no-pager" >&2
  return 1
}

ensure_venv() {
  command -v uv >/dev/null 2>&1 || die "falta 'uv' (pipx install uv): lo usamos para el venv con Python $PYTHON_VERSION"
  local uv_bin; uv_bin="$(command -v uv)"
  if [[ ! -x "$DEST/.venv/bin/uvicorn" ]]; then
    log "creando venv ($DEST/.venv, Python $PYTHON_VERSION)"
    "${SUDO[@]}" env "PATH=$PATH" UV_PYTHON_INSTALL_DIR="$DEST/.python" \
      "$uv_bin" venv --python "$PYTHON_VERSION" "$DEST/.venv"
  fi
  log "instalando dependencias"
  "${SUDO[@]}" env "PATH=$PATH" UV_CACHE_DIR=/var/cache/uv \
    "$uv_bin" pip install --quiet --python "$DEST/.venv/bin/python" "$DEST"
}

# ---------------------------------------------------------------- rollback ----
if [[ "$DO_ROLLBACK" -eq 1 ]]; then
  latest="$(ls -1dt "$BACKUP_ROOT"/*/ 2>/dev/null | head -1 || true)"
  [[ -n "$latest" ]] || die "no hay backups en $BACKUP_ROOT"
  restore_backup "${latest%/}"
  exit $?
fi

# --------------------------------------------------------------- prechecks ----
creds_present || die "faltan credenciales en /etc/model-gateway/creds (bash $PKG_DIR/scripts/manage-creds.sh)"

DIRTY="no"
if [[ -n "$(git -C "$PKG_DIR" status --porcelain -- . 2>/dev/null)" ]]; then
  if [[ "$ALLOW_DIRTY" -eq 0 ]]; then
    git -C "$PKG_DIR" status --short -- . >&2 || true
    die "hay cambios sin commitear en $PKG_REL; commitea o usa --allow-dirty (quedará estampado)"
  fi
  DIRTY="yes"
fi

SHA="$(git -C "$PKG_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
BRANCH="$(git -C "$PKG_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
UTC_NOW="$(date -u +%FT%TZ)"

# Materializa la fuente: checkout actual o una revisión concreta.
TMP_DIR=""
cleanup() { if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then rm -rf "$TMP_DIR"; fi; }
trap cleanup EXIT

STAMP="$(printf 'commit=%s\nbranch=%s\ndeployed_at=%s\ndirty=%s\n' "$SHA" "$BRANCH" "$UTC_NOW" "$DIRTY")"

if [[ -n "$REF" ]]; then
  git -C "$PKG_DIR" rev-parse --verify --quiet "$REF^{commit}" >/dev/null || die "ref desconocida: $REF"
  TMP_DIR="$(mktemp -d)"
  git -C "$PKG_DIR" archive "$REF" -- "$PKG_REL" | tar -x -C "$TMP_DIR" || die "no se pudo materializar $REF"
  SRC="$TMP_DIR/$PKG_REL"
  SHA_REF="$(git -C "$PKG_DIR" rev-parse --short "$REF")"
  STAMP="$(printf 'commit=%s\nref=%s\ndeployed_at=%s\ndirty=no\n' "$SHA_REF" "$REF" "$UTC_NOW")"
  BACKUP_DIR="$BACKUP_ROOT/$(date -u +%Y%m%dT%H%M%SZ)-$SHA_REF"
  log "desplegando la revisión $REF ($SHA_REF)"
else
  SRC="$PKG_DIR"
  BACKUP_DIR="$BACKUP_ROOT/$(date -u +%Y%m%dT%H%M%SZ)-$SHA"
  log "desplegando el checkout actual ($SHA en $BRANCH, dirty=$DIRTY)"
fi

# ------------------------------------------------------------------ deploy ----
backup_current "$BACKUP_DIR"
copy_artifact "$SRC" "$STAMP"
install_unit

if ! ensure_venv; then
  echo "error: falló la instalación de dependencias" >&2
  if [[ -f "$BACKUP_DIR/server.py" ]]; then
    restore_backup "$BACKUP_DIR" || true
  fi
  die "deploy abortado antes de arrancar; el artefacto desplegado NO se tocó"
fi

restart_service

if health_check; then
  prune_backups
  echo
  log "desplegado: $(printf '%s' "$STAMP" | tr '\n' ' ')"
  "${SUDO[@]}" systemctl --no-pager --lines=0 status "$SERVICE" 2>/dev/null | head -6 || true
  exit 0
fi

echo "--- journal del intento fallido ---" >&2
"${SUDO[@]}" journalctl -u "$SERVICE" -n 40 --no-pager >&2 || true
echo "-----------------------------------" >&2
if [[ -f "$BACKUP_DIR/server.py" ]]; then
  restore_backup "$BACKUP_DIR" || true
  die "deploy revertido; el artefacto anterior sigue en $BACKUP_DIR"
fi
die "primer despliegue fallido y no había artefacto previo que restaurar (journal arriba)"
