import { convertToModelMessages, generateObject } from "ai";
import { z } from "zod";
import type {
  LanguageModelKeys,
  ModelConfiguration,
} from "@/lib/ai/models/definition";
import { languageModelConfigurations } from "@/lib/ai/models/definition";
import type { ChatbotMessage } from "@/lib/ai/types";
import { WEB_SEARCH_TOOL, type Tools } from "@/lib/ai/tools/types";

const CATEGORIES = [
  "factual",
  "analytical",
  "technical",
  "creative",
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
  category: z.enum(CATEGORIES),
  complexity: z.enum(COMPLEXITY_LEVELS),
});

const toolsSchema = z.object({
  tools: z.array(z.enum([WEB_SEARCH_TOOL])),
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

  const modelMessages = convertToModelMessages(userMessages);

  const modelRouterResponse = generateObject({
    ...languageModelConfigurations("GPT OSS Mini"),
    temperature: 0.1,
    schema,
    system: modelRouterSystemPrompt,
    messages: modelMessages,
  }).catch((error) => {
    console.error("Error during model generation:", error);
    return {
      object: {
        category: "other",
        complexity: "simple",
      } satisfies z.infer<typeof schema>,
    } as const;
  });

  const toolsResponse = generateObject({
    ...languageModelConfigurations("GPT OSS Mini"),
    temperature: 0.1,
    schema: toolsSchema,
    system: toolsSystemPrompt,
    messages: modelMessages,
  }).catch((error) => {
    console.error("Error during model generation:", error);
    return {
      object: {
        tools: [],
      } satisfies z.infer<typeof toolsSchema>,
    } as const;
  });

  const [modelResult, toolsResult] = await Promise.all([
    modelRouterResponse,
    toolsResponse,
  ]);

  const { object: classification } = modelResult;
  const { object: toolsDecision } = toolsResult;

  console.log("Classification Result:", classification);
  console.log("Tools Decision Result:", toolsDecision);

  const { category, complexity } = classification;
  const { modelConfiguration } = decisionTree({
    requestedFileTypes,
  })[category][complexity];

  return {
    modelConfiguration,
    tools: [...new Set([...previousTools, ...toolsDecision.tools])],
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
  return (...modelIds: Array<LanguageModelKeys>): ModelConfiguration => {
    const modelSelected =
      modelIds.find((modelId) =>
        requestedFileTypes.every((fileType) =>
          languageModelConfigurations(modelId).supportedFiles?.includes(
            fileType
          )
        )
      ) || "GPT 5 Mini";
    return languageModelConfigurations(modelSelected);
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
    { modelConfiguration: ModelConfiguration }
  >
> => {
  const findModelByRequestedFileTypes =
    findModelWithSupportedFileTypes(requestedFileTypes);
  return {
    factual: {
      simple: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Llama 4 Scout",
          "GPT 5 Nano"
        ),
      },
      moderate: {
        modelConfiguration: findModelByRequestedFileTypes("Llama 4 Maverick"),
      },
      complex: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Kimi K2",
          "Gemini 2.5 Flash"
        ),
      },
      advanced: {
        modelConfiguration: findModelByRequestedFileTypes("Gemini 2.5 Flash"),
      },
    },
    analytical: {
      simple: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Llama 4 Maverick",
          "Gemini 2.5 Flash Lite"
        ),
      },
      moderate: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Qwen3 Next Thinking",
          "GPT 5 Mini"
        ),
      },
      complex: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Grok 4.1 Fast",
          "Gemini 2.5 Flash"
        ),
      },
      advanced: {
        modelConfiguration: findModelByRequestedFileTypes("Grok 4", "GPT 5.1"),
      },
    },
    technical: {
      simple: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Llama 4 Scout",
          "GPT 5 Nano"
        ),
      },
      moderate: {
        modelConfiguration: findModelByRequestedFileTypes(
          "MiniMax M2",
          "GPT 5 Mini"
        ),
      },
      complex: {
        modelConfiguration: findModelByRequestedFileTypes("Claude Sonnet 4.5"),
      },
      advanced: {
        modelConfiguration: findModelByRequestedFileTypes("GPT 5.1"),
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
          ...findModelByRequestedFileTypes(
            "Llama 4 Maverick",
            "Gemini 2.5 Flash"
          ),
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
        modelConfiguration: findModelByRequestedFileTypes("Kimi K2"),
      },
      complex: {
        modelConfiguration: findModelByRequestedFileTypes("GPT OSS"),
      },
      advanced: {
        modelConfiguration: findModelByRequestedFileTypes("Gemini 2.5 Pro"),
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
          ...findModelByRequestedFileTypes("Llama 4 Maverick"),
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
          "Llama 3.1 Instant",
          "GPT 5 Nano"
        ),
      },
      moderate: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Qwen3 Next Instruct"
        ),
      },
      complex: {
        modelConfiguration: findModelByRequestedFileTypes("Gemini 2.5 Flash"),
      },
      advanced: {
        modelConfiguration: findModelByRequestedFileTypes("Gemini 2.5 Pro"),
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
          "Llama 4 Maverick",
          "GPT 5 Mini"
        ),
      },
      advanced: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Llama 4 Maverick",
          "GPT 5 Mini"
        ),
      },
    },
  };
};

const modelRouterSystemPrompt = `\n
  # Query Classification for LLM Routing
  Analyze the user query, and classify it to determine the most appropriate LLM routing.

  ## Classification Requirements

  ### 1. Categories
  Choose the **primary category** based on the query's main intent. If the query fits multiple categories, select the most dominant one and note secondary categories in the reasoning.

  *   **factual**: Direct requests for specific and verifiable information that is timeless, consolidated, or not subject to rapid changes, such as definitions, historical facts, scientific principles, or general knowledge.
  *   **analytical**: Multi-step reasoning, problem-solving, or logical analysis.
  *   **technical**: Programming, debugging, system design, or technical implementation.
  *   **prompt_engineering**: Requests related to designing, optimizing, or analyzing prompts for AI models, including prompt templates, prompt tuning, or prompt best practices.
  *   **conversational**: Casual chat, personal advice, or social interaction.
  *   **processing**: Text transformation, translation, summarization, or data extraction. The original text to process should be included in the query.
  *   **image_generation**: Requests to create visual content (images, graphics, art) from textual descriptions, including style specifications or modifications.
      Examples:
        - "Generate a photorealistic image of a forest at sunset"
        - "Create a logo with a blue wolf and mountains in flat design style"
        - "Edit the attached image to add a rainbow in the sky"
  *   **creative**: Requests for the generation of original, text-based artistic or imaginative content. This includes tasks like writing poetry, stories, scripts, song lyrics, engaging in open-ended brainstorming, or developing novel ideas. This category is distinct from **Image Generation**, which is specific to creating visual assets.
  *   **other**: Queries that don't fit the above (e.g., spam, unclear, or off-topic). Use this sparingly and explain in reasoning.

  ### 2. Complexity Levels
  Assess complexity based on the **nature of the task, required expertise, and expected output structure**, not just query length. Additionally, factor in the **specificity of the query**: If the query is well-specified (clear, detailed, with all necessary context and instructions provided), reduce the complexity level accordingly, as it minimizes the need for assumptions or additional inference. Vague or incomplete queries increase complexity.

  *   **Simple**: Straightforward tasks requiring minimal reasoning or expertise, such as basic facts, simple transformations, or casual responses with clear, direct outputs.
  *   **Moderate**: Tasks involving some analysis or synthesis, moderate expertise (e.g., standard problem-solving or content generation), and structured but not intricate outputs.
  *   **Complex**: Multi-layered tasks needing deeper reasoning, domain-specific knowledge, or integration of multiple elements, resulting in detailed or nuanced outputs.
  *   **Advanced**: Highly intricate tasks demanding expert-level expertise, extensive multi-step reasoning, or innovative problem-solving, often with ambiguous or open-ended outputs requiring significant inference.


  ## 3 Additional Notes
  *   If the query is referencing an image or document, assume the image or document is available for context, even if you don't have it available.
`;

const toolsSystemPrompt = `
  Determine if a user's request necessitates the use of the 'web search' tool.

  The 'web search' tool is designed to perform external web searches to acquire current, dynamic, or specific contextual information that is beyond general model knowledge. Its primary purpose is to provide up-to-date or detailed information to an AI assistant.

  ## Criteria for requiring the 'web search' tool
  -   The request seeks information that is likely to be very recent (e.g., news, current events, latest developments).
  -   The request asks for highly specific data, statistics, or details that may not be part of common general knowledge.
  -   The request implies a need for external validation or up-to-date facts.

  If the request can be adequately and accurately answered using the AI assistant's internal knowledge without needing external verification, the 'web search' tool is NOT required.
`;
