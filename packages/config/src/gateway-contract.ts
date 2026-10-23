/**
 * Shared contract of the Model Gateway catalog (ADR 0010): PURE and isomorphic
 * types, reading no environment variables and importing nothing from Node — they
 * are consumed from server code (`inference-kit`, coding-agent worker), from the
 * client (`<ModelCatalogProvider>`) and from the tests (Mock Model Gateway).
 *
 * It is the only copy on the TypeScript side; the Python side lives in
 * `packages/model-gateway/catalog.py`. The schema is documented and
 * versioned in `packages/model-gateway/CONTRACT.md` (mirror of spec
 * §2.2).
 */

/** Reasoning levels; the catalog declares the supported subset. */
export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export const GATEWAY_THINKING_LEVELS: readonly ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

/**
 * Output dimensions of the `embedding-default` contract (spec §2.4: Gemini
 * Embedding 001 truncated to 768). Single source of the value: consumed by the
 * chatbot `inference-kit` (`POST /v1/embeddings` with `dimensions`) and by the
 * Mock Model Gateway (deterministic test vectors).
 */
export const EMBEDDING_DIMENSIONS = 768;

/** Price per million tokens (USD), in the units of the original catalog. */
export interface GatewayModelCost {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Entry of `GET /v1/models/catalog` — see `packages/model-gateway/CONTRACT.md`. */
export interface GatewayModelEntry {
  id: string;
  company: string;
  isDefault: boolean;
  /** null in sparse entries (embedding/rerank/tts contracts without a window). */
  contextWindow: number | null;
  maxTokens: number | null;
  cost: GatewayModelCost;
  reasoning: boolean;
  thinkingLevels: ThinkingLevel[];
  defaultThinkingLevel: ThinkingLevel | null;
  supportedFiles: Array<"img" | "pdf">;
  supportedOutput: Array<"text" | "img">;
  zeroDataRetention: boolean;
  temperature: number | null;
  topP: number | null;
  topK: number | null;
}
