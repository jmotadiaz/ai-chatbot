# 05: `trace-analyzer` re-emparejado con `diagnosing-bugs`

**What to build:** El workflow de depuración de `trace-analyzer` deja de apuntar a una skill que ya no se carga y se apoya en `diagnosing-bugs`, que es parte del flujo y está en contexto.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] La referencia al par antiguo ha desaparecido del skill y de su documento de workflow.
- [x] El workflow de depuración queda descrito de principio a fin con las fases de `diagnosing-bugs`.
- [x] El skill sigue siendo cargable (frontmatter válido) y no queda ninguna mención a superpowers en `.agents/skills/`.
