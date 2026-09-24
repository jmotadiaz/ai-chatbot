import { OpenRouter } from "@openrouter/sdk";
import { config } from "config";
import type { DecisionsClient, DecisionsClients } from "../types";

/**
 * Shares the API key with the OpenRouter language-model provider
 * (`clients/openrouter.ts`) — same account, same key, a different endpoint
 * (`alpha.decisions`, not chat completions). Lazy singleton; the key is
 * re-read inside the async `apiKey` thunk on every call, so a missing key
 * surfaces as a decision failure, not a module-load crash.
 */
export function buildOpenRouterDecisionsClient(): () => DecisionsClient {
  let _client: OpenRouter | null = null;
  const get = (): DecisionsClient => {
    if (!_client) {
      _client = new OpenRouter({
        apiKey: async () => {
          const apiKey = config.openRouterApiKey();
          if (!apiKey) {
            throw new Error(
              "OPENROUTER_API_KEY is not configured; cannot execute a decision",
            );
          }
          return apiKey;
        },
      });
    }
    return _client;
  };
  return get;
}

/**
 * The real `Record<DecisionProviderKind, …>` registry: one lazy, memoized
 * client per decision endpoint kind. Nothing here reads `config` or
 * constructs the SDK client until the returned getter is first called.
 */
export function buildDefaultDecisionsClients(): DecisionsClients {
  return {
    openrouterDecisions: buildOpenRouterDecisionsClient(),
  };
}
