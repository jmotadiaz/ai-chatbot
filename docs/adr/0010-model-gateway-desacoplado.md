---
status: accepted
---

# Model Gateway desacoplado, catálogo en runtime y retirada de `packages/models` y `packages/inference`

Reemplaza a [ADR 0008](./0008-inference-kit-fachada-sobre-ai-sdk.md).

## Decisión

Extraemos toda la gestión de proveedores de IA, sus credenciales de terceros y la definición del **Model Catalog** a un servicio autónomo de la máquina (**Model Gateway**, implementado inicialmente en `packages/model-gateway` sin dependencias del monorepo para su posterior extracción a repositorio propio, desplegado como unidad de sistema `systemd`).

1. **LiteLLM Proxy stateless + wrapper FastAPI (`packages/model-gateway`)**:
   - Ejecuta LiteLLM Proxy sin base de datos (`config.yaml` como única fuente de verdad).
   - Aprovecha el soporte nativo de LiteLLM (`>= v1.104.2`) para todas las operaciones del sistema, incluyendo `/v1/chat/completions`, `/v1/embeddings`, `/v1/rerank`, `/v1/audio/speech` y la Decisions API nativa (`/v1/decisions` y `/v1/systemone`).
   - Un micro-entrypoint FastAPI (`server.py`) envuelve la app de LiteLLM únicamente para exponer el endpoint del **Model Catalog** (`GET /v1/models/catalog`) filtrando **en el servidor** los modelos `user_invocable: true` y devolviendo su esquema limpio de metadatos (`id`, `company`, `contextWindow`, `maxTokens`, `cost`, `reasoning`, `thinkingLevels`, `defaultThinkingLevel`, `supportedFiles`, `supportedOutput`, `zeroDataRetention`, `temperature`, `topP`, `topK`, `isDefault`).
   - Expone todos los modelos de lenguaje bajo un único dialecto (`openai-completions`) hacia los consumidores (`chatbot`, `coding-agent` y el resto de aplicaciones de la máquina).

2. **Custodia de API keys de terceros con `systemd-creds` en el Gateway, variables estándar en las apps**:
   - Todas las API keys de proveedores externos desaparecen de `.env.dev`, `.env.prod`, `~/.pi/agent/auth.json` y del resto de proyectos del host; se almacenan exclusivamente cifradas con `systemd-creds encrypt` (`/etc/model-gateway/creds/*.cred`) mediante un asistente interactivo que recorre todos los secretos requeridos uno a uno, y se inyectan vía `LoadCredentialEncrypted=` en `model-gateway.service`, que corre con `DynamicUser=yes` (UID transitorio por arranque) y `ProtectHome=yes` sobre un artefacto en `/opt/model-gateway`: ni siquiera otro proceso del mismo usuario del operador puede leer `$CREDENTIALS_DIRECTORY`.
   - En `ai-chatbot` (`packages/config`), las variables de entorno propias (`POSTGRES_URL`, `AUTH_SECRET`, `MODEL_GATEWAY_URL`, `MODEL_GATEWAY_API_KEY`, etc.) se mantienen como variables de entorno estándar en `.env.{dev,prod,test}` (no requieren `systemd-creds`).

3. **Consumo dual de modelos y fin del tipado estático (`packages/models` eliminado)**:
   - Los identificadores de modelo dejan de ser uniones literales de TypeScript (`InvocableModelId` desaparece; `modelId` pasa a `string`).
   - **Modelos de usuario (en runtime)**: `chatbot` consulta el endpoint de catálogo del Gateway en el servidor (con caché en memoria) e hidrata a los componentes `"use client"` mediante un `<ModelCatalogProvider>` en el layout de `(chat)`. `coding-agent` consulta ese mismo endpoint al arrancar su worker y escribe el `models.json` de su Entorno con un único proveedor (`model-gateway`).
   - **Usos internos hardcoded (`Default Model Contracts`)**: las features internas invocan directamente nombres de contrato estables garantizados por el Gateway (`fast-default`, `flash-default`, `vision-default`, `reasoning-default`, `free-default`, `image-default`, `embedding-default`, `rerank-default`, `decision-default`, `tts-default`).

4. **Eliminación de `packages/inference` y `Mock Model Gateway` por entorno**:
   - Al absorber el Gateway los 12 clientes de proveedores y desaparecer `packages/models`, `packages/inference` quedaría reducido a un módulo *pass-through* consumido solo por `chatbot`. Se elimina el paquete y la capa delgada de cliente AI SDK + llamadas al Gateway (~250 líneas) pasa a vivir en `packages/chatbot/lib/infrastructure/ai/`.
   - En el Entorno de Test (`.env.test`), en lugar de ramificar el código de producción con `isTestMode()` para inyectar mocks en memoria, `MODEL_GATEWAY_URL` apunta a un **Mock Model Gateway** HTTP local (`:4001`) que vive en la suite de tests de `ai-chatbot`. Este servidor mock publica directamente el catálogo de capacidades que necesitan los tests (`basicChat`, `basicChatAlt`, `canExecuteTools`, `canSeeImages`, `canProduceReasoning`, `alwaysRefuses`, `failsMidStream`) y responde de forma determinista.

## Considered Options

- **Bifrost (Go) o Portkey Gateway (Node.js) frente a LiteLLM Proxy**: descartados porque LiteLLM en modo stateless (`config.yaml`) es el único que cubre nativamente `/v1/chat/completions`, `/v1/embeddings`, `/v1/rerank`, `/v1/audio/speech`, traducción cruzada de `reasoning_effort`/`thinking` y metadatos arbitrarios en `model_info`.
- **Filtrar `user_invocable` en el consumidor contra `GET /v1/model/info` crudo**: descartado porque acopla a cada aplicación consumidora a los modelos internos del Gateway y a la estructura interna de LiteLLM.
- **Mantener `packages/models` y `packages/inference` adelgazados**: descartado por dejar paquetes superficiales (*shallow modules*) con un único consumidor real (`chatbot`) y nombres confusos una vez que el catálogo y los proveedores viven en el servicio Gateway.
- **Poner el servidor Mock dentro de `packages/model-gateway`**: descartado porque el catálogo de capacidades de test pertenece a las pruebas de `ai-chatbot`, no al servicio de infraestructura compartido de la máquina.

## Consequences

- `packages/models` y `packages/inference` se eliminan del workspace; se añade `packages/model-gateway` (con cero dependencias del workspace para permitir su futura extracción directa con `mv` + `git init`).
- `packages/config` elimina las 10 API keys de proveedores externos y añade `MODEL_GATEWAY_URL` y `MODEL_GATEWAY_API_KEY`, junto a un guardarraíl en `guardrails.ts` que asegura que `NEXT_PUBLIC_ENV=test` apunte exclusivamente al puerto del Mock Model Gateway (`:4001`).
- Desaparecen `isTestMode()` de `packages/chatbot/lib/infrastructure/ai/`, el mapa indirecto `CAPABILITY_ALIASES` sobre modelos comerciales y el script de compilación estática `packages/coding-agent/scripts/generate-models.ts`.
