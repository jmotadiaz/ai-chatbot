# 03: Migrar Compaction como primer corte vertical

**What to build:** Compaction encapsula su inferencia concreta y sus pruebas verifican el comportamiento público con respuestas del Gateway controladas por HTTP, incluida la persistencia cuando corresponde. El resultado sirve para evaluar el patrón antes de extenderlo.

**Blocked by:** 01: Extraer el toolkit oficial y conectarlo al Mock Model Gateway actual.

**Status:** ready-for-agent

- [ ] La feature utiliza la infraestructura real de inferencia sin puerto, adapter ni parámetro de factoría cuyo único propósito sea inyectar IA en tests (incluyendo retirar `compactionAi` de `makeProcessChatResponse` en `packages/chatbot/lib/features/chat/conversation/factory.ts` y sus consumidores).
- [ ] Las pruebas preservan selección de contrato para texto y contenido multimedia, construcción de prompts, temperatura, resumen, modelUsed y comportamiento ante errores.
- [ ] El flujo con persistencia se verifica en social unit test con PGlite (`setupTestDb()`); si una prueba operase sobre un PostgreSQL compartido, la limpieza se limita a los recursos de la prueba sin borrado global.
- [ ] Las pruebas de comportamiento configuran instancias locales del toolkit y atraviesan la serialización e interpretación reales del cliente. No requieren el servidor HTTP global cuando utilizan MSW.
- [ ] Se mantienen las comprobaciones puras con garantías independientes y se registra el reemplazo de las garantías de los fakes y pruebas retirados.
- [ ] Se comparan preparación, código eliminado, diagnóstico, cobertura y coste de ejecución antes y después, sin imponer umbrales numéricos. Se documentan los problemas encontrados y se resuelven los que impidan extender el patrón.
- [ ] Pasan las pruebas focalizadas y las comprobaciones de tipos y lint correspondientes, sin cambios de protocolo, selección de Environment ni efectos sobre producción.
