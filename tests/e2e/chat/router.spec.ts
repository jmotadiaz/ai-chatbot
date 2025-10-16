import { expect, test } from "../fixtures";
import { ChatPage } from "./chat.page";

type Category = "technical" | "prompt_engineering";

type Complexity = "simple" | "moderate" | "complex" | "advanced";

const modelRoutingExpectations: Record<Category, Record<Complexity, string>> = {
  technical: {
    simple: "meta-llama/llama-4-scout-17b-16e-instruct",
    moderate: "qwen/qwen3-coder",
    complex: "claude-sonnet-4-5-20250929",
    advanced: "gpt-5-2025-08-07",
  },
  prompt_engineering: {
    simple: "meta-llama/llama-4-scout-17b-16e-instruct",
    moderate: "moonshotai/kimi-k2-instruct-0905",
    complex: "openai/gpt-oss-120b",
    advanced: "google/gemini-2.5-pro",
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

  test(`should adapt model when an is included in the prompt`, async () => {
    await chatPage.goto();
    await chatPage.openAttachmentMenu();
    await chatPage.uploadFile("./tests/mocks/dummy-image.png", "image");
    await chatPage.sendMessage(`category=factual complexity=simple`);
    await chatPage.waitForLoadingComplete();

    const lastMessage = await chatPage.getLastAssistantMessage();
    expect(lastMessage).not.toContain("meta-llama/llama-3.1-8b-instant");
    expect(lastMessage).toContain("meta-llama/llama-4-scout-17b-16e-instruct");
  });
});
