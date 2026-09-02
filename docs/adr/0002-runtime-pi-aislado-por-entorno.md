# Runtime Pi aislado por entorno (enmendado 2026-09-02)

## Principio

Los Entornos **nuevos** (dev/test) tienen su runtime Pi aislado con valores propios (`.pi-dev/*`, `.pi-test/*`). **Producción conserva, sin excepción, todas sus configuraciones de runtime actuales y funcionando** — las vigentes en `.env.prod` (gitignored), tal como quedaron tras la recuperación del incidente: `authJson`, `modelsJson`, `agentDir`, `piPackagesDir`, `artifactsDir`, `sessionsDir`, `traceDir` y puertos.

El refactor **no migra ni reconfigura estado de prod**: el aislamiento se garantiza dando a dev/test los valores nuevos, no tocando los que funcionan en prod. Cambiar la configuración viva de prod fue la causa directa del incidente (pérdida de visibilidad del historial de sesiones y fallo de arranque), por lo que cualquier cambio futuro en prod requiere decisión explícita del operador y verificación de arranque.

## Decisión

- **Prod**: valores vigentes en `.env.prod` (canónicos). No se migra nada: ni sesiones, ni artifacts históricos, ni auth hacia carpetas nuevas. `auth.json` de prod ya está provisionado por Entorno (`.pi-prod/auth.json`, copia materializada en la recuperación) y ese es su valor vigente.
- **Dev**: valores aislados nuevos (`.pi-dev/*`; `CODING_AGENT_SESSIONS_DIR=packages/coding-agent/.pi-dev/sessions`).
- **Test**: valores aislados nuevos (`.pi-test/*`; sessions `.pi-test/sessions`).
- **Sesiones de prod (nota empírica)**: el literal vigente es el dejado por la recuperación (`/home/javier/coding-agent-sessions`), que funciona a nivel del SDK de Pi (las sesiones de conversación viven en `~/.pi/agent/sessions` agrupadas por path del proyecto codificado, y ambos literales gemelos codifican al mismo grupo). Existe su gemelo `/home/javier/coding-agent/sessions` con los datos del historial y `subagents/`. No se cambia nada de prod en este ADR; la elección final del literal (si el operador decide ajustar una línea en la pasada de ejecución) queda a su criterio, sin tocar el servicio.

## Por qué

El aislamiento total original (migrar las 6 vars de prod a `.pi-prod/*` reubicando estado) se revisó tras el incidente del 2026-09-02: apuntar prod a carpetas nuevas hizo que el runtime perdiera la visibilidad del historial de sesiones de Pi y rompió el arranque bajo pm2 (env_file ausente). Los datos nunca se borraron, pero el operador no ve mejora en reubicar un estado activo; la continuidad de prod es prioritaria y el aislamiento se logra por construcción en los entornos nuevos.

## Consequences

- `.env.dev` → `CODING_AGENT_SESSIONS_DIR=packages/coding-agent/.pi-dev/sessions`; `.env.test` → `.pi-test/sessions`; `.env.prod` → literal vigente (ver nota). El resto de variables Pi: `.pi-dev/*` y `.pi-test/*` para dev/test; `.pi-prod/*` vigentes para prod.
- Los artifacts históricos permanecen en `packages/coding-agent/.pi/artifacts` (gitignored, preservados, fuera del servicio actual); no hay plan de migración.
- `.pi-prod/sessions` queda sin uso; los grupos vacíos creados accidentalmente en `~/.pi/agent/sessions` (p. ej. `--…coding-agent-.pi-prod-sessions--`) son cosméticos y pueden ignorarse o limpiarse manualmente.
- El guardarraíl de coherencia (ticket 05) valida solo `POSTGRES_URL ↔ NEXT_PUBLIC_ENV`, no sesiones.
- `packages/config` expone `CODING_AGENT_AUTH_JSON` por entorno; `paths.ts`/`runtime-factory.ts` resuelven relativos contra el package.

## Enmiendas

- **2026-09-02 (v2)**: generaliza la enmienda v1 — el principio pasa de "solo sesiones de prod" a "todas las configuraciones de runtime de prod se conservan vigentes; los entornos nuevos dev/test adoptan valores aislados". Reemplaza la decisión original de aislar las 6 vars de prod en `.pi-prod/*` con migración de estado.
- **2026-09-02 (v1)**: sesiones de prod OUT del aislamiento por migración; dev/test a carpetas aisladas. Motivación: incidente de pérdida de visibilidad del historial.