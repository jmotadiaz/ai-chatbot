# 11: Migrar sesiones y extensiones del Worker

**What to build:** Proteger los comportamientos de sesiones y extensiones
del Coding Agent Worker sin repetir invariantes ni mantener una interfaz
usada únicamente por un test vacío.

**Blocked by:** 01: Preparar la transición y migrar Compaction.

**Status:** ready-for-agent

- [x] Se inventarían y migran las garantías de sesiones, runtime, extensiones y carga de recursos, usando la interfaz de capacidad más adecuada.
- [x] Se consolidan los invariantes repetidos sobre extensiones y rutas, conservando por separado la existencia física y el comportamiento del cargador de recursos.
- [x] Se comprueban los usos actuales y se eliminan el test vacío del setter de la factoría de runtime y el setter usado solo por él; se conserva la inyección mediante constructor.
- [x] Si aparecen consumidores legítimos nuevos del setter, se consulta al operador antes de efectuar el cambio de API.
- [x] Se registran las garantías y equivalencias en los comentarios y se ejecutan los tests y comprobaciones de tipos afectados con recursos de test aislados.

## Evidence

The Worker unit tests are organized by capability: `sessions/` covers registry,
queries, transcript lookup, persistence, model selection, subagents and git
state; `extensions/` covers physical extension paths and resource loading;
`runtime/` covers Gateway catalog refresh.

The four deleted `pi-extension-paths` tests are covered by `extensions/pi-packages`:
default inclusion, inventory composition, subagent exclusion, and physical path
existence. Resource loading remains a separate guarantee.

The unused `setRuntimeFactory` and its empty test were removed. Constructor
injection remains covered by `sessions/session-file-lookup-disk.test.ts`.

Node 24.15.0: 85 focused tests and 358 tests across the Worker unit, integration
and contract suites passed; package ESLint and TypeScript checks passed. The
worktree used fake gitignored configuration placeholders; no Production build,
process or data was touched. Monorepo-wide and E2E checks were not run here.
