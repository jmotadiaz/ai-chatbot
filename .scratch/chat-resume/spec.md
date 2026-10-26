# Spec: El turno de chat sobrevive a pantalla apagada / browser en segundo plano

**Status:** ready-for-agent

## Problem Statement

Cuando la pantalla del móvil se apaga o el browser va a segundo plano a mitad de
la respuesta del asistente, el fetch del stream muere y con él el turno: el
Message del asistente nunca se persiste (toda la escritura —mensajes, title,
memoria, compactación— vive en el `onFinish` del stream) y al volver queda un
parcial congelado y un toast "Failed to fetch". No existe ningún mecanismo de
reanudación para `/api/chat` (el del Coding Agent, `use-coding-agent.ts`, es el
único del repo y no aplica).

**Constraint del operador: nada de Redis.** Una solución in-memory es
explícitamente aceptable; el chatbot corre como un único proceso pm2.

## Solution

**Replay in-memory con el contrato de resume nativo del SDK.** Un registry
in-memory en el chatbot guarda el stream SSE de cada turno (tee de
`consumeSseStream`), lo sirve por una route GET nueva, y el cliente se
re-engancha con `resume: true` + un hook de ciclo de vida. Apagar la pantalla
pasa a significar "desconectar", no "cancelar": el servidor termina la
generación y la persistencia aunque nadie escuche, y al volver el cliente
recibe el resto del stream o el mensaje completo.

### Hechos verificados que sostienen el diseño (auditados en `ai@6.0.287` / `@ai-sdk/react@3.0.290`)

- El SDK **no** tiene protocolo de offset: nunca envía `Last-Event-ID`, no
  genera SSE ids. El único contrato de resume es GET → repetir el stream
  completo o responder `204`.
- El replay completo **es idempotente para el cliente**: en `resume-stream` el
  cliente descarta el último mensaje y reconstruye uno nuevo; el chunk `start`
  con el `messageId` original hace que `replaceMessage` sustituya el parcial,
  sin duplicar. Un resume a medias (sin el `start`) duplicaría o lanzaría
  `UIMessageStreamError`. → El buffer replaya siempre desde el principio.
- `204` es la única señal "nada que resumir" y el cliente la trata en silencio
  (status `ready`). No hay reintentos: un resumeStream por llamada.
- `resumable-stream` no está instalado y no hace falta: el paquete existe para
  el caso multi-proceso/Redis. Un `Map` process-wide cubre el caso un-proceso.
- No hay `onToolCall`/handlers de tools en el cliente (todas las tools son
  server-side): re-emitir chunks de tool tras el terminal es inofensivo.
- `consumeSseStream` en `createUIMessageStreamResponse` (v6 ya lo soporta) hace
  que generación y `onFinish` sobrevivan a la desconexión del cliente.

## Implementation Decisions

1. **Registry in-memory** (`packages/chatbot`, módulo nuevo): `Map` process-wide
   claveado por `streamKey` + índice "última stream por `chatId`". Cada entrada:
   buffer de chunks SSE ya codificados, estado `streaming` → `persisted` (la
   persistencia en `onFinish` lo confirma), y evict por TTL (~60 min) tras
   `persisted`. El buffer sigue servible tras el terminal hasta el TTL: el
   replay tras terminal es seguro (sin handlers de tools en cliente).
2. **Alimentación**: `consumeSseStream` en el `createUIMessageStreamResponse`
   del POST existente tee-ea el SSE hacia el registry. Con eso, generación y
   `onFinish` (persistencia, title, memoria, compactación) completan aunque el
   cliente muera.
3. **Clave de resume**: el cliente genera un `streamKey` (uuid) por turno y lo
   manda en el body del POST (los chats nuevos no tienen `chatId` hasta el
   `data-chat` final, que llega al final del stream). El `chatId` (para el
   resume desde un remontaje) resuelve por el índice "última stream".
4. **GET `/api/chat/[key]/stream`** (wrapper `withAuth` existente): si hay
   entrada viva → `text/event-stream` con replay completo desde `start` + cola
   viva + `[DONE]`; si no → `204`. Es la URL por defecto que
   `DefaultChatTransport.reconnectToStream` ya espera.
5. **Cliente**: `useChat({ id, resume: true })` (hoy no se pasa `id`) para el
   resume al montar; hook de ciclo de vida (`visibilitychange`/`pageshow`,
   espejo del del Coding Agent) que llama `resumeStream()` cuando la request
   murió (señal: estado `error`/`ready` + el propio cliente sabe que tenía un
   turno en vuelo — sin heurísticas sintácticas sobre mensajes). Un resume por
   evento de visibilidad, sin timers de reintento. Chats nuevos sin `chatId`
   aún: la route GET se invoca con el `streamKey` (`prepareReconnectToStreamRequest`).

   **Refinamiento (E2E)**: el `resume: true` del SDK dispara una sonda de
   montaje NO condicionada (`GET /api/chat/<chatId>/stream` en cada apertura
   del chat). Detectado en E2E (`seed.spec.ts` fallando ~1/3 de las runs): el
   `204` de la sonda puede resolverse después de que el usuario envió (oculta
   el loading a mitad de stream) y el GET puede ser atendido tras el POST
   (se engancha a un turno recién registrado: doble replay del mismo mensaje).
   Se sustituye por un resume de montaje **gateado**: solo cuando la
   navegación fue `reload` o `back_forward`
   (`performance.getEntriesByType("navigation")[0]?.type`), vía el propio hook
   (`useChat({ id })`, sin `resume`). Una apertura normal del chat ya no
   sondea el registry: ni replay del turno anterior ni carrera con el envío.
   **Refinamiento (dev)**: el estado del registry se ancla en
   `globalThis[Symbol.for(...)]` en lugar de bindings de módulo, porque
   `next dev` recompila rutas bajo demanda y reevalúa los módulos compartidos
   (el primer resume tras un reload respondía `204`); en producción el
   module graph es único y el comportamiento no cambia.
6. **Alcance**: solo chats persistidos (página de chat). Hub, temporales y
   project-form (`preventChatPersistence: true`) quedan como hoy.
7. **Fuera de alcance (explícito)**:
   - Reinicio del proceso a mitad de turno: el turno se pierde (aceptado en
     frío; sin persistencia no hay nada que recuperar ni detectar).
   - Vuelta tras TTL con página viva: la cura es recargar la página (el RSC
     trae la verdad del DB). No hay server action de adopción del DB.
   - Multi-dispositivo en vivo, cola offline de envíos, endpoint `stop`
     dedicado (el `stop` de hoy persiste el parcial vía `onFinish` y queda como
     está), supresión del toast "Failed to fetch".
   - Redis / `resumable-stream` / subida a v7 del SDK.

## User Stories (núcleo)

1. Apago la pantalla a mitad de respuesta y al volver veo el resto del stream
   o el mensaje completo, sin tocar nada.
2. La generación y su persistencia (mensajes, title, memoria, compactación)
   completan aunque nadie escuche.
3. Reengancharse N veces produce un único Message del asistente (idempotencia
   por replay completo).
4. Un refresco de página a mitad de generación reataca al stream activo en
   lugar de reiniciar la respuesta.

## Testing Decisions

- Test = comportamiento externamente visible: el Message se completa tras
  abortar y reanudar; no hay duplicados; la persistencia ocurre una vez; el
  GET responde `204` sin stream activo; el replay reconstruye desde `start`.
  Ningún test husmea el Map interno del registry.
- Seams:
  1. Contrato HTTP de las rutas de chat (POST + GET de stream) con el Gateway
     simulado del entorno test (Mock Model Gateway `:4001`).
  2. Frontera del hook de sesión de chat para el ciclo ocultar→reanudar
     (component test sobre `visibilitychange`/`pageshow`), espejo de
     `tests/component/agent-code/use-coding-agent.lifecycle.test.tsx`.
  3. Unit del registry (estados, TTL/evict, índice por chatId).
  4. Playwright E2E: el criterio de aceptación (abajo) con stream lento del
     Mock Gateway.
- Prior art en el repo: tests de ciclo de vida y reconexión del coding agent
  (`packages/chatbot/tests/{unit,component}/agent-code/`).
- Cada cambio mantiene verdes lint, `type:check` y las suites rápidas.

## Criterio de aceptación (único)

Prompt largo → apagar la pantalla a mitad de la generación → volver → se ve el
resto del stream o el mensaje completo sin intervención. Equivalente en desktop
con browser minimizado.

## Guardrails

- Verificación de compilación solo con `pnpm build:verify` (`.next/verify`).
  **Nunca `build`**: pm2 sirve el `.next` de Producción en vivo.
- Sin `process.env` en `src/` (ADR 0011); sin `pm2 restart` ni tocar puertos
  8085/3015/5435 sin aprobación explícita del operador.
- El registry asume un único proceso (pm2 sirve un chatbot sin cluster); la
  memoria queda acotada por el TTL y la cantidad de turnos en vuelo.

## Further Notes

- Investigación previa con verificación en `node_modules` (contrato exacto de
  `reconnectToStream`, `resume-stream` en `AbstractChat`, semántica de
  `replaceMessage` y `204`): hecha en la sesión de grilling de 2026-10-26;
  supera a la nota eliminada `sdk-v7-resumable-streams.md` (diseño Redis
  descartado por el constraint del operador).
- Diagnóstico confirmado: la ejecución del chat vive atada al ciclo de vida del
  request HTTP y la persistencia solo ocurre en el fin del stream
  (`lib/features/chat/conversation/factory.ts:257-362`).
