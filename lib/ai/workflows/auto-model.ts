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
        category: "factual",
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
      ...languageModelConfigurations["Deepseek R1 0528"],
    },
  },
  technical: {
    simple: {
      ...languageModelConfigurations["Llama 3.1 Instant"],
    },
    moderate: {
      ...languageModelConfigurations["GPT 4.1 Mini"],
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
      ...languageModelConfigurations["Llama 3.3 Versatile"],
      temperature: 0.5,
    },
    moderate: {
      ...languageModelConfigurations["GPT 4.1 Mini"],
      temperature: 0.5,
    },
    complex: {
      ...languageModelConfigurations["Deepseek R1 0528"],
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
} satisfies Record<
  (typeof CATEGORIES)[number],
  Record<(typeof COMPLEXITY_LEVELS)[number], ModelConfiguration>
>;

const getPrompt = (query: string): string => `\n
  # Query Classification for LLM Routing
  Analyze the following user query, included in a xml tag <query>, and classify it to determine the most appropriate LLM routing:

  ## Classification Requirements

  ### 1. Categories

  #### factual
  - Direct questions seeking specific information
  - Examples: "What is the capital of France?", "When was Python created?"

  #### analytical
  - Multi-step reasoning, problem-solving, logical analysis
  - Examples: "Compare pros/cons of X vs Y", "Analyze this data trend"

  #### technical
  - Programming, debugging, system design, technical implementation
  - Examples: "Fix this code bug", "Design a REST API"

  #### creative
  - Artistic content generation, open-ended writing, brainstorming
  - Examples: "Write a story", "Create a poem", "Generate creative marketing slogans"

  #### instructional
  - Creating structured content, prompts, templates, educational materials
  - Examples: "Design a prompt for X", "Create a lesson plan", "Write documentation template"

  #### conversational
  - Casual chat, personal advice, social interaction
  - Examples: "How was your day?", "What should I wear?"

  #### processing
  - Text transformation, translation, summarization
  - Examples: "Translate this text", "Summarize this article"

  ### 2. Complexity Levels

  #### simple
  - Single-step task, common knowledge, minimal context needed
  - Processing time: < 30 seconds
  - Examples: "Define machine learning", "Convert 100°F to Celsius"

  #### moderate
  - Multi-step process, some domain knowledge, moderate context
  - Processing time: 30 seconds - 2 minutes
  - Examples: "Explain how OAuth works", "Debug this 20-line function"

  #### complex
  - Deep expertise required, extensive context, multi-faceted analysis
  - Processing time: > 2 minutes
  - Examples: "Design microservices architecture", "Write comprehensive market analysis"

  ### 3. Reasoning
  Brief reasoning for classification.

  ### Classification Guidelines

  1. **Choose the most specific category** that fits the primary intent
  2. **Base complexity on required expertise and processing depth**, not query length
  3. **Provide brief reasoning** - focus on the key deciding factors. 1-2 sentence explanation

  ## User Query
  <query>
    ${scapeXML(query)}
  </query>
`;
