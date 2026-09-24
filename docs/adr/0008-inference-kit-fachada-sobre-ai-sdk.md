# Inference Kit: fachada fina sobre el AI SDK en un paquete de servidor propio

Origen: revisión de arquitectura del 2026-09-24 (página compartida
https://claude.ai/artifact/NfYa4pxPhymsBU2WzxSYFE) y `.scratch/inference-kit/spec.md`, implementada
en los tickets 01–07 de ese mismo directorio.

## Contexto

`packages/models` ya existía como Model Catalog aislado (datos isomorfos, sin dependencias), pero el
resto de la capa de inferencia del chatbot quedó repartida en tres sitios con las fronteras corridas:

- El módulo de proveedores de infraestructura mezclaba la construcción de clientes SDK por
  proveedor con dos modelos ocultos fuera del catálogo (embedding, rerank) y con una operación
  completa (el rerank se ejecutaba dentro del "provider"); duplicaba la baseUrl de OpenCode Go que
  ya vivía en el catálogo; e importaba código de tests en producción para conmutar mocks por
  variable de entorno.
- La feature `foundation-model` definía la interfaz de proveedores que implementaba infraestructura
  (inversión de dependencia al revés), instanciaba los ~60 modelos del catálogo al importar el
  módulo (anulando la construcción perezosa y leyendo `config` en import), y conservaba un Model
  Router muerto cuyos tipos creaban un ciclo con los tipos del chat.
- La operación de decisión (Jev vía Decisions API de OpenRouter) vivía dentro de la feature de Chat
  Mode Router: cliente, key, timeout, trazas e id de modelo estaban ahí, así que una segunda
  decisión (p. ej. enrutar un Subagent) habría obligado a copiar el adaptador entero; la provenance
  genérica de la decisión estaba fundida con el resultado de dominio del router.

Además, siete API keys de proveedor se leían implícitamente por los SDKs desde `process.env`, fuera
del catálogo central de `config`, y seis features nombraban modelos por id literal. Nada de esto era
reutilizable desde el worker de coding agent: cualquier inferencia lateral futura (resumir una
sesión, una decisión para enrutar Subagents, embeddings de repositorio) habría tenido que reinventar
clientes, keys, retry y trazas.

## Decisión

Un paquete de workspace nuevo, `packages/inference` (servidor, Node), como **fachada fina sobre el
AI SDK** — no una capa anticorrupción:

- **Clientes por Endpoint Kind.** Un módulo por Endpoint Kind de modelo de lenguaje (`ProviderKind`,
  hoy 12 valores en `packages/models`), con todas las keys leídas vía `config` y pasadas
  explícitamente al constructor del SDK. Embedding, rerank, decision y speech tienen cada uno su
  propio Endpoint Kind y su propio registro de clientes (`EmbeddingProviderKind`,
  `RerankProviderKind`, `DecisionProviderKind`, `SpeechProviderKind`) — no se añaden a `ProviderKind`,
  que sigue siendo exclusivo de modelos de lenguaje y de la traducción a Pi (`toPiProviderId`).
- **Resolución perezosa y memoizada** por id del catálogo o por Model Role
  (`languageModel`/`speechModel`), construida en la primera petición, nunca ansiosa.
- **Operaciones transversales** que añaden valor real: `embed`, `rerank`, `decide` (genérica, con
  provenance: choice, confidence, probabilities, modelId, provider, latencia, coste) y `createAgent`
  (un `ToolLoopAgent` con el modelo trazado cuando `TRACE_ENABLED=1`). No se envuelven
  `generateText`/`streamText`; el paquete reexporta los tipos del AI SDK que necesita, sin inventar
  tipos propios de mensajes, tools o streams.
- **`createInferenceKit(options)`** construye una instancia independiente (registros de cliente y
  caché de memoización propios); se exporta además una instancia por defecto. El paquete no sabe
  nada de entornos de test — la elección entre kit real y kit de mocks es de la **composición raíz**
  de cada aplicación consumidora (en el chatbot, el único módulo con ese conocimiento es
  `packages/chatbot/lib/infrastructure/ai/inference-kit.ts`).
- **`inference/testing`**, subpath propio con constructores de mock sin ningún id de modelo, para que
  el worker de coding agent pueda reutilizarlos sin depender del código de test del chatbot. La
  tabla de Capability Alias que ata un mock a un Model concreto seleccionable queda fuera del
  paquete, en los tests del chatbot (`packages/chatbot/tests/mocks/ai/capabilities.ts`), con un test
  de invariantes contra el Model Catalog.
- **`models` no cambia de naturaleza**: sigue siendo datos isomorfos sin dependencias. Crece con un
  catálogo por operación (`EMBEDDING_MODELS`, `RERANK_MODELS`, `DECISION_MODELS`, `SPEECH_MODELS`,
  cada uno con forma propia, sin unión discriminada forzada) y con los mapas de Model Role
  (`LANGUAGE_MODEL_ROLES`, `EMBEDDING_ROLES`, `RERANK_ROLES`, `DECISION_ROLES`, `SPEECH_ROLES`,
  unidos en `MODEL_ROLES`). Ninguno de los catálogos nuevos entra en `INVOCABLE_MODEL_IDS` ni en
  `generateModelsJson`.
- **Pi queda fuera por construcción**: su bucle de agente usa `pi-ai`, no el AI SDK; la única
  frontera con Pi sigue siendo el catálogo y `generateModelsJson`.
- **El worker de coding agent puede importar el kit, pero no lo consume todavía**: un test de
  contrato (`packages/coding-agent/tests/contract/inference-import.test.ts`) prueba que `inference`
  e `inference/testing` funcionan desde un proceso `tsx` puro, sin Next.js.
- **Lint** impide, en el chatbot, que un fichero `"use client"` importe `inference` o el módulo de
  composición raíz, y que cualquier módulo fuera de `packages/inference` importe un SDK de proveedor
  directamente (`@ai-sdk/<vendor>`, `@openrouter/ai-sdk-provider`, `@openrouter/sdk`); `ai`,
  `@ai-sdk/react` y `@ai-sdk/provider` siguen permitidos en todas partes.
- **El Chat Mode Router se recompone** sobre `decide`: `createChatModeRouter(decide)` mapea `choice`
  a un Resolved Chat Mode y copia la provenance; `RoutingDecision` (resultado de dominio del router,
  en `packages/chatbot/lib/features/chat/mode-routing/types.ts`) queda separado del `Decision`
  genérico del kit.

## Alternativas descartadas

- **Crecer `packages/models`** para que absorbiera también clientes y operaciones. Descartada:
  `models` viaja al bundle de cliente precisamente porque es solo datos sin dependencias; construir
  clientes SDK, leer `config` o llamar a una red desde ahí rompería esa propiedad para todo el que
  hoy importa el catálogo, incluida la UI.
- **Anticorrupción completa** (tipos propios de mensajes, tools, streams y agent loop). Descartada:
  el AI SDK ya resuelve bien ese contrato; una capa anticorrupción completa duplicaría su superficie
  sin aportar valor y convertiría el paquete en cuello de botella para cada opción nueva que el AI
  SDK exponga. El kit solo envuelve lo que añade algo por encima (dimensiones/taskType de catálogo,
  timeout más provenance estable, trazas).
- **Modelos sintéticos de test en el catálogo** (un `testOnly` en `MODEL_CATALOG`). Descartada en la
  revisión: mezclaría datos de producción con fixtures de test en la única fuente de verdad que
  también viaja al bundle de cliente. Se prefirió `inference/testing` (mocks sin id) más la tabla de
  Capability Alias fuera del paquete.
- **Resolver el Capability Alias por predicado o por Model Role** en vez de una tabla explícita
  `alias → { id, requires }` con test de invariantes. Descartada: un predicado sobre las capacidades
  del catálogo esconde qué Model concreto usa cada spec de e2e y puede cambiar de resultado en
  silencio si el catálogo cambia; resolver por Model Role confundiría un mecanismo de producción
  (retargeting de una feature interna) con una necesidad de test (un mock atado a un Model concreto
  seleccionable). Se adoptó la tabla explícita fuera del paquete más el test de invariantes.

## Consecuencias

- **Una única versión de `ai`** en todo el workspace (`packages/inference` fija la misma que ya
  usaba el chatbot); el lockfile no resuelve una segunda.
- **Endpoint Kind por operación, no por vendor.** `ProviderKind` se queda en 12 valores, solo modelos
  de lenguaje; embedding, rerank, decision y speech no lo tocan — añadir o quitar uno de ellos es un
  cambio local a su propio catálogo y su propio registro de clientes, nunca a `ProviderKind`, a
  `InferenceClients` ni a `toPiProviderId`.
- **Solo seis API keys nuevas, no siete.** `OPENAI_API_KEY`, `XAI_API_KEY`, `GROQ_API_KEY`,
  `PERPLEXITY_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` y `COHERE_API_KEY` se declaran en
  `packages/config` como `secretOptional`. Anthropic y DeepSeek no necesitan key propia: el
  prefactor (ticket 01) ya los había retirado como Endpoint Kind de modelo de lenguaje, así que se
  alcanzan a través de la key del proxy de OpenCode Go.
- **Runtime Node, comprobado, no solo asumido.** `packages/coding-agent/tests/contract/inference-import.test.ts`
  importa `inference` e `inference/testing` desde `tsx` puro; `coding-agent → inference` es una
  dependencia real de `package.json` hoy solo para mantener ese test en verde, no porque el worker
  llame al kit desde ningún camino real todavía.
- **El Model Router muerto deja rastro permanente.** `ModelRoutingMetadata`
  (`packages/chatbot/lib/features/foundation-model/types.ts`),
  `MessageMetadata.autoModel` (`packages/chatbot/lib/features/chat/types.ts`) y el panel de detalle
  en `packages/chatbot/components/chat/message.tsx` sobreviven como decodificación exclusivamente
  legada, para que un `Message.metadata.autoModel` persistido antes de la retirada siga renderizando
  (`packages/chatbot/tests/component/chat/legacy-model-routing-metadata.test.tsx`). No hay plan de
  borrarlos: no describen código vivo, pero tampoco se puede borrar el historial de mensajes ya
  persistidos.
- **La promesa de "cero cambios en los specs de e2e" no fue del todo literal.** Mover la tabla de
  Capability Alias de un string a `{ id, requires }` tocó 6 líneas en dos specs
  (`packages/chatbot/tests/e2e/chat/hub.spec.ts`,
  `packages/chatbot/tests/e2e/chat/hub-sidebar-update.spec.ts`) que leían `CAPABILITY_ALIASES`
  directamente para construir constantes locales, no a través de los helpers. La API de los helpers
  (`ModelPickerComponent.selectModel()`, `HubHeaderComponent.addModel()`) no cambió.
- **Un quinto catálogo por operación (speech), no previsto en el texto original del spec.** El
  texto-a-voz de `packages/chatbot/lib/features/english/actions.ts` llamaba a un proveedor y a un id
  literal directamente; para que la regla de lint del ticket 07 se sostuviera sin excepciones, el
  text-to-speech se movió detrás del kit con su propio catálogo pequeño (`SPEECH_MODELS`/
  `SPEECH_ROLES`/`SpeechProviderKind`, `speechModel(idOrRole)`), siguiendo el mismo patrón que
  embedding/rerank/decision — decisión del orquestador tomada durante la implementación (ver
  `09-orchestrator-decisions.md` en las notas del esfuerzo).
- **No contradice ADR 0002** (runtime Pi aislado por entorno): `generateModelsJson` y los ficheros de
  runtime de Pi no cambian; el Inference Kit ni los lee ni los escribe.
- **No contradice ADR 0006** (build exclusivo de producción): toda la verificación de este esfuerzo
  usó `build:verify` hacia directorios aislados (`.next/verify`, `dist/verify`, `.pi-verify`); nunca
  `build` ni `pnpm preview`.
