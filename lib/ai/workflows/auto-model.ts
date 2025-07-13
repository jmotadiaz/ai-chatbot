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

const COMPLEXITY_LEVELS = ["simple", "moderate", "complex"] as const;

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
  },
  analytical: {
    simple: {
      ...languageModelConfigurations["Deepseek R1 Distill"],
    },
    moderate: {
      ...languageModelConfigurations["Qwen 3"],
    },
    complex: {
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
      ...languageModelConfigurations["Claude Sonnet 4"],
    },
  },
  creative: {
    simple: {
      ...languageModelConfigurations["Llama 3.1 Instant"],
      temperature: 1,
    },
    moderate: {
      ...languageModelConfigurations["Llama 4 Maverick"],
      temperature: 1,
    },
    complex: {
      ...languageModelConfigurations["Gemini 2.5 Flash"],
      temperature: 1,
    },
  },
  instructional: {
    simple: {
      ...languageModelConfigurations["Gemini 2.5 Flash Lite"],
      temperature: 0.5,
    },
    moderate: {
      ...languageModelConfigurations["GPT 4.1 Mini"],
      temperature: 0.5,
    },
    complex: {
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
      ...languageModelConfigurations["Llama 4 Maverick"],
      temperature: 0.8,
    },
    complex: {
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

  - **Factual**: Direct questions seeking specific, verifiable information.
    - Examples: "What is the capital of France?", "When was Python created?", "List the planets in our solar system."

  - **Analytical**: Multi-step reasoning, problem-solving, or logical analysis.
    - Examples: "Compare pros/cons of electric vs gas cars", "Analyze this sales data trend", "Solve this logic puzzle."

  - **Technical**: Programming, debugging, system design, or technical implementation.
    - Examples: "Fix this code bug in Python", "Design a REST API for user authentication", "Explain quantum computing basics."

  - **Creative**: Artistic content generation, open-ended writing, or brainstorming.
    - Examples: "Write a short story about a time traveler", "Create a poem about autumn", "Generate creative marketing slogans for a coffee brand."

  - **Instructional**: Creating structured content, prompts, templates, or educational materials.
    - Examples: "Design a prompt for generating recipes", "Create a lesson plan on climate change", "Write a documentation template for software APIs."

  - **Conversational**: Casual chat, personal advice, or social interaction.
    - Examples: "How was your day?", "What should I wear to a job interview?", "Tell me a joke."

  - **Processing**: Text transformation, translation, summarization, or data extraction.
    - Examples: "Translate this text to Spanish", "Summarize this article on AI ethics", "Extract key points from this report."

  - **Other**: Queries that don't fit the above (e.g., spam, unclear, or off-topic). Use this sparingly and explain in reasoning.

  ### 2. Complexity Levels

  Assess complexity based on **required expertise, number of steps, and context depth**, not query length. Estimate processing effort as a guide.

  - **Simple**: Single-step task, common knowledge, minimal context needed.
    - Estimated effort: Low (e.g., < 30 seconds).
    - Examples: "Define machine learning", "Convert 100°F to Celsius."

  - **Moderate**: Multi-step process, some domain knowledge, moderate context.
    - Estimated effort: Medium (e.g., 30 seconds - 2 minutes).
    - Examples: "Explain how OAuth works with examples", "Debug this 20-line JavaScript function."

  - **Complex**: Deep expertise required, extensive context, multi-faceted analysis.
    - Estimated effort: High (e.g., > 2 minutes).
    - Examples: "Design a scalable microservices architecture for e-commerce", "Write a comprehensive market analysis report on renewable energy."

  ### 3. Reasoning
  Provide a brief reasoning (1-3 sentences) explaining the classification, focusing on key deciding factors such as query intent, overlaps, and complexity drivers.

  ### Classification Guidelines

  1. **Choose the most specific category** that fits the primary intent; prioritize based on the query's core goal.
  2. **Handle hybrids**: If a query spans categories (e.g., technical + analytical), select the primary and list secondaries in reasoning.
  3. **Base complexity on inherent factors**: Consider expertise needed, steps involved, and potential for in-depth response.
  4. **Edge cases**: For ambiguous queries, classify as "other" and suggest clarification. If multilingual, classify based on content intent.
  5. **Confidence**: Include a confidence score (high/medium/low) in the output for the classification.

  ## User Query
  <query>
    ${scapeXML(query)}
  </query>
`;
