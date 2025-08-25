import { convertToModelMessages, generateObject } from "ai";
import { z } from "zod";
import {
  languageModelConfigurations,
  ModelConfiguration,
} from "@/lib/ai/models/definition";
import { ChatbotMessage } from "@/lib/ai/types";
import { RAG_TOOL, Tools } from "@/lib/ai/tools/types";

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

export interface AutoModelArguments {
  messages: ChatbotMessage[];
  tools?: Tools;
}

export interface AutoModelResult {
  modelConfiguration: ModelConfiguration;
  autoModelMetadata: AutoModelMetadata;
}
export async function autoModel({
  messages,
  tools = [],
}: AutoModelArguments): Promise<{
  modelConfiguration: ModelConfiguration;
  autoModelMetadata: AutoModelMetadata;
}> {
  if (messages.length === 0) {
    throw new Error("Query cannot be empty");
  }

  let hasImage = false;
  let hasDocument = false;

  const userMessages = messages.reduce((memo, message) => {
    if (message.role === "user") {
      memo.push({
        ...message,
        parts: message.parts.filter((part) => {
          const hasFile = part.type === "file";
          if (hasFile) {
            if (part.mediaType.includes("image/")) hasImage = true;
            if (
              part.mediaType.includes("application/") ||
              part.mediaType.includes("text/")
            )
              hasDocument = true;
          }

          return !hasFile;
        }),
      });
    }
    return memo;
  }, [] as ChatbotMessage[]);

  const { object: classification } = await generateObject({
    ...languageModelConfigurations["GPT OSS Mini"],
    schema,
    system: systemPrompt,
    messages: convertToModelMessages(userMessages),
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
  const modelConfiguration = decisionTree({ tools, hasDocument, hasImage })[
    category
  ][complexity];

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

const decisionTree = ({
  tools,
  hasDocument,
  hasImage,
}: {
  tools: Tools;
  hasImage: boolean;
  hasDocument: boolean;
}): Record<string, Record<string, ModelConfiguration>> => ({
  factual: {
    simple: {
      ...languageModelConfigurations[
        !hasDocument && !tools.includes(RAG_TOOL)
          ? "Sonar"
          : !hasDocument
          ? "Llama 4 Scout"
          : "Gemini 2.5 Flash Lite"
      ],
    },
    moderate: {
      ...languageModelConfigurations[
        !hasDocument && !tools.includes(RAG_TOOL)
          ? "Sonar"
          : !hasDocument
          ? "Llama 4"
          : "Gemini 2.5 Flash Lite"
      ],
    },
    complex: {
      ...languageModelConfigurations[
        !hasDocument && !tools.includes(RAG_TOOL)
          ? "Sonar Reasoning"
          : "Gemini 2.5 Flash"
      ],
    },
    advanced: {
      ...languageModelConfigurations[
        !hasDocument && !tools.includes(RAG_TOOL) ? "Sonar Reasoning" : "GPT 5"
      ],
    },
  },
  analytical: {
    simple: {
      ...languageModelConfigurations[
        !hasDocument ? "Llama 4" : "Gemini 2.5 Flash Lite"
      ],
    },
    moderate: {
      ...languageModelConfigurations[
        !hasDocument && !hasImage ? "GPT OSS Mini" : "GPT 5 Mini"
      ],
    },
    complex: {
      ...languageModelConfigurations[
        !hasDocument && !hasImage ? "Qwen 3" : "Gemini 2.5 Flash"
      ],
    },
    advanced: {
      ...languageModelConfigurations["Grok 4"],
    },
  },
  technical: {
    simple: {
      ...languageModelConfigurations[
        !hasDocument ? "Llama 4 Scout" : "GPT 5 Mini"
      ],
    },
    moderate: {
      ...languageModelConfigurations[
        !hasDocument && !hasImage ? "GPT OSS Mini High" : "GPT 5 Mini"
      ],
    },
    complex: {
      ...languageModelConfigurations[
        !hasDocument && !hasImage ? "GPT OSS" : "Claude Sonnet 4"
      ],
    },
    advanced: {
      ...languageModelConfigurations["GPT 5"],
    },
  },
  creative: {
    simple: {
      ...languageModelConfigurations[
        !hasImage && !hasDocument
          ? "Llama 3.1 Instant"
          : !hasDocument
          ? "Llama 4 Scout"
          : "Gemini 2.5 Flash Lite"
      ],
      temperature: 1,
    },
    moderate: {
      ...languageModelConfigurations["Gemini 2.5 Flash Lite"],
      temperature: 1,
    },
    complex: {
      ...languageModelConfigurations[
        !hasDocument ? "Llama 4" : "Gemini 2.5 Flash"
      ],
      temperature: 1,
    },
    advanced: {
      ...languageModelConfigurations["Gemini 2.5 Flash"],
      temperature: 1,
    },
  },
  prompt_engineering: {
    simple: {
      ...languageModelConfigurations[
        !hasDocument && !hasImage ? "Llama 3.1 Instant" : "GPT 5 Nano"
      ],
    },
    moderate: {
      ...languageModelConfigurations[!hasDocument ? "Llama 4" : "GPT 5 Mini"],
    },
    complex: {
      ...languageModelConfigurations[
        !hasDocument && !hasImage ? "Qwen 3" : "GPT 5 Mini High"
      ],
    },
    advanced: {
      ...languageModelConfigurations["GPT 5"],
    },
  },
  structured_content: {
    simple: {
      ...languageModelConfigurations[
        !hasDocument ? "Llama 4 Scout" : "GPT 5 Nano"
      ],
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
      ...languageModelConfigurations[
        !hasImage && !hasDocument
          ? "Llama 3.1 Instant"
          : !hasDocument
          ? "Llama 4 Scout"
          : "GPT 5 Nano"
      ],
      temperature: 1,
    },
    moderate: {
      ...languageModelConfigurations[
        !hasDocument ? "Llama 4 Scout" : "Gemini 2.5 Flash Lite"
      ],
      temperature: 1,
    },
    complex: {
      ...languageModelConfigurations[!hasDocument ? "Llama 4" : "GPT 5 Mini"],
      temperature: 1,
    },
    advanced: {
      ...languageModelConfigurations["Gemini 2.5 Flash"],
      temperature: 1,
    },
  },
  processing: {
    simple: {
      ...languageModelConfigurations[
        !hasDocument ? "Llama 4 Scout" : "GPT 5 Nano"
      ],
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
      ...languageModelConfigurations[
        !hasImage && !hasDocument
          ? "Llama 3.1 Instant"
          : !hasDocument
          ? "Llama 4 Scout"
          : "GPT 5 Nano"
      ],
    },
    moderate: {
      ...languageModelConfigurations[
        !hasImage && !hasDocument
          ? "Llama 3.1 Instant"
          : !hasDocument
          ? "Llama 4 Scout"
          : "GPT 5 Nano"
      ],
    },
    complex: {
      ...languageModelConfigurations[!hasDocument ? "Llama 4" : "GPT 5 Mini"],
    },
    advanced: {
      ...languageModelConfigurations[!hasDocument ? "Llama 4" : "GPT 5 Mini"],
    },
  },
});

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

  ## 4 Additional Notes
  *   If the query is referencing a document, assume the document is available for context, even if you don't have it available.
`;
