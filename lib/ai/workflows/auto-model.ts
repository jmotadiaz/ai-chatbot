import { generateObject } from "ai";
import { z } from "zod";
import {
  languageModelConfigurations,
  ModelConfiguration,
} from "@/lib/ai/models";
import { scapeXML } from "@/lib/utils";

const CATEGORIES = [
  "factual",
  "analytical",
  "technical",
  "creative",
  "instructional",
  "conversational",
  "processing",
  "other",
] as const;

const COMPLEXITY_LEVELS = [
  "simple",
  "moderate",
  "complex",
  "advanced",
] as const;

const schema = z.object({
  reasoning: z.string(),
  category: z.enum(CATEGORIES),
  complexity: z.enum(COMPLEXITY_LEVELS),
});

export async function autoModel(query: string): Promise<ModelConfiguration> {
  if (!query || query.trim() === "") {
    throw new Error("Query cannot be empty");
  }

  const { object: classification } = await generateObject({
    ...languageModelConfigurations["Gemini 2.5 Flash Lite"],
    schema,
    prompt: getPrompt(query),
  }).catch((error) => {
    console.error("Error during model generation:", error);
    return {
      object: {
        category: "other",
        complexity: "simple",
        reasoning: "Default classification due to error",
      } satisfies z.infer<typeof schema>,
    } as const;
  });

  console.log("Classification Result:", classification);

  const { category, complexity } = classification;

  return decisionTree[category][complexity];
}

const decisionTree: Record<string, Record<string, ModelConfiguration>> = {
  factual: {
    simple: {
      ...languageModelConfigurations["Llama 3.1 Instant"],
    },
    moderate: {
      ...languageModelConfigurations["Llama 3.3 Versatile"],
    },
    complex: {
      ...languageModelConfigurations["Llama 4 Maverick"],
    },
    advanced: {
      ...languageModelConfigurations["Qwen 3"],
    },
  },
  analytical: {
    simple: {
      ...languageModelConfigurations["Llama 4 Maverick"],
    },
    moderate: {
      ...languageModelConfigurations["Deepseek R1 Distill"],
    },
    complex: {
      ...languageModelConfigurations["Qwen 3"],
    },
    advanced: {
      ...languageModelConfigurations["Grok 4"],
    },
  },
  technical: {
    simple: {
      ...languageModelConfigurations["Gemini 2.5 Flash Lite"],
    },
    moderate: {
      ...languageModelConfigurations["Llama 4 Maverick"],
    },
    complex: {
      ...languageModelConfigurations["Qwen 3"],
    },
    advanced: {
      ...languageModelConfigurations["Claude Sonnet 4"],
    },
  },
  creative: {
    simple: {
      ...languageModelConfigurations["Llama 3.1 Instant"],
      temperature: 1,
    },
    moderate: {
      ...languageModelConfigurations["Gemini 2.5 Flash Lite"],
      temperature: 1,
    },
    complex: {
      ...languageModelConfigurations["Gemini 2.5 Flash Lite Thinking"],
      temperature: 1,
    },
    advanced: {
      ...languageModelConfigurations["Gemini 2.5 Flash"],
      temperature: 1,
    },
  },
  instructional: {
    simple: {
      ...languageModelConfigurations["Llama 3.3 Versatile"],
      temperature: 0.5,
    },
    moderate: {
      ...languageModelConfigurations["Llama 4 Maverick"],
      temperature: 0.5,
    },
    complex: {
      ...languageModelConfigurations["GPT 4.1"],
      temperature: 0.5,
    },
    advanced: {
      ...languageModelConfigurations["Gemini 2.5 Pro"],
      temperature: 0.5,
    },
  },
  conversational: {
    simple: {
      ...languageModelConfigurations["Llama 3.1 Instant"],
      temperature: 0.8,
    },
    moderate: {
      ...languageModelConfigurations["Llama 3.3 Versatile"],
      temperature: 0.8,
    },
    complex: {
      ...languageModelConfigurations["Llama 4 Maverick"],
      temperature: 0.8,
    },
    advanced: {
      ...languageModelConfigurations["Gemini 2.5 Flash"],
      temperature: 0.8,
    },
  },
  processing: {
    simple: {
      ...languageModelConfigurations["Llama 3.1 Instant"],
    },
    moderate: {
      ...languageModelConfigurations["Gemini 2.5 Flash Lite"],
    },
    complex: {
      ...languageModelConfigurations["Gemini 2.0 Flash"],
    },
    advanced: {
      ...languageModelConfigurations["Gemini 2.5 Flash"],
    },
  },
  other: {
    simple: {
      ...languageModelConfigurations["Llama 3.1 Instant"],
    },
    moderate: {
      ...languageModelConfigurations["Llama 3.3 Versatile"],
    },
    complex: {
      ...languageModelConfigurations["Llama 4 Maverick"],
    },
    advanced: {
      ...languageModelConfigurations["Llama 4 Maverick"],
    },
  },
} satisfies Record<
  (typeof CATEGORIES)[number],
  Record<(typeof COMPLEXITY_LEVELS)[number], ModelConfiguration>
>;

const getPrompt = (query: string): string => `\n
  # Query Classification for LLM Routing
  Analyze the following user query, included in an XML tag \`<query>\`, and classify it to determine the most appropriate LLM routing. Output your classification in the specified JSON format.
  ## Classification Requirements

  ### 1. Categories

  Choose the **primary category** based on the query's main intent. If the query fits multiple categories, select the most dominant one and note secondary categories in the reasoning.

  *   **Factual**: Direct questions seeking specific, verifiable information.
  *   **Analytical**: Multi-step reasoning, problem-solving, or logical analysis.
  *   **Technical**: Programming, debugging, system design, or technical implementation.
  *   **Creative**: Artistic content generation, open-ended writing, or brainstorming.
  *   **Instructional**: Creating structured content, prompts, templates, or educational materials.
  *   **Conversational**: Casual chat, personal advice, or social interaction.
  *   **Processing**: Text transformation, translation, summarization, or data extraction.
  *   **Other**: Queries that don't fit the above (e.g., spam, unclear, or off-topic). Use this sparingly and explain in reasoning.

  ### 2. Complexity Levels
  Assess complexity based on the **nature of the task, required expertise, and expected output structure**, not just query length.

  *   **Simple**: A task involving the retrieval of a single, self-contained piece of information or a generic, atomic action.
      *   **Core Task**: Retrieving a generic fact or a standard code snippet.
      *   **Estimated effort**: Low.

  *   **Moderate**: A task that requires applying a process to a **specific context provided within the prompt**, or combining distinct steps to create a structured output.
      *   **Core Task**: Processing user-provided input to produce a customized or structured result.
      *   **Estimated effort**: Moderate.

  *   **Complex**: A task requiring the **deep and multi-faceted application of expert knowledge** to produce a single, comprehensive artifact. It involves detailed analysis, design, or planning within an established domain.
      *   **Core Task**: Solving a difficult problem.
      *   **Estimated effort**: High.

  *   **Advanced**: A task that involves **designing a system, a process, or a new conceptual framework**. It often requires orchestrating multiple complex sub-tasks, creating iterative or self-correcting workflows, or synthesizing disparate domains to build a novel structure.
      *   **Core Task**: Designing a system to solve problems.
      *  **Estimated effort**: Very high.

  ### 3. Reasoning
  Provide a brief reasoning (1-3 sentences) explaining the classification, focusing on key deciding factors such as query intent, overlaps, and complexity drivers.

  ### Classification Guidelines

  1. **Choose the most specific category** that fits the primary intent; prioritize based on the query's core goal.
  2. **Handle hybrids**: If a query spans categories (e.g., technical + analytical), select the primary and list secondaries in reasoning.
  3. **Base complexity on inherent factors**: Consider expertise needed, steps involved, and potential for in-depth response.
  4. **Edge cases**: For ambiguous queries, classify as "other" and suggest clarification. If multilingual, classify based on content intent.

  ## User Query
  <query>
    ${scapeXML(query)}
  </query>
`;
