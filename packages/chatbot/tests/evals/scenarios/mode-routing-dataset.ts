import type { ResolvedChatMode } from "@/lib/features/chat/mode-routing/types";

/**
 * Labelled dataset for the `mode-routing` eval (ticket 05).
 *
 * Every entry is the ground truth for the **current criteria** documented in
 * `@/lib/features/chat/mode-routing/questions.ts`:
 *
 * - `ctx7`  → library/framework/SDK/CLI/language-API documentation is needed
 *             (how something works, its API surface, its configuration, or
 *             version-specific behavior). Resolves to `context7`.
 * - `web`   → current or externally verifiable information is needed (news,
 *             prices, releases, availability, references/sources to check a
 *             claim, the content behind a URL, real-world comparisons,
 *             official standards/regulations and their current edition).
 * - `neither` → general reasoning, knowledge already in the repo/conversation,
 *             or plain chat. No library docs, no external search, nothing to
 *             cite or verify.
 *
 * The `previousTurn` field feeds `recentContext`; messages that only make sense
 * with a referent (pronoun-only follow-ups) carry one. Messages without a
 * previous turn are self-contained.
 *
 * Each entry keeps a `rationale` so that changing a label is a deliberate
 * decision during a criteria revision, not an accident.
 */
export type ModeRoutingClass = "ctx7" | "web" | "neither";

/** Expected class → mode the turn must actually be answered with. */
export const MODE_ROUTING_CLASS_TO_MODE: Record<
  ModeRoutingClass,
  ResolvedChatMode
> = {
  ctx7: "context7",
  web: "web",
  neither: "neutral",
};

/** Class of an already resolved mode (inverse of the map above). */
export const MODE_ROUTING_MODE_TO_CLASS: Record<
  ResolvedChatMode,
  ModeRoutingClass
> = {
  context7: "ctx7",
  web: "web",
  neutral: "neither",
};

export interface ModeRoutingPreviousTurn {
  user: string;
  assistant: string;
}

export interface ModeRoutingDatasetEntry {
  id: string;
  message: string;
  previousTurn?: ModeRoutingPreviousTurn;
  expected: ModeRoutingClass;
  /** Why this label follows from the current criteria. */
  rationale: string;
  lang: "es" | "en";
}

export const MODE_ROUTING_DATASET: readonly ModeRoutingDatasetEntry[] = [
  // ---------------------------------------------------------------- ctx7 (13)
  {
    id: "ctx7-01",
    lang: "es",
    message:
      "¿Cuál es la firma exacta de `useOptimistic` en React 19 y cuándo se reinicia su estado?",
    expected: "ctx7",
    rationale:
      "Asks about a framework's API surface (a hook's signature and semantics), not about external facts.",
  },
  {
    id: "ctx7-02",
    lang: "en",
    message:
      "How do I configure `dynamicIO` in Next.js 16 and which routes opt out of it?",
    expected: "ctx7",
    rationale:
      "Framework configuration and version-specific behavior → documentation.",
  },
  {
    id: "ctx7-03",
    lang: "es",
    message:
      "¿Qué API de Drizzle ORM se usa para crear un índice parcial sobre una columna de texto?",
    expected: "ctx7",
    rationale:
      "A library's concrete API (Drizzle) → up-to-date documentation.",
  },
  {
    id: "ctx7-04",
    lang: "en",
    message:
      "What options does Vitest's `defineConfig` accept to isolate the environment per test file?",
    expected: "ctx7",
    rationale:
      "Configuration options of a tool (Vitest) → documentation.",
  },
  {
    id: "ctx7-05",
    lang: "es",
    message:
      "¿Cómo se declara un bloque `@theme` con tokens propios en Tailwind CSS v4?",
    expected: "ctx7",
    rationale:
      "Syntax of a concrete major version (Tailwind v4) → documentation.",
  },
  {
    id: "ctx7-06",
    lang: "en",
    message:
      "In the AI SDK v6, how does `stopWhen: stepCountIs(n)` differ from the old `maxSteps`?",
    expected: "ctx7",
    rationale:
      "API change between SDK versions → the library's documentation.",
  },
  {
    id: "ctx7-07",
    lang: "es",
    message:
      "¿Cómo se define una tool con zod en el AI SDK v6? Necesito la firma de `tool()`.",
    expected: "ctx7",
    rationale: "A SDK API signature → documentation.",
  },
  {
    id: "ctx7-08",
    lang: "en",
    message:
      "How do I enable `trace: 'on-first-retry'` in Playwright and open the trace from the CLI?",
    expected: "ctx7",
    rationale:
      "Configuration and CLI of a tool (Playwright) → documentation.",
  },
  {
    id: "ctx7-09",
    lang: "es",
    message:
      "¿Cómo se añade una dependencia al catálogo (`catalog:`) de un workspace con pnpm 11?",
    expected: "ctx7",
    rationale:
      "Documented CLI functionality (pnpm catalogs), not a fact about the world.",
  },
  {
    id: "ctx7-10",
    lang: "en",
    message:
      "What does `AbortSignal.timeout()` reject with in Node 24, and how does it differ from Node 20?",
    expected: "ctx7",
    rationale:
      "Language/runtime API and its per-version behavior → documentation.",
  },
  {
    id: "ctx7-11",
    lang: "es",
    previousTurn: {
      user: "¿Qué gancho nuevo trae React 19 para actualizaciones optimistas?",
      assistant:
        "React 19 añade `useOptimistic`, que aplica un estado temporal mientras la acción async está en vuelo.",
    },
    message: "¿Y cómo se integra eso con un formulario que ya existe?",
    expected: "ctx7",
    rationale:
      "Pronominal follow-up ('eso' = `useOptimistic`): without the previous turn it would be ambiguous; with it, it is still a framework API question.",
  },
  {
    id: "ctx7-12",
    lang: "en",
    previousTurn: {
      user: "How do I declare custom design tokens in Tailwind CSS v4?",
      assistant:
        "With an `@theme { --color-brand: … }` block in your CSS entry point.",
    },
    message: "And does that still work when the styles live in a shared package?",
    expected: "ctx7",
    rationale:
      "Implicit follow-up ('that' = the `@theme` block): Tailwind v4's documentation is still the source.",
  },
  {
    id: "ctx7-13",
    lang: "es",
    message:
      "Mi componente de React 19 lanza «Cannot update a component while rendering a different component». ¿Qué significa ese error y cómo se corrige?",
    expected: "ctx7",
    rationale:
      "ctx7/neither boundary: it is a framework error message and the correct answer depends on its semantics and on the React 19 API, not on general reasoning.",
  },

  // ----------------------------------------------------------------- web (15)
  {
    id: "web-01",
    lang: "es",
    message: "¿A cuánto está el bitcoin ahora mismo?",
    expected: "web",
    rationale: "A live price: data that changes and lives in no doc.",
  },
  {
    id: "web-02",
    lang: "en",
    message:
      "What is the latest stable Node.js release, and when does it reach end of life?",
    expected: "web",
    rationale: "Releases and support dates = current external information.",
  },
  {
    id: "web-03",
    lang: "en",
    message:
      "Give me sources that back the claim that transformers use less energy per token than LSTMs.",
    expected: "web",
    rationale:
      "It asks for references/sources to back a claim → external search.",
  },
  {
    id: "web-04",
    lang: "es",
    message:
      "Resume el contenido de https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-questions-and-answers-request",
    expected: "web",
    rationale: "Content behind a URL → web.",
  },
  {
    id: "web-05",
    lang: "es",
    message: "¿Quién ganó el Balón de Oro de este año?",
    expected: "web",
    rationale: "Current affairs: the outcome of a recent event.",
  },
  {
    id: "web-06",
    lang: "en",
    message: "How much does an RTX 5090 cost right now in the EU?",
    expected: "web",
    rationale: "A product's current price → live external data.",
  },
  {
    id: "web-07",
    lang: "es",
    message: "¿Está abierto mañana el Museo del Prado? ¿Qué horario de visita tiene?",
    expected: "web",
    rationale: "Real availability and opening hours → web.",
  },
  {
    id: "web-08",
    lang: "es",
    message: "¿Qué ha pasado hoy con la cotización de NVIDIA?",
    expected: "web",
    rationale: "Today's news/market → web.",
  },
  {
    id: "web-09",
    lang: "es",
    message:
      "¿Sigue disponible `typesafe/jev-1.13` en OpenRouter? ¿Cuánto cuesta cada llamada?",
    expected: "web",
    rationale:
      "Service availability and price: an external operational fact, not a library's documentation.",
  },
  {
    id: "web-10",
    lang: "es",
    previousTurn: {
      user: "¿A cómo está el bitcoin?",
      assistant: "Ahora mismo ronda los 92.000 dólares.",
    },
    message: "¿Y cómo cerró ayer?",
    expected: "web",
    rationale:
      "Pronominal follow-up with no explicit subject: 'cerró' points back to the previous turn's price → it still needs the current external data.",
  },
  {
    id: "web-11",
    lang: "en",
    previousTurn: {
      user: "What is the current LTS version of Node.js?",
      assistant: "Node.js 24 is the active LTS line.",
    },
    message: "And when does its maintenance window end?",
    expected: "web",
    rationale:
      "Implicit follow-up ('its' = Node 24): up-to-date support dates → web.",
  },
  {
    id: "web-12",
    lang: "es",
    previousTurn: {
      user: "Resume esta noticia sobre el acuerdo UE-Mercosur.",
      assistant:
        "El acuerdo elimina aranceles en el 91% de las líneas tarifarias y entra en vigor tras su ratificación.",
    },
    message: "¿Y cuáles serían las fuentes oficiales para contrastarlo?",
    expected: "web",
    rationale:
      "It asks for verifiable sources on a current-affairs topic → web.",
  },
  {
    id: "web-13",
    lang: "es",
    message:
      "¿Cuál es la versión publicada más reciente de `@openrouter/sdk` en npm y cuándo salió?",
    expected: "web",
    rationale:
      "web/ctx7 boundary: it mentions a library, but the answer is a published release fact (version and date), not its documentation.",
  },
  {
    id: "web-14",
    lang: "es",
    message:
      "¿Dónde puedo comprobar en la fuente oficial que esa certificación sigue vigente?",
    expected: "web",
    rationale:
      "An external document/authority whose validity must be checked at the issuer: general reasoning is not enough.",
  },
  {
    id: "web-15",
    lang: "es",
    message:
      "Dame la referencia oficial y la edición actual del reglamento que regula ese procedimiento.",
    expected: "web",
    rationale:
      "It asks for a citable external normative source and its current edition: information verifiable outside the model.",
  },

  // ------------------------------------------------------------- neither (14)
  {
    id: "neither-01",
    lang: "es",
    message: "Hola, ¿qué tal?",
    expected: "neither",
    rationale: "Chit-chat."
  },
  {
    id: "neither-02",
    lang: "es",
    message: "Gracias, muy útil.",
    expected: "neither",
    rationale: "Chit-chat."
  },
  {
    id: "neither-03",
    lang: "en",
    message: "Write a haiku about distributed systems.",
    expected: "neither",
    rationale:
      "Creative generation with general knowledge: neither library docs nor the internet.",
  },
  {
    id: "neither-04",
    lang: "es",
    message:
      "Resume en una frase este párrafo que te pego: «El despliegue se pospuso porque el equipo de datos no terminó la migración, y el comité decidió esperar dos semanas».",
    expected: "neither",
    rationale: "Transformation of pasted text, with no external tool.",
  },
  {
    id: "neither-05",
    lang: "es",
    message: "¿En qué archivo de este repositorio se decide el Chat Mode automático?",
    expected: "neither",
    rationale:
      "Repo-local question: the knowledge is in the repository/conversation, not in external docs or on the web.",
  },
  {
    id: "neither-06",
    lang: "es",
    message:
      "Explícame qué hace el archivo `packages/chatbot/lib/features/chat/mode-routing/policy.ts`.",
    expected: "neither",
    rationale: "Local repository code → neither ctx7 nor web.",
  },
  {
    id: "neither-07",
    lang: "es",
    message: "Corrige la gramática de esta frase: «habían muchos problemas con el despliegue».",
    expected: "neither",
    rationale: "Text correction with general knowledge.",
  },
  {
    id: "neither-08",
    lang: "es",
    message: "¿Qué tablas tiene la base de datos de este proyecto?",
    expected: "neither",
    rationale: "Repo-local question about the project's own schema.",
  },
  {
    id: "neither-09",
    lang: "es",
    message:
      "¿Me recomiendas alguna forma de organizar las notas de una reunión? Nada técnico.",
    expected: "neither",
    rationale: "Generic reasoning advice, with no tools.",
  },
  {
    id: "neither-10",
    lang: "es",
    previousTurn: {
      user: "¿Cómo se llama el archivo donde vive la política de enrutado?",
      assistant: "`policy.ts`, dentro de `mode-routing/`.",
    },
    message: "¿Y quién lo consume?",
    expected: "neither",
    rationale:
      "Pronominal follow-up ('lo' = policy.ts): repo-local, with no tools.",
  },
  {
    id: "neither-11",
    lang: "es",
    message: "¿Y eso cómo se hace?",
    expected: "neither",
    rationale:
      "Pronominal WITHOUT previous context: the referent is unresolvable, so paying for any tool is not justified. The correct label is the neutral branch.",
  },
  {
    id: "neither-12",
    lang: "es",
    message: "¿Y entonces qué me recomiendas?",
    expected: "neither",
    rationale:
      "Pronominal WITHOUT previous context and with no information to look up: degrade to the neutral branch.",
  },
  {
    id: "neither-13",
    lang: "es",
    message: "¿Cómo se usa Drizzle en este proyecto?",
    expected: "neither",
    rationale:
      "neither/ctx7 boundary: it names a library, but the answer is in the repository code, not in external documentation.",
  },
  {
    id: "neither-14",
    lang: "es",
    message:
      "¿Qué diferencia conceptual hay entre un requisito funcional y uno no funcional?",
    expected: "neither",
    rationale:
      "neither/web boundary: a reasoning question about a concept; it asks for no external sources and does not require checking their validity.",
  },
] as const;

/** Dataset size per expected class, for documentation and sanity checks. */
export const MODE_ROUTING_CLASS_COUNTS: Record<ModeRoutingClass, number> = {
  ctx7: MODE_ROUTING_DATASET.filter((e) => e.expected === "ctx7").length,
  web: MODE_ROUTING_DATASET.filter((e) => e.expected === "web").length,
  neither: MODE_ROUTING_DATASET.filter((e) => e.expected === "neither").length,
};
