# 01: Lookup directo por nombre de fichero en `loadSessionFromDisk`

**What to build:** Ver `../spec.md`. Sustituir `SessionManager.list()` por localización del
`.jsonl` por nombre + `SessionManager.open()`.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] Confirmar en el SDK de Pi (`@earendil-works/pi-coding-agent@0.85.1`, `dist/core/session-manager*`)
  el patrón exacto de nombre de fichero de sesión y la API de `SessionManager.open()`: Pi escribe
  `<timestamp ISO>_<sessionId>.jsonl` y `open(path, sessionDir)` relee solo ese fichero. La carpeta
  la resuelve `getDefaultSessionDir(cwd)` (`<agent dir>/sessions/--<cwd encoded>--`), no exportada;
  `src/session/session-file-lookup.ts` la espeja y el test de integración la fija creando sesiones
  reales con el SDK.
- [x] `session-registry.ts:93`: localizar por nombre con `readdir` y abrir directamente; si no
  hay match, devolver `undefined` sin parsear ficheros. Se verifica además que el id abierto
  coincide (un fichero vacío/perdido hace que `open()` cree una sesión nueva con otro id).
- [x] Tests (TDD) en `packages/coding-agent/tests/{unit,integration}`: encuentra la sesión
  correcta entre varias; sesión inexistente devuelve `undefined`; no lee el contenido de otras
  transcripciones (p.ej. fichero corrupto ajeno no afecta).
- [x] Medir antes/después (log de duración de `session.load_disk_*`). Fixture sintético de 383
  ficheros / 175.6 MB: `SessionManager.list()+open` 1297–1546 ms vs lookup por nombre + `open`
  4 ms (≈360× menos). Nuevo timer `session.load_disk_lookup` en el trace del worker.
- [x] Verificación: type-check, lint, tests y `pnpm --filter coding-agent build:verify`.
  **Nunca `build` ni tocar pm2.**

## Comments

### 2026-10-22 — Implementado

- `findSessionFile(cwd, sessionId)` (`src/session/session-file-lookup.ts`): `readdir` de la carpeta
  de sesiones de Pi + match de `<sessionId>.jsonl` / `_<sessionId>.jsonl` (gana el más reciente
  si hay varios). `resolveSessionDir(cwd)` espeja `getDefaultSessionDir` del SDK; el test de
  integración crea transcripciones con `SessionManager.create` y las relee por este módulo.
- `SessionRegistry.loadSessionFromDisk` abre el fichero encontrado con `SessionManager.open` y
  exige que `getSessionId()` coincida; si no, warning `session.load_disk_id_mismatch` y `undefined`
  (nunca se registra la sesión nueva que `open()` fabrica para un fichero vacío o desaparecido).
- Tests: 6 unit (`resolveSessionDir`, matcher puro) y 8 integración (lookup por nombre entre
  varias, inexistente, transcripciones ajenas corruptas/truncadas, header con id ajeno,
  subagents).

