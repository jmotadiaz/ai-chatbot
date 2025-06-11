import { generateObject } from "ai";
import {
  defaultTemperature,
  getModelConfiguration,
  ModelConfiguration,
} from "../providers";
import { z } from "zod";

export interface AutoModelCalculated {
  modelConfig: ModelConfiguration;
  temperature: number;
}

export async function autoModel(query: string): Promise<AutoModelCalculated> {
  const { object: classification } = await generateObject({
    ...getModelConfiguration("Llama 3.1 Instant"),
    schema: z.object({
      reasoning: z.string(),
      queryType: z.enum([
        "simple_question",
        "general_knowledge",
        "reasoning",
        "code",
        "creative",
        "conversational",
        "translation",
        "summarization",
      ]),
      complexity: z.enum(["simple", "moderate", "complex"]),
    }),
    prompt: `\n
      # Query Classification for LLM Routing
      Analyze the following user query and classify it to determine the most appropriate LLM routing:

      **Query:** ${query}

      ## Classification Requirements

      ### 1. Query Type
      Classify into one of these categories:
      - **simple_question** - Direct factual questions with straightforward answers
      - **general_knowledge** - Broad informational queries requiring general understanding
      - **reasoning** - Logic problems, analysis, ai prompt refinement or multi-step thinking required
      - **code** - Programming, debugging, or technical implementation requests
      - **creative** - Writing, brainstorming, or artistic content generation
      - **conversational** - Casual chat, personal advice, or social interaction
      - **translation** - Language translation or linguistic analysis
      - **summarization** - Content condensation or key point extraction

      ### 2. Complexity Level
      Determine complexity:
      - *simple**: Requires a straightforward answer, minimal reasoning, a small amount of information, or a very common task.
      - **moderate**: Requires some level of interpretation, multi-step processing, synthesis of a few pieces of information, or a moderately common task.
      - **complex**: Requires deep reasoning, synthesis of multiple diverse information sources, handling ambiguity, generating extensive or highly structured output, or addressing a niche/specialized task.
      ### 3. Reasoning
      Brief reasoning for classification\n
    `,
  });

  console.log("Classification Result:", classification);

  const { queryType, complexity } = classification;

  return (
    decisionTree[queryType]?.[complexity] ?? {
      modelConfig: getModelConfiguration("Llama 4 Maverick"),
      temperature: defaultTemperature,
    }
  );
}

const decisionTree: Record<string, Record<string, AutoModelCalculated>> = {
  simple_question: {
    simple: {
      modelConfig: getModelConfiguration("Llama 3.1 Instant"),
      temperature: defaultTemperature,
    },
    moderate: {
      modelConfig: getModelConfiguration("Llama 4 Maverick"),
      temperature: defaultTemperature,
    },
    complex: {
      modelConfig: getModelConfiguration("Llama 4 Maverick"),
      temperature: defaultTemperature,
    },
  },
  general_knowledge: {
    simple: {
      modelConfig: getModelConfiguration("Llama 3.1 Instant"),
      temperature: defaultTemperature,
    },
    moderate: {
      modelConfig: getModelConfiguration("Llama 4 Maverick"),
      temperature: defaultTemperature,
    },
    complex: {
      modelConfig: getModelConfiguration("Gemini 2.5 Flash"),
      temperature: defaultTemperature,
    },
  },
  reasoning: {
    simple: {
      modelConfig: getModelConfiguration("Deepseek R1 Distill"),
      temperature: defaultTemperature,
    },
    moderate: {
      modelConfig: getModelConfiguration("Deepseek R1 0528"),
      temperature: defaultTemperature,
    },
    complex: {
      modelConfig: getModelConfiguration("o3"),
      temperature: defaultTemperature,
    },
  },
  code: {
    simple: {
      modelConfig: getModelConfiguration("Llama 3.1 Instant"),
      temperature: defaultTemperature,
    },
    moderate: {
      modelConfig: getModelConfiguration("GPT 4.1 Mini"),
      temperature: defaultTemperature,
    },
    complex: {
      modelConfig: getModelConfiguration("Claude Sonnet 4"),
      temperature: defaultTemperature,
    },
  },
  creative: {
    simple: {
      modelConfig: getModelConfiguration("Llama 3.1 Instant"),
      temperature: 1,
    },
    moderate: {
      modelConfig: getModelConfiguration("Llama 4 Maverick"),
      temperature: 1,
    },
    complex: {
      modelConfig: getModelConfiguration("Gemini 2.5 Flash"),
      temperature: 1,
    },
  },
  conversational: {
    simple: {
      modelConfig: getModelConfiguration("Llama 3.1 Instant"),
      temperature: 0.8,
    },
    moderate: {
      modelConfig: getModelConfiguration("Llama 4 Maverick"),
      temperature: 0.8,
    },
    complex: {
      modelConfig: getModelConfiguration("Gemini 2.5 Flash"),
      temperature: 0.8,
    },
  },
  translation: {
    simple: {
      modelConfig: getModelConfiguration("Llama 4 Maverick"),
      temperature: defaultTemperature,
    },
    moderate: {
      modelConfig: getModelConfiguration("Gemini 2.5 Flash"),
      temperature: defaultTemperature,
    },
    complex: {
      modelConfig: getModelConfiguration("o4 Mini"),
      temperature: defaultTemperature,
    },
  },
  summarization: {
    simple: {
      modelConfig: getModelConfiguration("Llama 3.1 Instant"),
      temperature: defaultTemperature,
    },
    moderate: {
      modelConfig: getModelConfiguration("Llama 4 Maverick"),
      temperature: defaultTemperature,
    },
    complex: {
      modelConfig: getModelConfiguration("Gemini 2.5 Flash"),
      temperature: defaultTemperature,
    },
  },
};
