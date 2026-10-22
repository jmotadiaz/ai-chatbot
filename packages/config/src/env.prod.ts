import { configProd } from "./config.prod";
import { createConfigFacade } from "./facade";
import { validateAppConfig } from "./guardrails";
import { secretsProd } from "./secrets.prod";
import type { AppConfig } from "./types";

/**
 * Bundle estático de PRODUCCIÓN: `config.prod` + `secrets.prod`, validado por
 * los guardarraíles de coherencia y congelado.
 *
 * Es el módulo al que el bundler de Next.js redirige el import `"config"`
 * cuando el Entorno activo es prod (`next.config.ts` → `resolveAlias`), y el
 * que `config.ts` selecciona para el worker y los scripts CLI con
 * `--env=prod`.
 */
export const envProd: AppConfig = Object.freeze(
  validateAppConfig({ ...configProd, ...secretsProd }),
);

// El alias `"config"` del bundler (Next.js) y de los runners de test
// resuelve este módulo: debe exportar la MISMA fachada `config` que el
// selector para que los puntos de llamada no cambien (ADR 0011 §4.2).
export const config = createConfigFacade(() => envProd);
