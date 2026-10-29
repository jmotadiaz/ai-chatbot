# 03: Separar las evaluaciones de calidad

**What to build:** Separar las evaluaciones de calidad de modelos de las
categorías de tests sin cambiar cómo se ejecutan ni sugerir que respuestas
simuladas demuestran calidad de un modelo real.

**Blocked by:** Ninguno (puede comenzar inmediatamente).

**Status:** done

- [x] El entorno de ejecución, los casos y recursos de evaluación quedan fuera de los directorios de tests y fuera del comando unitario.
- [x] Se actualizan selección, imports, configuración, rutas de recursos y documentación necesarios para que los comandos de evaluación sigan resolviendo sus casos.
- [x] Se conserva la semántica actual de ejecución y de selección de Environment; no se redirige ninguna evaluación a proveedores reales.
- [x] La documentación explica la discrepancia existente entre las afirmaciones de modelos reales y el uso de Test Environment/Mock Model Gateway, sin atribuir validez a resultados históricos no verificados.
- [x] Se comprueban las referencias y la selección sin ejecutar evaluaciones contra proveedores reales; las limitaciones de validación se notifican explícitamente.

## Evidencia

- Traslado: `packages/chatbot/tests/evals/` → `packages/chatbot/evals/` con `git mv`
  (historial preservado). Los imports relativos entre `cases/`, `lib/` y
  `scenarios/` no cambian porque la estructura interna se conserva.
- Referencias actualizadas: `scripts/eval-runner.ts` (lockfile y directorio de
  casos), `evals/README.md`, `evals/lib/trace-writer.ts`,
  `evals/cases/mode-routing.eval.ts`, `.gitignore` raíz y del paquete,
  `AGENTS.md` del paquete y la skill local `trace-analyzer`.
- Selección: `vitest.config.ts` (perfil por defecto) solo incluye `tests/**`,
  por lo que `pnpm test:unit` ya no toca `evals/`.
- Semántica sin cambios: `evalite.config.ts`, `initConfig`, el comando
  `pnpm eval` y la lógica del runner no se han modificado.
- Comprobaciones (Node 24.15.0, sin ejecutar evaluaciones):
  - `pnpm run type:check` (chatbot): correcto.
  - `eslint evals scripts/eval-runner.ts`: correcto.
  - `pnpm run test:unit`: 53 ficheros, 426 tests correctos.
  - Runner sin `--env`: rechaza la ejecución (guardarraíl ADR 0011).
  - Runner con `--env=test --no-server --no-db --no-migrate -c does-not-exist`:
    resuelve `evals/cases` y lista `compaction` y `mode-routing`; termina con
    código 1 y libera el lockfile.

## Limitaciones

- No se ha ejecutado ninguna evaluación (ni `pnpm eval`, ni `evalite run`):
  la validación de la selección es estática y de descubrimiento de casos.
- En un worktree nuevo faltan `packages/config/src/secrets.{dev,prod}.ts`
  (gitignored). Tanto `tsc` como el runner y Vitest los necesitan. Para las
  comprobaciones se usó temporalmente `secrets.example.ts` (con el DSN de dev
  corregido a `:5433`) y después se eliminó. No se copiaron secretos reales.
  Con el template original, la guardarraíl de dev rechaza el DSN de prod
  (`:5435`), lo que confirma que la validación funciona.
- No se ha ejecutado `pnpm build:verify` ni E2E: no son necesarios para este
  traslado, que no toca código de producción.
- Discrepancia documentada, no resuelta: el README de evals y los casos
  describen modelos reales (p. ej. juez Deepseek), pero el runner indica que
  los casos in-process usan el Environment de test y el Mock Model Gateway
  (`:4001`). Esto queda pendiente de la investigación de evaluaciones
  (ticket 04 / runner). Los resultados históricos no se consideran verificados.
