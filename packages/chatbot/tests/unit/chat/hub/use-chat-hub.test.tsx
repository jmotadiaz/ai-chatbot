/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FormEvent, ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { ModelCatalogProvider } from "@/lib/features/foundation-model/model-catalog-context";
import type { GatewayModelEntry } from "@/lib/features/foundation-model/config";
import type { HubInstance, SubmitMessage } from "@/lib/features/chat/hub/types";
import { useChatHub } from "@/lib/features/chat/hub/hooks/use-chat-hub";
import { persistHubChatFromTranscript } from "@/lib/features/chat/hub/actions";
import { deleteChat } from "@/lib/features/chat/actions";

vi.mock("@/lib/features/chat/hub/actions", () => ({
  persistHubChatFromTranscript: vi.fn(async ({ chatId }: { chatId: string }) => ({
    chatId,
  })),
}));
vi.mock("@/lib/features/chat/actions", () => ({
  deleteChat: vi.fn(async () => undefined),
}));

const model = (id: string): GatewayModelEntry => ({
  id,
  company: "test",
  isDefault: false,
  contextWindow: 8192,
  maxTokens: 1024,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  reasoning: false,
  thinkingLevels: [],
  defaultThinkingLevel: null,
  supportedFiles: [],
  supportedOutput: ["text"],
  zeroDataRetention: false,
  temperature: null,
  topP: null,
  topK: null,
});

const MODEL_IDS = ["model-a", "model-b", "model-c", "model-d"];
const catalog = MODEL_IDS.map(model);
const wrapper = ({ children }: { children: ReactNode }) => (
  <ModelCatalogProvider catalog={catalog}>{children}</ModelCatalogProvider>
);
const submitEvent = { preventDefault: () => {} } as FormEvent<HTMLFormElement>;
const persistArgs = (chatId: string) => ({
  chatId,
  messages: [],
  model: "model-a",
  chatMode: "auto" as const,
});
const instanceIdAt = (instances: HubInstance[], index: number): string => {
  const chatId = instances[index]?.chatId;
  if (!chatId) throw new Error(`expected a hub instance at index ${index}`);
  return chatId;
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useChatHub", () => {
  it("caps the Hub at three instances and frees a slot when one is removed", async () => {
    const { result } = renderHook(() => useChatHub(), { wrapper });
    expect(result.current.availableModels).toEqual(MODEL_IDS);
    act(() => result.current.addInstance("model-a"));
    act(() => result.current.addInstance("model-b"));
    act(() => result.current.addInstance("model-c"));
    expect(result.current.instances).toHaveLength(3);
    expect(result.current.availableModels).toEqual([]);
    act(() => result.current.addInstance("model-d"));
    expect(result.current.instances).toHaveLength(3);
    const lastId = instanceIdAt(result.current.instances, 2);
    await act(async () => {
      await result.current.removeInstance(lastId);
    });
    expect(result.current.instances).toHaveLength(2);
    expect(result.current.availableModels).toEqual(MODEL_IDS);
    act(() => result.current.addInstance("model-d"));
    expect(result.current.instances).toHaveLength(3);
  });

  it("locks the comparison set after the first send and fans the message out", async () => {
    const { result } = renderHook(() => useChatHub(), { wrapper });
    act(() => result.current.addInstance("model-a"));
    const handler = vi.fn<(message: SubmitMessage) => Promise<void>>(async () => {});
    act(() => {
      result.current.submitSubscribe(handler);
    });
    act(() => result.current.setInput("hello hub"));
    await act(async () => {
      await result.current.handleSubmit(submitEvent);
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]).toMatchObject({
      role: "user",
      parts: [{ type: "text", text: "hello hub" }],
    });
    expect(result.current.instancesLocked).toBe(true);
    expect(result.current.availableModels).toEqual([]);
    expect(result.current.input).toBe("");
    act(() => result.current.addInstance("model-b"));
    expect(result.current.instances).toHaveLength(1);
  });

  it("does not send or lock when the input is empty", async () => {
    const { result } = renderHook(() => useChatHub(), { wrapper });
    act(() => result.current.addInstance("model-a"));
    const handler = vi.fn<(message: SubmitMessage) => Promise<void>>(async () => {});
    act(() => {
      result.current.submitSubscribe(handler);
    });
    await act(async () => {
      await result.current.handleSubmit(submitEvent);
    });
    expect(handler).not.toHaveBeenCalled();
    expect(result.current.instancesLocked).toBe(false);
  });

  it("deletes only persisted chats when an instance is removed", async () => {
    const { result } = renderHook(() => useChatHub(), { wrapper });
    act(() => result.current.addInstance("model-a"));
    act(() => result.current.addInstance("model-b"));
    const persistedId = instanceIdAt(result.current.instances, 0);
    const transientId = instanceIdAt(result.current.instances, 1);
    await act(async () => {
      await result.current.persistChat(persistArgs(persistedId));
    });
    expect(result.current.isChatPersisted(persistedId)).toBe(true);
    expect(persistHubChatFromTranscript).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.removeInstance(transientId);
    });
    expect(deleteChat).not.toHaveBeenCalled();
    expect(result.current.instances.map((i) => i.chatId)).toEqual([persistedId]);
    await act(async () => {
      await result.current.removeInstance(persistedId);
    });
    expect(deleteChat).toHaveBeenCalledTimes(1);
    expect(deleteChat).toHaveBeenCalledWith(persistedId);
    expect(result.current.instances).toEqual([]);
    expect(result.current.isChatPersisted(persistedId)).toBe(false);
  });

  it("rejects a second persist while one is in flight and blocks new instances", async () => {
    const { result } = renderHook(() => useChatHub(), { wrapper });
    act(() => result.current.addInstance("model-a"));
    const chatId = instanceIdAt(result.current.instances, 0);
    let resolvePersist!: (value: { chatId: string }) => void;
    vi.mocked(persistHubChatFromTranscript).mockImplementationOnce(
      () => new Promise<{ chatId: string }>((resolve) => {
        resolvePersist = resolve;
      }),
    );
    let inFlight!: Promise<unknown>;
    act(() => {
      inFlight = result.current.persistChat(persistArgs(chatId));
    });
    expect(result.current.isPersisting).toBe(true);
    expect(result.current.persistingChatId).toBe(chatId);
    await expect(result.current.persistChat(persistArgs(chatId))).rejects.toThrow(
      "Already persisting a chat",
    );
    act(() => result.current.addInstance("model-b"));
    expect(result.current.instances).toHaveLength(1);
    await act(async () => {
      resolvePersist({ chatId });
      await inFlight;
    });
    expect(result.current.isPersisting).toBe(false);
    expect(result.current.isChatPersisted(chatId)).toBe(true);
  });
});
