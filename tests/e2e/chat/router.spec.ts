import { expect, test } from "../fixtures";
import { ChatPage } from "./chat.page";

type Category =
  | "current_news"
  | "factual"
  | "analytical"
  | "technical"
  | "creative"
  | "prompt_engineering"
  | "conversational"
  | "processing"
  | "image_generation"
  | "other";

type Complexity = "simple" | "moderate" | "complex" | "advanced";

const modelRoutingExpectations: Record<Category, Record<Complexity, string>> = {
  current_news: {
    simple: "llama-3.1-8b-instant",
    moderate: "meta-llama/llama-4-scout-17b-16e-instruct",
    complex: "meta-llama/llama-4-maverick-17b-128e-instruct",
    advanced: "google/gemini-2.5-pro",
  },
  factual: {
    simple: "meta-llama/llama-4-scout-17b-16e-instruct",
    moderate: "meta-llama/llama-4-maverick-17b-128e-instruct",
    complex: "moonshotai/kimi-k2-instruct-0905",
    advanced: "google/gemini-2.5-flash",
  },
  analytical: {
    simple: "meta-llama/llama-4-maverick-17b-128e-instruct",
    moderate: "qwen/qwen3-next-80b-a3b-thinking",
    complex: "grok-4-fast",
    advanced: "grok-4-0709",
  },
  technical: {
    simple: "meta-llama/llama-4-scout-17b-16e-instruct",
    moderate: "qwen/qwen3-coder",
    complex: "claude-sonnet-4-5-20250929",
    advanced: "gpt-5-2025-08-07",
  },
  creative: {
    simple: "llama-3.1-8b-instant",
    moderate: "google/gemini-2.5-flash-lite",
    complex: "meta-llama/llama-4-maverick-17b-128e-instruct",
    advanced: "google/gemini-2.5-flash",
  },
  prompt_engineering: {
    simple: "meta-llama/llama-4-scout-17b-16e-instruct",
    moderate: "moonshotai/kimi-k2-instruct-0905",
    complex: "openai/gpt-oss-120b",
    advanced: "google/gemini-2.5-pro",
  },
  conversational: {
    simple: "llama-3.1-8b-instant",
    moderate: "meta-llama/llama-4-scout-17b-16e-instruct",
    complex: "meta-llama/llama-4-maverick-17b-128e-instruct",
    advanced: "google/gemini-2.5-flash",
  },
  processing: {
    simple: "llama-3.1-8b-instant",
    moderate: "qwen/qwen3-next-80b-a3b-instruct",
    complex: "google/gemini-2.5-flash",
    advanced: "google/gemini-2.5-pro",
  },
  image_generation: {
    simple: "google/gemini-2.5-flash-image-preview",
    moderate: "google/gemini-2.5-flash-image-preview",
    complex: "google/gemini-2.5-flash-image-preview",
    advanced: "google/gemini-2.5-flash-image-preview",
  },
  other: {
    simple: "llama-3.1-8b-instant",
    moderate: "llama-3.1-8b-instant",
    complex: "meta-llama/llama-4-maverick-17b-128e-instruct",
    advanced: "meta-llama/llama-4-maverick-17b-128e-instruct",
  },
};

const modelRouterTestCases: Array<{
  category: Category;
  complexity: Complexity;
  expected: string;
}> = [];

for (const category of Object.keys(modelRoutingExpectations) as Category[]) {
  const complexities = modelRoutingExpectations[category];

  for (const complexity of Object.keys(complexities) as Complexity[]) {
    modelRouterTestCases.push({
      category,
      complexity,
      expected: complexities[complexity],
    });
  }
}

test.describe("Model Router", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page, authenticatedUser }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
    expect(authenticatedUser.email).toBeDefined();
  });

  modelRouterTestCases.forEach(({ category, complexity, expected }) => {
    test(`should use ${expected} for category ${category} and complexity ${complexity}`, async () => {
      await chatPage.goto();
      await chatPage.sendMessage(
        `category=${category} complexity=${complexity}`
      );
      await chatPage.waitForLoadingComplete();

      const lastMessage = await chatPage.getLastAssistantMessage();
      expect(lastMessage).toContain(expected);
    });
  });
});
