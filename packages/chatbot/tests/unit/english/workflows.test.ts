import { describe, expect, it } from "vitest";
import {
  GatewayScenarioError,
  decisionsResponse,
  pacedTextReply,
  textReply,
} from "@ai-chatbot/model-gateway-testing";
import type {
  ChatRequest,
  ChatReply,
  DecisionsRequest,
  GatewayScenario,
} from "@ai-chatbot/model-gateway-testing";
import { correctGrammar, translate } from "@/lib/features/english/workflows";
import {
  buildGrammarSystemPrompt,
  buildTranslateSystemPrompt,
} from "@/lib/features/english/workflows/utils";
import { setupGatewayHarness } from "@/tests/helpers/gateway-harness";

/**
 * Social unit tests of the public English Helper workflows at the Model Gateway
 * HTTP seam (ADR 0013): `correctGrammar`/`translate` are the real entry points
 * the routes call, classification goes through `inferenceKit.decide`, generation
 * through `inferenceKit.languageModel("flash-default")`, and MSW answers both
 * requests deterministically. No AI port, fake model or module mock.
 *
 * These tests pass with no gateway listening on `:4001`.
 */
const gateway = setupGatewayHarness();

const GRAMMAR_INPUT = "This are a sentence.";
const GRAMMAR_ANSWER = JSON.stringify({
  correctedText: "This is a sentence.",
  reasons: ["'are' changed to 'is' for subject-verb agreement."],
});

/** The recorded `POST /v1/chat/completions` bodies, oldest first. */
const chatBodies = (scenario: GatewayScenario): ChatRequest[] =>
  scenario.requests
    .filter((request) => request.path === "/v1/chat/completions")
    .map((request) => request.body as ChatRequest);

/** The recorded `POST /v1/systemone` bodies, oldest first. */
const decisionsBodies = (scenario: GatewayScenario): DecisionsRequest[] =>
  scenario.requests
    .filter((request) => request.path === "/v1/systemone")
    .map((request) => request.body as DecisionsRequest);

const contentOf = (body: ChatRequest, role: string): string =>
  (body.messages ?? [])
    .filter((message) => message.role === role)
    .map((message) =>
      typeof message.content === "string" ? message.content : "",
    )
    .join("\n");

const systemContent = (body: ChatRequest): string => contentOf(body, "system");
const userContent = (body: ChatRequest): string => contentOf(body, "user");

/** Drains the object stream the way the route's text response does. */
const drainObjectStream = async (
  result: Awaited<ReturnType<typeof correctGrammar>>,
): Promise<void> => {
  await Array.fromAsync(result.fullStream);
};

/** Classification answers configured per question by the scenario. */
const useScenario = (
  choices: Readonly<Record<string, string>>,
  chat: (request: ChatRequest) => ChatReply,
): Promise<GatewayScenario> =>
  gateway.use({
    decisions: (request) => decisionsResponse(request, { choices }),
    chat,
  });

describe("correctGrammar over the Gateway HTTP seam", () => {
  it("classifies through decision-default, then generates with flash-default and the static prompt", async () => {
    const scenario = await useScenario(
      { audience: "executives", domain: "devops" },
      () => textReply(GRAMMAR_ANSWER),
    );

    const result = await correctGrammar(GRAMMAR_INPUT);
    await drainObjectStream(result);

    // The object is parsed and validated against `grammarSchema`.
    await expect(result.object).resolves.toEqual({
      correctedText: "This is a sentence.",
      reasons: ["'are' changed to 'is' for subject-verb agreement."],
    });

    // ── Classification request (grammar asks audience + domain only).
    const [decisions] = decisionsBodies(scenario);
    expect(decisions!.model).toBe("decision-default");
    expect(Object.keys(decisions!.questions!)).toEqual(["audience", "domain"]);
    expect(decisions!.state).toEqual({ text: GRAMMAR_INPUT });

    // ── Generation request: contract, static system prompt, classification in
    // the user prompt plus the delimited raw text and its instruction.
    const [body] = chatBodies(scenario);
    expect(body!.model).toBe("flash-default");
    // Streaming object generation: the SDK asks for a JSON object back.
    expect(body!.stream).toBe(true);
    expect(body!.response_format).toEqual({ type: "json_object" });
    expect(systemContent(body!)).toBe(buildGrammarSystemPrompt());
    // Objective + correction rules + the schema, and the guardrail.
    expect(systemContent(body!)).toContain("expert in **English** grammar");
    expect(systemContent(body!)).toContain("== CORRECTION RULES ==");
    expect(systemContent(body!)).toContain(
      "Respond with JSON matching this schema",
    );
    expect(systemContent(body!)).toContain(
      "ABSOLUTE RULE — THE DELIMITED TEXT MUST BE EXCLUSIVELY CORRECTED",
    );

    const user = userContent(body!);
    expect(user).toContain("executives or investors");
    expect(user).toContain("devops & infrastructure");
    expect(user).toContain("Maintain precise English terminology");
    expect(user).toContain(
      "Correct EXCLUSIVELY the text between the `«…»` delimiters",
    );
    expect(user).toContain(`«${GRAMMAR_INPUT}»`);
  });

  it("removes the domain block when the classifier answers none", async () => {
    const scenario = await useScenario(
      { audience: "professionals", domain: "none" },
      () => textReply(GRAMMAR_ANSWER),
    );

    const result = await correctGrammar(GRAMMAR_INPUT);
    await drainObjectStream(result);

    const user = userContent(chatBodies(scenario)[0]!);
    expect(user).toContain("professionals");
    expect(user).not.toContain("Domain:");
    expect(user).not.toContain("Maintain precise English terminology");
  });

  it("degrades to the fallback classifications when the Decisions call fails", async () => {
    const scenario = await gateway.use({
      decisions: () => {
        throw new GatewayScenarioError("decisions unavailable", 500);
      },
      chat: () => textReply(GRAMMAR_ANSWER),
    });

    const result = await correctGrammar(GRAMMAR_INPUT);
    await drainObjectStream(result);

    // The workflow still generates, with the per-question defaults.
    expect(chatBodies(scenario)).toHaveLength(1);
    const user = userContent(chatBodies(scenario)[0]!);
    expect(user).toContain("general public");
    expect(user).not.toContain("Domain:");
  });

  it("falls back to a non-conflicting delimiter when the text contains the first candidate's close", async () => {
    const text = "un texto con » dentro";
    const scenario = await useScenario(
      { audience: "internal", domain: "software" },
      () => textReply(GRAMMAR_ANSWER),
    );

    const result = await correctGrammar(text);
    await drainObjectStream(result);

    const user = userContent(chatBodies(scenario)[0]!);
    expect(user).toContain(
      'Correct EXCLUSIVELY the text between the `"…"` delimiters',
    );
    expect(user).toContain(`"${text}"`);
  });

  it("propagates a model output that violates grammarSchema", async () => {
    await useScenario({ audience: "general", domain: "none" }, () =>
      // `reasons` must be an array of strings.
      textReply(JSON.stringify({ correctedText: "Fine.", reasons: "because" })),
    );

    const result = await correctGrammar(GRAMMAR_INPUT);
    await drainObjectStream(result);

    await expect(result.object).rejects.toThrow();
  });

  it("propagates a generation transport error instead of returning an object", async () => {
    await useScenario({ audience: "general", domain: "none" }, () => {
      throw new GatewayScenarioError("generation rejected the request", 400);
    });

    const result = await correctGrammar(GRAMMAR_INPUT);
    await drainObjectStream(result);

    await expect(result.object).rejects.toThrow();
  });
});

describe("translate over the Gateway HTTP seam", () => {
  it("classifies direction + audience + domain, then generates with flash-default and the static prompt", async () => {
    const scenario = await useScenario(
      { direction: "en-to-es", audience: "executives", domain: "finance" },
      () => textReply("hola mundo"),
    );

    const result = await translate("hello world");

    await expect(result.text).resolves.toBe("hola mundo");

    // ── Classification request: the three questions of this workflow.
    const [decisions] = decisionsBodies(scenario);
    expect(decisions!.model).toBe("decision-default");
    expect(Object.keys(decisions!.questions!)).toEqual([
      "direction",
      "audience",
      "domain",
    ]);

    // ── Generation request.
    const [body] = chatBodies(scenario);
    expect(body!.model).toBe("flash-default");
    expect(systemContent(body!)).toBe(buildTranslateSystemPrompt());
    expect(systemContent(body!)).toContain(
      "expert Spanish⇄English translator",
    );
    expect(systemContent(body!)).toContain("== OUTPUT RULES ==");
    expect(systemContent(body!)).toContain(
      "ABSOLUTE RULE — THE DELIMITED TEXT MUST BE EXCLUSIVELY TRANSLATED",
    );

    const user = userContent(body!);
    // The classified direction, audience and domain reach the prompt.
    expect(user).toContain("from English to Spanish (Spain)");
    expect(user).toContain("executives or investors");
    expect(user).toContain(
      "Use standard Spanish (Spain) terminology for this field",
    );
    expect(user).toContain(
      "Translate EXCLUSIVELY the text between the `«…»` delimiters",
    );
    expect(user).toContain("«hello world»");
  });

  it("sends the text un-delimited when every candidate conflicts", async () => {
    const everything = '» " ] } ``` >';
    const scenario = await useScenario(
      { direction: "es-to-en", audience: "general", domain: "none" },
      () => textReply("whatever"),
    );

    const result = await translate(everything);
    await result.text;

    const user = userContent(chatBodies(scenario)[0]!);
    expect(user).toContain("Translate EXCLUSIVELY the text below.");
    expect(user).not.toContain("delimiters below");
    expect(user).toContain(everything);
  });

  it("strips the delimiter pair the model echoes back, split across stream chunks", async () => {
    await useScenario(
      { direction: "es-to-en", audience: "general", domain: "none" },
      () => pacedTextReply({ chunks: ["«", "hola", "»"], delayMs: 0 }),
    );

    const result = await translate("hola mundo");

    await expect(result.text).resolves.toBe("hola");
  });

  it("strips the fallback delimiter that the prompt actually chose", async () => {
    await useScenario(
      { direction: "es-to-en", audience: "general", domain: "none" },
      () => pacedTextReply({ chunks: ['"', "hola", '"'], delayMs: 0 }),
    );

    // `»` is taken, so `pickDelimiter` falls back to the double quote.
    const result = await translate("un texto con » dentro");

    await expect(result.text).resolves.toBe("hola");
  });

  it("propagates a generation transport error instead of returning text", async () => {
    await useScenario(
      { direction: "es-to-en", audience: "general", domain: "none" },
      () => {
        throw new GatewayScenarioError("generation rejected the request", 400);
      },
    );

    const result = await translate("hola mundo");

    await expect(result.text).rejects.toThrow();
  });
});
