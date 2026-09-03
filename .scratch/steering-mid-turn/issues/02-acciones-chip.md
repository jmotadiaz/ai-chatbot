# 02: Acciones del chip (editar, eliminar, promocionar a Steering)

**What to build:** con un Mensaje en Espera pendiente, editar lo devuelve al textarea para retocar y re-encolar, eliminar lo descarta sin ejecutar, y enviar lo promociona a Steering para inyectarlo en el siguiente request del Turn activo sin duplicar ni abortar las tools en curso.

**Blocked by:** 01 (Encolar Mensaje en Espera y verlo ejecutarse).

**Status:** resolved

- [x] Editar devuelve el texto al textarea y permite re-encolarlo como Mensaje en Espera
- [x] Eliminar descarta el Mensaje en Espera sin ejecutarlo
- [x] Enviar lo promociona a Steering: una sola inyección en el siguiente request, sin duplicado al final del Turn
- [x] Suites rápidas del repo en verde (lint, type-check, tests afectados)

## Comments

- Rama `feat/steering-02-acciones-chip` (`04ec6c6`) fusionada en
  `feat/steering-mid-turn` como merge `3f7794e` (fast-forward lógico, sin
  conflictos: era la primera en fusionarse sobre la base `a301107`).
- Reconciliación con el ticket 03 en el merge `a1fc1df`: se conservó todo el
  stack del 02 (RPCs `clearQueue`/`steer`, `WorkerClient.clearQueue`/`steer`,
  BFF `clear-queue/` + `steer/`, hook `clearQueue`/`promoteToSteering`, chip con
  3 acciones) junto al drenado en `cancelRun` del 03 — coexisten sin pisarse,
  tal como preveía el 03. Única unificación: las lecturas de `pending` de
  `clearQueue`/`steer` reutilizan el helper `snapshotPendingQueues` del 03 en
  vez de duplicar las copias defensivas.
- Checks tras el merge: `type:check` verde en los 6 paquetes; coding-agent
  unit (222) + contract (54); chatbot unit (232) + component (161). Sin commit
  `fix(steering)` adicional: no hubo que ajustar funcionalidad.
