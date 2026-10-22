#!/usr/bin/env bash
# Guarda del árbol sucio para el despliegue del Model Gateway.
#
# Se SOURCEA (no se ejecuta): define `dirty_guard_confirm`.
#
# `dirty_guard_confirm <pkg_dir> <pkg_rel> <allow_dirty>`
#   - Árbol limpio            → no dice nada, devuelve 0.
#   - Árbol sucio + allow_dirty=1 → no dice NADA (ni aviso ni pregunta) y
#     devuelve 0: el operador ya ha declarado la intención de desplegar así.
#   - Árbol sucio + allow_dirty=0 → avisa (lista los cambios), pregunta
#     «¿Desplegar de todos modos? [y/N]» y devuelve 0 solo si el operador
#     responde y/yes/s/si. Cualquier otra respuesta (incluido EOF o una
#     entrada vacía) devuelve 1 → el despliegue se cancela.
#
# Deja en `DIRTY_GUARD_DIRTY` ("yes"/"no") si el árbol está sucio: lo usa el
# sello `DEPLOYED` para dejar constancia de qué se desplegó.

dirty_guard_confirm() {
  local pkg_dir="$1"
  local pkg_rel="$2"
  local allow_dirty="${3:-0}"

  DIRTY_GUARD_DIRTY="no"

  # ¿Hay cambios sin commitear en el paquete?
  if [[ -z "$(git -C "$pkg_dir" status --porcelain -- . 2>/dev/null)" ]]; then
    return 0
  fi

  DIRTY_GUARD_DIRTY="yes"

  # Sin preguntas ni aviso si el operador ya lo ha pedido explícitamente
  # (pero el sello `DEPLOYED` sigue dejando constancia: dirty=yes).
  if [[ "$allow_dirty" == "1" ]]; then
    return 0
  fi

  printf 'aviso: hay cambios sin commitear en %s:\n' "$pkg_rel" >&2
  git -C "$pkg_dir" status --short -- . >&2 || true

  local answer=""
  printf '¿Desplegar de todos modos? (quedará estampado dirty=yes) [y/N] ' >&2
  read -r answer || answer=""

  case "${answer,,}" in
    y|yes|s|si|sí) return 0 ;;
    *) return 1 ;;
  esac
}
