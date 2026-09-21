import type { ResolvedChatMode } from "@/lib/features/chat/mode-routing/types";

/**
 * Labelled dataset for the `mode-routing` eval (ticket 05).
 *
 * Every entry is the ground truth for the **v1 criteria** documented in
 * `@/lib/features/chat/mode-routing/questions.ts`:
 *
 * - `ctx7`  → library/framework/SDK/CLI/language-API documentation is needed
 *             (how something works, its API surface, its configuration, or
 *             version-specific behavior). Resolves to `context7`.
 * - `web`   → current or externally verifiable information is needed (news,
 *             prices, releases, availability, references/sources to check a
 *             claim, the content behind a URL, real-world comparisons).
 * - `neither` → general reasoning, knowledge already in the repo/conversation,
 *             or plain chat. No library docs, no external search.
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
  /** Why this label follows from the v1 criteria. */
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
      "Pregunta por la superficie de API de un framework (firma y semántica de un hook), no por hechos externos.",
  },
  {
    id: "ctx7-02",
    lang: "en",
    message:
      "How do I configure `dynamicIO` in Next.js 16 and which routes opt out of it?",
    expected: "ctx7",
    rationale:
      "Configuración de un framework y comportamiento específico de versión → documentación.",
  },
  {
    id: "ctx7-03",
    lang: "es",
    message:
      "¿Qué API de Drizzle ORM se usa para crear un índice parcial sobre una columna de texto?",
    expected: "ctx7",
    rationale:
      "API concreta de una librería (Drizzle) → documentación actualizada.",
  },
  {
    id: "ctx7-04",
    lang: "en",
    message:
      "What options does Vitest's `defineConfig` accept to isolate the environment per test file?",
    expected: "ctx7",
    rationale:
      "Opciones de configuración de una herramienta (Vitest) → documentación.",
  },
  {
    id: "ctx7-05",
    lang: "es",
    message:
      "¿Cómo se declara un bloque `@theme` con tokens propios en Tailwind CSS v4?",
    expected: "ctx7",
    rationale:
      "Sintaxis de una versión mayor concreta (Tailwind v4) → documentación.",
  },
  {
    id: "ctx7-06",
    lang: "en",
    message:
      "In the AI SDK v6, how does `stopWhen: stepCountIs(n)` differ from the old `maxSteps`?",
    expected: "ctx7",
    rationale:
      "Cambio de API entre versiones de un SDK → documentación de la librería.",
  },
  {
    id: "ctx7-07",
    lang: "es",
    message:
      "¿Cómo se define una tool con zod en el AI SDK v6? Necesito la firma de `tool()`.",
    expected: "ctx7",
    rationale: "Firma de una API de SDK → documentación.",
  },
  {
    id: "ctx7-08",
    lang: "en",
    message:
      "How do I enable `trace: 'on-first-retry'` in Playwright and open the trace from the CLI?",
    expected: "ctx7",
    rationale:
      "Configuración y CLI de una herramienta (Playwright) → documentación.",
  },
  {
    id: "ctx7-09",
    lang: "es",
    message:
      "¿Cómo se añade una dependencia al catálogo (`catalog:`) de un workspace con pnpm 11?",
    expected: "ctx7",
    rationale:
      "Funcionalidad documentada de una CLI (pnpm catalogs), no un dato del mundo.",
  },
  {
    id: "ctx7-10",
    lang: "en",
    message:
      "What does `AbortSignal.timeout()` reject with in Node 24, and how does it differ from Node 20?",
    expected: "ctx7",
    rationale:
      "API del lenguaje/runtime y su comportamiento por versión → documentación.",
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
      "Follow-up pronominal ('eso' = `useOptimistic`): sin el turno anterior sería ambiguo, con él sigue siendo una pregunta de API de framework.",
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
      "Follow-up implícito ('that' = bloque `@theme`): la documentación de Tailwind v4 sigue siendo la fuente.",
  },
  {
    id: "ctx7-13",
    lang: "es",
    message:
      "Mi componente de React 19 lanza «Cannot update a component while rendering a different component». ¿Qué significa ese error y cómo se corrige?",
    expected: "ctx7",
    rationale:
      "Frontera ctx7/neither: es un mensaje de error de un framework y la respuesta correcta depende de su semántica y de la API de React 19, no de razonamiento genérico.",
  },

  // ----------------------------------------------------------------- web (13)
  {
    id: "web-01",
    lang: "es",
    message: "¿A cuánto está el bitcoin ahora mismo?",
    expected: "web",
    rationale: "Precio en vivo: dato que cambia y no vive en ninguna doc.",
  },
  {
    id: "web-02",
    lang: "en",
    message:
      "What is the latest stable Node.js release, and when does it reach end of life?",
    expected: "web",
    rationale: "Releases y fechas de soporte = información actual externa.",
  },
  {
    id: "web-03",
    lang: "en",
    message:
      "Give me sources that back the claim that transformers use less energy per token than LSTMs.",
    expected: "web",
    rationale:
      "Pide referencias/fuentes para contrastar una afirmación → búsqueda externa.",
  },
  {
    id: "web-04",
    lang: "es",
    message:
      "Resume el contenido de https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-questions-and-answers-request",
    expected: "web",
    rationale: "Contenido detrás de una URL → web.",
  },
  {
    id: "web-05",
    lang: "es",
    message: "¿Quién ganó el Balón de Oro de este año?",
    expected: "web",
    rationale: "Actualidad: resultado de un evento reciente.",
  },
  {
    id: "web-06",
    lang: "en",
    message: "How much does an RTX 5090 cost right now in the EU?",
    expected: "web",
    rationale: "Precio actual de un producto → dato externo vivo.",
  },
  {
    id: "web-07",
    lang: "es",
    message: "¿Está abierto mañana el Museo del Prado? ¿Qué horario de visita tiene?",
    expected: "web",
    rationale: "Disponibilidad y horarios reales → web.",
  },
  {
    id: "web-08",
    lang: "es",
    message: "¿Qué ha pasado hoy con la cotización de NVIDIA?",
    expected: "web",
    rationale: "Noticia/mercado del día → web.",
  },
  {
    id: "web-09",
    lang: "es",
    message:
      "¿Sigue disponible `typesafe/jev-1.13` en OpenRouter? ¿Cuánto cuesta cada llamada?",
    expected: "web",
    rationale:
      "Disponibilidad y precio del servicio: dato operativo externo, no la documentación de una librería.",
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
      "Follow-up pronominal sin sujeto explícito: 'cerró' remite al precio del turno anterior → sigue necesitando el dato actual externo.",
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
      "Follow-up implícito ('its' = Node 24): fechas de soporte actualizadas → web.",
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
      "Pide fuentes verificables sobre un tema de actualidad → web.",
  },
  {
    id: "web-13",
    lang: "es",
    message:
      "¿Cuál es la versión publicada más reciente de `@openrouter/sdk` en npm y cuándo salió?",
    expected: "web",
    rationale:
      "Frontera web/ctx7: menciona una librería, pero la respuesta es un dato de release publicado (versión y fecha), no su documentación.",
  },

  // ------------------------------------------------------------- neither (13)
  {
    id: "neither-01",
    lang: "es",
    message: "Hola, ¿qué tal?",
    expected: "neither",
    rationale: "Charla.",
  },
  {
    id: "neither-02",
    lang: "es",
    message: "Gracias, muy útil.",
    expected: "neither",
    rationale: "Charla.",
  },
  {
    id: "neither-03",
    lang: "en",
    message: "Write a haiku about distributed systems.",
    expected: "neither",
    rationale:
      "Generación creativa con conocimiento general: ni docs de librería ni internet.",
  },
  {
    id: "neither-04",
    lang: "es",
    message:
      "Resume en una frase este párrafo que te pego: «El despliegue se pospuso porque el equipo de datos no terminó la migración, y el comité decidió esperar dos semanas».",
    expected: "neither",
    rationale: "Transformación de texto pegado, sin herramienta externa.",
  },
  {
    id: "neither-05",
    lang: "es",
    message: "¿En qué archivo de este repositorio se decide el Chat Mode automático?",
    expected: "neither",
    rationale:
      "Pregunta repo-local: el conocimiento está en el repositorio/conversación, no en docs externas ni en la web.",
  },
  {
    id: "neither-06",
    lang: "es",
    message:
      "Explícame qué hace el archivo `packages/chatbot/lib/features/chat/mode-routing/policy.ts`.",
    expected: "neither",
    rationale: "Código local del repositorio → ni ctx7 ni web.",
  },
  {
    id: "neither-07",
    lang: "es",
    message: "Corrige la gramática de esta frase: «habían muchos problemas con el despliegue».",
    expected: "neither",
    rationale: "Corrección de texto con conocimiento general.",
  },
  {
    id: "neither-08",
    lang: "es",
    message: "¿Qué tablas tiene la base de datos de este proyecto?",
    expected: "neither",
    rationale: "Pregunta repo-local sobre el esquema del propio proyecto.",
  },
  {
    id: "neither-09",
    lang: "es",
    message:
      "¿Me recomiendas alguna forma de organizar las notas de una reunión? Nada técnico.",
    expected: "neither",
    rationale: "Consejo genérico de razonamiento, sin herramientas.",
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
      "Follow-up pronominal ('lo' = policy.ts): repo-local, sin herramientas.",
  },
  {
    id: "neither-11",
    lang: "es",
    message: "¿Y eso cómo se hace?",
    expected: "neither",
    rationale:
      "Pronominal SIN contexto previo: el referente es irresoluble, así que no se justifica pagar ninguna tool. La etiqueta correcta es la rama neutra.",
  },
  {
    id: "neither-12",
    lang: "es",
    message: "¿Y entonces qué me recomiendas?",
    expected: "neither",
    rationale:
      "Pronominal SIN contexto previo y sin información que buscar: degradar a la rama neutra.",
  },
  {
    id: "neither-13",
    lang: "es",
    message: "¿Cómo se usa Drizzle en este proyecto?",
    expected: "neither",
    rationale:
      "Frontera neither/ctx7: nombra una librería, pero la respuesta está en el código del repositorio, no en la documentación externa.",
  },
] as const;

/** Dataset size per expected class, for documentation and sanity checks. */
export const MODE_ROUTING_CLASS_COUNTS: Record<ModeRoutingClass, number> = {
  ctx7: MODE_ROUTING_DATASET.filter((e) => e.expected === "ctx7").length,
  web: MODE_ROUTING_DATASET.filter((e) => e.expected === "web").length,
  neither: MODE_ROUTING_DATASET.filter((e) => e.expected === "neither").length,
};
