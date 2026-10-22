# Spec: Hot reload del Model Catalog en el coding-agent

**Status:** ready-for-agent

## Problem Statement

Cuando se modifica el Model Gateway (alta de un modelo en `config.yaml`), el chatbot lo
refleja en su Model Picker en ≤60 s (TTL de `packages/chatbot/lib/infrastructure/ai/catalog.ts`),
pero el Model Picker de los chats de código no lo muestra hasta reiniciar la aplicación.

Causa: el picker de código es la **intersección** de `getAvailableModels` del worker y del
Model Catalog del chatbot (`packages/chatbot/lib/features/code/actions.ts:229-245`). El worker
materializa `models.json` y crea su `ModelRuntime` **una sola vez por proceso**
(`packages/coding-agent/src/runtime/model-runtime.ts:28-50`, `runtimePromise ??= …`), y la
decoración de thinking levels (`getSyncedGatewayCatalog()`) también se sincroniza una vez. Un
modelo nuevo nunca entra en la intersección; uno eliminado sí desaparece (basta con que falte
en el chatbot).

Además, si llega un `modelId` que el worker no conoce, hoy cae **en silencio**: al crear sesión
Pi usa su default (`runtime/runtime-factory.ts:79-86`) y al iniciar turno mantiene el modelo
anterior (`session/turn-runner.ts:548-557`), solo con un log `session.model_not_in_registry`.

## Solution

Refrescar el Model Catalog del worker en cada `getAvailableModels` (llamada solo en el SSR de la
página de chat de código, en paralelo con `loadCodingAgentBootstrap`), y convertir la caída
silenciosa por modelo desconocido en un error explícito.

## Decisiones (sesión de grilling 2026-10-22)

1. **Turno activo**: sin cambios. Si su modelo desaparece del Gateway, el error lo produce el
   propio Gateway. `ModelRuntime.refresh()` no muta las sesiones vivas (mantienen su referencia
   `Model`; cada turno re-resuelve por id).
2. **Disparador del refresco**: cada llamada a `getAvailableModels`, **sin TTL**, con
   deduplicación in-flight (llamadas concurrentes comparten el mismo refresco). Coste medido
   ≈20 ms (GET Gateway ~1.6 ms, escritura `models.json` <0.5 ms, `refresh({ allowNetwork:false })`
   ~18 ms, sin red externa), oculto por el `Promise.all` del SSR.
3. **Fuente del picker**: se mantiene la intersección worker ∩ catálogo del chatbot. Sin cambios
   en el frontal, sin reintentos.
4. **Gateway caído durante un refresco**: se conserva el último catálogo bueno (`models.json` +
   `ModelRuntime` actuales) y se registra un warning; `getAvailableModels` responde con él. El
   comportamiento de la carga inicial (lazy, con reintento si falla) no cambia.
5. **Modelo persistido obsoleto** (`coding_agent_sessions.model_id` ya no existe): se deja como
   está; el error aparece al enviar (decisión Q8-b).
6. **Modelo desconocido al crear sesión o iniciar turno**: error explícito (error RPC en
   `initializeSession` / `RUN_ERROR` en el turno) con mensaje claro que incluye el `modelId`.
   Sin código tipado ni auto-refresco en el cliente; el banner de error existente lo muestra.
7. **Documentación**: actualizar el párrafo de ADR 0010 que dice que el coding-agent escribe
   `models.json` "al arrancar", y `packages/coding-agent/AGENTS.md`. Sin ADR nuevo; `CONTEXT.md`
   sin cambios (usar "Model Catalog", no "model registry").

## Out of scope

- Unificar el picker de código con `<ModelCatalogProvider>` (alternativa B, descartada).
- Invalidación bajo demanda de la caché de 60 s del chatbot.
- Fallback del picker al modelo por defecto para ids persistidos obsoletos.
- Latencia de `loadSessionFromDisk` → `.scratch/coding-agent-session-lookup/`.
