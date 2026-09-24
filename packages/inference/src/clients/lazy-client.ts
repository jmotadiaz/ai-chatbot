import type { LanguageModelV3 } from "@ai-sdk/provider";

/**
 * Wraps an SDK provider factory (e.g. `createOpenAI`) so it is called at most
 * once, on first use, instead of at kit-construction time — the lazy
 * singleton every `buildXClient()` in this directory repeated on its own: a
 * nullable module-scope variable, a getter that builds it once, and a
 * `(modelId) => client(modelId)` closure. `create` receives no arguments and
 * must return something callable with a model id (the provider object the
 * SDK's `createX(...)` factory returns).
 */
export function buildLazyLanguageModelClient<
  TClient extends (modelId: string) => LanguageModelV3,
>(create: () => TClient): (modelId: string) => LanguageModelV3 {
  let client: TClient | undefined;

  return (modelId: string): LanguageModelV3 => {
    if (!client) {
      client = create();
    }
    return client(modelId);
  };
}
