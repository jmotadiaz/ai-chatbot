import { describe, expect, it, vi } from "vitest";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3, LanguageModelV3CallOptions } from "@ai-sdk/provider";
import { finishChunk, textChunks } from "inference/testing";
import type { ChatAgentAiPort } from "@/lib/features/chat/conversation/ports";
import type { ModelConfiguration } from "@/lib/features/foundation-model/types";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import { createChatModeAgent } from "@/lib/features/chat/chat-modes/factory";

// The neutral branch is tool-less on purpose; memory retrieval would otherwise
// hit the embedding provider, so it is stubbed for this seam-level test.
vi.mock("@/lib/features/memory/retrieval", () => ({
  getRelevantMemory: vi.fn(async () => null),
}));

const USER_ID = "11111111-1111-1111-1111-111111111111";

const userMessage = (text: string): ChatbotMessage => ({
  id: "user-1",
  role: "user",
  parts: [{ type: "text", text }],
});

const createRecordingModel = (modelId: string, calls: LanguageModelV3CallOptions[]) =>
  new MockLanguageModelV3({
    modelId,
    doStream: async (options) => {
      calls.push(options);
      return {
        stream: simulateReadableStream({
          chunks: [...textChunks("text-1", "Hola"), finishChunk("stop")],
        }),
        rawCall: { rawPrompt: null, rawSettings: {} },
      };
    },
  }) as unknown as LanguageModelV3;

const configuration = (model: LanguageModelV3): ModelConfiguration => ({
  model,
  company: "openai",
});

const createFakePort = ({
  neutral,
  context7,
}: {
  neutral: ModelConfiguration;
  context7?: ModelConfiguration;
}): ChatAgentAiPort => ({
  getRagModelConfiguration: () => neutral,
  getWebSearchModelConfiguration: () => neutral,
  getContext7ModelConfiguration: () => context7 ?? neutral,
  getProjectModelConfiguration: () => neutral,
  getNeutralModelConfiguration: vi.fn(() => neutral),
});

/** Types of every chunk the agent writes to its UI message stream. */
const collectUiPartTypes = async (
  agent: Awaited<ReturnType<typeof createChatModeAgent>>,
) => {
  const result = await agent.stream({
    messages: [{ role: "user", content: "hola" }],
  });
  const reader = result.toUIMessageStream().getReader();
  const types: string[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value?.type) types.push(value.type);
  }

  return types;
};

describe("neutral chat mode branch", () => {
  it("answers without offering a single tool, using the port's configuration", async () => {
    const calls: LanguageModelV3CallOptions[] = [];
    const model = createRecordingModel("neutral-model", calls);
    const neutral = {
      ...configuration(model),
      temperature: 0.3,
      topP: 0.9,
    };
    const ai = createFakePort({ neutral });

    const agent = await createChatModeAgent({
      ai,
      chatMode: "neutral",
      messages: [userMessage("hola, ¿cómo estás?")],
      userId: USER_ID,
      webSearchNumResults: 4,
    });

    expect(vi.mocked(ai.getNeutralModelConfiguration)).toHaveBeenCalledTimes(1);
    expect(Object.keys(agent.tools ?? {})).toEqual([]);

    const uiPartTypes = await collectUiPartTypes(agent);
    expect(uiPartTypes.filter((type) => type.startsWith("tool-"))).toEqual([]);
    expect(uiPartTypes).toContain("text-delta");

    // The model was never offered a tool either, and kept the user's config.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.tools ?? []).toEqual([]);
    expect(calls[0]!.temperature).toBe(0.3);
    expect(calls[0]!.topP).toBe(0.9);
  });

  it("degrades a bare auto mode to the same tool-less branch", async () => {
    const calls: LanguageModelV3CallOptions[] = [];
    const ai = createFakePort({
      neutral: configuration(createRecordingModel("neutral-model", calls)),
    });

    const agent = await createChatModeAgent({
      ai,
      chatMode: "auto",
      messages: [userMessage("charla")],
      userId: USER_ID,
      webSearchNumResults: 4,
    });

    expect(vi.mocked(ai.getNeutralModelConfiguration)).toHaveBeenCalledTimes(1);
    expect(Object.keys(agent.tools ?? {})).toEqual([]);

    await collectUiPartTypes(agent);
    expect(calls[0]!.tools ?? []).toEqual([]);
  });

  it("keeps tools on the Context7 branch, as a contrast", async () => {
    const calls: LanguageModelV3CallOptions[] = [];
    const ai = createFakePort({
      neutral: configuration(createRecordingModel("neutral-model", calls)),
      context7: configuration(createRecordingModel("context7-model", calls)),
    });

    const agent = await createChatModeAgent({
      ai,
      chatMode: "context7",
      messages: [userMessage("¿Cómo uso drizzle-kit?")],
      userId: USER_ID,
      webSearchNumResults: 4,
    });

    expect(Object.keys(agent.tools ?? {}).length).toBeGreaterThan(0);

    await collectUiPartTypes(agent);
    expect(calls[0]!.tools?.length).toBeGreaterThan(0);
  });
});
