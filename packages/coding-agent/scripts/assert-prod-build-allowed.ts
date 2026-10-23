#!/usr/bin/env tsx
import { config, parseBuildFlagsFromArgv, setBuildFlags } from "config";

/**
 * Gate de `build:prod` del worker (ticket 07; mismo contrato que el gate del
 * chatbot). `build:prod` escribe el `dist/` de prod y regenera
 * `.pi-prod/models.json` (insumo del próximo arranque), así que exige el
 * opt-in explícito del operador/CI. La verificación del agente usa
 * `build:verify` (dist/verify + .pi-verify, aislado), que no lo requiere.
 *
 * Opt-in según ADR 0011: flag `--allow-prod-build` en `process.argv` (lo que
 * el selector `config.ts` parsea en `initConfig`). El gate no necesita ningún
 * Entorno, así que fija solo los flags de compilación en vez de inicializar un
 * bundle. Se acepta además `ALLOW_PROD_BUILD=1` en el proceso mientras los
 * `package.json` vigentes (ticket 04) sigan aportando ese opt-in por shell.
 */
setBuildFlags(parseBuildFlagsFromArgv());

const allowProdBuild =
  config.allowProdBuild() || process.env.ALLOW_PROD_BUILD === "1";

if (!allowProdBuild) {
  console.error(
    [
      "build del worker está bloqueado: escribe dist/ y .pi-prod/models.json de Producción.",
      "Si eres el operador/CI: reejecuta con `--allow-prod-build` en argv (o ALLOW_PROD_BUILD=1,",
      "que es lo que hoy aporta `pnpm preview`).",
      "Si eres el agente verificando compilación: usa `pnpm --filter coding-agent build:verify`",
      "(escribe a dist/verify + .pi-verify/models.json, aislado). Está prohibido build — ver AGENTS.md.",
    ].join("\n"),
  );
  process.exit(1);
}
