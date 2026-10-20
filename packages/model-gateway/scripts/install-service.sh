#!/usr/bin/env bash
# Instala el Model Gateway como unidad systemd endurecida (DynamicUser=yes).
#
# Por qué copia el paquete a /opt: la unidad corre con un UID transitorio
# (DynamicUser), así que no puede leer /home/<operador>. /opt/model-gateway es
# el artefacto que ejecuta el servicio: read-only para el proceso (systemd lo
# cubre con ProtectSystem=strict) y separado del checkout, de modo que editar
# el repo no cambia en caliente lo que corre en producción.
#
# Idempotente: se puede relanzar tras tocar config.yaml (reinicia la unidad).
#
# Requisitos: `uv` en el PATH (sirve un CPython gestionado, sin tocar el
# intérprete del sistema) y sudo. Las credenciales se cargan aparte con
# scripts/manage-creds.sh.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="/opt/model-gateway"
UNIT="/etc/systemd/system/model-gateway.service"
PYTHON_VERSION="${PYTHON_VERSION:-3.12}"

if [[ $EUID -eq 0 ]]; then SUDO=(); else SUDO=(sudo); fi

if ! command -v uv >/dev/null 2>&1; then
  echo "error: falta 'uv' (pipx install uv). Se usa para crear el venv con Python $PYTHON_VERSION sin tocar el intérprete del sistema." >&2
  exit 1
fi
UV_BIN="$(command -v uv)"

echo "==> Copiando el paquete a $DEST"
"${SUDO[@]}" install -d -m 0755 "$DEST" "$DEST/scripts"
"${SUDO[@]}" install -m 0644 \
  "$SRC/server.py" "$SRC/catalog.py" "$SRC/config.yaml" \
  "$SRC/pyproject.toml" "$SRC/CONTRACT.md" "$SRC/README.md" \
  "$DEST/"
"${SUDO[@]}" install -m 0755 "$SRC/scripts/run-gateway.sh" "$DEST/scripts/run-gateway.sh"

if [[ ! -x "$DEST/.venv/bin/uvicorn" ]]; then
  echo "==> Creando venv ($DEST/.venv, Python $PYTHON_VERSION)"
  "${SUDO[@]}" env "PATH=$PATH" UV_PYTHON_INSTALL_DIR="$DEST/.python" \
    "$UV_BIN" venv --python "$PYTHON_VERSION" "$DEST/.venv"
fi

echo "==> Instalando dependencias (litellm[proxy], fastapi, uvicorn, httpx, pyyaml)"
"${SUDO[@]}" env "PATH=$PATH" UV_CACHE_DIR=/var/cache/uv \
  "$UV_BIN" pip install --python "$DEST/.venv/bin/python" "$DEST"

echo "==> Instalando la unidad"
"${SUDO[@]}" install -m 0644 "$SRC/systemd/model-gateway.service" "$UNIT"
"${SUDO[@]}" systemctl daemon-reload

if [[ ! -d /etc/model-gateway/creds ]] || ! compgen -G "/etc/model-gateway/creds/*.cred" >/dev/null; then
  echo
  echo "AVISO: no hay credenciales en /etc/model-gateway/creds."
  echo "       Cárgalas antes de arrancar: bash $SRC/scripts/manage-creds.sh"
  echo "       (la unidad fallará hasta que existan los 7 .cred)"
  exit 0
fi

if systemctl is-active --quiet model-gateway; then
  echo "==> Reiniciando model-gateway"
  "${SUDO[@]}" systemctl restart model-gateway
else
  echo "==> Habilitando y arrancando model-gateway"
  "${SUDO[@]}" systemctl enable --now model-gateway
fi

echo
echo "==> Estado:"
"${SUDO[@]}" systemctl --no-pager --lines=0 status model-gateway || true
