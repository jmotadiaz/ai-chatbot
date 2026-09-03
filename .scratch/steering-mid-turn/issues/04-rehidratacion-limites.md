# 04: Rehidratación y casos límite

**What to build:** recargar con cola pendiente rehidrata el chip desde el worker; un Turn que falla con chip pendiente deja un estado definido y visible; encolar con el worker inalcanzable muestra error sin perder el texto redactado.

**Blocked by:** 02 (Acciones del chip), 03 (Guardas y estados del composer).

**Status:** resolved

- [x] Recargar con Mensaje en Espera pendiente rehidrata el chip desde el worker
- [x] Un Turn que falla con chip pendiente deja estado definido sin ejecuciones fantasma
- [x] Encolar con el worker inalcanzable muestra error y conserva el texto
- [x] Suites rápidas del repo en verde (lint, type-check, tests afectados)

## Comments

- Rama `feat/steering-04-rehidratacion-limites` sobre la base `1df515c`
  (tickets 01+02+03 fusionados). Sin merges: commit único del ticket.
- Snapshot: `SessionSnapshot.pending { steering, followUp }` leído en vivo de
  `getSteeringMessages()/getFollowUpMessages()` (`session-queries.ts`, con
  degradado a vacío si faltan los lectores); propagado por
  `session-manager.ts`, snapshot-route/BFF y SSR seed (`types.ts` +
  `worker-client.ts` como `pending?` opcional para workers antiguos).
- Hook: siembra el chip desde `snapshot.pending` (seed SSR y `loadSnapshot`)
  con la misma derivación que el evento queue-update en vivo (solo followUp,
  nunca steering: tras promocionar ambos acuerdan "sin chip"); el evento lo
  mantiene en sync después.
- Fallo de Turn con chip: el `RUN_ERROR` en banda nunca llegaba a
  `onRunFailed` (solo errores de transporte) y dejaba `isRunning` clavado en
  true; ahora cierra el run con error visible en el banner, chip intacto
  según el último queue-update, sin reintentos ni runs fantasma.
- Worker inalcanzable al encolar: error explícito `... worker unreachable
  (...)` en el banner; `sendMessage` mid-turn resuelve `false` y el
  composer solo limpia tras aceptación (el submit mid-turn preserva el
  borrador; el botón followUp ya lo hacía).
- Checks: `type:check` + `lint` verdes; `build:verify` en ambos paquetes;
  coding-agent unit (226=222+4 nuevos) + integration (41) + contract (54);
  chatbot unit (232) + component (168=161+7 nuevos) + integration (36) +
  contract (12).
