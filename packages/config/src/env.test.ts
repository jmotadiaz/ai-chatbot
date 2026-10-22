import { configTest } from "./config.test";
import { createConfigFacade } from "./facade";
import { validateAppConfig } from "./guardrails";
import { secretsTest } from "./secrets.test";
import type { AppConfig } from "./types";

/**
 * Bundle estático de TEST: `config.test` + `secrets.test`, validado por los
 * guardarraíles de coherencia y congelado.
 *
 * Es el módulo al que el bundler de Next.js redirige el import `"config"`
 * cuando el Entorno activo es test (`next.config.ts` → `resolveAlias`), al que
 * apuntan los `resolve.alias` de `vitest.config.ts` (chatbot y coding-agent) y
 * el que `config.ts` selecciona para los scripts CLI con `--env=test`.
 */
export const envTest: AppConfig = Object.freeze(
  validateAppConfig({ ...configTest, ...secretsTest }),
);

// El alias `"config"` del bundler (Next.js) y de los runners de test
// resuelve este módulo: debe exportar la MISMA fachada `config` que el
// selector para que los puntos de llamada no cambien (ADR 0011 §4.2).
export const config = createConfigFacade(() => envTest);
