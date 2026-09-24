# 02: Paquete `inference` — clientes, resolución perezosa e inyección (expand)

**What to build:** existe un paquete de workspace `inference` (forma de `tracing`: fuente TS, `lint`, `type:check`, `test:unit`, `test:contract`) que posee los clientes por endpoint kind y la resolución de Model Configuration por id, construido con `createInferenceKit(options)` y con instancia por defecto. El chatbot obtiene sus modelos a través de **un único módulo de composición raíz** en su infraestructura, que elige la instancia real o la de test; los módulos actuales (`languageModelConfigurations`, `providers`) quedan como reexports finos para que ninguna feature cambie todavía. El chat, RAG, memoria, compaction y el resto funcionan igual en dev y en e2e.

**Blocked by:** 01 (prefactor: registro tipado por `ProviderKind`, sin ciclo con chat).

**Status:** ready-for-agent

- [ ] `packages/inference` creado con dependencias `ai`, los `@ai-sdk/*` de proveedor que hoy usa el chatbot, `@openrouter/ai-sdk-provider`, `models`, `config`, `tracing`; una sola versión de `ai` en el workspace. Sin `server-only`.
- [ ] Clientes movidos desde infraestructura del chatbot: un módulo por endpoint kind, cabeceras de sesión y fetch con retry de 5xx de OpenCode Go incluidos. El registro es `Record<ProviderKind, …>`.
- [ ] Todas las keys se leen vía `config`: las siete que hoy leen los SDKs implícitamente (Anthropic, OpenAI, Google Generative AI, xAI, Groq, Cohere, Perplexity, DeepSeek según aplique) se declaran en el catálogo de env de `config` como opcionales y secretas y se pasan explícitamente al constructor del SDK. Ningún cliente se construye ni lee configuración al importar el paquete.
- [ ] `languageModel(id, { providerOptions? })` devuelve la misma Model Configuration que hoy `languageModelConfigurations` (incluido el wrap del middleware de razonamiento y el deepmerge de `providerOptions`), construida y memoizada en la primera llamada; el mapa ansioso de import desaparece.
- [ ] `createInferenceKit({ clients?, languageModel? })` permite sustituir clientes por kind y modelos por entrada de catálogo; se exporta además una instancia por defecto.
- [ ] Un módulo de composición raíz en infraestructura del chatbot exporta la instancia elegida; en modo test construye el kit con el resolutor de mocks actual (registro por id de catálogo). `NEXT_PUBLIC_ENV` e imports de `tests/` no aparecen en el paquete.
- [ ] `languageModelConfigurations` y `providers` del chatbot pasan a ser reexports finos sobre la instancia raíz (expand); ninguna feature cambia de import en este ticket.
- [ ] Unit del paquete: configuración por id para varios modelos representativos (parámetros, providerOptions, merge de overrides), y memoización (una única construcción por id). Contrato del paquete: cabeceras y user-agent de OpenCode Go y retry de 5xx contra un fetcher enlatado; el paquete y su índice se importan desde un proceso tsx sin Next.
- [ ] `pnpm verify:fast` y `pnpm test:e2e` en verde; `pnpm build:verify` compila. Arranque comprobado con `pnpm dev` (nunca pm2 ni `build`).

## Comments
