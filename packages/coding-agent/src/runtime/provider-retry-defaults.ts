import type { SettingsManager } from "@earendil-works/pi-coding-agent";

/**
 * Pi deja los reintentos a nivel de provider sin configurar (0): solo
 * reintenta el turno completo cuando el error es reintentable
 * (`retry.maxRetries`, 3 por defecto). Para 5xx transitorios — OpenCode Go
 * responde 503 "Endpoint is unavailable" en ráfagas, sobre todo en los
 * modelos stealth gratis — un reintento dentro del propio request es mucho
 * más barato que re-ejecutar el turno (sin re-prompt ni eventos de
 * auto-retry), así que el worker fija un presupuesto por defecto. El
 * presupuesto del turno se suma por encima: 1+3 intentos de provider por
 * cada 1+3 intentos de sesión.
 */
export const DEFAULT_PROVIDER_MAX_RETRIES = 3;

/**
 * Aplica el presupuesto de reintentos de provider solo si el operador no ha
 * configurado uno (`retry.provider.maxRetries` en settings.json). Un valor
 * explícito, incluido 0 para desactivarlos, se respeta tal cual.
 */
export function applyProviderRetryDefaults(
  settingsManager: SettingsManager,
): void {
  if (settingsManager.getProviderRetrySettings().maxRetries !== undefined) {
    return;
  }
  settingsManager.applyOverrides({
    retry: { provider: { maxRetries: DEFAULT_PROVIDER_MAX_RETRIES } },
  });
}
