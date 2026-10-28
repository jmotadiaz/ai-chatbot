# 02: Definir el catálogo y los perfiles E2E del chatbot con el toolkit oficial

**What to build:** el harness E2E construye sus modelos, capacidades y escenarios con el toolkit oficial y los registra al arrancar, manteniendo deterministas los recorridos actuales. Se migra el soporte de inferencia, no la clasificación de los tests.

**Blocked by:** 01: Extraer el toolkit oficial y conectarlo al Mock Model Gateway actual.

**Status:** ready-for-agent

- [ ] El catálogo, los identificadores, los metadatos de capacidades y los perfiles con nombre son propiedad del chatbot; el paquete oficial aporta los mecanismos de protocolo.
- [ ] El catálogo permanece estable durante la ejecución y es compatible con la caché de la aplicación, sin mutaciones por test ni API remota de configuración.
- [ ] Se expresan mediante el toolkit las respuestas de texto, herramientas, imágenes, errores y streams controlados que requieren los E2E existentes, sin añadir escenarios sin consumidor.
- [ ] Las definiciones incluyen respuestas explícitas para operaciones internas y Default Model Contracts, incluido Decisions. No se configura únicamente el modelo seleccionado por el usuario.
- [ ] El estado de ejecución pertenece a cada petición o stream. Las continuaciones utilizan el historial cuando corresponda, sin colas, resets o contadores globales que interfieran entre recorridos.
- [ ] Los E2E existentes conservan sus garantías y pasan utilizando las nuevas definiciones, con el Worker stub actual. No se eliminan, reclasifican ni trasladan pruebas según la heurística.
- [ ] Se retira la construcción anterior que quede sustituida y se documenta cómo añadir un modelo o escenario sin duplicar la implementación del protocolo.
