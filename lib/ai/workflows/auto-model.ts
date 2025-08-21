import { convertToModelMessages, generateObject } from "ai";
import { z } from "zod";
import {
  languageModelConfigurations,
  ModelConfiguration,
} from "@/lib/ai/models/definition";
import { ChatbotMessage } from "@/lib/ai/types";

const CATEGORIES = [
  "factual",
  "analytical",
  "technical",
  "creative",
  "structured_content",
  "prompt_engineering",
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
  reasoningText: z.string(),
  category: z.enum(CATEGORIES),
  complexity: z.enum(COMPLEXITY_LEVELS),
});

export interface AutoModelMetadata {
  category: (typeof CATEGORIES)[number];
  complexity: (typeof COMPLEXITY_LEVELS)[number];
  model: string;
}

export async function autoModel(messages: ChatbotMessage[]): Promise<{
  modelConfiguration: ModelConfiguration;
  autoModelMetadata: AutoModelMetadata;
}> {
  if (messages.length === 0) {
    throw new Error("Query cannot be empty");
  }

  const { object: classification } = await generateObject({
    ...languageModelConfigurations["GPT OSS Mini"],
    schema,
    system: systemPrompt,
    messages: convertToModelMessages(messages.filter((m) => m.role === "user")),
  }).catch((error) => {
    console.error("Error during model generation:", error);
    return {
      object: {
        category: "other",
        complexity: "simple",
        reasoningText: "Default classification due to error",
      } satisfies z.infer<typeof schema>,
    } as const;
  });

  console.log("Classification Result:", classification);

  const { category, complexity } = classification;
  const modelConfiguration = decisionTree[category][complexity];

  return {
    modelConfiguration,
    autoModelMetadata: {
      category,
      complexity,
      model:
        typeof modelConfiguration.model === "string"
          ? modelConfiguration.model
          : modelConfiguration.model.modelId,
    },
  };
}

const decisionTree: Record<string, Record<string, ModelConfiguration>> = {
  factual: {
    simple: {
      ...languageModelConfigurations["Sonar"],
    },
    moderate: {
      ...languageModelConfigurations["Sonar"],
    },
    complex: {
      ...languageModelConfigurations["Sonar Pro"],
    },
    advanced: {
      ...languageModelConfigurations["Sonar Pro"],
    },
  },
  analytical: {
    simple: {
      ...languageModelConfigurations["Llama 4"],
    },
    moderate: {
      ...languageModelConfigurations["GPT OSS Mini"],
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
      ...languageModelConfigurations["Llama 4 Scout"],
    },
    moderate: {
      ...languageModelConfigurations["GPT OSS Mini"],
    },
    complex: {
      ...languageModelConfigurations["GPT OSS"],
    },
    advanced: {
      ...languageModelConfigurations["GPT 5"],
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
      ...languageModelConfigurations["Llama 4"],
      temperature: 1,
    },
    advanced: {
      ...languageModelConfigurations["Gemini 2.5 Flash"],
      temperature: 1,
    },
  },
  prompt_engineering: {
    simple: {
      ...languageModelConfigurations["Llama 3.1 Instant"],
    },
    moderate: {
      ...languageModelConfigurations["Llama 4"],
    },
    complex: {
      ...languageModelConfigurations["Qwen 3"],
    },
    advanced: {
      ...languageModelConfigurations["GPT 5"],
    },
  },
  structured_content: {
    simple: {
      ...languageModelConfigurations["Llama 3.3 Versatile"],
      temperature: 0.7,
    },
    moderate: {
      ...languageModelConfigurations["Gemini 2.5 Flash Lite"],
      temperature: 0.7,
    },
    complex: {
      ...languageModelConfigurations["Gemini 2.5 Flash"],
      temperature: 0.7,
    },
    advanced: {
      ...languageModelConfigurations["Gemini 2.5 Pro"],
      temperature: 0.7,
    },
  },
  conversational: {
    simple: {
      ...languageModelConfigurations["Llama 3.1 Instant"],
      temperature: 1,
    },
    moderate: {
      ...languageModelConfigurations["Llama 3.3 Versatile"],
      temperature: 1,
    },
    complex: {
      ...languageModelConfigurations["Llama 4"],
      temperature: 1,
    },
    advanced: {
      ...languageModelConfigurations["Gemini 2.5 Flash"],
      temperature: 1,
    },
  },
  processing: {
    simple: {
      ...languageModelConfigurations["Llama 3.3 Versatile"],
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
      ...languageModelConfigurations["Llama 3.1 Instant"],
    },
    complex: {
      ...languageModelConfigurations["Llama 3.3 Versatile"],
    },
    advanced: {
      ...languageModelConfigurations["Llama 3.3 Versatile"],
    },
  },
} satisfies Record<
  (typeof CATEGORIES)[number],
  Record<(typeof COMPLEXITY_LEVELS)[number], ModelConfiguration>
>;

const systemPrompt = `\n
  # Query Classification for LLM Routing
  Analyze the following user query, included in an XML tag \`<query>\`, and classify it to determine the most appropriate LLM routing. Output your classification in the specified JSON format.
  ## Classification Requirements

  ### 1. Categories

  Choose the **primary category** based on the query's main intent. If the query fits multiple categories, select the most dominant one and note secondary categories in the reasoning.

  *   **Factual**: Direct requests or questions seeking specific, verifiable information, such as facts, real data or news reports.
  *   **Analytical**: Multi-step reasoning, problem-solving, or logical analysis.
  *   **Technical**: Programming, debugging, system design, or technical implementation.
  *   **Creative**: Artistic content generation, open-ended writing, or brainstorming.
  *   **Structured Content**: Requests to create organized, educational, or instructional materials (e.g., guides, tutorials, lesson plans, checklists, templates).
  *   **Prompt Engineering**: Requests related to designing, optimizing, or analyzing prompts for AI models, including prompt templates, prompt tuning, or prompt best practices.
  *   **Conversational**: Casual chat, personal advice, or social interaction.
  *   **Processing**: Text transformation, translation, summarization, or data extraction. The original text to process should be included in the query.
  *   **Other**: Queries that don't fit the above (e.g., spam, unclear, or off-topic). Use this sparingly and explain in reasoning.

  ### 2. Complexity Levels
  Assess complexity based on the **nature of the task, required expertise, and expected output structure**, not just query length. Additionally, factor in the **specificity of the query**: If the query is well-specified (clear, detailed, with all necessary context and instructions provided), reduce the complexity level accordingly, as it minimizes the need for assumptions or additional inference. Vague or incomplete queries increase complexity.

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
  Provide a brief reasoning (1-3 sentences) explaining the classification, focusing on key deciding factors such as query intent, overlaps, and complexity drivers
`;
