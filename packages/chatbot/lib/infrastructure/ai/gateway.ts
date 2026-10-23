import "server-only";

import { config } from "config";

/**
 * Base URL of the Model Gateway (ADR 0010) for LiteLLM's native routes:
 `${config.modelGatewayUrl()}/v1` — e.g. `http://127.0.0.1:4000/v1` in
 * dev/prod and `http://127.0.0.1:4001/v1` (Mock Model Gateway) in test. The
 * Environment↔port guardrail lives in `packages/config` (`modelGatewayUrl`).
 */
export const gatewayBaseUrl = (): string => `${config.modelGatewayUrl()}/v1`;

/**
 * Gateway authentication headers. Every route (`/v1/models/catalog`,
 * `/v1/rerank`, `/v1/systemone` (System One format of the Decisions API), `/v1/embeddings`, …) requires
 * `Authorization: Bearer <MODEL_GATEWAY_API_KEY>`.
 */
export const gatewayHeaders = (): Record<string, string> => ({
  Authorization: `Bearer ${config.modelGatewayApiKey() ?? ""}`,
});
