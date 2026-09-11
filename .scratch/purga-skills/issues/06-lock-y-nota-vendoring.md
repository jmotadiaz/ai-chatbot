# 06: Lock y nota de vendoring coherentes

**What to build:** El lock de skills vendored y la nota de parches locales de `AGENTS.md` reflejan el catálogo real, de modo que un re-sync no pueda resucitar lo borrado.

**Blocked by:** 02, 03.

**Status:** resolved

- [x] Las entradas de las 11 skills borradas han salido de `skills-lock.json`.
- [x] Las claves del lock coinciden con los directorios presentes en `.agents/skills/`, salvo las locales conocidas (`find-docs` y `trace-analyzer`).
- [x] La nota de skills vendored de `AGENTS.md` deja constancia de la poda y de qué sigue parcheado.
