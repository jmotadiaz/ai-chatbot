#!/usr/bin/env tsx
import {
  getBuildFlags,
  parseBuildFlagsFromArgv,
  setBuildFlags,
} from "config";

/**
 * Gate de `build:prod` (ticket 06; selector migrado a argv en ADR 0011,
 * ticket 03).
 *
 * `build` escribe al `.next` que serve Producción bajo pm2; un disparo
 * distraído del agente rompería la ejecución en curso. Por eso exige un
 * opt-in explícito del operador/CI:
 *
 *   - `--allow-prod-build` en process.argv — la vía canónica (ADR 0011); la
 *     usan los scripts `build` de package.json (ticket 04) y este launcher.
 *   - `ALLOW_PROD_BUILD=1` en el ambiente — aceptado TRANSITORIAMENTE para no
 *     romper los scripts actuales del package.json (que aún lo inyectan) hasta
 *     que el ticket 04 los migre a `--allow-prod-build`. Es el único
 *     process.env que queda en el gate y no selecciona Entorno alguno.
 *
 * La verificación de compilación del agente NO pasa por aquí: usa `--verify`
 * (next-cli → `.next/verify`, aislado). Está prohibido `build` — ver AGENTS.md.
 *
 * Salida a stderr → exit 1 sin opt-in; silenciosa → exit 0 con él.
 */
const fromArgv = parseBuildFlagsFromArgv(process.argv);
setBuildFlags({
  allowProdBuild: fromArgv.allowProdBuild || process.env.ALLOW_PROD_BUILD === "1",
});

if (!getBuildFlags().allowProdBuild) {
  console.error(
    [
      "build está bloqueado: escribe el .next que sirve prod bajo pm2.",
      "Si eres el operador/CI: reejecuta con --allow-prod-build (o con",
      "ALLOW_PROD_BUILD=1 mientras los scripts migran en el ticket 04; la vía",
      "canónica `pnpm preview` ya lo incorpora).",
      "Si eres el agente verificando compilación: usa `pnpm --filter chatbot build:verify`",
      "(compila a .next/verify, aislado). Está prohibido build — ver AGENTS.md.",
    ].join("\n"),
  );
  process.exit(1);
}
