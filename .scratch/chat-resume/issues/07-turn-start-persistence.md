# 07: Persistencia al inicio del turno (chats existentes)

**What to build:** Ver `../spec.md` («Refinamiento (ticket 07)» bajo la decisión 2).

**Flujo del operador (bug en Producción):** un chat con un turno completo
(U1, A1 persistidos) → click en el control **Regenerate** (icono `RefreshCcw`
del footer del mensaje, `packages/chatbot/components/chat/reload.tsx`,
opcionalmente con otro modelo/chat mode) → el SDK trunca A1 en el cliente (el
mensaje viejo desaparece y aparece un loading — esperado) y el turno
regenerado hace streaming → el operador CIERRA la app a mitad del turno →
reabre el mismo chat → la UI muestra el mensaje viejo del asistente (aún la
última fila del DB) **más** un mensaje de carga con tools del nuevo turno (el
replay del resume empujó un segundo mensaje del asistente) → cuando el turno
termina y se recarga la página, el mensaje viejo desaparece (borrado por
`onFinish`).

**Root cause:** el borrado del mensaje reemplazado (`deleteMessageById(messageId)`
en `onFinish`, `packages/chatbot/lib/features/chat/conversation/factory.ts`) y
la persistencia del mensaje del usuario ocurren solo al FINAL del turno.
Mientras tanto el resume registry sigue sirviendo el stream en vuelo, así que
cualquier reapertura a mitad del turno renderiza
`[..., A_viejo(stale)] + A_nuevo(replay)` hasta que el turno persiste.

**Blocked by:** 02, 03, 04.

**Status:** resolved

- [x] Contrato: el mensaje del usuario se escribe al inicio del turno —
  sembrar un chat en el DB, POST de un turno normal y, con el stream aún vivo,
  afirmar que la fila del usuario ya existe; tras completar, exactamente una
  fila de usuario + una de asistente.
- [x] Contrato: el mensaje reemplazado se borra al inicio del turno — sembrar
  [U1, A1], POST con la forma de regenerate (`messageId = A1.id`), con el
  stream vivo A1 ya no existe y U1 está; tras completar, exactamente una fila
  de asistente con id distinto del de A1.
- [x] Contrato: chat nuevo (sin fila persistida) no escribe nada temprano —
  comportamiento de hoy, sin cambios.
- [x] Implementación en `factory.ts`: una transacción
  (`deleteMessageById(messageId)` + upsert del mensaje del usuario) cuando
  `!preventChatPersistence && chatId`, el último mensaje del body es de
  usuario y el chat existe (`getChatById`); try/catch con degradación
  silenciosa; `onFinish` intacto.
- [x] A11y: `aria-label="Regenerate response"` en `ChatReloadButton` (el botón
  no tenía nombre accesible; permite `getByLabel` en E2E).
- [x] E2E (4º test de `resume.spec.ts`): sembrar [U1, A1] → regenerate con
  `slowStream` → texto lento parcial en pantalla → `page.reload()` (la
  «reapertura») → exactamente UN mensaje del asistente con el texto completo,
  el mensaje del usuario visible → recarga final → sigue habiendo exactamente
  un mensaje del asistente.
- [x] Docs: párrafo `Refinamiento (ticket 07)` en la decisión 2 de `spec.md`
  y bala de Consequences en `docs/adr/0012-in-memory-resumable-stream-registry.md`.
- [x] Verificación: `type:check`, `lint`, `test:unit`, `test:contract`,
  `test:component`, `build:verify` del chatbot; E2E completo del entorno test.
  Nunca Producción (8085/3015/5435).

## Comments

- Implementación en `packages/chatbot/lib/features/chat/conversation/
  factory.ts`, tras `prunedMessagesToSend` y antes de `createUIMessageStream`:
  un único `transaction` que (a) borra el mensaje que este turno reemplaza
  (regenerate; no-op si no hay `messageId`) y (b) persiste el mensaje del
  usuario. Seguro porque `saveMessages` es un UPSERT (`onConflictDoUpdate` sobre
  `message.id`): el `onFinish` posterior lo actualiza in place. Los chats
  nuevos (id borrador sin fila) no escriben nada temprano. Fallos se degradan
  en silencio (`console.error` + comportamiento de hoy). Tradeoff aceptado: si
  la transacción del final falla tras comprometerse esta, el mensaje
  reemplazado ya se fue — raro, y el mismo riesgo que el orden antiguo llevaba
  a la inversa.
- Forma de regenerate confirmada en el SDK (`ai@6.0.287`): `regenerate`
  trunca `state.messages` antes del mensaje reemplazado, así que el body lleva
  como último mensaje el del USUARIO y `messageId` con el id del asistente
  reemplazado; para un envío normal `messageId` es `undefined`.
- **Cueva al validar el E2E**: la primera versión del test filtraba los
  mensajes por «SLOW chunk», con lo que el mensaje viejo (que no lo contiene)
  era invisible al conteo y el test pasaba incluso sin el fix. Corregido:
  tras la reapertura se afirma que hay exactamente UN mensaje del asistente en
  total. Además, sin el fix el test solo es rojo si la recarga cae de verdad a
  mitad del turno: si cae después de que `onFinish` persistió (y borró A1),
  el conteo es 1 y el test pasaría — con el fix el escenario es estable
  (~9 s) porque el borrado ocurre en el primer frame del turno.
- Verificación: chatbot `type:check`/`lint`/`test:unit` (37)/`test:component`
  (64)/`test:contract` (87)/`build:verify` verdes; resume spec 4/4 (dos runs);
  suite E2E completa 44 passed / 9 skipped (pre-existing `test.skip`/`fixme`).
