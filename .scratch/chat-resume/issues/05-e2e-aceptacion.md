# 05: E2E — criterio de aceptación (pantalla off → turno completo)

**What to build:** Ver `../spec.md` ("Criterio de aceptación"). Escenario
Playwright de extremo a extremo con el Mock Model Gateway (`:4001`, entorno
test).

**Blocked by:** 02, 03, 04.

**Status:** resolved

- [x] Mock Gateway: alias de comportamiento "stream lento" (si no existe) para
  forzar una generación que siga viva a mitad del escenario.
- [x] Escenario: prompt largo → POST en vuelo → abortar el fetch a mitad
  (simulación de pantalla apagada, p. ej. `context.setOffline(true)` o cancelar
  la request por CDP) → simular vuelta (`visibilitychange`/`pageshow`,
  red restaurada) → afirmar que el Message se completa en el UI sin tocar
  nada, es un único Message (sin duplicados) y persistió una sola vez
  (recarga posterior muestra el mismo historial).
- [x] Escenario de remontaje: recargar la página con la generación aún viva →
  reataca por `resume: true` y no reinicia la respuesta.
- [x] Escenario negativo: resume sin stream activo (TTL evictado) → `204`, UI
  en `ready`, sin error ruidoso.
- [x] Verificación: `pnpm test:e2e` contra el entorno test (`--env=test`:
  pg 5434, worker stub, Mock Gateway). Nunca apuntar a Producción (8085).

## Comments

## Comments

- **Slow stream**: new user-invocable mock capability `slowStream`
  (`tests/mocks/gateway/{catalog,server}.ts`): 8 paced chunks (~350 ms apart) so
  a generation is reliably alive mid-scenario. `ChatStep.delayMs` paces only the
  streaming rendering; all other scripts stay single-tick.
- **Simulating "screen off"**: `context.setOffline(true)` was measured NOT to
  kill an in-flight streaming fetch in Chromium (a loopback connection keeps
  delivering bytes), so the spec installs an `addInitScript` that wraps
  `window.fetch`: the first `POST /api/chat` gets a body that forwards ~6 SSE
  frames, then `reader.cancel()` + `controller.error(new TypeError("Failed to
  fetch"))` — the exact rejection a killed fetch produces (the SDK maps it to
  `isDisconnect`, status `error`, and the turn stays pending client-side).
  The server keeps generating: the tee's registry branch is unaffected.
- **Scenarios** (`tests/e2e/chat/resume.spec.ts`):
  1. screen off → back on: the visibility event resumes the turn's `streamKey`,
     the replay completes the SAME single assistant message, no user action;
  2. reload mid-generation on a persisted chat (`/chat/<id>`): the remount's
     `resume: true` re-attaches to the live stream, exactly ONE `POST /api/chat`
     across the reload (re-attached, not restarted);
  3. no in-flight turn: the mount probe answers `204`, the UI stays `ready`
     with no error.
- **Caveat found while writing it**: a brand-new chat only knows its
  client-side draft id, so a hard reload mid-turn would resume a different id;
  the reload scenario therefore uses a persisted chat. The screen-off scenario
  waits for the mount probe (`204`) to settle before sending — otherwise the
  dev server can handle that probe after the POST registered the entry and the
  mount itself attaches to the live stream (a legitimate resume, but not the
  path under test).
- Verification: full `pnpm --filter chatbot test:e2e` green (39 passed, 10
  skipped — pre-existing `test.skip`/`fixme`), plus type:check, lint, unit,
  component and contract.

### Refinement (E2E regression): mount probe removed, scenarios adjusted

The unconditional mount probe (`resume: true`) caused intermittent failures
in `seed.spec.ts` (~1/3 of runs). After gating the mount resume to
reload/back_forward navigations (see ticket 04):

- Scenario 1 ("screen off"): the mount-probe wait/`204` assertion was removed
  (a normal `goto` issues no probe now, so nothing can race the turn); the
  rest is unchanged (streamKey in the body, visibility resume by key, single
  message, full text).
- Scenario 2 ("reload mid-generation"): unchanged — the reload probe now
  comes from our hook instead of `resume: true`.
- Scenario 3 ("no in-flight turn"): now asserts a normal `goto` issues NO
  `GET /api/chat/*/stream` at all, and a `page.reload()` probes and answers
  `204` with the UI staying `ready`, no error, and exactly one stream GET.
- **New: `warmUpResumeRoute` in scenarios 1–2.** Debugging the post-fix
  failures revealed a second, independent dev-server hazard: `next dev`
  (webpack) compiles route handlers ON DEMAND and each first compile
  re-evaluates the shared server modules — wiping module-level state, the
  in-memory resume registry included. With the old unconditional `resume:
  true` mount probe this never bit (the probe compiled the stream route
  before any POST); with the gated probe, the stream route's first compile
  could land between the POST (`register`) and the reconnect (`attach`),
  answering the resume with a registry-miss `204`. A production build
  compiles every route into one module graph, so prod is immune; the warm-up
  (`GET /api/chat/resume-warm-up/stream` → `204`) pins the route's
  compilation before the turn starts. With it, the suite is stable: resume
  spec 5/5, seed spec 5/5, full suite 39 passed / 10 skipped.
