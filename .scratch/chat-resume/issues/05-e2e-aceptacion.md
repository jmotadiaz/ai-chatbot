# 05: E2E — criterio de aceptación (pantalla off → turno completo)

**What to build:** Ver `../spec.md` ("Criterio de aceptación"). Escenario
Playwright de extremo a extremo con el Mock Model Gateway (`:4001`, entorno
test).

**Blocked by:** 02, 03, 04.

**Status:** ready-for-agent

- [ ] Mock Gateway: alias de comportamiento "stream lento" (si no existe) para
  forzar una generación que siga viva a mitad del escenario.
- [ ] Escenario: prompt largo → POST en vuelo → abortar el fetch a mitad
  (simulación de pantalla apagada, p. ej. `context.setOffline(true)` o cancelar
  la request por CDP) → simular vuelta (`visibilitychange`/`pageshow`,
  red restaurada) → afirmar que el Message se completa en el UI sin tocar
  nada, es un único Message (sin duplicados) y persistió una sola vez
  (recarga posterior muestra el mismo historial).
- [ ] Escenario de remontaje: recargar la página con la generación aún viva →
  reataca por `resume: true` y no reinicia la respuesta.
- [ ] Escenario negativo: resume sin stream activo (TTL evictado) → `204`, UI
  en `ready`, sin error ruidoso.
- [ ] Verificación: `pnpm test:e2e` contra el entorno test (`--env=test`:
  pg 5434, worker stub, Mock Gateway). Nunca apuntar a Producción (8085).

## Comments
