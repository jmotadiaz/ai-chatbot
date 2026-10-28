# 08: Migrar la recuperación RAG con inferencia determinista

**What to build:** la recuperación RAG verifica su búsqueda y selección de resultados con datos controlados y respuestas preparadas de embeddings y rerank por HTTP, manteniendo la lógica de la feature dentro de su implementación concreta.

**Blocked by:** 03: Migrar Compaction como primer corte vertical.

**Status:** ready-for-agent

- [ ] Se reutiliza o incorpora al toolkit el soporte de embeddings y rerank necesario, con pruebas del protocolo y comportamiento compartido entre MSW y servidor HTTP. Este ticket no requiere que haya terminado la migración de ingestión.
- [ ] Las pruebas públicas utilizan el cliente real, vectores y rankings preparados, sin proveedores reales ni heurísticas que pretendan reproducir inteligencia.
- [ ] Se preservan búsquedas, filtros, ordenación, asociación de rankings, parsing y comportamiento ante respuestas inválidas o errores.
- [ ] Las comprobaciones de social unit que requieren persistencia usan PGlite en memoria (`setupTestDb()`), sin requerir un contenedor PostgreSQL externo.
- [ ] Se retira la composición exclusiva de inyección donde exista y se conservan helpers, interfaces con variaciones reales de producción y pruebas puras útiles.
- [ ] Pasan las pruebas focalizadas y las comprobaciones de tipos y lint correspondientes; las garantías sustituidas tienen una prueba de reemplazo identificada.
