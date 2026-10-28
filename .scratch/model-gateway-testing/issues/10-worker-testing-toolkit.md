# 10: Adoptar el toolkit en las pruebas del Coding Agent Worker

**What to build:** las pruebas del Coding Agent Worker utilizan herramientas oficiales del Gateway donde sustituyen dobles de transporte redundantes, ejercitando su integración real sin comprometer el aislamiento del runtime.

**Blocked by:** 03: Migrar Compaction como primer corte vertical.

**Status:** ready-for-agent

- [ ] Se identifican y migran las pruebas que sustituyen transporte o protocolo del Gateway, conservando los dobles que representan dependencias distintas o comportamiento independiente.
- [ ] Se verifica la integración real de catálogo y operaciones de inferencia que requieran las pruebas migradas, manteniendo modelos y escenarios específicos en el Worker.
- [ ] Las pruebas conservan sus garantías de eventos, errores y transporte con instancias locales o servidor HTTP según el límite de proceso real.
- [ ] Se usan contextos de prueba y recursos de filesystem aislados; no se mutan selectores de configuración mediante variables de entorno ni se escribe en recursos de producción o desarrollo.
- [ ] Se retiran mecanismos redundantes con cobertura equivalente identificada y se verifica la liberación de recursos propios de cada prueba.
- [ ] Pasan las pruebas focalizadas y las comprobaciones de tipos y lint correspondientes. Los E2E del chatbot mantienen su Worker stub y no se presentan como cobertura del ensamblaje con el Worker real.
