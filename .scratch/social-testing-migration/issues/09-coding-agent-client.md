# 09: Migrar Coding Agent Client

**What to build:** Cubrir el comportamiento del Coding Agent Client en las
fronteras adecuadas y recuperar las garantías soportadas de los escenarios
omitidos escritos para una ruta que ya no existe.

**Blocked by:** 01: Preparar la transición y migrar Compaction.

**Status:** ready-for-agent

- [ ] Se inventarían y consolidan los tests de Coding Agent UI y Coding Agent Bridge por garantía y riesgo, con colaboradores propios reales por defecto.
- [ ] Se investigan los tres escenarios omitidos de sesión/envío, reconexión y agrupación de herramientas contra la interfaz actual y la cobertura activa existente.
- [ ] Se restaura en la frontera adecuada toda garantía soportada que falte; la eliminación de comportamiento dudoso se consulta al operador.
- [ ] Los E2E del chatbot mantienen el stub de Coding Agent Worker y cada E2E retenido explica por qué necesita un navegador real.
- [ ] Se registran en los comentarios las equivalencias, los límites del stub y las decisiones sobre casos omitidos; se ejecutan las pruebas afectadas.
