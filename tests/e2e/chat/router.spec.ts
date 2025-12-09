import { expect, test } from "../fixtures";
import { ChatPage } from "./page";

type Category = "technical" | "prompt_engineering";

type Complexity = "simple" | "moderate" | "complex" | "advanced";

const modelRoutingExpectations: Record<Category, Record<Complexity, string>> = {
  technical: {
    simple: "meta-llama/llama-4-scout-17b-16e-instruct",
    moderate: "anthropic/claude-haiku-4.5",
    complex: "anthropic/claude-sonnet-4.5",
    advanced: "anthropic/claude-opus-4.5",
  },
  prompt_engineering: {
    simple: "meta-llama/llama-4-scout-17b-16e-instruct",
    moderate: "moonshotai/kimi-k2-instruct-0905",
    complex: "openai/gpt-oss-120b",
    advanced: "gemini-2.5-pro",
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
      await chatPage.chat.sendMessage(
        `category=${category} complexity=${complexity}`
      );
      await chatPage.chat.waitForLoadingComplete();

      const lastMessage = await chatPage.chat.getLastAssistantMessage();
      expect.soft(lastMessage).toContain(expected);
    });
  });

  test(`should adapt model when an attachment is included in the prompt`, async () => {
    await chatPage.chat.openAttachmentMenu();
    await chatPage.chat.uploadFile("./tests/mocks/dummy-image.png", "image");
    await chatPage.chat.sendMessage(`category=factual complexity=simple`);
    await chatPage.chat.waitForLoadingComplete();

    const lastMessage = await chatPage.chat.getLastAssistantMessage();
    expect.soft(lastMessage).not.toContain("meta-llama/llama-3.1-8b-instant");
    expect
      .soft(lastMessage)
      .toContain("meta-llama/llama-4-scout-17b-16e-instruct");
  });
});
