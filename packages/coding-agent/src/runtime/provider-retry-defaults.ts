import type { SettingsManager } from "@earendil-works/pi-coding-agent";

/**
 * Pi leaves provider-level retries unconfigured (0): it only retries the
 * whole turn when the error is retryable (`retry.maxRetries`, 3 by default).
 * For transient 5xx — OpenCode Go answers 503 "Endpoint is unavailable" in
 * bursts, especially on free stealth models — a retry inside the request
 * itself is much cheaper than re-running the turn (no re-prompt, no
 * auto-retry events), so the worker sets a default budget. The turn budget
 * stacks on top: 1+3 provider attempts per 1+3 session attempts.
 */
export const DEFAULT_PROVIDER_MAX_RETRIES = 3;

/**
 * Applies the provider retry budget only if the operator has not configured
 * one (`retry.provider.maxRetries` in settings.json). An explicit value,
 * including 0 to disable them, is respected as is.
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
