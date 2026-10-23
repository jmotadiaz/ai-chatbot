# 02: Inyección de Dependencias (DI) en `packages/coding-agent` y erradicación de mutaciones de `process.env` en tests

**What to build:** Desacoplar `ModelRuntime`, `syncGatewayModelsFile`, `ensureGatewayAuthJson`, `SessionRegistry` y las herramientas del Coding Agent Worker de cualquier estado global en tests mediante inyección explícita de configuración (`GatewayRuntimeConfig` / `WorkerConfig`) y un helper canónico `createTestWorkerContext()`.

**Blocked by:** 01

**Status:** resolved

- [x] `ModelRuntime.create()`, `syncGatewayModelsFile()` y `ensureGatewayAuthJson()` reciben explícitamente `authJsonPath`, `modelsJsonPath`, `gatewayUrl` y `apiKey` en sus opciones, sin leer `process.env` y usando `config` únicamente como default cuando se invocan desde el composition root del worker.
- [x] Se crea `packages/coding-agent/tests/helpers/test-context.ts` con `createTestWorkerContext(overrides?)`, que aprovisiona un directorio temporal aislado con `mkdtempSync` para `sessionDir`, `modelsJsonPath`, `authJsonPath`, `agentDir`, `piPackagesDir`, `artifactsDir` y `traceDir`.
- [x] Se refactorizan todos los tests de `packages/coding-agent/tests/**` (`model-unknown-fail-fast.test.ts`, `gateway-models-sync.test.ts`, `paths.test.ts`, `publish-artifact.test.ts`, `session-registry.test.ts`) para usar DI e inyectar rutas del sandbox temporal, eliminando toda asignación a `process.env.CODING_AGENT_*` y `process.env.MODEL_GATEWAY_*`.
- [x] Se añade un test de contrato en `packages/coding-agent/tests/contract/` que verifica que ningún fichero bajo `packages/coding-agent/tests/` muta `process.env` y que `ModelRuntime.create()` en un test jamás toca `.pi-prod/` ni `.pi-dev/`.

## Comments
