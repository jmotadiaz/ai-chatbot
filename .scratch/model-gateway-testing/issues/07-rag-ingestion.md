# 07: Migrar la ingestión RAG con embeddings deterministas

**What to build:** la ingestión RAG mantiene su procesamiento y persistencia reales mientras recibe vectores preparados a través del contrato HTTP del Gateway, sin inyección de IA exclusiva de testing.

**Blocked by:** 03: Migrar Compaction como primer corte vertical.

**Status:** ready-for-agent

- [ ] El toolkit incorpora o reutiliza el soporte de embeddings que requiere este consumidor, con pruebas del protocolo y paridad entre handlers MSW y servidor HTTP.
- [ ] Las pruebas de la interfaz de ingestión usan la infraestructura real de inferencia y vectores explícitos, sin proveedores reales ni algoritmos que simulen inteligencia.
- [ ] Se preservan batching, límites de ritmo, asociación chunk/vector, validación y errores; la sincronización de pruebas temporales es explícita cuando resulta necesaria.
- [ ] La persistencia en social unit tests se verifica en memoria con PGlite (`setupTestDb()`), sin introducir un puerto de repositorio para fakes ni requerir un contenedor PostgreSQL externo.
- [ ] Se retiran puertos, adapters y pruebas de composición solo cuando su justificación era la inyección de IA, conservando helpers y garantías independientes.
- [ ] Pasan las pruebas focalizadas y las comprobaciones de tipos y lint correspondientes, con cobertura equivalente registrada y recursos liberados.
