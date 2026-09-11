# 09: `prototype` publica por el harness

**What to build:** La rama de lógica de un prototipo entrega su HTML como artefacto del harness en vez de un fichero para abrir a mano, de modo que el usuario lo lee desde el navegador como el resto de informes, siguiendo las reglas mobile-first del harness. La rama de UI no cambia.

**Blocked by:** 06 (por conflicto de fichero: ambos editan la sección de parches locales de `AGENTS.md`).

**Status:** ready-for-agent

- [ ] El skill `prototype` indica que la salida HTML de la rama de lógica se escribe en el directorio que el visor de artefactos publica y se entrega como URL al usuario.
- [ ] El skill apunta a `mobile-first-artifacts` para las reglas de autoría.
- [ ] La regla de capturar el prototipo como fuente primaria (rama desechable y puntero al issue de implementación) se mantiene.
- [ ] La entrada de `prototype` está añadida a la sección de parches locales de `AGENTS.md`.
- [ ] La rama de UI (variaciones en una ruta del proyecto) queda intacta.
