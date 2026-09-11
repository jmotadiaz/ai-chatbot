# 02: Poda del catálogo de skills de operador

**What to build:** El catálogo de skills de operador pasa de 40 a 29: desaparecen las que no pueden aplicar en este repo y las `in-progress` sin uso, mientras el flujo principal, `retro`, `implement-spec` y las utilidades conservadas quedan intactas.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Ya no existen: `git-guardrails-claude-code`, `setup-pre-commit`, `migrate-to-shoehorn`, `scaffold-exercises`, `claude-handoff`, `loop-me`, `setup-ts-deep-modules`, `to-questionnaire`, `writing-beats`, `writing-fragments` y `writing-shape`.
- [x] Siguen presentes y sin cambios: `find-docs`, `retro`, `implement-spec`, `writing-for-agents` y el resto de skills conservadas del flujo principal.
- [x] Ninguna skill conservada referencia a una borrada, salvo el router `ask-matt`, que tiene su propio ticket.
- [x] El catálogo resultante tiene 29 skills.
