# 01: Extraer el toolkit oficial y conectarlo al Mock Model Gateway actual

**What to build:** el Mock Model Gateway actual responde mediante un toolkit JavaScript oficial del Gateway, reutilizable por chatbot y Coding Agent Worker, sin alterar los escenarios ni las garantías de sus consumidores. Es el prefactor que permite migrar features por separado.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Existe un paquete con manifiesto y exports propios de testing (registrado en `pnpm-workspace.yaml` si vive en un subdirectorio como `packages/model-gateway/js/`), sin cliente de producción, dependencia del runner ni requisito de Node para ejecutar o desplegar el Gateway Python.
- [ ] El servidor HTTP actual del harness utiliza el paquete manteniendo compatibles sus operaciones y escenarios; los identificadores, capacidades, catálogo y comportamiento específico de la aplicación permanecen en el consumidor.
- [ ] Los handlers MSW y el servidor HTTP comparten la construcción de respuestas y streaming. El import principal no carga anticipadamente el servidor Node y funciona en el entorno jsdom del consumidor.
- [ ] El consumidor gestiona explícitamente MSW. Puede configurar una instancia local, observar sus peticiones y limpiar su estado sin hooks implícitos ni una segunda API de ciclo de vida.
- [ ] Pruebas propias y de consumo verifican serialización, respuestas, errores explícitos ante configuración o peticiones no soportadas, aislamiento entre instancias y liberación de streams y recursos al cerrar.
- [ ] Las continuaciones de herramientas y streams no dependen de contadores o colas globales. La desconexión de un consumidor y el cierre del servidor tienen comportamientos comprobados.
- [ ] La extracción conserva las garantías del harness sin consolidar todavía features ni reorganizar suites. No se implementa reconfiguración remota, correlación de producción para testing ni soporte de proveedores externos.
