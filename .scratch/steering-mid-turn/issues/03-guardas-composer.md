# 03: Guardas y estados del composer

**What to build:** en Turn activo y con chip pendiente el composer aplica los bloqueos acordados: todo deshabilitado salvo chip y cancelar; attachments, skills, prompts y comentarios deshabilitados (texto plano v1); modelo y thinking deshabilitados; sin Turn activo el Enviar abre un Turn nuevo; abortar con chip pendiente devuelve el texto al textarea.

**Blocked by:** 01 (Encolar Mensaje en Espera y verlo ejecutarse).

**Status:** done (rama feat/steering-03-guardas-composer, commit feat(steering): 03 guardas y estados del composer)

- [x] Con chip pendiente solo quedan vivos el chip y cancelar; el resto del composer está deshabilitado
- [x] En Turn activo no se pueden cambiar modelo/thinking ni adjuntar attachments, skills, prompts o comentarios
- [x] Sin Turn activo, Enviar abre un Turn nuevo en vez de encolar
- [x] Abortar con chip pendiente devuelve el texto al textarea sin ejecutarlo

Notas de merge (solape con ticket 02, rama paralela): el 03 NO crea los RPCs
`clearQueue`/`steer` ni las acciones del chip (editar/eliminar/promocionar) —
son del 02. El abort con chip drena la cola dentro del `cancelRun` existente
(helper `snapshotPendingQueues` reutilizable por el 02) y `cancel()` del hook
resuelve el texto drenado como draft. El chip del 03 es de lectura con un
comentario seam donde el 02 monta sus 3 botones.
