# Spec: Inference Kit — paquete servidor compartido para proveedores, catálogo y operaciones de IA

**Status:** ready-for-agent

Origen: revisión de arquitectura del 2026-09-24 (página compartida
https://claude.ai/artifact/NfYa4pxPhymsBU2WzxSYFE). Decisiones ya tomadas con el operador:
fachada fina sobre el AI SDK (no anticorrupción), `models` sigue siendo datos isomorfos, y para
los alias de capacidad de e2e se adoptan las alternativas **1 + 2** (tabla de alias fuera del
paquete + test de invariantes contra el Model Catalog).

## Problem Statement

La extracción del Model Catalog a `packages/models` dejó la capa de inferencia del chatbot
partida en tres sitios con las fronteras corridas:

- El módulo de proveedores de infraestructura del chatbot mezcla la construcción de clientes SDK
  por proveedor con dos modelos ocultos fuera del catálogo (el de embeddings y el de rerank) y con
  una operación completa (ejecuta el rerank dentro del "provider"). Duplica la baseUrl de OpenCode
  Go que ya vive en el catálogo, e importa código de tests en producción para conmutar mocks por
  variable de entorno.
- La feature `foundation-model` define la interfaz de proveedores que implementa infraestructura
  (inversión al revés), instancia los ~60 modelos del catálogo al importar el módulo (anulando la
  construcción perezosa y leyendo `config` en import) y conserva un Model Router muerto cuyos tipos
  crean un ciclo con los tipos del chat.
- La operación *decision* (Jev vía Decisions API de OpenRouter) vive dentro de la feature de
  Chat Mode Router: cliente, key, timeout, trazas y el id del modelo están en la feature, así que
  una segunda decisión (RAG sí/no, elección de subagente) obligaría a copiar el adaptador entero.
  La provenance genérica de la decisión está fundida con el resultado de dominio.

Además, siete API keys de proveedor se leen implícitamente por los SDKs desde `process.env`, fuera
del catálogo central de `config`; y seis features nombran modelos por id literal, de modo que
cambiar el modelo de un rol obliga a tocar cada feature.

Como consecuencia, nada de esto es reutilizable desde el worker de coding agent: cualquier
inferencia lateral futura (resumir una sesión, una decision para enrutar subagentes, embeddings de
repositorio) tendría que reinventar clientes, keys, retry y trazas.

## Solution

Un paquete de workspace nuevo, **`inference`** (el nombre `ai` colisiona con el paquete npm),
servidor y Node, que actúa como **fachada fina sobre el AI SDK**:

- Posee los **clientes por endpoint kind** (hoy `ProviderKind`), con keys leídas vía `config`,
  cabeceras y fetch con retry de OpenCode Go, y el cliente de la Decisions API de OpenRouter
  compartiendo key con el provider del SDK.
- Posee la **resolución** por id o por **Model Role**: `languageModel`, `embeddingModel`,
  `reranker`, `decisionClient`. Memoizada por id, nunca ansiosa.
- Posee las **operaciones transversales** que añaden valor: `embed` (dimensiones y taskType),
  `rerank`, `decide` genérico y `createAgent` con trazas y middleware. La generación de texto no
  se envuelve: las features siguen usando `generateText`, `streamText`, `ToolLoopAgent` y `tool()`
  del AI SDK con la configuración que el kit resuelve.
- Reexporta los tipos del AI SDK que necesitan los consumidores. No define tipos propios de
  mensajes, tools ni streams.
- Se construye con **`createInferenceKit({ clients })`** y expone una instancia por defecto. La
  elección de instancia (real o con mocks) la hace la **composición raíz de cada aplicación**, no
  el paquete: la variable de entorno de test sale del código de librería.
- Expone un subpath **`inference/testing`** con los constructores de comportamiento de mock
  (modelo genérico, embeddings, streams, los comportamientos especializados) **sin ningún id de
  modelo**. La tabla de alias de capacidad de e2e se queda en los tests del chatbot, su único
  consumidor.

`models` **no cambia de naturaleza**: sigue siendo datos isomorfos sin dependencias porque ya
viaja al bundle de cliente. Crece en datos: catálogos tipados por operación (embedding, rerank,
decision) y el mapa de Model Roles. Pi queda fuera por construcción (su bucle de agente usa
`pi-ai`, no el AI SDK); la única frontera con Pi sigue siendo el catálogo y `generateModelsJson`.

## User Stories

1. As a chatbot feature author, I want to obtain a Model Configuration by id or by Model Role from
   one place, so that I never touch a provider, a key or a literal model id.
2. As a chatbot feature author, I want to keep writing `generateText`, `ToolLoopAgent` and `tool()`
   from the AI SDK, so that the shared package does not become a bottleneck for every new option.
3. As a chatbot feature author, I want embeddings and rerank resolved by role, so that swapping the
   embedding or rerank model is a catalog change, not a code change.
4. As a Chat Mode Router maintainer, I want a generic `decide` operation with provenance
   (choice, confidence, probabilities, modelId, provider, latency, cost), so that the routing
   feature only owns its question and its policy.
5. As a maintainer, I want a second decision question (e.g. subagent routing) to reuse the same
   client, timeout and trace scope, so that adding a decision is a question plus a policy.
6. As a coding-agent maintainer, I want the package importable from a plain Node/tsx process, so
   that the worker can use lateral inference in the future without Next-specific constructs.
7. As a maintainer, I want the Model Catalog to stay dependency-free and isomorphic, so that client
   components keep importing it without pulling provider SDKs or server config into the bundle.
8. As a maintainer, I want every provider API key declared in the central env catalog, so that no
   SDK reads `process.env` implicitly.
9. As a maintainer, I want model instances built lazily and memoized, so that importing the kit
   reads no configuration and creates no clients until first use.
10. As a maintainer, I want the test-mode switch out of library code, so that the package has no
    knowledge of test environments and imports no test code in production paths.
11. As an e2e author, I want capability aliases to keep resolving to selectable Models, so that
    specs keep driving the real model picker.
12. As an e2e author, I want the test suite to fail loudly, with the alias named, when the Model an
    alias points at loses the capability its mock assumes (image input, reasoning, distinct
    temperatures), so that catalog changes never break e2e silently.
13. As a coding-agent test author, I want to reuse the same mock builders as the chatbot, so that
    worker tests never re-implement AI SDK mocks.
14. As an evals author, I want the simulator to resolve models through the kit, so that evals and
    production share provenance types and never hardcode provider calls.
15. As an operator, I want one place for retry of transient 5xx, zero data retention options and
    tracing middleware, so that provider behaviour is consistent across every consumer.
16. As an operator, I want the Decisions cost and the AI SDK usage recorded through the same
    package, so that per-turn accounting is uniform.
17. As a maintainer, I want lint to forbid importing the kit from client components and importing
    provider SDKs outside the kit, so that the dependency rule is enforced, not remembered.
18. As a maintainer, I want the dead Model Router code and the feature ↔ foundation type cycle
    removed, so that `foundation-model` depends on nothing above it.
19. As a maintainer, I want the architectural decision recorded as an ADR and the new terms in the
    glossary, so that future work respects the package boundary.

## Implementation Decisions

- **Nombre y forma del paquete.** `packages/inference`, con la misma forma que `tracing`:
  `main`/`types` apuntando a fuente TS, scripts `lint`, `type:check`, `test:unit`, `test:contract`;
  dependencias `ai`, los `@ai-sdk/*` que hoy tiene el chatbot, `@openrouter/ai-sdk-provider`,
  `@openrouter/sdk`, `models`, `config`, `tracing`. Versión única de `ai` en el workspace.
- **Sin `server-only`.** El paquete no importa `server-only` (alias de Next, inexistente bajo tsx).
  La frontera servidor se garantiza por convención y por lint en los consumidores.
- **Endpoint kind.** `ProviderKind` de `models` se documenta como *clave de cliente* (endpoint +
  sabor de API), no como vendor. El kit tipa su registro de clientes como
  `Record<ProviderKind, …>` derivado del catálogo, de modo que añadir o quitar un kind es un
  error de compilación en un solo sitio. Las entradas hoy muertas (`anthropic`, `google`,
  `deepseek` como kinds de lenguaje) desaparecen.
- **Clientes.** Un módulo por endpoint kind. Todas las keys se leen vía `config`; las siete que hoy
  leen los SDKs implícitamente (Anthropic, OpenAI, Google Generative AI, xAI, Groq, Cohere,
  Perplexity, DeepSeek) se declaran en el catálogo de env de `config` como opcionales y secretas y
  se pasan explícitamente al constructor del SDK. El fetch con retry de 5xx y las cabeceras de
  sesión de OpenCode Go viven aquí.
- **Resolución perezosa.** `languageModel(idOrRole)` devuelve la Model Configuration expandible que
  hoy devuelve `languageModelConfigurations` (modelo, providerOptions, temperatura, topP, topK,
  contextWindow, supportedFiles, supportedOutput, company), construida y memoizada en la primera
  petición. Acepta el override de `providerOptions` con deepmerge como hoy. Se elimina el mapa
  ansioso construido en import.
- **Factoría e inyección.** `createInferenceKit(options)` recibe opcionalmente un resolutor de
  clientes por kind y un resolutor de `languageModel` por entrada de catálogo (`(entry) =>
  LanguageModelV3 | undefined`), que permite a una composición de test sustituir modelos
  concretos. El paquete exporta también una instancia por defecto. En el chatbot hay **un único
  módulo de composición raíz** en infraestructura que elige la instancia (real, o con el resolutor
  de mocks cuando la app corre en modo test) y del que importan todas las features. La variable
  `NEXT_PUBLIC_ENV` no aparece en el paquete.
- **Catálogos por operación en `models`.** Junto a `MODEL_CATALOG`: `EMBEDDING_MODELS`
  (proveedor, id, dimensiones de salida, taskTypes soportados), `RERANK_MODELS` y
  `DECISION_MODELS` (Jev bajo un endpoint kind propio `openrouterDecisions`). Cada uno con su
  propia forma; no se fuerza una unión discriminada. Los catálogos nuevos son datos puros y no
  entran en `INVOCABLE_MODEL_IDS` ni en `generateModelsJson`.
- **Model Roles.** `MODEL_ROLES` en `models`: mapa de rol → id de catálogo para los modelos
  internos no seleccionables que hoy nombran las features (título de chat, extracción de memoria,
  descomposición de queries, resumen de búsqueda web, edición de imagen, meta-prompt, los
  workflows de english, compaction) más `embedding`, `rerank` y `chatModeRouter`. El kit resuelve
  por rol o por id; las features migran a rol. Los roles cubren modelos internos: los Models
  seleccionables por el usuario siguen llegando por id desde la UI.
- **Operaciones.** `embed(role, values, { taskType })` aplica dimensiones y taskType del catálogo;
  `rerank(role, { query, documents, topN })` devuelve `{ originalIndex, score }[]`;
  `decide({ model, question: { instructions, criteria }, state, scope })` devuelve
  `{ choice, confidence?, probabilities?, modelId, provider?, latencyMs, costUsd? }` con timeout
  acotado y `sessionId`/`traceId` tomados del scope de trazas; `createAgent(idOrRole, {
  instructions, tools, overrides })` construye un `ToolLoopAgent` con el modelo trazado cuando el
  tracing está activo. `generateText`/`streamText` no se envuelven.
- **Chat Mode Router sobre `decide`.** La feature conserva `questions`, `policy` y el
  `ChatModeRouterPort`; el adaptador real pasa a ser una composición fina `createChatModeRouter(
  decide)` que mapea `choice` → Resolved Chat Mode y copia la provenance. `RoutingDecision` se
  separa en provenance genérica de decisión (tipo del kit) más resultado de dominio (`mode`,
  `reason`), eliminando el ciclo entre tipos y preguntas. El router determinista de test no cambia.
  La metadata persistida `Message.metadata.chatModeRouting` conserva su forma exacta.
- **Mocks.** `inference/testing` exporta los constructores (`createMockModel`,
  `createMockEmbeddingModel`, streams, y los cinco comportamientos: ejecución de tools, visión,
  razonamiento, rechazo, error a mitad de stream) sin ids de modelo. La tabla
  `CAPABILITY_ALIASES` permanece en los tests del chatbot, tipada con `InvocableModelId` de
  `models`, y cada alias declara junto al id **lo que su mock asume del catálogo** (por ejemplo
  `requires: { imageInput: true }`, `requires: { reasoning: true }`, `distinctTemperatureFrom:
  "basicChat"`, `plainMock: true`). La composición de test del chatbot construye el resolutor
  `entry → alias → comportamiento`.
- **Expand–contract.** Los módulos actuales del chatbot (`languageModelConfigurations`,
  `providers`) se conservan como reexports finos mientras las features migran al kit; se borran
  al final, junto con el Model Router muerto (que se elimina al principio como prefactor).
- **Lint.** Regla `no-restricted-imports` en dos frentes: ficheros con `"use client"` no importan
  `inference` ni el módulo de composición raíz; fuera de `packages/inference` nadie importa
  `@ai-sdk/*` de proveedor, `@openrouter/ai-sdk-provider` ni `@openrouter/sdk` (el paquete `ai` y
  `@ai-sdk/react`/`@ai-sdk/provider` siguen permitidos).
- **Worker.** El worker no consume el kit en este spec; la garantía es que puede hacerlo: un test
  de contrato importa el paquete y sus subpaths desde un proceso tsx sin Next.
- **Runtime.** El kit asume Node (`randomUUID`, AsyncLocalStorage de `tracing`). La única ruta
  edge del chatbot (stub del worker) no infiere. Queda escrito en el README del paquete.
- **ADRs.** No contradice ADR 0002 (runtime Pi aislado por entorno): `generateModelsJson` y los
  ficheros de Pi no cambian. Respeta ADR 0006 (build exclusivo de producción): toda verificación
  usa `build:verify`, nunca `build`.

## Testing Decisions

Un buen test asserta comportamiento externo del paquete o de la feature: qué Model Configuration
se obtiene para un id o rol, qué request sale por el fetch de un cliente, qué provenance devuelve
`decide`, con qué modo se responde un turno Auto. Ningún test mira el interior del AI SDK ni los
prompts.

- **Seam principal (nueva, la única nueva):** `createInferenceKit(options)`. Todo lo demás se
  prueba a través de seams existentes: los puertos por feature (`CompactionAiPort`,
  `RagRetrieveAiPort`, `ChatAgentAiPort`, `ChatModeRouterPort`), la metadata del mensaje y el
  selector real de modelos en e2e.
- **Unit del paquete:** resolución catálogo → configuración (parámetros, providerOptions, merge de
  overrides, memoización: una única construcción por id), resolución por rol, invariantes de los
  catálogos por operación (cada rol apunta a un id existente; cada `DECISION_MODELS` usa un kind
  de decisión).
- **Contrato del paquete:** cada cliente contra un fetcher enlatado sin red: cabeceras de sesión y
  user-agent de OpenCode Go, retry de 5xx con backoff, request y parseo de la Decisions API (se
  mueve el contract test actual de mode-routing con su fixture). Un contrato adicional importa el
  paquete y `inference/testing` desde tsx puro.
- **Chatbot unit/component:** sin cambios de estrategia; los puertos por feature siguen recibiendo
  fakes.
- **Chatbot integration:** conversación Auto con `decide` fake inyectado por el kit de test:
  metadata `chatModeRouting` idéntica a la actual; RAG y memoria con embeddings y rerank fake vía
  kit de test.
- **E2E:** sin cambios en los specs. Los alias siguen resolviendo a Models seleccionables.
- **Invariantes de alias (nuevo unit test en el chatbot):** por cada alias, la entrada del
  catálogo cumple lo declarado en `requires`; los alias son disjuntos; los alias `plainMock` no
  tienen comportamiento registrado; el mensaje de fallo nombra el alias y la propiedad.
- **Evals:** el simulador resuelve por rol o id a través del kit; sin cambios de datasets.
- **Prior art:** contract test de mode-routing con fetcher enlatado; tests de configuración por
  modelo en `tests/unit/foundation-model`; mocks de `ai/test` en `tests/mocks/ai`; composición del
  router determinista en `conversation/index.ts`.

## Out of Scope

- Consumo real del kit desde el worker de coding agent (solo se garantiza la importabilidad).
- Poner el bucle de agente de Pi bajo el kit: Pi usa `pi-ai`, no el AI SDK.
- Tipos propios de mensajes, tools, streams o agent loops (anticorrupción completa).
- Envolver `generateText`/`streamText`.
- Herramientas compartidas (web search, Context7) en el paquete.
- Cambios en la UI, en el selector de modelos, en `INVOCABLE_MODEL_IDS` o en el pgEnum.
- Modelos sintéticos de test en el catálogo (`testOnly`), descartados en la revisión.
- Cambios en los ficheros de runtime de Pi o en `generateModelsJson`.
- Retirar ids literales de modelo del **simulador de evals** más allá de resolverlos vía kit.

## Further Notes

- **Glosario.** Términos nuevos a incorporar en `CONTEXT.md` vía `/domain-modeling`: *Inference
  Kit*, *Endpoint Kind* (semántica real de `ProviderKind`), *Model Role*, *Capability Alias*,
  *Decision* (operación de inferencia con provenance). El término *Model Router* del glosario
  describe el mecanismo muerto que este spec borra; conviene marcarlo como legado o retirarlo.
- **Prod.** Ninguna verificación toca pm2 ni `build`. La composición raíz del chatbot cambia de
  módulo, así que el arranque real se comprueba en dev (`pnpm dev`) antes de proponer restart de
  prod al operador.
- **Nombre del paquete.** `inference` es una decisión por defecto; si el operador prefiere
  `ai-kit`, se cambia en el ticket 02 antes de que existan consumidores.
