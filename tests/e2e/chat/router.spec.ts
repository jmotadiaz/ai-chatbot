import { expect, test } from "../fixtures";
import { ChatPage } from "./pages/chat";

type Category = "technical" | "prompt_engineering";

type Complexity = "simple" | "moderate" | "complex" | "advanced";

const modelRoutingExpectations: Record<Category, Record<Complexity, string>> = {
  technical: {
    simple: "openai/gpt-oss-20b",
    moderate: "anthropic/claude-haiku-4.5",
    complex: "anthropic/claude-sonnet-4.5",
    advanced: "anthropic/claude-opus-4.5",
  },
  prompt_engineering: {
    simple: "alibaba/qwen3-next-80b-a3b-instruct",
    moderate: "moonshotai/kimi-k2-instruct-0905",
    complex: "grok-4-1-fast",
    advanced: "gpt-5.2",
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

  test.beforeEach(async ({ page }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
  });

  modelRouterTestCases.forEach(({ category, complexity, expected }) => {
    test(`should use ${expected} for category ${category} and complexity ${complexity}`, async () => {
      await chatPage.chat.sendMessage(
        `category=${category} complexity=${complexity}`,
      );
      await chatPage.chat.waitForLoadingComplete();

      const lastMessage = await chatPage.chat.getLastAssistantMessage();
      expect.soft(lastMessage).toContain(expected);
    });
  });

  test(`should adapt model when an attachment is included in the prompt`, async () => {
    await chatPage.chat.openAttachmentMenu();
    await chatPage.chat.uploadFile("./tests/mocks/dummy-image.png", "image");
    await chatPage.chat.sendMessage(`category=factual complexity=complex`);
    await chatPage.chat.waitForLoadingComplete();

    const lastMessage = await chatPage.chat.getLastAssistantMessage();
    expect.soft(lastMessage).not.toContain("moonshotai/kimi-k2-instruct-0905");
    expect.soft(lastMessage).toContain("google/gemini-3-flash");
  });
});
