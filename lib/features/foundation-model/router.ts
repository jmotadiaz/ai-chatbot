import { convertToModelMessages, generateText, Output } from "ai";
import { z } from "zod";
import {
  chatModelId,
  chatModelKeys,
  LanguageModelKeys,
  languageModelConfigurations,
} from "./config";
import { CATEGORIES, COMPLEXITY_LEVELS } from "./types";
import type {
  ModelConfiguration,
  ModelRoutingArguments,
  ModelRoutingMetadata,
  ModelRoutingResult,
} from "./types";
import { WEB_SEARCH_TOOL } from "@/lib/features/web-search/constants";
import type { Tools, ChatbotMessage } from "@/lib/features/chat/types";
import {
  modelRouterSystemPrompt,
  toolsSystemPrompt,
} from "@/lib/features/foundation-model/prompts";

// --- Model Routing Logic ---

const schema = z.object({
  category: z.enum(CATEGORIES),
  complexity: z.enum(COMPLEXITY_LEVELS),
});

const toolsSchema = z.object({
  tools: z.array(z.enum([WEB_SEARCH_TOOL])),
});

const findModelWithSupportedFileTypes = (
  fileTypes: Set<Required<ModelConfiguration>["supportedFiles"][number]>,
) => {
  const requestedFileTypes = [...fileTypes];
  return (...modelIds: Array<LanguageModelKeys>): ModelConfiguration => {
    const modelSelected =
      modelIds.find((modelId) =>
        requestedFileTypes.every((fileType) =>
          languageModelConfigurations(modelId).supportedFiles?.includes(
            fileType,
          ),
        ),
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
          "Gemini 2.5 Flash Lite",
        ),
      },
      moderate: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Qwen3 Next Instruct",
        ),
      },
      complex: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Kimi K2",
          "Gemini 3 Flash",
        ),
      },
      advanced: {
        modelConfiguration: findModelByRequestedFileTypes("Gemini 3 Flash"),
      },
    },
    analytical: {
      simple: {
        modelConfiguration: findModelByRequestedFileTypes("GPT OSS Mini"),
      },
      moderate: {
        modelConfiguration: findModelByRequestedFileTypes("GPT OSS"),
      },
      complex: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Grok 4.1 Fast",
          "Gemini 3 Flash",
        ),
      },
      advanced: {
        modelConfiguration: findModelByRequestedFileTypes("GPT 5.2"),
      },
    },
    technical: {
      simple: {
        modelConfiguration: findModelByRequestedFileTypes("GPT OSS Mini"),
      },
      moderate: {
        modelConfiguration: findModelByRequestedFileTypes("MiniMax M2.1"),
      },
      complex: {
        modelConfiguration: findModelByRequestedFileTypes("Claude Sonnet 4.5"),
      },
      advanced: {
        modelConfiguration: findModelByRequestedFileTypes("Claude Opus 4.5"),
      },
    },
    creative: {
      simple: {
        modelConfiguration: {
          ...findModelByRequestedFileTypes("Gemini 2.5 Flash Lite"),
          temperature: 1.5,
        },
      },
      moderate: {
        modelConfiguration: {
          ...findModelByRequestedFileTypes("Qwen3 Next Instruct"),
          temperature: 1.5,
        },
      },
      complex: {
        modelConfiguration: {
          ...findModelByRequestedFileTypes("Gemini 3 Flash"),
          temperature: 1.5,
        },
      },
      advanced: {
        modelConfiguration: {
          ...findModelByRequestedFileTypes("Gemini 3 Flash"),
          temperature: 1.5,
        },
      },
    },
    prompt_engineering: {
      simple: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Qwen3 Next Instruct",
        ),
      },
      moderate: {
        modelConfiguration: findModelByRequestedFileTypes("Kimi K2"),
      },
      complex: {
        modelConfiguration: findModelByRequestedFileTypes("Grok 4.1 Fast"),
      },
      advanced: {
        modelConfiguration: findModelByRequestedFileTypes("GPT 5.2"),
      },
    },
    conversational: {
      simple: {
        modelConfiguration: {
          ...findModelByRequestedFileTypes("Llama 4 Scout", "GPT 5 Nano"),
          temperature: 1,
        },
      },
      moderate: {
        modelConfiguration: {
          ...findModelByRequestedFileTypes("Gemini 2.5 Flash Lite"),
          temperature: 1,
        },
      },
      complex: {
        modelConfiguration: {
          ...findModelByRequestedFileTypes("Gemini 2.5 Flash"),
          temperature: 1,
        },
      },
      advanced: {
        modelConfiguration: {
          ...findModelByRequestedFileTypes("Gemini 3 Flash"),
          temperature: 1,
        },
      },
    },
    processing: {
      simple: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Qwen3 Next Instruct",
        ),
      },
      moderate: {
        modelConfiguration: findModelByRequestedFileTypes("MiMo V2 Flash"),
      },
      complex: {
        modelConfiguration: findModelByRequestedFileTypes("Gemini 3 Flash"),
      },
      advanced: {
        modelConfiguration: findModelByRequestedFileTypes("Gemini 3 Pro"),
      },
    },
    image_generation: {
      simple: {
        modelConfiguration: findModelByRequestedFileTypes("Nano Banana"),
      },
      moderate: {
        modelConfiguration: findModelByRequestedFileTypes("Nano Banana"),
      },
      complex: {
        modelConfiguration: findModelByRequestedFileTypes("Nano Banana"),
      },
      advanced: {
        modelConfiguration: findModelByRequestedFileTypes("Nano Banana"),
      },
    },
    other: {
      simple: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Llama 4 Scout",
          "GPT 5 Nano",
        ),
      },
      moderate: {
        modelConfiguration: findModelByRequestedFileTypes(
          "Llama 4 Scout",
          "GPT 5 Nano",
        ),
      },
      complex: {
        modelConfiguration: findModelByRequestedFileTypes("GPT 5 Mini"),
      },
      advanced: {
        modelConfiguration: findModelByRequestedFileTypes("GPT 5 Mini"),
      },
    },
  };
};

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

  const modelMessages = await convertToModelMessages(userMessages);

  const modelRouterResponse = generateText({
    ...languageModelConfigurations("GPT OSS Mini"),
    output: Output.object({
      schema,
    }),
    system: modelRouterSystemPrompt,
    messages: modelMessages,
  }).catch((error) => {
    console.error("Error during model generation:", error);
    return {
      output: {
        category: "other",
        complexity: "simple",
      } satisfies z.infer<typeof schema>,
    } as const;
  });

  const toolsResponse = generateText({
    ...languageModelConfigurations("GPT OSS Mini"),
    temperature: 0.1,
    output: Output.object({
      schema: toolsSchema,
    }),
    system: toolsSystemPrompt,
    messages: modelMessages,
  }).catch((error) => {
    console.error("Error during model generation:", error);
    return {
      output: {
        tools: [],
      } satisfies z.infer<typeof toolsSchema>,
    } as const;
  });

  const [modelResult, toolsResult] = await Promise.all([
    modelRouterResponse,
    toolsResponse,
  ]);

  const { output: classification } = modelResult;
  const { output: toolsDecision } = toolsResult;

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

// --- Configuration Calculation Helpers ---

export const calculateModelConfiguration = async ({
  selectedModel,
  messages,
  temperature,
  topP,
  topK,
  tools,
}: {
  selectedModel: chatModelId;
  messages: ChatbotMessage[];
  temperature?: number;
  topP?: number;
  topK?: number;
  tools: Tools;
}): Promise<{
  modelConfiguration: ModelConfiguration;
  autoModelMetadata?: ModelRoutingMetadata;
  tools: Tools;
}> => {
  if (selectedModel === "Router") {
    return modelRouting({ messages, tools });
  }
  const modelConfig: ModelConfiguration =
    languageModelConfigurations(selectedModel) ||
    languageModelConfigurations(chatModelKeys[0]);
  return {
    modelConfiguration: {
      ...modelConfig,
      // If overrides are provided, use them; otherwise keep modelConfig values
      temperature: temperature ?? modelConfig.temperature,
      topP: topP ?? modelConfig.topP,
      topK: topK ?? modelConfig.topK,
    },
    tools,
  };
};
