# 03: Guardas y estados del composer

**What to build:** en Turn activo y con chip pendiente el composer aplica los bloqueos acordados: todo deshabilitado salvo chip y cancelar; attachments, skills, prompts y comentarios deshabilitados (texto plano v1); modelo y thinking deshabilitados; sin Turn activo el Enviar abre un Turn nuevo; abortar con chip pendiente devuelve el texto al textarea.

**Blocked by:** 01 (Encolar Mensaje en Espera y verlo ejecutarse).

**Status:** resolved

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

## Comments

- Rama `feat/steering-03-guardas-composer` (`107d8c7`) fusionada en
  `feat/steering-mid-turn` como merge `a1fc1df` (segunda fusión, sobre el merge
  `3f7794e` del ticket 02).
- Conflictos resueltos conservando ambas funcionalidades, stack único final:
  RPCs `clearQueue` + `steer` + `followUp`, `cancelRun` que drena vía
  `clearQueue()` del SDK, hook con `pending` + `clearQueue` +
  `promoteToSteering` + `cancel`-con-draft + bifurcación idle→turn /
  running→followUp, chip con 3 acciones + guardas `hasPending`/`isRunning`.
  - `agent-code-chat.tsx` (2 hunks): unidos import `useEffect` +
    iconos `Pencil`/`X`, y chip con layout `flex` del 02 + comentario seam
    del 03 (más `}` de cierre JSX que faltaba en la primera resolución).
  - `turn-runner.ts`: coexisten `clearQueue` + `steer` (02) y `cancelRun`
    con drenado (03); las lecturas de `pending` del 02 pasan a usar el helper
    `snapshotPendingQueues` del 03; repuesto el `/**` de apertura del doc de
    `cancelRun` (era contexto común del merge).
  - `transports/http.ts` (`summarizeRpcResult`): unión de los 3 casos
    `steer` + `clearQueue` + `cancelRun` (más corrección de una duplicación de
    la cola del `case` en la primera resolución, cazada por el pre-commit).
  - `turn-runner.test.ts` (2 hunks entrelazados): se conservan ambos
    `describe` (`steering` del 02 y `cancelRun drains the queue` del 03) con
    sus helpers `seedSteering`/`seedCancellable` (cola `activeRun` común
    duplicada para cada helper) y el cierre del `it` final con su indentado.
- Ficheros sin conflicto (fusión automática, verificado que traen ambos
  lados): `use-coding-agent.ts`, `worker-client.ts`, `session-manager.ts`,
  handlers RPC en `http.ts`, controles del composer, tests de guardas y
  `http-transport-cancel.test.ts`.
- Checks tras el merge: `type:check` verde en los 6 paquetes; coding-agent
  unit (222, incluye 22 de `turn-runner`) + contract (54, incluye `steer` y
  `cancel`); chatbot unit (232) + component (161, incluye chip-actions y
  guards). Sin commit `fix(steering)` adicional: no hubo que ajustar
  funcionalidad.
