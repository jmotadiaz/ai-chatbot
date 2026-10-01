import { describe, it, expect } from "vitest";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import {
  makeCorrectGrammar,
  makeTranslate,
} from "../../../lib/features/english/workflows/factory";
import type {
  CorrectGrammarAiPort,
  TranslateAiPort,
} from "../../../lib/features/english/workflows/ports";
import type {
  TextClassifications,
  TranslationClassifications,
} from "../../../lib/features/english/workflows/policy";
import {
  buildGrammarSystemPrompt,
  buildTranslateSystemPrompt,
} from "../../../lib/features/english/workflows/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const defaultUsage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};

const defaultStreamFinish = {
  type: "finish" as const,
  finishReason: { unified: "stop" as const, raw: undefined },
  logprobs: undefined,
  usage: defaultUsage,
};

interface CapturedPrompt {
  system?: string;
  user?: string;
}

const extractMessage = (
  prompt: Array<{ role: string; content: unknown }>,
  role: string,
): string | undefined => {
  const part = prompt.find((p) => p.role === role);
  if (!part || !("content" in part)) return undefined;
  const content = part.content;
  return typeof content === "string"
    ? content
    : (content as Array<{ type: string; text?: string }>)
        .map((piece) => (piece.type === "text" ? (piece.text ?? "") : ""))
        .join("");
};

/**
 * Mock model that records the prompt it is called with and streams a stub
 * response back, so tests assert on the actual system/user split the factory
 * built.
 */
const createRecordingModel = (captured: CapturedPrompt) =>
  new MockLanguageModelV3({
    doStream: async (options) => {
      const prompt = options.prompt as Array<{ role: string; content: unknown }>;
      captured.system = extractMessage(prompt, "system");
      captured.user = extractMessage(prompt, "user");
      return {
        stream: simulateReadableStream({
          initialDelayInMs: 0,
          chunkDelayInMs: 0,
          chunks: [
            { type: "text-start" as const, id: "text-1" },
            { type: "text-delta" as const, id: "text-1", delta: "ok" },
            { type: "text-end" as const, id: "text-1" },
            defaultStreamFinish,
          ],
        }),
      };
    },
  });

/**
 * Mock model that echoes the delimiter wrapper around a fixed payload, so
 * tests can assert the output-side stripping of the translation workflow.
 */
const createDelimitedModel = (open: string, close: string) =>
  new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        initialDelayInMs: 0,
        chunkDelayInMs: 0,
        chunks: [
          { type: "text-start" as const, id: "text-1" },
          { type: "text-delta" as const, id: "text-1", delta: open },
          { type: "text-delta" as const, id: "text-1", delta: "hola" },
          { type: "text-delta" as const, id: "text-1", delta: close },
          { type: "text-end" as const, id: "text-1" },
          defaultStreamFinish,
        ],
      }),
    }),
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const drainTextStream = async (result: any): Promise<void> => {
  await Array.fromAsync(result.textStream);
};

const provenance = { modelId: "test-decisions", answers: {} };

const grammarClassifications = (
  overrides: Partial<TextClassifications> = {},
): TextClassifications => ({
  audience: "internal",
  domain: "devops",
  provenance,
  ...overrides,
});

const translationClassifications = (
  overrides: Partial<TranslationClassifications> = {},
): TranslationClassifications => ({
  direction: "es-to-en",
  ...grammarClassifications(),
  ...overrides,
});

// ─── makeCorrectGrammar ───────────────────────────────────────────────────────

describe("makeCorrectGrammar", () => {
  it("keeps the system prompt static and puts the classified context in the user prompt", async () => {
    const captured: CapturedPrompt = {};
    const port: CorrectGrammarAiPort = {
      classify: async () => grammarClassifications(),
      getGrammarModelConfiguration: () => ({
        model: createRecordingModel(captured),
        company: "ai chatbot" as const,
      }),
    };

    const correctGrammar = makeCorrectGrammar(port);
    await drainTextStream(await correctGrammar("some input text"));

    // System prompt interpolates nothing: objective + rules + guardrail only.
    expect(captured.system).toBe(buildGrammarSystemPrompt());
    expect(captured.system).toContain(
      "ABSOLUTE RULE — THE DELIMITED TEXT MUST BE EXCLUSIVELY CORRECTED",
    );
    // The variable context travels in the user prompt, with the text delimited.
    expect(captured.user).toContain("internal team");
    expect(captured.user).toContain("devops & infrastructure");
    expect(captured.user).toContain("Maintain precise English terminology");
    expect(captured.user).toContain(
      "Correct EXCLUSIVELY the text between the `«…»` delimiters",
    );
    expect(captured.user).toContain("«some input text»");
  });

  it("omits the domain block entirely when the domain is none", async () => {
    const captured: CapturedPrompt = {};
    const port: CorrectGrammarAiPort = {
      classify: async () => grammarClassifications({ domain: "none" }),
      getGrammarModelConfiguration: () => ({
        model: createRecordingModel(captured),
        company: "ai chatbot" as const,
      }),
    };

    const correctGrammar = makeCorrectGrammar(port);
    await drainTextStream(await correctGrammar("some input text"));

    expect(captured.user).not.toContain("Domain:");
    expect(captured.user).not.toContain("Maintain precise English terminology");
    expect(captured.user).toContain("internal team");
  });

  it("falls back to a non-conflicting delimiter when the text contains the first candidate's close", async () => {
    const captured: CapturedPrompt = {};
    const port: CorrectGrammarAiPort = {
      classify: async () => grammarClassifications(),
      getGrammarModelConfiguration: () => ({
        model: createRecordingModel(captured),
        company: "ai chatbot" as const,
      }),
    };

    const correctGrammar = makeCorrectGrammar(port);
    await drainTextStream(await correctGrammar("un texto con » dentro"));

    expect(captured.user).toContain(
      'Correct EXCLUSIVELY the text between the `"…"` delimiters',
    );
    expect(captured.user).toContain('"un texto con » dentro"');
  });
});

// ─── makeTranslate ────────────────────────────────────────────────────────────

describe("makeTranslate", () => {
  it("keeps the system prompt static and carries direction, audience and domain in the user prompt", async () => {
    const captured: CapturedPrompt = {};
    const port: TranslateAiPort = {
      classify: async () =>
        translationClassifications({ audience: "executives", domain: "finance" }),
      getTranslateModelConfiguration: () => ({
        model: createRecordingModel(captured),
        company: "ai chatbot" as const,
      }),
    };

    const translateFn = makeTranslate(port);
    await (await translateFn("hola mundo")).text;

    expect(captured.system).toBe(buildTranslateSystemPrompt());
    expect(captured.system).toContain(
      "ABSOLUTE RULE — THE DELIMITED TEXT MUST BE EXCLUSIVELY TRANSLATED",
    );
    expect(captured.user).toContain("from Spanish to English (UK)");
    expect(captured.user).toContain("executives or investors");
    expect(captured.user).toContain(
      "Use standard English (UK) terminology for this field",
    );
    expect(captured.user).toContain(
      "Translate EXCLUSIVELY the text between the `«…»` delimiters",
    );
    expect(captured.user).toContain("«hola mundo»");
  });

  it("applies the en-to-es direction as-is", async () => {
    const captured: CapturedPrompt = {};
    const port: TranslateAiPort = {
      classify: async () => translationClassifications({ direction: "en-to-es" }),
      getTranslateModelConfiguration: () => ({
        model: createRecordingModel(captured),
        company: "ai chatbot" as const,
      }),
    };

    const translateFn = makeTranslate(port);
    await (await translateFn("hello world")).text;

    expect(captured.user).toContain("from English to Spanish (Spain)");
  });

  it("sends the text un-delimited when every candidate conflicts", async () => {
    const captured: CapturedPrompt = {};
    const port: TranslateAiPort = {
      classify: async () => translationClassifications(),
      getTranslateModelConfiguration: () => ({
        model: createRecordingModel(captured),
        company: "ai chatbot" as const,
      }),
    };

    const everything = '» " ] } ``` >';
    const translateFn = makeTranslate(port);
    await (await translateFn(everything)).text;

    expect(captured.user).toContain("Translate EXCLUSIVELY the text below.");
    expect(captured.user).not.toContain("delimiters below");
    expect(captured.user).toContain(everything);
  });

  it("strips the delimiter pair the model echoes back", async () => {
    const port: TranslateAiPort = {
      classify: async () => translationClassifications(),
      getTranslateModelConfiguration: () => ({
        model: createDelimitedModel("«", "»"),
        company: "ai chatbot" as const,
      }),
    };

    const translateFn = makeTranslate(port);
    const result = await translateFn("hola mundo");

    expect(await result.text).toBe("hola");
  });

  it("strips the fallback delimiter that the prompt actually chose", async () => {
    const port: TranslateAiPort = {
      classify: async () => translationClassifications(),
      getTranslateModelConfiguration: () => ({
        model: createDelimitedModel('"', '"'),
        company: "ai chatbot" as const,
      }),
    };

    const translateFn = makeTranslate(port);
    // `»` is taken, so `pickDelimiter` falls back to the double quote.
    const result = await translateFn("un texto con » dentro");

    expect(await result.text).toBe("hola");
  });
});
