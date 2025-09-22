import { convertToModelMessages, generateObject } from "ai";
import { z } from "zod";
import {
  languageModelConfigurations,
  ModelConfiguration,
} from "@/lib/ai/models/definition";
import { ChatbotMessage } from "@/lib/ai/types";
import { Tools } from "@/lib/ai/tools/types";
import { zodToPrompt } from "@/lib/ai/utils";

const CATEGORIES = [
  "current_news",
  "factual",
  "analytical",
  "technical",
  "creative",
  "structured_content",
  "prompt_engineering",
  "image_generation",
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

export interface ModelRoutingMetadata {
  category: (typeof CATEGORIES)[number];
  complexity: (typeof COMPLEXITY_LEVELS)[number];
  model: string;
}

export interface ModelRoutingArguments {
  messages: ChatbotMessage[];
  tools?: Tools;
}

export interface ModelRoutingResult {
  modelConfiguration: ModelConfiguration;
  autoModelMetadata: ModelRoutingMetadata;
  tools: Tools;
}
export async function modelRouting({
  messages,
  tools: previousTools = [],
}: ModelRoutingArguments): Promise<ModelRoutingResult> {
  if (messages.length === 0) {
    throw new Error("Query cannot be empty");
  }

  const requestedFileTypes = new Set<
    Required<ModelConfiguration>["supportedFiles"][number]
  >();

  const userMessages = messages.reduce((memo, message) => {
    if (message.role === "user") {
      memo.push({
        ...message,
        parts: message.parts.filter((part) => {
          const hasFile = part.type === "file";
          if (hasFile) {
            if (part.mediaType.includes("image/"))
              requestedFileTypes.add("img");
            if (
              part.mediaType.includes("application/") ||
              part.mediaType.includes("text/")
            )
              requestedFileTypes.add("pdf");
          }

          return !hasFile;
        }),
      });
    } else {
      message.parts.forEach((part) => {
        if (part.type === "file") {
          if (part.mediaType.includes("image/")) requestedFileTypes.add("img");
          if (
            part.mediaType.includes("application/") ||
            part.mediaType.includes("text/")
          )
            requestedFileTypes.add("pdf");
        }
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
  const { modelConfiguration, tools = [] } = decisionTree({
    requestedFileTypes,
  })[category][complexity];

  return {
    modelConfiguration,
    tools: [...new Set([...previousTools, ...tools])],
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

const findModelWithSupportedFileTypes = (
  fileTypes: Set<Required<ModelConfiguration>["supportedFiles"][number]>
) => {
  const requestedFileTypes = [...fileTypes];
  return (
    ...modelIds: Array<keyof typeof languageModelConfigurations>
  ): ModelConfiguration => {
    const modelSelected =
      modelIds.find((modelId) =>
        requestedFileTypes.every((fileType) =>
          languageModelConfigurations[modelId].supportedFiles?.includes(
            fileType
          )
        )
      ) || "GPT 5 Mini";
    return languageModelConfigurations[modelSelected];
  };
};

const decisionTree = ({
  requestedFileTypes,
}: {
  requestedFileTypes: Set<
    Required<ModelConfiguration>["supportedFiles"][number]
  >;
}): Record<
  (typeof CATEGORIES)[number],
  Record<
    (typeof COMPLEXITY_LEVELS)[number],
    { modelConfiguration: ModelConfiguration; tools?: Tools }
  >
> => {
  const findModelByRequestedFileTypes =
    findModelWithSupportedFileTypes(requestedFileTypes);
  return {
    current_news: {
      simple: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Llama 3.1 Instant",
          "Llama 4 Scout",
          "GPT 5 Nano"
        ),
        tools: ["webSearch"],
      },
      moderate: {
        modelConfiguration: findModelByRequestedFileTypes("Llama 4 Scout"),
        tools: ["webSearch"],
      },
      complex: {
        modelConfiguration: findModelByRequestedFileTypes("Llama 4"),
        tools: ["webSearch"],
      },
      advanced: {
        modelConfiguration: findModelByRequestedFileTypes("Gemini 2.5 Pro"),
        tools: ["webSearch"],
      },
    },
    factual: {
      simple: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Llama 3.1 Instant",
          "Llama 4 Scout",
          "GPT 5 Nano"
        ),
      },
      moderate: {
        modelConfiguration: findModelByRequestedFileTypes("Llama 4 Scout"),
      },
      complex: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Llama 4",
          "Gemini 2.5 Flash"
        ),
      },
      advanced: {
        modelConfiguration: findModelByRequestedFileTypes("Gemini 2.5 Pro"),
      },
    },
    analytical: {
      simple: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Llama 4",
          "Gemini 2.5 Flash Lite"
        ),
      },
      moderate: {
        modelConfiguration: findModelByRequestedFileTypes(
          "GPT OSS Mini",
          "GPT 5 Mini"
        ),
      },
      complex: {
        modelConfiguration: findModelByRequestedFileTypes(
          "GPT OSS",
          "Gemini 2.5 Flash"
        ),
      },
      advanced: {
        modelConfiguration: findModelByRequestedFileTypes("Grok 4"),
      },
    },
    technical: {
      simple: {
        modelConfiguration: findModelByRequestedFileTypes(
          "GPT OSS Mini",
          "GPT 5 Nano"
        ),
      },
      moderate: {
        modelConfiguration: findModelByRequestedFileTypes(
          "GPT OSS",
          "GPT 5 Mini"
        ),
      },
      complex: {
        modelConfiguration: findModelByRequestedFileTypes("Claude Sonnet 4"),
      },
      advanced: {
        modelConfiguration: findModelByRequestedFileTypes("Claude Opus 4.1"),
      },
    },
    creative: {
      simple: {
        modelConfiguration: {
          ...findModelByRequestedFileTypes(
            "Llama 3.1 Instant",
            "Llama 4 Scout",
            "Gemini 2.5 Flash Lite"
          ),
          temperature: 1.5,
        },
      },
      moderate: {
        modelConfiguration: {
          ...findModelByRequestedFileTypes("Gemini 2.5 Flash Lite"),
          temperature: 1.5,
        },
      },
      complex: {
        modelConfiguration: {
          ...findModelByRequestedFileTypes("Llama 4", "Gemini 2.5 Flash"),
          temperature: 1.5,
        },
      },
      advanced: {
        modelConfiguration: {
          ...findModelByRequestedFileTypes("Gemini 2.5 Flash"),
          temperature: 1.5,
        },
      },
    },
    prompt_engineering: {
      simple: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Llama 4 Scout",
          "GPT 5 Nano"
        ),
      },
      moderate: {
        modelConfiguration: findModelByRequestedFileTypes("GPT OSS Mini"),
      },
      complex: {
        modelConfiguration: findModelByRequestedFileTypes("GPT OSS"),
      },
      advanced: {
        modelConfiguration: findModelByRequestedFileTypes("Gemini 2.5 Pro"),
      },
    },
    structured_content: {
      simple: {
        modelConfiguration: {
          ...findModelByRequestedFileTypes("Llama 4 Scout", "GPT 5 Nano"),
          temperature: 0.7,
        },
      },
      moderate: {
        modelConfiguration: {
          ...findModelByRequestedFileTypes("Gemini 2.0 Flash"),
          temperature: 0.7,
        },
      },
      complex: {
        modelConfiguration: {
          ...findModelByRequestedFileTypes("Kimi K2"),
          temperature: 0.7,
        },
      },
      advanced: {
        modelConfiguration: {
          ...findModelByRequestedFileTypes("Gemini 2.5 Pro"),
          temperature: 0.7,
        },
      },
    },
    conversational: {
      simple: {
        modelConfiguration: {
          ...findModelByRequestedFileTypes(
            "Llama 3.1 Instant",
            "Llama 4 Scout",
            "GPT 5 Nano"
          ),
          temperature: 1,
        },
      },
      moderate: {
        modelConfiguration: {
          ...findModelByRequestedFileTypes(
            "Llama 4 Scout",
            "Gemini 2.5 Flash Lite"
          ),
          temperature: 1,
        },
      },
      complex: {
        modelConfiguration: {
          ...findModelByRequestedFileTypes("Llama 4"),
          temperature: 1,
        },
      },
      advanced: {
        modelConfiguration: {
          ...findModelByRequestedFileTypes("Gemini 2.5 Flash"),
          temperature: 1,
        },
      },
    },
    processing: {
      simple: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Llama 4 Scout",
          "GPT 5 Nano"
        ),
      },
      moderate: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Gemini 2.5 Flash Lite"
        ),
      },
      complex: {
        modelConfiguration: findModelByRequestedFileTypes("Gemini 2.0 Flash"),
      },
      advanced: {
        modelConfiguration: findModelByRequestedFileTypes("Gemini 2.5 Flash"),
      },
    },
    image_generation: {
      simple: {
        modelConfiguration: findModelByRequestedFileTypes("Gemini Nano Banana"),
      },
      moderate: {
        modelConfiguration: findModelByRequestedFileTypes("Gemini Nano Banana"),
      },
      complex: {
        modelConfiguration: findModelByRequestedFileTypes("Gemini Nano Banana"),
      },
      advanced: {
        modelConfiguration: findModelByRequestedFileTypes("Gemini Nano Banana"),
      },
    },
    other: {
      simple: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Llama 3.1 Instant",
          "Llama 4 Scout",
          "GPT 5 Nano"
        ),
      },
      moderate: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Llama 3.1 Instant",
          "Llama 4 Scout",
          "GPT 5 Nano"
        ),
      },
      complex: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Llama 4",
          "GPT 5 Mini"
        ),
      },
      advanced: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Llama 4",
          "GPT 5 Mini"
        ),
      },
    },
  };
};

const systemPrompt = `\n
  # Query Classification for LLM Routing
  Analyze the user query, and classify it to determine the most appropriate LLM routing.
  ${zodToPrompt(schema)}

  ## Classification Requirements

  ### 1. Categories

  Choose the **primary category** based on the query's main intent. If the query fits multiple categories, select the most dominant one and note secondary categories in the reasoning.

  *   **Current News**: Requests for information about recent events, breaking news, current developments, updates, latest versions, real-time status, or any topic requiring up-to-date data subject to rapid changes. Excludes stable, timeless, or historical knowledge not dependent on immediacy.
  *   **Factual**: Direct requests for specific and verifiable information that is timeless, consolidated, or not subject to rapid changes, such as definitions, historical facts, scientific principles, or general knowledge. Does not apply to latest updates, current news, ongoing developments, or anything requiring real-time verification.
  *   **Analytical**: Multi-step reasoning, problem-solving, or logical analysis.
  *   **Technical**: Programming, debugging, system design, or technical implementation.
  *   **Structured Content**: Requests to create organized, educational, or instructional materials (e.g., guides, tutorials, lesson plans, checklists, templates).
  *   **Prompt Engineering**: Requests related to designing, optimizing, or analyzing prompts for AI models, including prompt templates, prompt tuning, or prompt best practices.
  *   **Conversational**: Casual chat, personal advice, or social interaction.
  *   **Processing**: Text transformation, translation, summarization, or data extraction. The original text to process should be included in the query.
  *   **Image Generation**: Requests to create visual content (images, graphics, art) from textual descriptions, including style specifications or modifications.
      Examples:
        - "Generate a photorealistic image of a forest at sunset"
        - "Create a logo with a blue wolf and mountains in flat design style"
        - "Edit the attached image to add a rainbow in the sky"
  *   **Creative**: Requests for the generation of original, text-based artistic or imaginative content. This includes tasks like writing poetry, stories, scripts, song lyrics, engaging in open-ended brainstorming, or developing novel ideas. This category is distinct from **Image Generation**, which is specific to creating visual assets.
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
      *   **Estimated effort**: Very high.

  ### 3. Reasoning
  Provide a brief reasoning (1-3 sentences) explaining only the classification and complexity drivers

  ## 4 Additional Notes
  *   If the query is referencing an image or document, assume the image or document is available for context, even if you don't have it available.
`;
