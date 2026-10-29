# 15: Completar comandos y retirar la organización anterior

**What to build:** Una vez migradas las capacidades, ofrecer la taxonomía y
los perfiles definitivos sin dejar suites sin ejecutar ni mantener categorías
históricas como estructura principal.

**Blocked by:** 01: Preparar la transición y migrar Compaction; 04: Migrar Chat Mode y conversación; 05: Migrar Hub, sidebar e historial; 06: Migrar Projects y configuración de modelo; 07: Revisar navegación y Background Generation; 08: Migrar Attachments, Prompt Refiner y recorrido básico; 09: Migrar Coding Agent Client; 10: Migrar RPC y servidor de artefactos del Worker; 11: Migrar sesiones y extensiones del Worker; 12: Migrar las pruebas del Model Gateway; 13: Migrar configuración, tracing y guardarraíles; 14: Migrar las capacidades restantes del chatbot.

**Status:** ready-for-agent

- [ ] Los tests de cada paquete están organizados en las categorías unit y E2E según el ADR 0013; se retiran selectores y categorías históricos solo después de comprobar que no quedan tests dependientes.
- [ ] Un comando unitario raíz ejecuta los tests unitarios autocontenidos de todos los paquetes, incluida la suite Python del Model Gateway; se conserva la selección por paquete y archivo.
- [ ] El perfil por defecto no requiere servicios preexistentes; existe un perfil explícito para infraestructura aprovisionada y está incluido en la verificación completa.
- [ ] Se comprueba el descubrimiento real y la propagación de fallos con selecciones representativas, incluido un test Python; una suite ausente o fallo hijo no produce éxito silencioso.
- [ ] Se actualizan coherentemente scripts, configuración de runners, CI, imports e instrucciones afectadas; no se reintroduce un selector de Environment mediante variables de entorno.
- [ ] Los perfiles se ejecutan con datos aislados y sin limpieza destructiva global ni alteraciones de Production; se registran las limitaciones de validación.
