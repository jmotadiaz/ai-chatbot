import { createGateway } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { config } from "config";

/**
 * Built explicitly with `createGateway` instead of importing the `gateway`
 * singleton from `"ai"`, so `AI_GATEWAY_API_KEY` is read once, centrally, via
 * `config` rather than by the SDK's own implicit `process.env` fallback.
 */
export function buildGatewayClient(): (modelId: string) => LanguageModelV3 {
  let _gateway: ReturnType<typeof createGateway> | null = null;
  const get = () => {
    if (!_gateway) {
      _gateway = createGateway({ apiKey: config.gatewayApiKey() });
    }
    return _gateway;
  };
  return (modelId) => get()(modelId);
}
