import { beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_PROMPT } from "@upstash/context7-tools-ai-sdk";
import { textReply } from "@ai-chatbot/model-gateway-testing";
import type {
  ChatRequest,
  GatewayScenario,
} from "@ai-chatbot/model-gateway-testing";
import { createChatModeAgent } from "@/lib/features/chat/chat-modes/factory";
import {
  DEFAULT_PROJECT_AGENT_PROMPT,
  RAG_AGENT_PROMPT,
  WEB_SEARCH_AGENT_PROMPT,
} from "@/lib/features/chat/chat-modes/prompts";
import type { ChatMode, ChatbotMessage } from "@/lib/features/chat/types";
import { RAG_TOOL } from "@/lib/features/rag/constants";
import { WEB_SEARCH_TOOL } from "@/lib/features/web-search/constants";
import { getRelevantMemory } from "@/lib/features/memory/retrieval";
import { getProjectById } from "@/lib/features/project/queries";
import { setupGatewayHarness } from "@/tests/helpers/gateway-harness";
import { TEST_MODELS } from "@/tests/mocks/gateway/catalog";

/**
 * Social unit tests of the Chat Mode composition at the Model Gateway HTTP seam
 * (ADR 0013): `createChatModeAgent` is the real dispatcher every turn goes
 * through, each branch builds its agent through the shared kit, and the
 * assertions read which instructions/tools/memory context reached
 * `POST /v1/chat/completions` — not whole prompts. There is no AI port to fake.
 *
 * Only the two collaborators that are NOT inference are stubbed: memory
 * retrieval (embeddings + PGlite) and the project lookup (PGlite). Both are
 * covered by their own suites; here they are the inputs of the composition.
 *
 * These tests pass with no gateway listening on `:4001`.
 */
const MEMORY_CONTEXT = "MEMORY: the user prefers concise answers.";

vi.mock("@/lib/features/memory/retrieval", () => ({
  getRelevantMemory: vi.fn(async () => null),
}));

vi.mock("@/lib/features/project/queries", () => ({
  getProjectById: vi.fn(async () => null),
}));

const gateway = setupGatewayHarness();

const USER_ID = "11111111-1111-1111-1111-111111111111";
const PROJECT_ID = "22222222-2222-2222-2222-222222222222";
const SELECTED_MODEL = TEST_MODELS[0]!.id;

const userMessage = (text: string): ChatbotMessage => ({
  id: "user-1",
  role: "user",
  parts: [{ type: "text", text }],
});

const chatBodies = (scenario: GatewayScenario): ChatRequest[] =>
  scenario.requests
    .filter((request) => request.path === "/v1/chat/completions")
    .map((request) => request.body as ChatRequest);

const systemContent = (body: ChatRequest): string =>
  (body.messages ?? [])
    .filter((message) => message.role === "system")
    .map((message) =>
      typeof message.content === "string" ? message.content : "",
    )
    .join("\n");

const userContent = (body: ChatRequest): string =>
  (body.messages ?? [])
    .filter((message) => message.role === "user")
    .map((message) =>
      typeof message.content === "string" ? message.content : "",
    )
    .join("\n");

const toolNames = (body: ChatRequest): string[] =>
  ((body.tools ?? []) as Array<{ function?: { name?: string } }>)
    .map((tool) => tool.function?.name ?? "")
    .sort();

/** Runs one turn through the real dispatcher and returns the recorded request. */
const runTurn = async ({
  chatMode,
  scenario,
  projectId,
  systemPrompt,
}: {
  chatMode: ChatMode | "neutral" | "context7";
  scenario: GatewayScenario;
  projectId?: string;
  systemPrompt?: string;
}): Promise<ChatRequest> => {
  const agent = await createChatModeAgent({
    selection: { selectedModel: SELECTED_MODEL },
    chatMode,
    projectId,
    systemPrompt,
    messages: [userMessage("hello, how are you?")],
    userId: USER_ID,
    webSearchNumResults: 4,
  });

  const result = await agent.stream({
    messages: [{ role: "user", content: "hello, how are you?" }],
  });
  const reader = result.toUIMessageStream().getReader();
  for (;;) {
    const { done } = await reader.read();
    if (done) break;
  }

  const bodies = chatBodies(scenario);
  expect(bodies).toHaveLength(1);
  return bodies[0]!;
};

const answering = () => ({ chat: () => textReply("Hello") });

type ProjectRow = NonNullable<Awaited<ReturnType<typeof getProjectById>>>;

const project = (tools: string[] | null): ProjectRow =>
  ({
    id: PROJECT_ID,
    userId: USER_ID,
    name: "Project",
    systemPrompt: "PROJECT PROMPT: answer with the project context.",
    tools,
  }) as ProjectRow;

beforeEach(() => {
  vi.mocked(getRelevantMemory).mockResolvedValue(MEMORY_CONTEXT);
  vi.mocked(getProjectById).mockResolvedValue(undefined);
});

describe("Chat Mode composition", () => {
  it("neutral answers with no tools and no memory context", async () => {
    const scenario = await gateway.use(answering());

    const body = await runTurn({ chatMode: "neutral", scenario });

    expect(body.model).toBe(SELECTED_MODEL);
    expect(toolNames(body)).toEqual([]);
    expect(systemContent(body)).toBe(DEFAULT_PROJECT_AGENT_PROMPT);
    expect(systemContent(body)).not.toContain(MEMORY_CONTEXT);
    expect(userContent(body)).toContain("hello, how are you?");
  });

  it("a bare auto mode degrades to the same tool-less branch", async () => {
    const scenario = await gateway.use(answering());

    const body = await runTurn({ chatMode: "auto", scenario });

    expect(toolNames(body)).toEqual([]);
    expect(systemContent(body)).toBe(DEFAULT_PROJECT_AGENT_PROMPT);
  });

  it("context7 keeps the Context7 tools and appends the memory context", async () => {
    const scenario = await gateway.use(answering());

    const body = await runTurn({ chatMode: "context7", scenario });

    expect(toolNames(body)).toEqual(["queryDocs", "resolveLibraryId"]);
    expect(systemContent(body)).toContain(AGENT_PROMPT);
    expect(systemContent(body)).toContain(MEMORY_CONTEXT);
  });

  it("web builds the web search tools with its own instructions", async () => {
    const scenario = await gateway.use(answering());

    const body = await runTurn({ chatMode: "web", scenario });

    expect(toolNames(body)).toEqual([WEB_SEARCH_TOOL]);
    expect(systemContent(body)).toContain(
      WEB_SEARCH_AGENT_PROMPT.slice(0, 60).trim(),
    );
    expect(systemContent(body)).toContain(MEMORY_CONTEXT);
  });

  it("rag builds the retrieval tool with its own instructions", async () => {
    const scenario = await gateway.use(answering());

    const body = await runTurn({ chatMode: "rag", scenario });

    expect(toolNames(body)).toEqual([RAG_TOOL]);
    expect(systemContent(body)).toContain(
      RAG_AGENT_PROMPT.slice(0, 60).trim(),
    );
    expect(systemContent(body)).toContain(MEMORY_CONTEXT);
  });

  it("a project turn forces the retrieval step on the first request", async () => {
    vi.mocked(getProjectById).mockResolvedValue(project([RAG_TOOL]));
    const scenario = await gateway.use(answering());

    const body = await runTurn({ chatMode: "rag", scenario, projectId: PROJECT_ID });

    // The project branch owns the dispatch even for an explicit mode: its
    // first step is the mandatory retrieval, with the RAG instructions.
    expect(toolNames(body)).toEqual([RAG_TOOL]);
    expect(body.tool_choice).toEqual({
      type: "function",
      function: { name: RAG_TOOL },
    });
    expect(systemContent(body)).toContain(
      RAG_AGENT_PROMPT.slice(0, 60).trim(),
    );
  });

  it("keeps the augmented project system prompt when retrieval is disabled", async () => {
    vi.mocked(getProjectById).mockResolvedValue(project([]));
    const scenario = await gateway.use(answering());

    const body = await runTurn({
      chatMode: "auto",
      scenario,
      projectId: PROJECT_ID,
      systemPrompt: "REBUILT SYSTEM PROMPT",
    });

    expect(body.model).toBe(SELECTED_MODEL);
    expect(toolNames(body)).toEqual([]);
    // The project prompt carries the chat's rebuilt context plus the memory
    // context: system prompt augmentation is observable on the request.
    expect(systemContent(body)).toContain("REBUILT SYSTEM PROMPT");
    expect(systemContent(body)).toContain(MEMORY_CONTEXT);
    expect(systemContent(body)).not.toContain(RAG_AGENT_PROMPT.slice(0, 60));
  });

  it("fails loudly when the project does not exist", async () => {
    vi.mocked(getProjectById).mockResolvedValue(undefined);
    await gateway.use(answering());

    await expect(
      createChatModeAgent({
        selection: { selectedModel: SELECTED_MODEL },
        chatMode: "auto",
        projectId: PROJECT_ID,
        messages: [userMessage("hello")],
        userId: USER_ID,
        webSearchNumResults: 4,
      }),
    ).rejects.toThrow("Project not found");
  });
});
