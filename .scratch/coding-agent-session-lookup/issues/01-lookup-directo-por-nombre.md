# 01: Lookup directo por nombre de fichero en `loadSessionFromDisk`

**What to build:** Ver `../spec.md`. Sustituir `SessionManager.list()` por localización del
`.jsonl` por nombre + `SessionManager.open()`.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Confirmar en el SDK de Pi (`@earendil-works/pi-coding-agent@0.85.1`, `dist/core/session-manager*`)
  el patrón exacto de nombre de fichero de sesión y la API de `SessionManager.open()`.
- [ ] `session-registry.ts:93`: localizar por nombre con `readdir` y abrir directamente; si no
  hay match, devolver `undefined` sin parsear ficheros.
- [ ] Tests (TDD) en `packages/coding-agent/tests/{unit,integration}`: encuentra la sesión
  correcta entre varias; sesión inexistente devuelve `undefined`; no lee el contenido de otras
  transcripciones (p.ej. fichero corrupto ajeno no afecta).
- [ ] Medir antes/después (log de duración de `session.load_disk_*`).
- [ ] Verificación: type-check, lint, tests y `pnpm --filter coding-agent build:verify`.
  **Nunca `build` ni tocar pm2.**

## Comments
