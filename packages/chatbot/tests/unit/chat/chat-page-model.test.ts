import {
  Children,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import { describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  chat: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@/lib/features/auth/with-auth/hoc", () => ({
  withAuth:
    <P,>(Component: (props: P) => unknown) =>
    (props: P) =>
      Component({ ...props, user: { id: "user-1" } }),
}));

vi.mock("@/lib/features/chat/queries", () => ({
  getChatById: vi.fn(async () => mockState.chat),
  getMessagesByChatId: vi.fn(async () => []),
}));

vi.mock("@/lib/features/project/queries", () => ({
  getProjectById: vi.fn(async () => null),
}));

// The page is only evaluated, never rendered: the test reads the props it
// hands to the client tree.
vi.mock("@/components/layout/sidebar/sidebar", () => ({ Sidebar: () => null }));
vi.mock("@/components/chat/lifecycle-shell", () => ({
  ChatLifecycleShell: () => null,
}));
vi.mock("@/app/(chat)/chat-layout", () => ({ ChatLayout: () => null }));

import ChatPage from "@/app/(chat)/chat/[id]/page";
import { ChatLayout } from "@/app/(chat)/chat-layout";
import {
  chatModelKeys,
  defaultModel,
  getChatConfigurationByModelId,
} from "@/lib/features/foundation-model/config";

const chatRow = (defaultModelColumn: string | null) => ({
  id: "chat-1",
  projectId: null,
  chatMode: "auto",
  defaultModel: defaultModelColumn,
  defaultTemperature: null,
  defaultTopP: null,
  defaultTopK: null,
  webSearchNumResults: null,
  ragMaxResources: null,
  minRagResourcesScore: null,
});

const loadChatConfig = async (row: ReturnType<typeof chatRow>) => {
  mockState.chat = row;
  const page = ChatPage as unknown as (props: {
    params: Promise<{ id: string }>;
  }) => Promise<ReactElement<{ children: ReactNode }>>;

  const tree = await page({ params: Promise.resolve({ id: row.id }) });
  const layout = Children.toArray(tree.props.children).find(
    (child): child is ReactElement<ComponentProps<typeof ChatLayout>> =>
      isValidElement(child) && child.type === ChatLayout,
  );
  return layout!.props.chatConfig;
};

// Chat.defaultModel is a nullable varchar. Seeded rows (the e2e fixtures)
// leave it NULL, and catalog retunes retire ids that older chats still
// reference. Handed to the client unresolved, useChatConfig called
// getChatConfigurationByModelId with it, which throws "Model null not found in
// MODEL_CATALOG", so the chat never rendered its messages.
describe("chat page model selection", () => {
  it("opens a chat whose row has no model with the default model", async () => {
    const { selectedModel } = await loadChatConfig(chatRow(null));

    expect(selectedModel).toBe(defaultModel);
    expect(() => getChatConfigurationByModelId(selectedModel!)).not.toThrow();
  });

  it("opens a chat whose model left the catalog with the default model", async () => {
    const { selectedModel } = await loadChatConfig(chatRow("Retired Model 0.9"));

    expect(selectedModel).toBe(defaultModel);
  });

  it("keeps the chat's model while it is still selectable", async () => {
    const selectable = chatModelKeys.at(-1)!;

    const { selectedModel } = await loadChatConfig(chatRow(selectable));

    expect(selectedModel).toBe(selectable);
  });
});
