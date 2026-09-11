# 04: Rastros externos de superpowers

**What to build:** El rastro de superpowers desaparece fuera del paquete del worker: OpenCode deja de instalarlo, el estado de runtime huérfano se borra, y la documentación histórica pierde su espacio de nombres sin perder los documentos.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] El plugin de superpowers ya no está en la configuración de OpenCode.
- [ ] El estado de runtime huérfano (brainstorm y sdd) está borrado, junto con sus entradas en los `.gitignore` que lo declaraban.
- [ ] `docs/superpowers/` es ahora `docs/archive/` y el comentario que lo referenciaba apunta a la nueva ruta.
- [ ] Los artefactos publicados y las trazas históricas quedan intactos: son salida generada, no rastro de código.
- [ ] No queda ninguna referencia a la ruta antigua de los documentos.
