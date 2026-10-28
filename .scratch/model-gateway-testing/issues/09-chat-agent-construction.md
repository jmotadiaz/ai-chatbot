# 09: Simplificar la construcción del agente de chat

**What to build:** la construcción del agente de chat utiliza composición concreta y la infraestructura de inferencia compartida, preservando parámetros y trazas y verificando el comportamiento con respuestas HTTP deterministas.

**Blocked by:** 03: Migrar Compaction como primer corte vertical.

**Status:** ready-for-agent

- [ ] Se identifican los consumidores de puertos y adapters antes de retirar interfaces exclusivas de testing o implementaciones sin uso; se mantienen variaciones reales de producción y tipos de dominio útiles.
- [ ] Pruebas de la interfaz correspondiente comprueban precedencia de parámetros, resolución de modelo con trazas y composición de modos mediante la integración real.
- [ ] Las interacciones de inferencia y continuaciones de herramientas relevantes utilizan el toolkit y verifican el resultado observable, sin colas globales ni mocks internos equivalentes al puerto retirado.
- [ ] No se pierde configuración, propagación de errores ni restricciones de imports del SDK, y no se traslada comportamiento de dominio al toolkit.
- [ ] Se registra dónde se preserva cada garantía de las pruebas o dobles eliminados, sin alterar la clasificación de E2E existentes.
- [ ] Pasan las pruebas focalizadas y las comprobaciones de tipos y lint correspondientes.
