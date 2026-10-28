import { describe, expect, it } from "vitest";
import {
  GatewayScenarioError,
  createGatewayScenario,
  textReply,
} from "@ai-chatbot/model-gateway-testing";
import type {
  ChatRequest,
  ChatReply,
  GatewayScenario,
} from "@ai-chatbot/model-gateway-testing";
import { setupMswServer } from "../../helpers/msw-server";
import {
  generateSummary,
  generateTurnPrefixSummary,
} from "@/lib/features/compaction/summary-generation";
import { SUMMARIZER_SYSTEM_PROMPT } from "@/lib/features/compaction/prompts";
import { warmModelCatalog } from "@/lib/infrastructure/ai/catalog";
import type { ChatbotMessage } from "@/lib/features/chat/types";

/**
 * Social unit tests at the Model Gateway HTTP seam (ADR 0013): the feature is
 * exercised through its public functions with the real inference kit, the real
 * SDK serialization and the MSW transport of the official toolkit. No AI port,
 * fake or module mock. These tests pass with no gateway listening on `:4001`.
 *
 * The catalog is consumer-owned (the toolkit passes entries through); the two
 * Default Model Contracts the feature can select need an entry so the kit can
 * resolve their metadata.
 */
const CATALOG = {
  public: [],
  internal: [{ id: "reasoning-default" }, { id: "vision-default" }],
};

const SUMMARY_TEXT = "## Goal\nTest conversation";

const server = setupMswServer();

const textMessages = [
  { id: "1", role: "user", parts: [{ type: "text", text: "Hello" }] },
  { id: "2", role: "assistant", parts: [{ type: "text", text: "Hi there" }] },
] as ChatbotMessage[];

const multimediaMessages = [
  {
    id: "1",
    role: "user",
    parts: [
      {
        type: "file",
        url: "https://example.com/img.png",
        mediaType: "image/png",
        filename: "img.png",
      },
    ],
  },
] as ChatbotMessage[];

/**
 * Installs a per-test scenario (its own recorded requests and responders) and
 * warms the catalog snapshot the kit resolves contracts from — the same
 * synchronous-resolution contract production honours via `warmModelCatalog`.
 */
const useScenario = async (
  chat: (request: ChatRequest) => ChatReply,
): Promise<GatewayScenario> => {
  const scenario = createGatewayScenario({ catalog: CATALOG, chat });
  server.use(...scenario.handlers);
  await warmModelCatalog();
  return scenario;
};

/** The recorded `POST /v1/chat/completions` bodies, oldest first. */
const chatBodies = (scenario: GatewayScenario) =>
  scenario.requests
    .filter((request) => request.path === "/v1/chat/completions")
    .map((request) => request.body as ChatRequest);

const systemContent = (body: ChatRequest): string => {
  const system = body.messages?.find((message) => message.role === "system");
  return typeof system?.content === "string" ? system.content : "";
};

const userContent = (body: ChatRequest): string =>
  (body.messages ?? [])
    .filter((message) => message.role === "user")
    .map((message) => (typeof message.content === "string" ? message.content : ""))
    .join("\n");

/**
 * `modelUsed` is persisted verbatim into `ChatSummary.modelUsed`
 * (`lib/infrastructure/db/schema.ts`) as provenance: with the Model Gateway
 * (ADR 0010) the Default Model Contract IS the stable identifier, so the
 * contract the request was sent with is what gets persisted.
 */
describe("generateSummary / generateTurnPrefixSummary over the Gateway HTTP seam", () => {
  it("summarizes text turns with reasoning-default, the initial prompt and temperature 0.1", async () => {
    const scenario = await useScenario(() => textReply(SUMMARY_TEXT));

    const { summary, modelUsed } = await generateSummary(textMessages);

    expect(summary).toBe(SUMMARY_TEXT);
    expect(modelUsed).toBe("reasoning-default");

    const bodies = chatBodies(scenario);
    expect(bodies).toHaveLength(1);
    const [body] = bodies;

    // Contract selection, temperature and the non-streaming shape of the call.
    expect(body!.model).toBe("reasoning-default");
    expect(body!.temperature).toBe(0.1);
    // `generateText` is non-streaming: the SDK omits the flag for JSON calls.
    expect(body!.stream ?? false).toBe(false);

    // Prompt construction: the summarizer system prompt plus the initial
    // template wrapping the serialized conversation (no previous summary yet).
    expect(systemContent(body!)).toBe(SUMMARIZER_SYSTEM_PROMPT);
    const prompt = userContent(body!);
    expect(prompt.startsWith("Extract and organize ALL information")).toBe(true);
    expect(prompt).toContain("user: Hello");
    expect(prompt).toContain("assistant: Hi there");
    expect(prompt).not.toContain("Previous Summary:");
  });

  it("selects vision-default and serializes file parts when the turns carry multimedia", async () => {
    const scenario = await useScenario(() => textReply(SUMMARY_TEXT));

    const { summary, modelUsed } = await generateSummary(multimediaMessages);

    expect(summary).toBe(SUMMARY_TEXT);
    expect(modelUsed).toBe("vision-default");

    const [body] = chatBodies(scenario);
    expect(body!.model).toBe("vision-default");
    expect(userContent(body!)).toContain("[File: img.png (image/png)]");
  });

  it("merges into the previous summary with the incremental prompt", async () => {
    const scenario = await useScenario(() => textReply(SUMMARY_TEXT));

    const { summary, modelUsed } = await generateSummary(
      textMessages,
      "## Goal\nEarlier goal",
    );

    expect(summary).toBe(SUMMARY_TEXT);
    expect(modelUsed).toBe("reasoning-default");

    const prompt = userContent(chatBodies(scenario)[0]!);
    expect(prompt.startsWith("You are updating an existing conversation summary")).toBe(
      true,
    );
    expect(prompt).toContain("## Goal\nEarlier goal");
    expect(prompt).toContain("user: Hello");
    expect(prompt).toContain("assistant: Hi there");
  });

  it("summarizes a turn prefix with the same contract selection", async () => {
    const textScenario = await useScenario(() => textReply(SUMMARY_TEXT));
    const textResult = await generateTurnPrefixSummary(textMessages);

    expect(textResult).toEqual({
      summary: SUMMARY_TEXT,
      modelUsed: "reasoning-default",
    });
    const textBody = chatBodies(textScenario)[0]!;
    expect(textBody.model).toBe("reasoning-default");
    expect(textBody.temperature).toBe(0.1);
    expect(systemContent(textBody)).toBe(SUMMARIZER_SYSTEM_PROMPT);
    const textPrompt = userContent(textBody);
    expect(textPrompt).toContain("turn prefix");
    expect(textPrompt).toContain("user: Hello");

    const multimediaScenario = await useScenario(() => textReply(SUMMARY_TEXT));
    const multimediaResult =
      await generateTurnPrefixSummary(multimediaMessages);

    expect(multimediaResult.modelUsed).toBe("vision-default");
    expect(chatBodies(multimediaScenario)[0]!.model).toBe("vision-default");
  });

  // A 400 is not retried by the SDK (retryable statuses — 429 and 5xx — are
  // retried with backoff, exactly as they are in production), so this asserts
  // the feature's error behaviour without depending on retry timing.
  it("propagates a Gateway error instead of returning a summary", async () => {
    await useScenario(() => {
      throw new GatewayScenarioError("summarizer rejected the request", 400);
    });

    await expect(generateSummary(textMessages)).rejects.toThrow();
  });
});
