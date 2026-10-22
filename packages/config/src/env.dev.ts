import { configDev } from "./config.dev";
import { createConfigFacade } from "./facade";
import { validateAppConfig } from "./guardrails";
import { secretsDev } from "./secrets.dev";
import type { AppConfig } from "./types";

/**
 * Bundle estático de DESARROLLO: `config.dev` + `secrets.dev`, validado por
 * los guardarraíles de coherencia y congelado.
 *
 * Es el módulo al que el bundler de Next.js redirige el import `"config"`
 * cuando el Entorno activo es dev (`next.config.ts` → `resolveAlias`), y el
 * que `config.ts` selecciona para el worker y los scripts CLI con
 * `--env=dev`.
 */
export const envDev: AppConfig = Object.freeze(
  validateAppConfig({ ...configDev, ...secretsDev }),
);

// El alias `"config"` del bundler (Next.js) y de los runners de test
// resuelve este módulo: debe exportar la MISMA fachada `config` que el
// selector para que los puntos de llamada no cambien (ADR 0011 §4.2).
export const config = createConfigFacade(() => envDev);
