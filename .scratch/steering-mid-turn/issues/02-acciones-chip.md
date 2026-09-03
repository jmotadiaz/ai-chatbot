# 02: Acciones del chip (editar, eliminar, promocionar a Steering)

**What to build:** con un Mensaje en Espera pendiente, editar lo devuelve al textarea para retocar y re-encolar, eliminar lo descarta sin ejecutar, y enviar lo promociona a Steering para inyectarlo en el siguiente request del Turn activo sin duplicar ni abortar las tools en curso.

**Blocked by:** 01 (Encolar Mensaje en Espera y verlo ejecutarse).

**Status:** ready-for-agent

- [ ] Editar devuelve el texto al textarea y permite re-encolarlo como Mensaje en Espera
- [ ] Eliminar descarta el Mensaje en Espera sin ejecutarlo
- [ ] Enviar lo promociona a Steering: una sola inyección en el siguiente request, sin duplicado al final del Turn
- [ ] Suites rápidas del repo en verde (lint, type-check, tests afectados)
