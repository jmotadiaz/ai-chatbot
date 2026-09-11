# 01: Superpowers fuera del worker

**What to build:** El worker arranca sin la extensión superpowers: no carga ninguna de sus 13 skills, no inyecta el bootstrap en el contexto y no emite instrumentación suya en las trazas. La sesión de subagente conserva la anti-recursión (sin el tool `subagent` ni skills de orquestador). Los tests dedicados a la feature desaparecen y los de composición de rutas quedan actualizados al inventario actual.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] La extensión superpowers y sus skills ya no existen en el paquete del worker.
- [ ] La composición de rutas del cargador de recursos ya no tiene la opción de exclusión de superpowers y expone una única función de skills first-party.
- [ ] La instrumentación del bootstrap (wrapper de `transformContext`, marker y logs de traza) y el chequeo residual del estado del bootstrap en el turn runner han desaparecido.
- [ ] Los dos ficheros de test dedicados a superpowers se han eliminado; los tests de composición de rutas afirman el inventario actual: `subagent` como única extensión first-party y las skills first-party reducidas al directorio built-in.
- [ ] Una sesión de subagente carga exactamente `mobile-first-artifacts` y `writing-prompties` y sigue sin recibir el tool `subagent`.
- [ ] Suites rápidas del paquete en verde.
- [ ] Verificación de compilación aislada en verde.
