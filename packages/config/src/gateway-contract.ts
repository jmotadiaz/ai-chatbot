/**
 * Contrato compartido del catálogo del Model Gateway (ADR 0010): tipos PUROS
 * e isomorfos, sin leer variables de entorno ni importar nada de Node — se
 * consumen desde código de servidor (`inference-kit`, worker del
 * coding-agent), desde el cliente (`<ModelCatalogProvider>`) y desde los
 * tests (Mock Model Gateway).
 *
 * Es la única copia del lado TypeScript; el lado Python vive en
 * `packages/model-gateway/catalog.py`. El schema está documentado y
 * versionado en `packages/model-gateway/CONTRACT.md` (espejo de la spec
 * §2.2).
 */

/** Niveles de razonamiento; el catálogo declara el subconjunto soportado. */
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

/** Price per million tokens (USD), en las unidades del catálogo original. */
export interface GatewayModelCost {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Entrada de `GET /v1/models/catalog` — ver `packages/model-gateway/CONTRACT.md`. */
export interface GatewayModelEntry {
  id: string;
  company: string;
  isDefault: boolean;
  /** null en entradas sparse (contratos de embedding/rerank/tts sin ventana). */
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
