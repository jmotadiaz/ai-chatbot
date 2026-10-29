# 14: Migrar las capacidades restantes del chatbot

**What to build:** Completar la revisión social de las capacidades del
chatbot que no pertenecen a los bloques anteriores, sin asumir que todos sus
tests actuales son útiles ni redundantes.

**Blocked by:** 01: Preparar la transición y migrar Compaction.

**Status:** done

- [x] Se inventarían y migran los tests restantes del chatbot, incluidos RAG, Memory, English Helper, Image Editor, Model Catalog y la infraestructura no asignada a otros tickets.
- [x] Se comprueba cada capacidad preferentemente desde su interfaz estable con colaboradores propios reales y fronteras externas controladas; se justifican las excepciones aisladas.
- [x] Se consolidan pruebas por garantía y riesgo y se preservan protocolos, errores y reglas significativas con cobertura equivalente antes de eliminar tests activos.
- [x] Se identifica cualquier test o escenario omitido restante, se documenta su estado y se consulta al operador ante una garantía funcional dudosa o un comportamiento no aclarado.
- [x] Se registran las garantías y equivalencias en los comentarios y se ejecutan los tests y comprobaciones afectadas.

## Evidence

| Capability | Tests and decisions |
| --- | --- |
| RAG | `tests/unit/rag/`: PGlite and Gateway seam tests retained alongside pure chunking and rate-limit rules. |
| Memory | `tests/unit/memory/memory.test.ts`: retrieval, extraction, deduplication, isolation and actual no-text behavior. |
| English Helper | `tests/unit/english/`: classifier, delimiter, grammar route and workflows retained. |
| Image Editor | Public `generateImages` test moved to `tests/unit/image/`; the adapter test stays separate because it covers a different boundary. |
| Model Catalog | Existing configuration and selection tests retained; `tests/unit/model-catalog/catalog-client.test.ts` adds HTTP, authentication, caching and error coverage. |
| Database infrastructure | `tests/unit/db/chat-mode-migration.test.ts`: migration replay on PGlite checks preserved legacy modes, enum values and new default. Transaction behavior is exercised through feature tests. |

Owned unit suites (rag, english, memory, image, model-catalog, foundation-model,
infrastructure and db) passed 142 tests. The default profiles passed 772 tests
with one bundle contract skipped because the verification build was absent.
ESLint and type-check passed on the moved file. `test:infra` passed 22 tests.
E2E and `build:verify` were not run for this ticket.

Retained overlaps cover distinct risks: image public API versus adapter errors;
Memory retrieval, extraction, deduplication, isolation and no-text behavior;
RAG persistence and retrieval versus pure chunking and rate limits; and catalog
selection versus client HTTP, authentication, caching and error handling.
The inventory and omitted-case accounting still need final verification.

The ticket-owned suites had no skipped, fixme or todo cases in the audit.
The conditional bundle skip belongs to ticket 02; browser skips in navigation,
Projects, settings and Coding Agent belong to tickets 06, 07 and 09.
Known direct-coverage gaps include `ragFactory`, `generateSpeech`, RAG
resource server actions and the deployment-only migration entrypoint.
