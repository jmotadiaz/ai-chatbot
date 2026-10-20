/**
 * Catálogo de test del Mock Model Gateway (ADR 0010, ticket 02).
 *
 * A diferencia del catálogo real (LiteLLM `config.yaml` → modelos comerciales),
 * aquí las entradas SON las capacidades que los tests necesitan: el id es el
 * alias de comportamiento y no hay ningún mapa de indirección hacia ids
 * comerciales. El schema de cada entrada es exactamente el `GatewayModelEntry`
 * del contrato compartido (§1 de `/tmp/model-gateway-contracts/contracts.md`):
 * `GET /v1/models/catalog` filtra en servidor las user-invocables (las 7 de
 * capacidad) y las internas (`*-default`) solo salen con `?include_internal=true`.
 */

/** Entrada del catálogo con el schema exacto del contrato compartido (§1). */
export interface MockCatalogEntry {
  id: string;
  company: string;
  isDefault: boolean;
  contextWindow: number;
  maxTokens: number;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  reasoning: boolean;
  thinkingLevels: string[];
  defaultThinkingLevel: string | null;
  supportedFiles: ("img" | "pdf")[];
  supportedOutput: ("text" | "img")[];
  zeroDataRetention: boolean;
  temperature: number | null;
  topP: number | null;
  topK: number | null;
}

/** Entrada base determinista: los tests solo se fijan en las propiedades que assertan. */
const entry = (overrides: Partial<MockCatalogEntry> & { id: string }): MockCatalogEntry => ({
  company: "mock",
  isDefault: false,
  contextWindow: 128000,
  maxTokens: 8192,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  reasoning: false,
  thinkingLevels: [],
  defaultThinkingLevel: null,
  supportedFiles: [],
  supportedOutput: ["text"],
  zeroDataRetention: true,
  temperature: 0.6,
  topP: null,
  topK: null,
  ...overrides,
});

/**
 * Los 7 modelos user-invocable del catálogo de test. Invariantes que los e2e
 * consumen directamente (sin capa de alias — los ids SON las capacidades):
 * - `basicChat` es el `isDefault` (y su temperature 0.6 difiere de la de
 *   `alwaysRefuses` — settings.spec cambia de modelo y espera otro valor).
 * - `canSeeImages` declara `supportedFiles: ["img"]` (attachments.spec).
 * - `canProduceReasoning` declara `reasoning: true` + thinking levels.
 * - `canExecuteTools` y `failsMidStream` no necesitan flags de catálogo: su
 *   comportamiento vive en el handler de `/v1/chat/completions`.
 */
export const TEST_MODELS: MockCatalogEntry[] = [
  entry({ id: "basicChat", isDefault: true }),
  entry({ id: "basicChatAlt", temperature: 0.7 }),
  entry({ id: "canExecuteTools" }),
  entry({ id: "canSeeImages", supportedFiles: ["img"] }),
  entry({
    id: "canProduceReasoning",
    reasoning: true,
    thinkingLevels: ["low", "medium", "high"],
    defaultThinkingLevel: "medium",
  }),
  entry({ id: "alwaysRefuses", temperature: 1 }),
  entry({ id: "failsMidStream" }),
];

/**
 * Los Default Model Contracts (spec §2.4): `user_invocable: false` en el
 * Gateway real, así que el mock también los oculta del listado por defecto.
 * Se aceptan como `model` en `/v1/chat/completions` y compañía siempre.
 */
export const TEST_INTERNAL_MODELS: MockCatalogEntry[] = [
  "fast-default",
  "flash-default",
  "vision-default",
  "reasoning-default",
  "free-default",
  "image-default",
  "embedding-default",
  "rerank-default",
  "decision-default",
  "tts-default",
].map((id) => entry({ id }));

export const isTestModel = (id: string): boolean =>
  TEST_MODELS.some((m) => m.id === id) ||
  TEST_INTERNAL_MODELS.some((m) => m.id === id);
