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
