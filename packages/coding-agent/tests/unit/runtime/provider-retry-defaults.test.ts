import { describe, expect, it } from "vitest";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import {
  applyProviderRetryDefaults,
  DEFAULT_PROVIDER_MAX_RETRIES,
} from "../../../src/runtime/provider-retry-defaults";

describe("applyProviderRetryDefaults", () => {
  it("sets Pi's provider retry budget when settings don't configure one", () => {
    const settingsManager = SettingsManager.inMemory();

    applyProviderRetryDefaults(settingsManager);

    expect(settingsManager.getProviderRetrySettings().maxRetries).toBe(
      DEFAULT_PROVIDER_MAX_RETRIES,
    );
  });

  it("respects an explicit operator value, including 0 to disable retries", () => {
    const settingsManager = SettingsManager.inMemory({
      retry: { provider: { maxRetries: 0 } },
    });

    applyProviderRetryDefaults(settingsManager);

    expect(settingsManager.getProviderRetrySettings().maxRetries).toBe(0);
  });
});
