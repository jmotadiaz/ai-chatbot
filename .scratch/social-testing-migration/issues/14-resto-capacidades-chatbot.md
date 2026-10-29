# 14: Migrar las capacidades restantes del chatbot

**What to build:** Completar la revisión social de las capacidades del
chatbot que no pertenecen a los bloques anteriores, sin asumir que todos sus
tests actuales son útiles ni redundantes.

**Blocked by:** 01: Preparar la transición y migrar Compaction.

**Status:** ready-for-agent

- [ ] Se inventarían y migran los tests restantes del chatbot, incluidos RAG, Memory, English Helper, Image Editor, Model Catalog y la infraestructura no asignada a otros tickets.
- [ ] Se comprueba cada capacidad preferentemente desde su interfaz estable con colaboradores propios reales y fronteras externas controladas; se justifican las excepciones aisladas.
- [ ] Se consolidan pruebas por garantía y riesgo y se preservan protocolos, errores y reglas significativas con cobertura equivalente antes de eliminar tests activos.
- [ ] Se identifica cualquier test o escenario omitido restante, se documenta su estado y se consulta al operador ante una garantía funcional dudosa o un comportamiento no aclarado.
- [ ] Se registran las garantías y equivalencias en los comentarios y se ejecutan los tests y comprobaciones afectadas.

## Evidence

| Capability | Tests and decisions |
| --- | --- |
| RAG | `tests/unit/rag/`: PGlite and Gateway seam tests retained alongside pure chunking and rate-limit rules. |
| Memory | `tests/unit/memory/memory.test.ts`: retrieval, extraction, deduplication, isolation and actual no-text behavior. |
| English Helper | `tests/unit/english/`: classifier, delimiter, grammar route and workflows retained. |
| Image Editor | Public `generateImages` test moved to `tests/unit/image/`; the adapter test stays separate because it covers a different boundary. |
| Model Catalog | Existing configuration and selection tests retained; `tests/unit/model-catalog/catalog-client.test.ts` adds HTTP, authentication, caching and error coverage. |
| Database infrastructure | Transaction behavior is exercised through feature tests. |

Memory, image and adapter focused runs passed 26 tests; the catalog client
passed four. The default profiles passed 772 tests with one bundle contract
skipped because the verification build was absent. ESLint and type-check passed.
Infrastructure, E2E and `build:verify` were not run for this ticket.
