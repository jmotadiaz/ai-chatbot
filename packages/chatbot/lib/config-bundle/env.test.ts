/**
 * Shim de compilación del Entorno TEST (ADR 0011, ticket 03).
 *
 * Es el módulo al que apunta el alias `"config"` de `vitest.config.ts` (y de
 * `next.config.ts` cuando el Entorno activo es test, p. ej. el `webServer` de
 * Playwright). Ver la documentación completa en `env.prod.ts`: re-exporta la
 * superficie COMPLETA del paquete `config` (el bundle `env.test.ts` solo
 * exporta `envTest` + fachada) y fija `config` al bundle congelado de test,
 * de modo que los workers de Vitest y los hijos de Next resuelven siempre
 * `:5434/test` y el Mock Model Gateway `:4001` sin selector ni `process.env`.
 */
/* eslint-disable import-x/export --
  `export * from "config/src/index"` + re-export explícito de `config` desde el
  bundle: la semántica ES (LocalExport > StarExport) y TypeScript hacen prevaler
  la exportación explícita (type:check y el contrato next-config-env-alias lo
  verifican); import-x/export no modela esa precedencia y ve un duplicado. */
export * from "../../../config/src/index";
export { config } from "../../../config/src/env.test";
