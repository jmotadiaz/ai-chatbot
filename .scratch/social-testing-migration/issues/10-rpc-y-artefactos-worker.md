# 10: Migrar RPC y servidor de artefactos del Worker

**What to build:** Preservar el parseo RPC en proceso y la entrega real de
artefactos por HTTP local, simplificando únicamente lo que no aporte una
garantía distinta.

**Blocked by:** 01: Preparar la transición y migrar Compaction.

**Status:** ready-for-agent

- [x] Se inventarían y trasladan los tests de RPC y del servidor de artefactos a la organización objetivo conservando sus garantías.
- [x] Se mantiene el parseo RPC en proceso sin afirmar que demuestra supervivencia de un proceso mediante HTTP real ni añadir esa nueva garantía en este ticket.
- [x] Se mantiene la comprobación mediante servidor HTTP aislado de enrutado, entrega, cabeceras, HEAD, rutas inválidas y coexistencia con RPC.
- [x] Se eliminan o consolidan solo aserciones cuya redundancia esté demostrada sin perder cobertura de conexión del servidor.
- [x] Se registran las equivalencias en los comentarios y se ejecutan los tests afectados con recursos propios del test, sin interactuar con Production.

## Evidencia de ejecución

Entorno: Node 24.15.0, pnpm 11.5.0, worktree dedicado. Sin builds de Production ni servicios o artefactos de Production.

| Garantía | Destino | Evidencia |
|---|---|---|
| Parseo RPC en proceso: vacío, no JSON, `null` y ausencia de `method` | `tests/unit/rpc/http-transport-parse.test.ts` | Mismas aserciones; no prueba supervivencia por HTTP |
| Enrutado, entrega, cabeceras, HEAD y coexistencia con RPC | `tests/unit/artifacts/artifacts-server.test.ts` | Servidor real en puerto efímero y sandbox temporal |
| Rutas inválidas y traversal | El mismo archivo | Traversal enviado por HTTP sin la normalización de `fetch` |
| Defaults de ubicación de artefactos | `tests/unit/runtime-paths.test.ts` | Test redundante eliminado de la suite del servidor |
| Configuración inyectada en el proceso | `tests/unit/artifacts/artifacts-server.test.ts` | Facade consultada tras arrancar el servidor |

Validación: 251 tests unitarios, 51 de integración y 60 de contrato; lint,
type-check y `build:verify` pasaron. No se ejecutó E2E: el ticket no cubre
una garantía de navegador.
