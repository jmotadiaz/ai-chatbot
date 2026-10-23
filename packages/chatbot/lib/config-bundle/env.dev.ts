/**
 * Shim de compilación del Entorno DEV (ADR 0011, ticket 03).
 *
 * Ver la documentación completa en `env.prod.ts`: `next.config.ts` aliasa
 * `"config"` a `lib/config-bundle/env.<entorno>.ts` (Turbopack y Webpack) y
 * `vitest.config.ts` al mismo shim de test. La superficie completa del paquete
 * se re-exporta porque el bundle `env.<env>.ts` solo exporta `envDev` + la
 * fachada `config`, y el código del chatbot importa además `optional`,
 * `EMBEDDING_DIMENSIONS`, `GATEWAY_THINKING_LEVELS`, `initConfig`, etc.
 * La exportación explícita `config` (la fachada estática del Entorno)
 * prevalece sobre la `config` del `export *`.
 */
/* eslint-disable import-x/export --
  `export * from "config/src/index"` + re-export explícito de `config` desde el
  bundle: la semántica ES (LocalExport > StarExport) y TypeScript hacen prevaler
  la exportación explícita (type:check y el contrato next-config-env-alias lo
  verifican); import-x/export no modela esa precedencia y ve un duplicado. */
export * from "../../../config/src/index";
export { config } from "../../../config/src/env.dev";
