import "server-only";

import { config } from "config";

/**
 * URL base del Model Gateway (ADR 0010) para las rutas nativas de LiteLLM:
 `${config.modelGatewayUrl()}/v1` — p. ej. `http://127.0.0.1:4000/v1` en
 * dev/prod y `http://127.0.0.1:4001/v1` (Mock Model Gateway) en test. El
 * guardarraíl Entorno↔puerto vive en `packages/config` (`modelGatewayUrl`).
 */
export const gatewayBaseUrl = (): string => `${config.modelGatewayUrl()}/v1`;

/**
 * Cabeceras de autenticación del Gateway. Toda ruta (`/v1/models/catalog`,
 * `/v1/rerank`, `/v1/decisions`, `/v1/embeddings`, …) exige
 * `Authorization: Bearer <MODEL_GATEWAY_API_KEY>`.
 */
export const gatewayHeaders = (): Record<string, string> => ({
  Authorization: `Bearer ${config.modelGatewayApiKey() ?? ""}`,
});
