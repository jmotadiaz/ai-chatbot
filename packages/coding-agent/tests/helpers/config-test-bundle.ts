/**
 * Punto de enlace `"config"` de los tests del Coding Agent Worker
 * (`vitest.config.ts` → `resolve.alias`).
 *
 * Ticket 01 enlazaba directamente `config` → `packages/config/src/env.test.ts`,
 * pero ese bundle estático solo exporta `envTest` y la fachada `config`: los
 * consumidores que importan además valores del contrato (`GATEWAY_THINKING_LEVELS`)
 * o helpers (`optional`, `initConfig`, `setBuildFlags`) recibían `undefined`
 * y la suite reventaba (`THINKING_LEVELS is not iterable`,
 * `optional is not a function`).
 *
 * Este shim preserva las dos mitades del contrato bajo un único specifier:
 * - `config` (la fachada) sale del bundle estático `env.test.ts` — un test no
 *   puede observar secretos ni rutas de dev/prod aunque el selector esté
 *   olvidado (ADR 0011 §3.5);
 * - todo lo demás (contrato del Gateway, guardarraíles, `initConfig`, paths
 *   del paquete) sale de la entrada pública `index.ts`, que en este proceso
 *   resuelve igualmente al Entorno de Test (`initConfig("test")` en el
 *   `vitest.config.ts`).
 *
 * No contiene lógica: solo re-exporta. Fuera de vitest (worker, scripts) el
 * specifier `"config"` resuelve a `packages/config/src/index.ts` sin alias.
 */
export * from "../../../config/src/index";
export { config } from "../../../config/src/env.test";
