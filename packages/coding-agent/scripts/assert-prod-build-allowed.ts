#!/usr/bin/env tsx
import { config } from "config";

/**
 * Gate de `build:prod` del worker (ticket 07; mismo contrato que el gate del
 * chatbot). `build:prod` escribe el `dist/` de prod y regenera
 * `.pi-prod/models.json` (insumo del próximo arranque), así que exige el
 * opt-in explícito del operador/CI: ALLOW_PROD_BUILD=1. La verificación del
 * agente usa `build:prod:verify` (dist/verify + .pi-verify), que no lo requiere.
 */
if (!config.allowProdBuild()) {
  console.error(
    [
      "build del worker está bloqueado: escribe dist/ y .pi-prod/models.json de Producción.",
      "Si eres el operador/CI: reejecuta con ALLOW_PROD_BUILD=1 (`pnpm build` de raíz lo hace explícito).",
      "Si eres el agente verificando compilación: usa `pnpm --filter coding-agent build:verify`",
      "(escribe a dist/verify + .pi-verify/models.json, aislado). Está prohibido build — ver AGENTS.md.",
    ].join("\n"),
  );
  process.exit(1);
}
