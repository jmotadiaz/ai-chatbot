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

/** Extracts the system message from the LanguageModelV3 prompt array */
const extractSystem = (prompt: Array<{ role: string; content: unknown }>) => {
  const part = prompt.find((p) => p.role === "system");
  return part && "content" in part ? (part.content as string) : undefined;
};

/** Collects all text chunks from a streamObject's textStream into a single string */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const collectTextStream = async (result: any): Promise<string> => {
  let text = "";
  for await (const chunk of result.textStream) {
    text += chunk;
  }
  return text;
};

/** Mock model for generateObject — returns JSON */
const createGenerateModel = (response: Record<string, unknown>) =>
  new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: "text" as const, text: JSON.stringify(response) }],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage: defaultUsage,
      warnings: [],
    }),
  });

/**
 * Mock model for streamObject/streamText — echoes the system prompt back
 * as the streamed response, so the test can assert on the output.
 */
const createEchoSystemModel = () =>
  new MockLanguageModelV3({
    doStream: async (options) => {
      const system =
        extractSystem(
          options.prompt as Array<{ role: string; content: unknown }>,
        ) ?? "";
      return {
        stream: simulateReadableStream({
          initialDelayInMs: 0,
          chunkDelayInMs: 0,
          chunks: [
            { type: "text-start" as const, id: "text-1" },
            { type: "text-delta" as const, id: "text-1", delta: system },
            { type: "text-end" as const, id: "text-1" },
            defaultStreamFinish,
          ],
        }),
      };
    },
  });

// ─── makeCorrectGrammar ───────────────────────────────────────────────────────

describe("makeCorrectGrammar", () => {
  it("composes a system prompt with classified audience and domain", async () => {
    const port: CorrectGrammarAiPort = {
      getAudienceModelConfiguration: () => ({
        model: createGenerateModel({ audience: "internal team" }),
        company: "ai chatbot" as const,
      }),
      getDomainModelConfiguration: () => ({
        model: createGenerateModel({ domain: "DevOps", subdomain: "CI/CD" }),
        company: "ai chatbot" as const,
      }),
      getGrammarModelConfiguration: () => ({
        model: createEchoSystemModel(),
        company: "ai chatbot" as const,
      }),
    };

    const correctGrammar = makeCorrectGrammar(port);
    const result = await correctGrammar("some input text");
    const systemPrompt = await collectTextStream(result);

    expect(systemPrompt).toContain("DevOps - CI/CD");
    expect(systemPrompt).toContain("internal team");
  });

  it("uses fallback values when classification fails", async () => {
    const failingModel = new MockLanguageModelV3({
      doGenerate: async () => {
        throw new Error("classification failed");
      },
    });

    const port: CorrectGrammarAiPort = {
      getAudienceModelConfiguration: () => ({
        model: failingModel,
        company: "ai chatbot" as const,
      }),
      getDomainModelConfiguration: () => ({
        model: failingModel,
        company: "ai chatbot" as const,
      }),
      getGrammarModelConfiguration: () => ({
        model: createEchoSystemModel(),
        company: "ai chatbot" as const,
      }),
    };

    const correctGrammar = makeCorrectGrammar(port);
    const result = await correctGrammar("test text");
    const systemPrompt = await collectTextStream(result);

    expect(systemPrompt).toContain("general public");
    expect(systemPrompt).toContain("unknown - unknown");
  });
});

// ─── makeTranslate ────────────────────────────────────────────────────────────

describe("makeTranslate", () => {
  it("composes a system prompt with all 3 classifications", async () => {
    const port: TranslateAiPort = {
      getAudienceModelConfiguration: () => ({
        model: createGenerateModel({ audience: "executives or investors" }),
        company: "ai chatbot" as const,
      }),
      getDomainModelConfiguration: () => ({
        model: createGenerateModel({
          domain: "Finance",
          subdomain: "Investment Banking",
        }),
        company: "ai chatbot" as const,
      }),
      getDirectionModelConfiguration: () => ({
        model: createGenerateModel({
          sourceLanguage: "Spanish",
          targetLanguage: "English (UK)",
        }),
        company: "ai chatbot" as const,
      }),
      getTranslateModelConfiguration: () => ({
        model: createEchoSystemModel(),
        company: "ai chatbot" as const,
      }),
    };

    const translateFn = makeTranslate(port);
    const result = await translateFn("hola mundo");
    const systemPrompt = await result.text;

    expect(systemPrompt).toContain("Spanish to English (UK) translator");
    expect(systemPrompt).toContain("Finance - Investment Banking");
    expect(systemPrompt).toContain("executives or investors");
  });

  it("uses fallback values when classification fails", async () => {
    const failingModel = new MockLanguageModelV3({
      doGenerate: async () => {
        throw new Error("classification failed");
      },
    });

    const port: TranslateAiPort = {
      getAudienceModelConfiguration: () => ({
        model: failingModel,
        company: "ai chatbot" as const,
      }),
      getDomainModelConfiguration: () => ({
        model: failingModel,
        company: "ai chatbot" as const,
      }),
      getDirectionModelConfiguration: () => ({
        model: failingModel,
        company: "ai chatbot" as const,
      }),
      getTranslateModelConfiguration: () => ({
        model: createEchoSystemModel(),
        company: "ai chatbot" as const,
      }),
    };

    const translateFn = makeTranslate(port);
    const result = await translateFn("some text");
    const systemPrompt = await result.text;

    expect(systemPrompt).toContain("English (UK)");
    expect(systemPrompt).toContain("general public");
    expect(systemPrompt).toContain("unknown - unknown");
  });
});
