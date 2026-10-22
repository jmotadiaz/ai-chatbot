# 01: Refresco del Model Catalog en `getAvailableModels` + error por modelo desconocido

**What to build:** Ver `../spec.md`. El worker re-sincroniza el Model Catalog del Gateway en
cada `getAvailableModels` y deja de caer en silencio ante un `modelId` desconocido.

**Blocked by:** None (can start immediately).

**Status:** done

- [ ] `gateway-catalog.ts` / `model-runtime.ts`: función de refresco que hace
  `GET /v1/models/catalog`, reescribe `models.json`, actualiza el catálogo sincronizado
  (`getSyncedGatewayCatalog`) y llama a `ModelRuntime.refresh({ allowNetwork: false })` sobre el
  runtime singleton existente (no recrearlo). Deduplicación in-flight.
- [ ] Si el Gateway falla en el refresco: se mantiene el último catálogo bueno, warning en log,
  sin propagar el error a `getAvailableModels`. Si no hay catálogo previo, se conserva el
  comportamiento actual de la carga inicial.
- [ ] `session-manager.ts` `getAvailableModels()` invoca el refresco antes de `getAvailable()`.
- [ ] `runtime-factory.ts:79-86`: `modelId` desconocido al crear sesión → error RPC con mensaje
  que incluye el `modelId` (sin fallback al default de Pi).
- [ ] `turn-runner.ts:548-557`: `modelId` desconocido al iniciar turno → `RUN_ERROR` con mensaje
  claro (sin mantener silenciosamente el modelo anterior).
- [ ] Tests (TDD) en `packages/coding-agent/tests/{unit,integration}`: alta de modelo visible
  tras refresco sin reiniciar; Gateway caído conserva catálogo; concurrencia comparte un único
  fetch; modelo desconocido produce error en creación y en turno. Usar el Mock Model Gateway.
- [ ] Docs: ADR 0010 (párrafo "escribe `models.json` al arrancar") y
  `packages/coding-agent/AGENTS.md`.
- [ ] Verificación: `pnpm --filter coding-agent type:check`, lint, suites de test y
  `pnpm --filter coding-agent build:verify`. **Nunca `build` ni tocar pm2.**

## Comments
