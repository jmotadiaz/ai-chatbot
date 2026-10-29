# 01: Preparar la transición y migrar Compaction

**What to build:** Preparar una transición compatible entre la organización
actual y la del ADR 0013, y demostrar el enfoque social con Compaction. La
suite sigue ejecutándose durante la migración sin perder ni duplicar
silenciosamente la selección de tests.

**Blocked by:** Ninguno (puede comenzar inmediatamente).

**Status:** completado con cuestión de producto abierta (punto de corte con un único Message: título corregido, comportamiento sin decidir)

- [x] Los selectores reconocen tanto la organización actual como la nueva durante la transición; los comandos y perfiles existentes siguen funcionando sin omitir ni ejecutar inadvertidamente dos veces una misma suite.
- [x] Las garantías de Compaction se inventarían y consolidan preferentemente desde la interfaz de la capacidad, con persistencia PGlite y respuestas controladas en la frontera HTTP del Model Gateway cuando corresponda.
- [x] Se conservan las reglas, límites y fallos significativos con cobertura equivalente demostrada; los tests aislados o de subcapacidades se mantienen cuando su contrato o coste lo justifique.
- [x] Se investiga la discrepancia entre el título y las aserciones del caso de punto de corte con un único Message; se consulta al operador antes de decidir un comportamiento no aclarado.
- [x] Se registra en los comentarios del ticket qué garantías se conservan, trasladan o eliminan y qué evidencia demuestra cada equivalencia.
- [x] Se ejecutan las selecciones afectadas y se verifican el descubrimiento y la propagación de fallos; no se usan servicios ni artefactos de Production.

## Evidencia de ejecución (rama `agent/social-testing-01`)

Entorno: Node 24.15.0 (nvm), pnpm 11.5.0, worktree dedicado. Sin builds de
Production, sin `pm2`, sin servicios ni artefactos de Production. Para compilar
la configuración tipada se crearon `packages/config/src/secrets.{dev,prod}.ts`
copiando la plantilla `secrets.example.ts` (gitignored; **sin secretos reales**,
ajustados a la regla de DSN del Environment). El operador debe sustituirlos si
necesita ejecutar Development.

### Selectores y perfiles (chatbot)

- Descubrimiento con `vitest list --filesOnly`: perfil por defecto 111 archivos,
  perfil de infraestructura 1 archivo (`tests/integration/mocks/gateway/gateway.test.ts`),
  intersección vacía. Juntos son 112 archivos `*.test.*` de `tests/` (excluido
  `tests/e2e`, Playwright): ningún archivo queda sin perfil ni se ejecuta dos veces.
- `pnpm test:unit` → 53 archivos / 426 tests, exit 0 (incluye `tests/unit/compaction`).
- `pnpm test:infra` → 1 archivo / 22 tests, exit 0.
- Selección negativa (`tests/unit/compaction/does-not-exist.test.ts`) → exit 1 con
  el `include` impreso: una selección vacía no produce falso éxito.
- No se renombró ningún directorio: la transición mantiene `tests/{unit,component,integration,contract}`.

### Garantías de Compaction

Suite: `tests/unit/compaction` (6 archivos, **36 tests passing** en el perfil
por defecto, PGlite en memoria + Gateway simulado por MSW en la frontera HTTP).

| Garantía | Destino | Evidencia |
|---|---|---|
| Persistencia: resumen guardado, `modelUsed`, `messageId`, `reasoning-default` por HTTP | Conservada (social) | `compaction-flow.test.ts` "compact saves a summary…" |
| Chat vacío y señal de abort no generan inferencia ni resumen | Conservada (social) | `compaction-flow.test.ts`, 2 tests |
| Fallo de summarización no persiste resumen | Conservada; **nueva** | `compaction-flow.test.ts` "does not persist…" |
| Contrato `reasoning-default` / `vision-default`, temperatura 0.1, prompt inicial e incremental, prefijo de turno, propagación de error de Gateway | Conservada (social, HTTP) | `summary-generation.test.ts` (5 tests) sustituye a los 3 tests de provenance con puerto inyectado |
| Umbral y frontera de `shouldCompact` | Aislada (regla pura con límites) | `should-compact.test.ts` (5) |
| Estimación de tokens (chars/4, 4800 por archivo, usage del proveedor) | Aislada (regla pura) | `token-estimation.test.ts` (11) |
| Punto de corte: orden, límites entre mensajes completos | Aislada (regla pura) | `cut-point.test.ts` (6), excepto el caso de un único Message (ver bloqueo) |
| Serialización (prefijos, reasoning, archivos, truncado a 2000 caracteres) | Aislada (regla pura con límite) | `serialize-messages.test.ts` (5) |

Comparación con el commit anterior 5f336a26: los tres tests del archivo de flujo
retirado de `tests/integration/compaction/` tienen equivalente idéntico en
`tests/unit/compaction/compaction-flow.test.ts`. Ningún test de Compaction
existe en `tests/e2e` ni se propone E2E: no hay garantía de navegador que
requiera Compaction.

### Bloqueo abierto: punto de corte con un único Message (requiere decisión del operador)

- El título de `cut-point.test.ts` "keeps all messages if single message exceeds
  threshold" dice que se conservan todos los mensajes.
- Sus aserciones dicen `cutIndex 0`, `messagesToSummarize` de 1 y `messagesToKeep` vacío.
- La implementación (`lib/features/compaction/cut-point.ts`) hace lo segundo: un
  Message que supera el umbral se resume completo y no se conserva nada.
- No se ha cambiado ni la implementación ni la aserción: el comportamiento
  esperado no está aclarado en la spec. La cuestión queda abierta para el operador;
  el test sigue activo (no omitido) y su título no se ha modificado.

### Limitaciones

- No se ejecutaron `lint`, `type:check`, `test:e2e` ni `build:verify`: el ticket no
  cambia código y no hay E2E de Compaction; la verificación fue de selección y de tests afectados.
- Los tests de `summary-generation` y `compaction-flow` ejercitan el Gateway solo
  mediante MSW (sin servidor real); no prueban compatibilidad con proveedores.
- Las evaluaciones de Compaction (`tests/evals`) no se ejecutaron ni se usaron para validar.

## Investigación del punto de corte con un único Message (2026-10-29)

Búsqueda en spec, ADR 0013, `openspec/` y el historial de git. Resultado: **no
existe ninguna decisión explícita** que resuelva la discrepancia; no se ha
cambiado la garantía.

- `spec.md` (nota adicional) declara la discrepancia y pide determinar el
  comportamiento esperado antes de cambiar la garantía; no lo determina.
- ADR 0013 no menciona el punto de corte ni Compaction.
- `openspec/changes/context-compaction/specs/.../spec.md` (introducido en
  `5ee5977f`, "add first version of compactation") define el punto de corte
  como acumular tokens desde el mensaje más reciente hasta alcanzar
  `keepRecentTokens`, con cortes entre mensajes completos. No contiene ningún
  escenario para un único mensaje que supera el umbral.
- El título "keeps all messages if single message exceeds threshold" y sus
  aserciones (`cutIndex` 0, 1 resumido, 0 conservados) existen desde la
  primera versión del test (`2dc11007`) y la implementación actual de
  `findCutPoint` es la misma desde `5ee5977f`. La discrepancia es, por tanto,
  original y nunca se resolvió por escrito.

Conclusión: el comportamiento es una decisión de producto abierta. Se mantiene
el comportamiento actual (resumir el mensaje oversized), el test sigue activo
y el ticket permanece **bloqueado** hasta que el operador elija entre (a)
conservar el mensaje completo (cambiar la implementación y el título/aserciones
en consecuencia) o (b) resumirlo y renombrar el título para que describa lo que
ya se verifica.

Re-verificación en esta sesión (Node 24.15.0): `vitest run tests/unit/compaction`
→ 6 archivos, 36 tests passing, exit 0.

## Prueba de selección en ambas organizaciones (transición)

La partición de perfiles por sí sola no bastaba. Se crearon archivos sonda
temporales en ambas organizaciones, se comprobó la selección y la ejecución y
después se eliminaron (sin cambios de configuración: los globs ya incluyen ambas).

Sondas (en `packages/chatbot/tests/`):
- Organización actual: `integration/transition-probe/current-layout.test.ts`,
  `component/transition-probe/current-component.test.tsx`
- Organización por capacidad (`unit`): `unit/transition-probe/capability-unit.test.ts`
- Infraestructura (en `integration/mocks/`): `integration/mocks/transition-probe/infra-probe.test.ts`

Resultados (Node 24.15.0):
- `vitest list --filesOnly` perfil por defecto: las 3 sondas no infra aparecen
  una vez cada una (3 ocurrencias); perfil infra: solo la sonda infra (1 ocurrencia).
- Ejecución completa (JSON reporter): perfil por defecto ejecuta las 3 sondas, cada
  una con 1 aserción `passed`, exit 0; perfil infra ejecuta solo la sonda infra
  (1 aserción `passed`), exit 0.
- Selección por archivo: cada sonda, pasada por ruta, ejecuta 1 test `passed`
  exit 0 en su perfil.
- Negativos: la sonda infra con el perfil por defecto y la sonda `unit` con el
  perfil infra no se ejecutan (exit 1, "no test files"), sin duplicados.

Limitaciones: las sondas son archivos temporales; no quedan en el repositorio y
no hay una prueba permanente de este contrato. Los `secrets.{dev,prod}.ts`
siguen siendo placeholders locales.

## Resolución conservadora del título y guarda permanente (2026-10-29, `agent/social-testing-01-final`)

Decisión (del operador): el título "keeps all messages if single message exceeds
threshold" era engañoso. Se corrige el título a "summarizes a single message that
exceeds the threshold and keeps none" y se añade un comentario que lo marca como
comportamiento actual, no como decisión aprobada. **No cambian** implementación ni
aserciones. La pregunta de producto (conservar o resumir un Message oversized) sigue
abierta; es un bloqueo de decisión, no de ejecución.

Guarda permanente de selección: `packages/chatbot/tests/contract/test-profile-selection.test.ts`
(3 tests). Usa `createVitest` y `projects[0].globTestFiles()` sobre `vitest.config.ts`
y `vitest.infra.config.ts`:
- todo `tests/**/*.test.ts(x)` en disco (excepto `e2e/`) lo selecciona exactamente un perfil;
- `tests/integration/` y `tests/unit/compaction/` están en el perfil por defecto;
- el perfil infra selecciona solo `tests/integration/mocks/` (no vacío).
Mutación: un archivo huérfano temporal en `tests/probe-uncovered/` hizo fallar el
primer test; al eliminarlo volvió a pasar.

Verificación (Node 24.15.0, `PATH=/Users/javier.mota/.nvm/versions/node/v24.15.0/bin:$PATH`):
- `pnpm test:unit` 54 archivos passed; `test:component` 40 passed; `test:integration` 8 passed;
  `test:contract` 10 passed, 1 skipped; `test:infra` 1 archivo passed. Todos exit 0.
- `vitest run tests/unit/compaction` → 6 archivos, 36 tests passed.
- `eslint` sobre los dos archivos tocados: exit 0. `pnpm type:check` (tsc --noEmit): exit 0.
- `pnpm test:fast` no existe en `packages/chatbot` (ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL):
  es un script del raíz; por eso se ejecutaron las suites equivalentes por separado.

Limitaciones: `secrets.{dev,prod}.ts` son placeholders gitignored; no se ejecutó
`test:e2e` ni `build:verify`; no se tocó producción; no se creó PR.
