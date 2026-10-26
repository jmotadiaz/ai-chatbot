# 08: Resume al montar en cualquier navegación + `?after` + persistencia de config al inicio del turno

**What to build:** Ver `../spec.md` («Refinamiento (ticket 08)» bajo la decisión 5 y la
persistencia de config en la decisión 2).

**Flujo del operador (bug en Producción):** un chat con un turno completo (U1, A1) →
click en **Regenerate** con OTRO modelo → el SDK trunca A1 en el cliente y el turno
regenerado A1' hace streaming (modelo nuevo) → el operador CIERRA el browser → reabre
la app en la raíz y navega al chat vía la sidebar (una navegación client-side,
`navigate`) → HOY: la sonda de montaje está gateada a `reload`/`back_forward`, así que
un `navigate` NO sondea → no hay resume → la UI muestra solo el estado del DB: la
pregunta U1 (el ticket 07 borró A1 y persistió U1 al inicio del turno), status `ready`
y el modelo VIEJO seleccionado (`defaultModel` solo se escribe en `onFinish`). Un
`page reload` manual sí sondea (el gate lo permite) y el turno en vuelo aparece… pero
con el modelo viejo (la config del cliente viene del DB). Solo al terminar el turno y
recargar de nuevo se ve correcto.

**Root cause (dos):**
1. El gate de navegación de la sonda de montaje (ticket 05/E2E) dejó el caso
   «reabrir y navegar» sin sondeo: el resume registry sirve el stream en vuelo, pero
   el cliente remontado jamás se re-engancha salvo recarga manual.
2. La config del chat (`defaultModel`, `chatMode`, …) se persiste solo en `onFinish`,
   así que cualquier reapertura a mitad de turno muestra el modelo/modo del turno
   anterior.

**Blocked by:** 02, 03, 04, 07.

**Status:** resolved

- [x] Contrato GET (`tests/contract/chat/get-stream-route.test.ts`): `?after` igual al
  `startMessageId` de la entrada → `204`; distinto → replay completo; ausente → replay;
  honrado también por la ruta del índice `chatId`.
- [x] Contrato POST (`tests/contract/chat/post-route-resume-persistence.test.ts`): la
  transacción de inicio de turno persiste la config (la fila del chat lleva
  `defaultModel`/`chatMode` del turno mientras el stream sigue vivo); el test de chat
  nuevo sigue verde con la forma `updateChat`-primero (sin escrituras tempranas ni
  error de FK).
- [x] Unit (`tests/unit/chat/resume/registry.test.ts`): `setStartMessageId` graba y
  expone en `StreamSnapshot`; no-op para clave desconocida/expirada; idempotente.
- [x] Componente (`tests/component/chat/use-chat-resume.lifecycle.test.tsx`): la sonda
  de montaje dispara también en `navigate` (una vez por montaje, reescrito el test
  «no probe on navigate»); la sonda de montaje lleva `?after=<último mensaje>` y los
  resumes de visibilidad no; `resumeGate`: un envío emitido con la sonda sin resolver
  espera a que se resuelva (orden de requests: la respuesta del probe precede al POST)
  y el POST sigue llevando el `streamKey`; todo lo demás sigue verde (silencio `204`,
  intent diferido, N reconexiones, opt-out no persistido).
- [x] Registry (`lib/features/chat/resume/registry.ts`): `setStartMessageId(key,
  messageId)` + `startMessageId?: string` en `StreamSnapshot`.
- [x] Factory (`lib/features/chat/conversation/factory.ts`): id del mensaje del
  asistente pre-generado UNA vez por turno (`generateMessageId: () =>
  assistantMessageId`; el SDK lo resuelve exactamente una vez por stream, verificado
  en `ai@6.0.287`) y grabado con `setStartMessageId(streamKey, assistantMessageId)` al
  INICIO del turno (junto al bloque de persistencia, no en `onFinish`).
- [x] GET route (`app/(chat)/api/chat/[key]/stream/route.ts`): parámetro `after`
  opcional; igualdad con `startMessageId` → `204`; ambas rutas de resolución lo
  respetan; sin parámetro → sin cambios.
- [x] Cliente: la sonda de MONTAJE pasa `after` = id del último mensaje del cliente en
  el momento de la sonda (getter `getLastMessageId` desde `use-chat.ts`); los resumes
  de VISIBILIDAD/pageshow no llevan `after` (el último mensaje puede ser un parcial;
  el replay completo es idempotente por el chunk `start`). `prepareReconnectToStreamRequest`
  construye la URL para AMBAS rutas (`${api}/${streamKey ?? id}/stream`) y añade
  `?after=` (codificado) cuando el body del resume lo lleva (el SDK reenvía el `body`
  de `resumeStream(options)` a `prepareReconnectToStreamRequest`, verificado en
  `ai@6.0.287`).
- [x] `resumeGate(): Promise<void>` en el hook: resuelve al instante si no hay resume
  en vuelo; si lo hay, espera la promesa del resume (siempre se resuelve: `204`,
  replay completo o error de fetch; si la sonda se enganchó a un stream vivo, cuando
  ese turno termina). `useChatSubmit` (send) y `useChatReload` (regenerate) la
  esperan ANTES de `beginTurn()` y la request.
- [x] Config al inicio del turno: la transacción del POST pasa a
  `updateChat({ id: chatId, userId }, { defaultModel, defaultTemperature, chatMode,
  webSearchNumResults, ragMaxResources, minRagResourcesScore })` PRIMERO; `undefined`
  (chat nuevo: el id borrador no tiene fila) → return temprano, nada se escribe temprano
  (sustituye el check de existencia con `getChatById` Y evita la violación de FK);
  si hay fila → `deleteMessageById(messageId)` + `saveMessages([userMessage])`.
  `onFinish` conserva su propio `updateChat` con los mismos valores (idempotente;
  cubre el camino degradado).
- [x] E2E (5º test): escenario del operador — sembrar [U1, A1] → goto →
  `selectModel("slowStream")` → Regenerate → texto parcial → `page.goto("/")` → click
  en el chat sembrado en la sidebar (un `navigate`, NO un reload) → sin más acción: el
  turno en vuelo es visible y completa `SLOW_STREAM_TEXT`, exactamente UN mensaje del
  asistente, la pregunta visible y el model picker muestra `slowStream`.
- [x] E2E (3er test reescrito): la apertura normal de un chat con el último turno
  completado responde `204` (vía `after`) y se queda en `ready` — sin replay.
- [x] Docs: «Refinamiento (ticket 08)» bajo la decisión 5 de `spec.md`, ajuste del
  párrafo del ticket 07, y bala de Consequences reescrita en
  `docs/adr/0012-in-memory-resumable-stream-registry.md`.
- [x] Verificación: `type:check`, `lint`, `test:unit`, `test:contract`,
  `test:component`, `build:verify` del chatbot; resume spec 5/5 verde repetidamente;
  seed.spec 5 runs consecutivas verdes; suite E2E completa. Nunca Producción
  (8085/3015/5435).

## Comments

- **Cueva con la sonda incondicional en los tests E2E**: la home («nuevo chat»)
  también monta el hook con resume habilitado (el id borrador se vuelve persistente
  tras el primer turno), así que SU sonda es legítima — un GET sin `after` a un id
  sin entrada que responde `204`. Los tests que cuentan/afirman sobre la sonda deben
  acotar la URL al chat propio (`pathnameOf(...) === /api/chat/<chatId>/stream`);
  el error de captura genérica (`/\/stream$/`) mezcla la sonda del hub con la del chat.
- **Race cubierto por `resumeGate` (no por el gate de navegación)**: un envío que
  arranca con la sonda de montaje sin resolver era exactamente la carrera que motivó
  el gate (el `204` tardío y silencioso de la sonda ponía `ready` a mitad de envío y
  la sonda podía engancharse a un stream registrado después de enviarla). Ahora el
  send/regenerate esperan a la promesa del resume — que siempre se resuelve — y, si
  la sonda se enganchó a un turno vivo, esperan a que ese turno termine, coherente
  con «nunca enviar sobre un turno vivo».
- **`?after` solo en la sonda de montaje**: los resumes de visibilidad omiten el
  parámetro porque el último mensaje del cliente puede ser un PARCIAL de ese mismo
  turno; el replay completo es idempotente por el chunk `start` (el cliente descarta
  el parcial y reconstruye). La sonda de montaje sí lo lleva porque su último mensaje
  proviene del RSC/DB (truth completo), y la coincidencia con `startMessageId`
  significa «el cliente ya tiene exactamente este mensaje».
- Forma de regenerate y `updateChat` verificados: `updateChat` solo setea los campos
  pasados (+ `updatedAt`) y devuelve `undefined` cuando ninguna fila coincide
  (`queries.ts`), así que la forma `updateChat`-primero reemplaza el check de
  existencia y elimina la violación de FK del chat nuevo de un tirón.
- Verificación: chatbot `type:check`/`lint`/`test:unit`/`test:component`/
  `test:contract`/`build:verify` verdes; resume spec 5/5 (dos runs); seed.spec 5/5
  runs consecutivas; suite E2E completa (ver informe).
