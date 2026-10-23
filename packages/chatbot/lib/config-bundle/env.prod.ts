/**
 * Shim de compilación del Entorno PROD (ADR 0011, ticket 03).
 *
 * `next.config.ts` aliasa el import `"config"` a ESTE módulo (y
 * `vitest.config.ts` a `env.test.ts`) en lugar de a
 * `packages/config/src/env.prod.ts` directamente. El bundle `env.<env>.ts`
 * solo exporta `envProd` + la fachada `config`, pero el código del chatbot
 * importa de `"config"` también `optional`, `EMBEDDING_DIMENSIONS` y
 * `GATEWAY_THINKING_LEVELS` (y los runners, `initConfig` / `envBundlePath` /
 * `setBuildFlags`): apuntar el alias al bundle solo habría dejado esos
 * símbolos `undefined` en el bundle compilado (y en los workers que Next
 * biforca), rompiendo la app en runtime.
 *
 * Aquí se re-exporta la superficie COMPLETA del paquete y se fija la fachada
 * `config` al bundle del Entorno: la exportación EXPLÍCITA `config` prevalece
 * sobre la `config` del `export *` (semántica ES de LocalExport > StarExport),
 * de modo que:
 *
 * - el proceso que evalúa `next.config.ts` (el launcher `scripts/next-cli.ts`,
 *   que ya llamó a `initConfig(env)`) y los workers hijos que Next biforca en
 *   `build`/`dev` resuelven SIEMPRE el bundle estático del Entorno, sin leer
 *   `process.env` ni `process.argv` (que el kernel Linux no propaga en
 *   `fork()`/`execve()` — la fuga del incidente de ADR 0011);
 * - `config.xxx()` en cliente y servidor queda soldada al Entorno: mismo
 *   objeto congelado que el selector elegiría para `--env=prod`.
 *
 * No tocar `packages/config` (paquete cerrado por el ticket): este shim vive
 * en el chatbot y solo existe para el alias de compilación.
 */
/* eslint-disable import-x/export --
  `export * from "config/src/index"` + re-export explícito de `config` desde el
  bundle: la semántica ES (LocalExport > StarExport) y TypeScript hacen prevaler
  la exportación explícita (type:check y el contrato next-config-env-alias lo
  verifican); import-x/export no modela esa precedencia y ve un duplicado. */
export * from "../../../config/src/index";
export { config } from "../../../config/src/env.prod";
