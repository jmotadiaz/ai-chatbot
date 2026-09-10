# Spec: Reanudar la respuesta del chat tras perder la conexión

**Status:** ready-for-agent

## Problem Statement

Cuando la pantalla del móvil se apaga (o se cierra la pestaña, se refresca o se
pierde la red) en mitad de la respuesta del asistente en un Chat, la respuesta
se interrumpe y se pierde: el Message del asistente nunca se completa ni se
persiste, y al volver no hay forma de retomar lo que el servidor estaba
generando. El Coding Agent no sufre esto porque su Worker sigue ejecutando el
Turn en servidor y el cliente se reconecta al stream; el Chat no tiene ningún
mecanismo equivalente.

## Solution

Adoptar el patrón oficial de streams reanudables del AI SDK: la generación de
cada respuesta del asistente se publica en un canal reanudable respaldado por
Redis mientras se emite, el Chat recuerda qué stream sigue activo, y el cliente
puede reengancharse a ese stream al volver (pantalla encendida, pestaña
reabierta, red recuperada) y recibir lo que se generó en su ausencia hasta
completar el Message. Cerrar o apagar se convierte en "desconectar", no en
"cancelar"; cancelar de verdad sigue existiendo como acción explícita.

## User Stories

1. As a chat user on mobile, I want to turn the screen off mid-response and find the completed assistant Message when I turn it back on, so that a long answer is never lost to a screen lock.
2. As a chat user on mobile, I want the response to keep generating on the server while my screen is off, so that waiting time passes even with the phone locked.
3. As a chat user, I want to close the tab mid-response and see the finished Message when I reopen the Chat, so that an accidental close costs nothing.
4. As a chat user, I want to refresh the page mid-response and have the answer resume instead of restarting, so that I never pay the generation twice.
5. As a chat user, I want my sent Message to survive any interruption, so that I never have to retype what I already sent.
6. As a chat user, I want at most one assistant Message per sent Message even after several disconnects and resumes, so that reconnecting never duplicates answers.
7. As a chat user, I want an explicit stop action that truly cancels the generation, so that disconnecting and stopping stay visibly different intentions.
8. As a chat user, I want a resumed response to continue the same answer rather than restart it from zero, so that long responses do not loop forever on flaky networks.
9. As a chat user, I want the Chat history to show the completed Message after a resume, so that navigating away and back shows a coherent record.
10. As a chat user with a poor connection, I want going offline and back online to resume the in-flight response automatically, so that tunnels and elevators do not kill answers.
11. As a chat user, I want a clear terminal state when the generation itself fails mid-stream, so that a failed answer is distinguishable from an interrupted one I can resume.
12. As a chat user, I want retry after a genuine failure to regenerate cleanly, so that resume logic never masks a real error.
13. As a chat user, I want sources, reasoning and tool activity already streamed to stay visible after a resume, so that reattaching does not wipe context I already saw.
14. As a chat user, I want token usage and billing to reflect a single generation per Message, so that resumes do not silently multiply cost.
15. As a chat user, I want the Chat title to be generated exactly once per Chat, so that resumes do not rename or re-title anything.
16. As a chat user, I want extracted memories to be recorded exactly once per exchange, so that reconnecting does not duplicate what the system remembers about me.
17. As a chat user, I want context compaction to keep working as today after resumes, so that long Chats do not degrade or lose context.
18. As a chat user of RAG, web search, project and context modes, I want resume to behave identically in every Chat Mode, so that no mode is a second-class citizen.
19. As a chat user, I want opening the same Chat in a second tab while a response runs to attach to the running stream, so that multi-tab use converges instead of forking.
20. As a chat user, I want sending a new Message while disconnected to wait for connectivity with my text intact, so that nothing I write offline is silently dropped.
21. As a chat user, I want the input to stay usable for reading history while a resume is pending, so that the interface never feels frozen.
22. As a chat user, I want a visible "reconnecting" indication when the client is reattaching, so that a pause after unlocking the screen reads as recovery, not breakage.
23. As a chat user, I want image attachments and project context to resume exactly like plain text, so that rich Messages get the same guarantee.
24. As a chat user, I want the response to finish and persist even if I never come back, so that opening the Chat hours later shows the complete answer.

## Implementation Decisions

- Patrón oficial de streams reanudables del AI SDK (misma forma en v6 instalada
  y v7 actual): publicar cada stream de respuesta en un canal con identidad
  propia respaldado por Redis, recordar el stream activo en el Chat, y exponer
  una ruta GET de stream por Chat que reanuda o responde vacío cuando no hay
  nada activo.
- Redis vive uno por Entorno (Desarrollo, Test, Producción), declarado junto a
  la base de datos de cada Entorno; sus credenciales y URLs entran por el
  catálogo central de entorno, nunca como acceso directo a variables en código
  de aplicación.
- El Message del usuario se persiste al recibir la petición, antes de empezar a
  streamear; el Message del asistente se persiste una sola vez al terminar la
  generación, y el identificador de stream activo se limpia en ese mismo paso.
  Así, volver tarde (historia 24) siempre encuentra el registro completo.
- Semántica de interrupción: cualquier abort del cliente (pantalla apagada,
  pestaña cerrada, refresco, `stop` del composer) es desconexión; la generación
  continúa en servidor. La cancelación real es una ruta dedicada que persiste
  el parcial, cancela el trabajo y libera el stream activo.
- Exactamente-una-vez: la reanudación reemite deltas ya generados sin
  re-ejecutar la generación; la persistencia solo ocurre en el fin terminal,
  por lo que reanudar N veces produce un único Message del asistente, un único
  cómputo de uso, una única titulación y una única extracción de memoria.
- Reanudar nunca cambia el Model ni su configuración: el stream retomado
  continúa con lo que la petición original fijó, igual que el coding agent
  nunca cambia de modelo al reconectar.
- Cliente: la sesión de chat se identifica por Chat y activa reanudación
  automática al montar; el stub actual de reanudación se sustituye por la
  llamada real. Además, un hook de ciclo de vida de página (oculto/congelado/
  ocultación/descartado del lado de corte; visible/mostrado/en línea/foco del
  lado de reanudación) replica el comportamiento del cliente del coding agent
  para los casos sin remontaje, como pantalla off→on.
- La subida del SDK a v7 queda fuera del comportamiento: el patrón es idéntico
  en ambas generaciones, así que puede viajar en el mismo cambio o justo
  después sin afectar a esta spec.
- Despliegue en Producción bajo las reglas del repo: el servicio vivo lo toca
  solo el operador con ventana de indisponibilidad; la verificación del agente
  usa los directorios aislados de compilación y las suites rápidas.

## Testing Decisions

- Un buen test afirma comportamiento externamente visible: el Message se
  completa tras abortar y reanudar, no hay Messages duplicados, el Message del
  usuario sobrevive, parar cancela de verdad, el endpoint de stream responde
  vacío sin stream activo. Ningún test husmea en el buffer de Redis ni en
  estado interno de componentes.
- Seams propuestos (existentes primero, el más alto posible; una sola seam
  nueva):
  1. Frontera de contrato HTTP de las rutas de chat (POST existente + GET de
     stream nueva), con publicador y almacén simulados — es la seam más alta
     y cubre todo el protocolo de reanudación.
  2. Frontera del hook de sesión de chat para el ciclo
     ocultar→reanudar (pantalla apagada/encendida) — aquí se fija el síntoma
     exacto del reporte.
  3. Frontera de la factoría de respuesta para persistencia anticipada del
     usuario y limpieza del stream activo al terminar.
  4. Escenarios Playwright de extremo a extremo (abortar a mitad de stream,
     reconectar, afirmar Message completo y único).
- La única seam nueva es el puerto del almacén de streams reanudables, en la
  forma puerto/adaptador que ya usa la conversación del chat, para que los
  tests lo simulen sin Redis real.
- Prior art: los tests de contrato de la ruta de conexión del coding agent
  (publicador simulado, reenvío SSE, códigos de estado), los tests de ciclo de
  vida del hook del coding agent (congelar corta, reanudar reconecta), los
  tests del traductor de streams, y el registro de modelos simulados de e2e
  (probable alias nuevo de comportamiento tipo stream lento para el caso
  abortar-a-mitad).
- Cada cambio mantiene en verde las suites rápidas del repo (lint, type-check
  y tests unitarios/de componente/integración/contrato afectados).

## Out of Scope

- Subir el SDK a v7 como fin en sí mismo (puede acompañar o seguir; el
  comportamiento no depende de ello).
- Reimplementar el buffer reanudable sobre Postgres en lugar de Redis.
- Cola de envíos offline más allá de preservar el texto escrito sin conexión.
- Conflictos multi-pestaña más allá de convergencia best-effort al stream
  activo (sin turnos de escritura ni fusiones).
- Cambios en RAG, ingesta, compaction, memoria o titulación más allá de
  mantener su garantía de exactamente-una-vez.
- Cambios visuales del composer más allá del indicador de reconexión y la
  acción de parada real.
- Hub: la reanudación funciona donde se use el hook compartido de sesión; el
  cableado propio de instancias del Hub queda fuera salvo que lo herede gratis.

## Further Notes

- Nota de investigación con fuentes primarias y verificación en `node_modules`:
  `.scratch/chat-resume/sdk-v7-resumable-streams.md`.
- Diagnóstico previo (bucle rojo `node /tmp/chat-screenoff-repro.mjs`): la
  ejecución del chat vive atada al ciclo de vida del request HTTP y su
  persistencia ocurre solo en el fin del stream, sin protocolo de reanudación;
  esa es la hipótesis confirmada que este diseño elimina. Los tests de
  regresión de esta spec sustituyen a ese harness desechable.
- En v6+ el contexto de streams reanudables ya no se importa del paquete del
  SDK sino del paquete separado de streams reanudables; importar del lugar
  correcto evita un error conocido.
