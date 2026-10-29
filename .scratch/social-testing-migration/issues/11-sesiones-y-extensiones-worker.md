# 11: Migrar sesiones y extensiones del Worker

**What to build:** Proteger los comportamientos de sesiones y extensiones
del Coding Agent Worker sin repetir invariantes ni mantener una interfaz
usada únicamente por un test vacío.

**Blocked by:** 01: Preparar la transición y migrar Compaction.

**Status:** ready-for-agent

- [ ] Se inventarían y migran las garantías de sesiones, runtime, extensiones y carga de recursos, usando la interfaz de capacidad más adecuada.
- [ ] Se consolidan los invariantes repetidos sobre extensiones y rutas, conservando por separado la existencia física y el comportamiento del cargador de recursos.
- [ ] Se comprueban los usos actuales y se eliminan el test vacío del setter de la factoría de runtime y el setter usado solo por él; se conserva la inyección mediante constructor.
- [ ] Si aparecen consumidores legítimos nuevos del setter, se consulta al operador antes de efectuar el cambio de API.
- [ ] Se registran las garantías y equivalencias en los comentarios y se ejecutan los tests y comprobaciones de tipos afectados con recursos de test aislados.
