# 01: Encolar Mensaje en Espera y verlo ejecutarse

**What to build:** en un Turn activo, escribir texto plano y pulsar el botón followUp nuevo encola un Mensaje en Espera en el worker, muestra el chip de lectura sobre el textarea y, al terminar el Turn, el texto se ejecuta y queda visible en el transcript del mismo Turn.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [ ] En Turn activo el botón followUp encola texto plano y aparece el chip sobre el textarea
- [ ] El Mensaje en Espera se ejecuta al terminar el Turn sin abrir un Turn nuevo
- [ ] El texto inyectado queda visible en el transcript dentro del Turn activo
- [ ] Suites rápidas del repo en verde (lint, type-check, tests afectados)

## Comments

Merge `5f18187` (`5f181874d4a6470c540d9fe1b931fc70a6cd8e38`) de `feat/steering-01-mensaje-en-espera` en `feat/steering-mid-turn`, sin conflictos.
Checks en verde tras el merge: `pnpm type:check` y `pnpm --filter coding-agent test:unit` (216 tests).
