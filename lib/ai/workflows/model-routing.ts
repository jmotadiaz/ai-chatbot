import { convertToModelMessages, generateObject } from "ai";
import { z } from "zod";
import type {
  LanguageModelKeys,
  ModelConfiguration,
} from "@/lib/ai/models/definition";
import { languageModelConfigurations } from "@/lib/ai/models/definition";
import type { ChatbotMessage } from "@/lib/ai/types";
import type { Tools } from "@/lib/ai/tools/types";

const CATEGORIES = [
  "current_news",
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
    ...languageModelConfigurations("GPT OSS Mini"),
    temperature: 0.1,
    schema,
    system: systemPrompt,
    messages: convertToModelMessages(userMessages),
  }).catch((error) => {
    console.error("Error during model generation:", error);
    return {
      object: {
        category: "other",
        complexity: "simple",
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
  return (...modelIds: Array<LanguageModelKeys>): ModelConfiguration => {
    const modelSelected =
      modelIds.find((modelId) =>
        requestedFileTypes.every((fileType) =>
          languageModelConfigurations(modelId).supportedFiles?.includes(
            fileType
          )
        )
      ) || "GPT 5 Mini";
    const config = languageModelConfigurations(modelSelected);

    console.log(config.model);

    return config;
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
        modelConfiguration: findModelByRequestedFileTypes("Llama 4 Maverick"),
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
          "Grok 4 Fast",
          "Gemini 2.5 Flash"
        ),
      },
      advanced: {
        modelConfiguration: findModelByRequestedFileTypes("Grok 4", "GPT 5"),
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
          "Qwen3 Coder",
          "GPT 5 Mini"
        ),
      },
      complex: {
        modelConfiguration: findModelByRequestedFileTypes("Claude Sonnet 4.5"),
      },
      advanced: {
        modelConfiguration: findModelByRequestedFileTypes("GPT 5"),
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

const systemPrompt = `\n
  # Query Classification for LLM Routing
  Analyze the user query, and classify it to determine the most appropriate LLM routing.

  ## Classification Requirements

  ### 1. Categories
  Choose the **primary category** based on the query's main intent. If the query fits multiple categories, select the most dominant one and note secondary categories in the reasoning.

  *   **current_news**: Requests for information about recent events, breaking news, current developments, updates, latest versions, real-time status, or any topic requiring up-to-date data subject to rapid changes. Excludes stable, timeless, or historical knowledge not dependent on immediacy.
  *   **factual**: Direct requests for specific and verifiable information that is timeless, consolidated, or not subject to rapid changes, such as definitions, historical facts, scientific principles, or general knowledge. Does not apply to latest updates, current news, ongoing developments, or anything requiring real-time verification.
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
