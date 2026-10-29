#!/usr/bin/env bash
# Dirty-tree guard for the Model Gateway deployment.
#
# It is SOURCED (not executed): it defines `dirty_guard_confirm`.
#
# `dirty_guard_confirm <pkg_dir> <pkg_rel> <allow_dirty>`
#   - Clean tree              → says nothing, returns 0.
#   - Dirty tree + allow_dirty=1 → says NOTHING (no warning, no question) and
#     returns 0: the operator has already declared the intention to deploy like that.
#   - Dirty tree + allow_dirty=0 → warns (lists the changes), asks
#     "Deploy anyway? [y/N]" and returns 0 only if the operator
#     answers y/yes/s/si. Any other answer (including EOF or an
#     empty input) returns 1 → the deployment is cancelled.
#
# It leaves `DIRTY_GUARD_DIRTY` ("yes"/"no") if the tree is dirty: the
# `DEPLOYED` stamp uses it to record what was deployed.

dirty_guard_confirm() {
  local pkg_dir="$1"
  local pkg_rel="$2"
  local allow_dirty="${3:-0}"

  DIRTY_GUARD_DIRTY="no"

  # Are there uncommitted changes in the package?
  if [[ -z "$(git -C "$pkg_dir" status --porcelain -- . 2>/dev/null)" ]]; then
    return 0
  fi

  DIRTY_GUARD_DIRTY="yes"

  # No questions and no warning if the operator already asked for it
  # explicitly (but the `DEPLOYED` stamp still records it: dirty=yes).
  if [[ "$allow_dirty" == "1" ]]; then
    return 0
  fi

  printf 'warning: there are uncommitted changes in %s:\n' "$pkg_rel" >&2
  git -C "$pkg_dir" status --short -- . >&2 || true

  local answer=""
  printf 'Deploy anyway? (it will be stamped dirty=yes) [y/N] ' >&2
  read -r answer || answer=""

  case "$answer" in
    [yY]|[yY][eE][sS]|[sS]|[sS][iI]|sí|Sí|sÍ|SÍ) return 0 ;;
    *) return 1 ;;
  esac
}
