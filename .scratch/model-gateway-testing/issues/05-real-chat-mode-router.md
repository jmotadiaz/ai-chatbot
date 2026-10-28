# 05: Usar el Chat Mode Router real también en Test Environment

**What to build:** el chatbot decide el Chat Mode mediante el mismo router de producción en todos los Environments; el determinismo de las pruebas procede de respuestas Decisions por HTTP, no de una implementación alternativa de routing.

**Blocked by:** 02: Definir el catálogo y los perfiles E2E del chatbot con el toolkit oficial; 03: Migrar Compaction como primer corte vertical.

**Status:** ready-for-agent

- [ ] Se elimina la selección del router determinista exclusiva del Test Environment y la composición de inyección que deje de tener consumidores justificados.
- [ ] Pruebas públicas con el cliente real y el toolkit verifican los Chat Modes soportados, mapeo, validación, procedencia y errores de Decisions.
- [ ] Las definiciones de routing específicas del chatbot permanecen en el consumidor y no se incorporan al paquete de protocolo.
- [ ] Los perfiles E2E responden explícitamente a las decisiones internas necesarias y mantienen deterministas los recorridos afectados.
- [ ] Pasan las pruebas focalizadas del router y los E2E afectados, sin reclasificar, reducir ni trasladar la suite existente.
- [ ] No se introducen nuevos selectores de Environment, bypasses de inferencia, defaults de éxito ante respuestas inválidas ni correlación de producción dedicada a testing.
