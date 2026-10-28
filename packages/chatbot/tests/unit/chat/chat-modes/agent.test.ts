import { describe, expect, it, vi } from "vitest";
import { tool } from "ai";
import type { ToolLoopAgent, ToolSet } from "ai";
import { z } from "zod";
import {
  textReply,
  toolCallReply,
  toolResultReply,
} from "@ai-chatbot/model-gateway-testing";
import type {
  ChatReply,
  ChatRequest,
  GatewayScenario,
} from "@ai-chatbot/model-gateway-testing";
import {
  createChatAgent,
  resolveChatModel,
} from "@/lib/features/chat/chat-modes/model";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";
import { setupGatewayHarness } from "@/tests/helpers/gateway-harness";
import { TEST_MODELS } from "@/tests/mocks/gateway/catalog";

/**
 * Social unit tests of the turn's model/agent composition at the Model Gateway
 * HTTP seam (ADR 0013). `resolveChatModel`/`createChatAgent` are the concrete
 * path every Chat Mode uses: they resolve the user-selected model through the
 * shared `inferenceKit` and fold the chat-level temperature/topP/topK overrides
 * over the catalog's own defaults. There is no AI port to fake: MSW answers
 * `POST /v1/chat/completions` and the assertions read the recorded requests.
 *
 * These tests pass with no gateway listening on `:4001`.
 */
const gateway = setupGatewayHarness();

/** `basicChat` is the test catalog's default entry: `temperature: 0.6`, no topP/topK. */
const SELECTED_MODEL = TEST_MODELS[0]!.id;

/** The recorded `POST /v1/chat/completions` bodies, oldest first. */
const chatBodies = (scenario: GatewayScenario): ChatRequest[] =>
  scenario.requests
    .filter((request) => request.path === "/v1/chat/completions")
    .map((request) => request.body as ChatRequest);

/** Consumes the agent's UI stream and returns the assistant text. */
const answerText = async <TOOLS extends ToolSet>(
  agent: ToolLoopAgent<never, TOOLS>,
): Promise<string> => {
  const result = await agent.stream({
    messages: [{ role: "user", content: "hola" }],
  });
  const reader = result.toUIMessageStream().getReader();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value?.type === "text-delta") text += value.delta;
  }
  return text;
};

const toolNames = (body: ChatRequest): string[] =>
  ((body.tools ?? []) as Array<{ function?: { name?: string } }>).map(
    (tool) => tool.function?.name ?? "",
  );

describe("resolveChatModel", () => {
  it("applies the chat-level overrides over the catalog's own defaults", async () => {
    await gateway.use();

    const catalogDefaults = resolveChatModel({ selectedModel: SELECTED_MODEL });
    expect(catalogDefaults).toMatchObject({
      company: "mock",
      temperature: 0.6,
    });
    // Sparse catalog entries (topP/topK null) stay absent instead of becoming
    // explicit `undefined` keys that would shadow a later default.
    expect(catalogDefaults).not.toHaveProperty("topP");
    expect(catalogDefaults).not.toHaveProperty("topK");

    expect(
      resolveChatModel({
        selectedModel: SELECTED_MODEL,
        overrides: { temperature: 0.42, topP: 0.9, topK: 0.5 },
      }),
    ).toMatchObject({ temperature: 0.42, topP: 0.9, topK: 0.5 });

    // An override the caller did not set never clobbers the resolved default.
    expect(
      resolveChatModel({
        selectedModel: SELECTED_MODEL,
        overrides: { temperature: 0.42 },
      }),
    ).toMatchObject({ temperature: 0.42 });
  });

  it("resolves the model through the tracing-wrapped kit member", async () => {
    await gateway.use();
    const createAgentModel = vi.spyOn(inferenceKit, "createAgentModel");

    const configuration = resolveChatModel({
      selectedModel: SELECTED_MODEL,
      overrides: { temperature: 0.42 },
    });

    // `createAgentModel` is the kit member that applies `wrapWithTracing`
    // before returning the Model Configuration, so the turn resolves through
    // it — the configuration is that member's result plus the overrides.
    // In the Test Environment (`traceEnabled: false`) `wrapWithTracing` is a
    // pass-through and only a `modelId` reaches the wire, so the tracing itself
    // has no observable HTTP effect: the guarantee that CAN be pinned at this
    // seam is which kit member performs the resolution and which model it
    // produced.
    expect(createAgentModel).toHaveBeenCalledWith(SELECTED_MODEL);
    const traced = createAgentModel.mock.results[0]!.value as {
      model: unknown;
    };
    expect(configuration.model).toBe(traced.model);
    expect(configuration.temperature).toBe(0.42);
  });
});

describe("createChatAgent", () => {
  it("sends the user-selected model with the chat-level parameter overrides", async () => {
    const scenario = await gateway.use({ chat: () => textReply("Hola") });
    const createAgent = vi.spyOn(inferenceKit, "createAgent");

    await answerText(
      createChatAgent(
        {
          selectedModel: SELECTED_MODEL,
          overrides: { temperature: 0.42, topP: 0.9 },
        },
        { instructions: "You are a test agent." },
      ),
    );

    // The agent was built by the kit (tracing included), not by a raw
    // `ToolLoopAgent`, and its model is the user-selected one.
    expect(createAgent).toHaveBeenCalledWith(SELECTED_MODEL, {
      instructions: "You are a test agent.",
      overrides: { temperature: 0.42, topP: 0.9 },
    });

    const [body] = chatBodies(scenario);
    expect(body.model).toBe(SELECTED_MODEL);
    expect(body.temperature).toBe(0.42);
    // `topK` is not part of the OpenAI-compatible transport (the provider
    // reports it as unsupported), so its precedence is asserted on the resolved
    // configuration above, not on the wire.
    expect(body).toHaveProperty("top_p", 0.9);
  });

  it("keeps the catalog's temperature when the turn sets no overrides", async () => {
    const scenario = await gateway.use({ chat: () => textReply("Hola") });

    await answerText(
      createChatAgent(
        { selectedModel: SELECTED_MODEL },
        { instructions: "You are a test agent." },
      ),
    );

    const [body] = chatBodies(scenario);
    expect(body.temperature).toBe(0.6);
    expect(body).not.toHaveProperty("top_p");
  });

  it("lets a mode's own override win over the chat-level one", async () => {
    const scenario = await gateway.use({ chat: () => textReply("Hola") });

    await answerText(
      createChatAgent(
        {
          selectedModel: SELECTED_MODEL,
          overrides: { temperature: 0.42, topP: 0.9 },
        },
        { instructions: "You are a test agent.", overrides: { temperature: 0.11 } },
      ),
    );

    const [body] = chatBodies(scenario);
    expect(body.temperature).toBe(0.11);
    // The mode did not override topP: the chat-level value survives.
    expect(body).toHaveProperty("top_p", 0.9);
  });

  it("runs the tool loop: the continuation derives from the request history", async () => {
    const echo = tool({
      description: "Echoes the given text.",
      inputSchema: z.object({ text: z.string() }),
      execute: async ({ text }) => `echoed: ${text}`,
    });

    const scenario = await gateway.use({
      chat: (request): ChatReply => {
        // No shared counter: the second call is recognized by the tool result
        // the client appended to the history.
        const hasToolResult = (request.messages ?? []).some(
          (message) => message.role === "tool",
        );
        return hasToolResult
          ? toolResultReply("loop finished")
          : toolCallReply({
              calls: [
                { id: "call_1", name: "echo", arguments: '{"text":"hi"}' },
              ],
            });
      },
    });

    const text = await answerText(
      createChatAgent(
        { selectedModel: SELECTED_MODEL },
        { instructions: "You are a test agent.", tools: { echo } },
      ),
    );

    // The agent loop ran the tool and answered with the continuation's text.
    expect(text).toBe("loop finished");

    const bodies = chatBodies(scenario);
    expect(bodies).toHaveLength(2);
    expect(toolNames(bodies[0]!)).toEqual(["echo"]);
    // The second request carries the executed tool's result and its output.
    const toolMessage = (bodies[1]!.messages ?? []).find(
      (message) => message.role === "tool",
    );
    expect(toolMessage).toBeDefined();
    expect(String(toolMessage!.content)).toContain("echoed: hi");
  });
});
