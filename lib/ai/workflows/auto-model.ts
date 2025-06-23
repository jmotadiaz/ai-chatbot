import { generateObject } from "ai";
import { z } from "zod";
import {
  defaultTemperature,
  languageModelConfigurations,
  ModelConfiguration,
} from "@/lib/ai/providers";
import { scapeXML } from "@/lib/utils";

export interface AutoModelCalculated {
  modelConfig: ModelConfiguration;
  temperature: number;
}

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

export async function autoModel(query: string): Promise<AutoModelCalculated> {
  if (!query || query.trim() === "") {
    console.warn(
      "Empty query provided to autoModel. Defaulting to Llama 3.1 Instant."
    );
    return {
      modelConfig: languageModelConfigurations["Llama 3.1 Instant"],
      temperature: defaultTemperature,
    };
  }

  const { object: classification } = await generateObject({
    ...languageModelConfigurations["Gemma 2"],
    schema: z.object({
      reasoning: z.string(),
      category: z.enum(CATEGORIES),
      complexity: z.enum(COMPLEXITY_LEVELS),
    }),
    prompt: getPrompt(query),
  });

  console.log("Classification Result:", classification);

  const { category, complexity } = classification;

  return decisionTree[category][complexity];
}

const decisionTree: Record<string, Record<string, AutoModelCalculated>> = {
  factual: {
    simple: {
      modelConfig: languageModelConfigurations["Llama 3.1 Instant"],
      temperature: defaultTemperature,
    },
    moderate: {
      modelConfig: languageModelConfigurations["Llama 3.3 Versatile"],
      temperature: defaultTemperature,
    },
    complex: {
      modelConfig: languageModelConfigurations["Llama 4 Maverick"],
      temperature: defaultTemperature,
    },
  },
  analytical: {
    simple: {
      modelConfig: languageModelConfigurations["Deepseek R1 Distill"],
      temperature: defaultTemperature,
    },
    moderate: {
      modelConfig: languageModelConfigurations["Qwen 3"],
      temperature: defaultTemperature,
    },
    complex: {
      modelConfig: languageModelConfigurations["o3"],
      temperature: defaultTemperature,
    },
  },
  technical: {
    simple: {
      modelConfig: languageModelConfigurations["Llama 3.1 Instant"],
      temperature: defaultTemperature,
    },
    moderate: {
      modelConfig: languageModelConfigurations["Qwen 3"],
      temperature: defaultTemperature,
    },
    complex: {
      modelConfig: languageModelConfigurations["Claude Sonnet 4"],
      temperature: defaultTemperature,
    },
  },
  creative: {
    simple: {
      modelConfig: languageModelConfigurations["Llama 3.1 Instant"],
      temperature: 1,
    },
    moderate: {
      modelConfig: languageModelConfigurations["Llama 4 Maverick"],
      temperature: 1,
    },
    complex: {
      modelConfig: languageModelConfigurations["Gemini 2.5 Flash"],
      temperature: 1,
    },
  },
  instructional: {
    simple: {
      modelConfig: languageModelConfigurations["Llama 3.3 Versatile"],
      temperature: 0.5,
    },
    moderate: {
      modelConfig: languageModelConfigurations["GPT 4.1 Mini"],
      temperature: 0.5,
    },
    complex: {
      modelConfig: languageModelConfigurations["Gemini 2.5 Flash"],
      temperature: 0.5,
    },
  },
  conversational: {
    simple: {
      modelConfig: languageModelConfigurations["Llama 3.1 Instant"],
      temperature: 0.8,
    },
    moderate: {
      modelConfig: languageModelConfigurations["Llama 4 Maverick"],
      temperature: 0.8,
    },
    complex: {
      modelConfig: languageModelConfigurations["Gemini 2.5 Flash"],
      temperature: 0.8,
    },
  },
  processing: {
    simple: {
      modelConfig: languageModelConfigurations["Llama 3.1 Instant"],
      temperature: defaultTemperature,
    },
    moderate: {
      modelConfig: languageModelConfigurations["Gemini 2.5 Flash Lite"],
      temperature: defaultTemperature,
    },
    complex: {
      modelConfig: languageModelConfigurations["Gemini 2.5 Flash"],
      temperature: defaultTemperature,
    },
  },
} satisfies Record<
  (typeof CATEGORIES)[number],
  Record<(typeof COMPLEXITY_LEVELS)[number], AutoModelCalculated>
>;

const getPrompt = (query: string): string => `\n
  # Query Classification for LLM Routing
  Analyze the following user query, included in a xml tag <query>, and classify it to determine the most appropriate LLM routing:

  **Query:**
  <query>
    ${scapeXML(query)}
  </query>

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
  3. **Provide brief reasoning** - focus on the key deciding factors. 1-2 sentence explanation\n
`;
