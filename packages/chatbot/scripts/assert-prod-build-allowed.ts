#!/usr/bin/env tsx
import { config } from "config";

/**
 * Gate de `build:prod` (ticket 06).
 *
 * `build:prod` escribe al `.next` que serve Producción bajo pm2; un disparo
 * distraído del agente rompería la ejecución en curso. Por eso exige un
 * opt-in explícito del operador/CI: `ALLOW_PROD_BUILD=1` en el ambiente
 * (lo aporta la vía canónica `preview` o el pipeline de CI, nunca un .env).
 *
 * La verificación de compilación del agente NO pasa por aquí: usa
 * `build:prod:verify`, que escribe a `.next/verify` y no toca prod.
 *
 * Salida a stderr → exit 1 sin opt-in; silenciosa → exit 0 con él.
 */
if (!config.allowProdBuild()) {
  console.error(
    [
      "build está bloqueado: escribe el .next que sirve prod bajo pm2.",
      "Si eres el operador/CI: reejecuta con ALLOW_PROD_BUILD=1 (la vía canónica",
      "`pnpm preview` ya lo incorpora).",
      "Si eres el agente verificando compilación: usa `pnpm --filter chatbot build:verify`",
      "(compila a .next/verify, aislado). Está prohibido build — ver AGENTS.md.",
    ].join("\n"),
  );
  process.exit(1);
}
