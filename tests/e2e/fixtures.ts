/* eslint-disable react-hooks/rules-of-hooks */
import { test as base } from "@playwright/test";
import { simulateReadableStream } from "ai";
import type { DefaultJWT } from "next-auth/jwt";
import { MockEmbeddingModelV2, MockLanguageModelV2 } from "./ai.mocks";
import { DB, getDb } from "@/lib/db/db";
import {
  setProviders,
  Providers,
  LanguageModelV2,
  EmbeddingModelV2,
} from "@/lib/ai/models/providers";
import { user } from "@/lib/db/schema";

interface TestFixtures {
  mockProviders: Providers;
  testDb: DB;
  authenticatedUser: { id: string; email: string };
}

/**
 * Extended test with fixtures for AI providers and database
 * This allows dependency injection for testing
 */
export const test = base.extend<TestFixtures>({
  // Mock AI providers fixture using AI SDK MockLanguageModelV2
  mockProviders: async ({}, use) => {
    const createMockModel = (modelId: string): LanguageModelV2 => {
      const mockModel = new MockLanguageModelV2({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: "text-start", id: "text-1" },
              { type: "text-delta", id: "text-1", delta: "Hello" },
              { type: "text-delta", id: "text-1", delta: ", I'm " },
              { type: "text-delta", id: "text-1", delta: modelId },
              { type: "text-end", id: "text-1" },
              {
                type: "finish",
                finishReason: "stop",
                logprobs: undefined,
                usage: { inputTokens: 3, outputTokens: 10, totalTokens: 13 },
              },
            ],
          }),
          rawCall: { rawPrompt: null, rawSettings: {} },
        }),
        doGenerate: async () => ({
          finishReason: "stop",
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          content: [{ type: "text", text: `{"content":"Hello, world!"}` }],
          warnings: [],
        }),
      });

      return Object.assign(mockModel, { modelId }) as LanguageModelV2;
    };

    const createMockEmbeddingModel = (modelId: string): EmbeddingModelV2 => {
      const mockEmbedding = new MockEmbeddingModelV2({
        doEmbed: async () => ({
          embeddings: [[0.1, 0.2, 0.3]],
          usage: { tokens: 10 },
        }),
      });

      return Object.assign(mockEmbedding, { modelId });
    };

    const mockProviders: Providers = {
      anthropic: (modelId: string) => createMockModel(modelId),
      openai: (modelId: string) => createMockModel(modelId),
      google: (modelId: string) => createMockModel(modelId),
      xai: (modelId: string) => createMockModel(modelId),
      groq: (modelId: string) => createMockModel(modelId),
      openrouter: (modelId: string) => createMockModel(modelId),
      deepseek: (modelId: string) => createMockModel(modelId),
      perplexity: (modelId: string) => createMockModel(modelId),
      gateway: (modelId: string) => createMockModel(modelId),
      embedding: () => createMockEmbeddingModel("test-embedding"),
    };

    // Set the mock providers
    setProviders(mockProviders);

    await use(mockProviders);
  },
  authenticatedUser: async ({ page, baseURL }, use) => {
    const email = `test@test.com`;
    const password =
      "$2b$10$testtestsalt123456789012uG9dWQd8U1xMOPuQJxFr7eETeM2Yy"; // dummy bcrypt hash for tests

    const [userCreated] = await getDb()
      .insert(user)
      .values({ email, password })
      .returning();

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      throw new Error("AUTH_SECRET not set");
    }

    const token: DefaultJWT = {
      id: userCreated.id,
      email: userCreated.email,
      type: "regular",
    };

    const { encode } = await import("next-auth/jwt");
    const cookieName = "authjs.session-token";

    const encodedToken = await encode({
      token,
      secret,
      salt: cookieName,
    });

    // --- Step 3: Set session cookie ---

    // Derive correct domain from baseURL (strip protocol and port)
    const url = new URL(baseURL ?? "http://localhost:3000");
    const domain = url.hostname;

    await page.context().addCookies([
      {
        name: cookieName,
        value: encodedToken,
        domain,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        secure: false,
        expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 1 week
      },
    ]);

    // Provide the authenticated user to the test
    await use(userCreated);
  },
});

export { expect } from "@playwright/test";
