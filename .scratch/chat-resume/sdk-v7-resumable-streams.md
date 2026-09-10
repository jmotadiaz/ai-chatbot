# SDK v7 — mecanismos nativos para reanudar turnos de chat

Pregunta: ¿tiene la versión 7 del AI SDK (actual: `ai@7.0.94` / `@ai-sdk/react@4.0.97`)
mecanismos nativos para que un turno de chat sobreviva a pantalla apagada /
desconexión y el cliente se reconecte, como hace el coding agent?

**Veredicto: sí, el patrón oficial existe y encaja con nuestro stack.
No es "cero código" (exige Redis + 2 endpoints + cableado cliente), pero evita
inventar protocolo propio: es la opción C del diagnóstico, bendecida por el SDK.**

Instalado en el repo hoy: `ai@6.0.44` / `@ai-sdk/react@3.0.41` (generación v6).
npm latest verificado 2026-09-09: `ai@7.0.94`, `@ai-sdk/react@4.0.97`,
`resumable-stream@2.2.12`.

## El patrón oficial: Resumable Streams

Fuente: `vercel/ai` — `content/docs/04-ai-sdk-ui/03-chatbot-resume-streams.mdx`
(vía Context7, IDs `/vercel/ai`):

1. **POST** crea el stream con ID único y lo publica en Redis mientras se genera:
   `createUIMessageStreamResponse({ stream, consumeSseStream })` +
   `createResumableStreamContext({ waitUntil: after }).createNewResumableStream(streamId, () => stream)`
   (paquete separado `resumable-stream`, Redis como pub/sub). Guarda
   `activeStreamId` en la fila del chat y el mensaje de usuario **antes** de
   streamear; `onEnd`/`onFinish` guarda mensajes finales y limpia `activeStreamId`.
2. **GET `/api/chat/[id]/stream`** reanuda: `resumeExistingStream(activeStreamId)`;
   `204` si no hay stream activo.
3. **Cliente**: `useChat({ resume: true })` reconecta solo al montar; `stop()` y
   cualquier abort (cerrar tab, refrescar, pantalla apagada) se tratan como
   **desconexión, no cancelación**: el servidor sigue generando y el cliente
   retoma con `resumeStream()`. Parar de verdad exige un endpoint `stop`
   dedicado que persista el parcial y cancele el trabajo.

## Qué ya tenemos sin subir de versión (verificado en `node_modules`)

- `ai@6.0.44` ya soporta `consumeSseStream` en `createUIMessageStreamResponse`
  (`ai/dist/index.d.ts:3728`) y `toUIMessageStream({ onEnd })`.
- `DefaultChatTransport.reconnectToStream` hace `GET {api}/{chatId}/stream`
  (`ai/dist/index.js:11912`) y devuelve `null` ante `204`, dejando status `ready`.
- `@ai-sdk/react@3.0.41` `useChat({ resume })` invoca `resumeStream()` al montar.
- O sea: **toda la mitad SDK del protocolo ya está instalada**. Falta nuestra
  mitad: paquete `resumable-stream` + Redis + `GET [id]/stream` + guardar
  `activeStreamId` + `resume: true` en `use-chat-session.ts` (hoy ni pasa `id`).

## Huecos que el SDK no cubre (diseño nuestro)

- **Redis no existe en ningún entorno** (dev/test/prod solo Postgres hoy):
  hay que añadirlo a los tres `docker-compose.*.yml` + catálogo `config`.
  Es el coste infra principal; alternativa sin Redis sería reimplementar el
  buffer en Postgres (más trabajo, peor "elegancia").
- `resume: true` solo reanuda **al montar**. Pantalla off→on sin remontaje
  necesita nuestro propio hook de lifecycle (`visibilitychange`/`freeze`/
  `pagehide`/`pageshow`/`online`, como `use-coding-agent.ts`) que llame a
  `resumeStream()`. El SDK da la primitiva; el cableado es nuestro.
- El endpoint `stop` dedicado (persistir parcial + cancelar de verdad).
- `onFinish` actual guarda en transacción Drizzle: reutilizable como `onEnd`,
  añadiendo limpieza de `activeStreamId`.

## Propuesta elegante (cuando se apruebe implementar)

1. Añadir Redis a los tres entornos + `resumable-stream` al chatbot.
2. `POST /api/chat`: guardar mensaje usuario + `activeStreamId` vía
   `consumeSseStream` → `createNewResumableStream`; `onEnd` persiste y limpia.
3. Nuevo `GET /api/chat/[id]/stream` con `resumeExistingStream` / `204`.
4. `use-chat-session.ts`: pasar `id` del chat + `resume: true`; quitar el noop
   de `resumeStream` en `provider.tsx`.
5. Lifecycle hook estilo coding agent que invoque `resumeStream()` al volver
   visible + endpoint `stop` dedicado.
6. Subir a v7 (`ai@7` / `@ai-sdk/react@4`) en el mismo cambio o justo después;
   el patrón es el mismo en v6 y v7, así que la subida no bloquea.

Nota: en v6+ `createResumableStreamContext` ya **no** vive en `ai` (grep vacío),
sino en el paquete `resumable-stream` — importar de ahí, no de `ai`.
