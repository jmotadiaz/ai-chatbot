# 15: Completar comandos y retirar la organización anterior

**What to build:** Una vez migradas las capacidades, ofrecer la taxonomía y
los perfiles definitivos sin dejar suites sin ejecutar ni mantener categorías
históricas como estructura principal.

**Blocked by:** 01: Preparar la transición y migrar Compaction; 04: Migrar Chat Mode y conversación; 05: Migrar Hub, sidebar e historial; 06: Migrar Projects y configuración de modelo; 07: Revisar navegación y Background Generation; 08: Migrar Attachments, Prompt Refiner y recorrido básico; 09: Migrar Coding Agent Client; 10: Migrar RPC y servidor de artefactos del Worker; 11: Migrar sesiones y extensiones del Worker; 12: Migrar las pruebas del Model Gateway; 13: Migrar configuración, tracing y guardarraíles; 14: Migrar las capacidades restantes del chatbot.

**Status:** done

- [x] Los tests de cada paquete están organizados en las categorías unit y E2E según el ADR 0013; se retiran selectores y categorías históricos solo después de comprobar que no quedan tests dependientes.
- [x] Un comando unitario raíz ejecuta los tests unitarios autocontenidos de todos los paquetes, incluida la suite Python del Model Gateway; se conserva la selección por paquete y archivo.
- [x] El perfil por defecto no requiere servicios preexistentes; existe un perfil explícito para infraestructura aprovisionada y está incluido en la verificación completa.
- [x] Se comprueba el descubrimiento real y la propagación de fallos con selecciones representativas, incluido un test Python; una suite ausente o fallo hijo no produce éxito silencioso.
- [x] Se actualizan coherentemente scripts, configuración de runners, CI, imports e instrucciones afectadas; no se reintroduce un selector de Environment mediante variables de entorno.
- [x] Los perfiles se ejecutan con datos aislados y sin limpieza destructiva global ni alteraciones de Production; se registran las limitaciones de validación.


## Evidence

Entorno: worktree `agent/social-testing-15`, Node 24.14.0, pnpm 11.5.0,
`python3 -m pytest` 9.0.2 disponible, `pnpm install --frozen-lockfile` en el
worktree. Sin `pm2`, sin `pnpm build`, sin servicios ni artefactos de
Production; ningún puerto de Production se tocó y no se ejecutó E2E.

### Organización final (una categoría unit + E2E)

Movidos a `tests/unit/<capacidad>/` conservando sus garantías y su contenido
(solo cambiaron rutas relativas de imports y comentarios de ruta):

| Antes | Ahora |
| --- | --- |
| `chatbot/tests/component/chat/response.test.tsx` | `chatbot/tests/unit/chat/response.test.tsx` |
| `chatbot/tests/component/chat/use-chat-resume.lifecycle.test.tsx` | `chatbot/tests/unit/chat/resume/use-chat-resume.lifecycle.test.tsx` |
| `chatbot/tests/component/ui/shimmer.test.tsx` | `chatbot/tests/unit/ui/shimmer.test.tsx` |
| `chatbot/tests/contract/chat/{get-stream-route,post-route-registry-feed,post-route-resume-persistence}.test.ts` | `chatbot/tests/unit/chat/resume/` |
| `chatbot/tests/contract/client-bundle-no-secrets.test.ts` | `chatbot/tests/unit/scripts/client-bundle-no-secrets.test.ts` |
| `chatbot/tests/integration/mocks/gateway/gateway.test.ts` (perfil de infraestructura) | `chatbot/tests/unit/mocks/gateway/gateway.test.ts` |
| `coding-agent/tests/contract/artifacts-extension.test.ts` | `coding-agent/tests/unit/artifacts/artifacts-extension.test.ts` |
| `coding-agent/tests/contract/http-transport-{cancel,connect,followup,steer}.test.ts` | `coding-agent/tests/unit/rpc/` |
| `chatbot/tests/unit/tracing/trace-sink-registry.test.ts` | `tracing/tests/unit/trace-sink-registry.test.ts` (propiedad del paquete que prueba; `tracing` gana su primer suite real y su `vitest.config.ts`) |

Retirados: directorios `tests/{component,contract,integration}` en chatbot y
`tests/contract` en coding-agent; scripts raíz `test:component`,
`test:integration`, `test:contract`, `test:fast`; scripts por paquete
`test:component|test:integration|test:contract` y `test:all`; patrones de
`include` de los configs de Vitest; `--passWithNoTests` (el perfil por defecto
ya no puede pasar con una selección vacía). `packages/chatbot/tests/e2e` sigue
intacto para Playwright.

`tests/unit/architecture/test-profile-selection.test.ts` (reescrito) es el
contrato de la taxonomía: exige que `tests/` contenga solo
`["e2e","helpers","mocks","unit"]`, que todo archivo `*.test.*` esté en exactamente
un perfil y que el perfil de infraestructura seleccione únicamente
`tests/unit/mocks/gateway/gateway.test.ts`.

### Comandos y resultados reales

| # | Comando | Resultado |
| --- | --- | --- |
| 1 | `pnpm test:unit` (raíz, ejecución completa) | **exit 0** — chatbot 127 archivos (827 tests + 1 skipped: contrato de bundle sin `.next/verify`), coding-agent 41/355, config 3/30, tracing 1/5, toolkit Model Gateway JS 4/48, Python `56 passed` |
| 2 | `pnpm --filter chatbot test:unit` | exit 0 — 127 archivos, 828 tests |
| 3 | `pnpm --filter coding-agent test:unit` | exit 0 — 41 archivos, 355 tests |
| 4 | `pnpm --filter config test:unit` / `pnpm --filter tracing test:unit` / `pnpm --filter @ai-chatbot/model-gateway-testing test:unit` | exit 0 — 30 / 5 / 48 tests |
| 5 | `pnpm --filter chatbot test:unit tests/unit/chat/resume/registry.test.ts` (selección por archivo) | exit 0 — **1 archivo, 37 tests** |
| 6 | `pnpm --filter coding-agent test:unit tests/unit/rpc/http-transport-connect.test.ts` | exit 0 — 1 archivo, 4 tests |
| 7 | `pnpm --filter @ai-chatbot/model-gateway exec python3 -m pytest tests/unit/test_catalog.py -q` (un test Python) | exit 0 — `26 passed` |
| 8 | `pnpm test:infra` (perfil aprovisionado) | exit 0 — 1 archivo, 22 tests |
| 9 | `ss -tlnp \| grep 4001` tras la ejecución por defecto | sin listeners: el perfil por defecto es autocontenido |
| 10 | `pnpm --filter chatbot test:unit tests/unit/does-not-exist.test.ts` | **exit 1** — `No test files found` + `include`/`exclude` impresos; una selección vacía no pasa |
| 11 | `pnpm --filter tracing test:unit tests/unit/does-not-exist.test.ts` | **exit 1** |
| 12 | `pnpm --filter @ai-chatbot/model-gateway exec python3 -m pytest tests/unit/does-not-exist.py -q` | **exit 1** (pytest exit 4) |
| 13 | Hijo Node fallando: test temporal en `packages/config/tests/unit/` + `pnpm test:unit` | **exit 1** en el hijo de `config`; los hijos posteriores (tracing, toolkit, Python) no se ejecutaron; archivo temporal eliminado |
| 14 | Hijo Python fallando: test temporal en `packages/model-gateway/tests/unit/` + `pnpm test:unit` | **exit 1** — `1 failed, 56 passed`, propagado por el último eslabón de la cadena; archivo temporal eliminado |
| 15 | `pnpm test:contract` (selector retirado) | **exit 1** — `Command "test:contract" not found` |
| 16 | `pnpm verify:fast` | **exit 0** — lint + type-check + `pnpm test:unit` + `inspect:bundle`, que imprimió `NOT INSPECTED` (sin `.next/verify`) y no cuenta como inspección satisfactoria |
| 17 | `pnpm lint` y `pnpm type:check` | exit 0 en los 6 paquetes (incluye el nuevo `tracing/vitest.config.ts` y su test) |

Descubrimiento comprobado con `vitest list --filesOnly`: perfil por defecto 127
archivos, perfil de infraestructura 1 archivo, disjuntos. `pnpm test:unit` no
ejecuta `tests/unit/mocks/gateway/gateway.test.ts` (0 apariciones de esa ruta en
el log del comando raíz).

### Selección real (verificada, no supuesta)

- Por paquete: `pnpm --filter <paquete> test:unit`.
- Por archivo: `pnpm --filter chatbot test:unit tests/unit/chat/resume/registry.test.ts`
  (los argumentos van **tras el nombre del script**, sin `--`: `pnpm … test:unit -- <ruta>`
  deja de filtrar y ejecuta toda la suite — comprobado).
- Python: `pnpm --filter @ai-chatbot/model-gateway exec python3 -m pytest tests/unit/test_catalog.py -q`;
  `pnpm test:gateway` ejecuta la suite Python completa. `pnpm --filter
  @ai-chatbot/model-gateway test:unit -- <ruta>` **no** aísla el archivo (pytest
  deduplica y ejecuta todo), por eso no se documenta como selección.
- La cadena raíz es explícita (`pnpm --filter … && …`), no `pnpm -r --if-present`:
  un paquete sin `test:unit`, una suite vacía o un hijo fallido hacen fracasar el
  comando raíz en lugar de omitirse en silencio (evidencia 10–15).

### Documentación actualizada

`AGENTS.md` (comandos y taxonomía), `packages/chatbot/tests/AGENTS.md`
(perfiles, selección y contrato de layout), `packages/coding-agent/AGENTS.md`
(perfil unitario y ruta de `artifacts-extension`), `packages/tracing/AGENTS.md`
(sección Tests), `packages/chatbot/tests/e2e/README.md` (nota de política ya no
obsoleta), `docs/model-gateway-testing-migration.md` (rutas movidas) y
`docs/adr/0013-…md` (nota de estado de implementación; la política del ADR no
cambia). Sin selectores de Environment por variables de entorno: la selección
sigue siendo listas de archivos en los configs de Vitest y `--env` no aparece en
ningún comando nuevo.

### Limitaciones de validación

- No se ejecutó `pnpm test:e2e` (requiere PostgreSQL `:5434`, dev server `:3001`
  y Mock Gateway `:4001`): ningún E2E se vio afectado por los movimientos, pero
  la suite de navegador no se validó en este ticket.
- No se ejecutó `pnpm verify:full` completo: incluye E2E y `build:verify`. El
  orden de `verify:full` no cambió y `verify:bundle` sigue lanzando el
  `build:verify` aislado antes de inspeccionar (ticket 02); `verify:fast` se
  ejecutó y conservó `NOT INSPECTED`.
- No se ejecutó `build:verify` en este ticket (compilación validada con
  `type:check` y `lint`); `docs/model-gateway-testing-migration.md` y las
  afirmaciones de bundle provienen de ejecuciones previas (ticket 02).
- Los secrets `packages/config/src/secrets.{dev,prod}.ts` son copias locales
  gitignored; no se versionan.
- El perfil Python no se midió con un Gateway real: son tests unitarios del
  servicio (pytest) sin proveedores externos.
