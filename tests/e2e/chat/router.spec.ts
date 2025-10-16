import { expect, test } from "tests/e2e/fixtures";
import { createRouterMock, createMockModel } from "tests/mocks/ai";
import { ChatPage } from "tests/e2e/chat/chat.page";
import {
  languageModelConfigurations,
  LanguageModelKeys,
} from "@/lib/ai/models/definition";

const modelRouterTestCases: {
  category: string;
  complexity: string;
  expected: LanguageModelKeys;
}[] = [
  {
    category: "factual",
    complexity: "simple",
    expected: "Llama 4 Scout",
  },
  {
    category: "factual",
    complexity: "moderate",
    expected: "Llama 4 Maverick",
  },
  {
    category: "factual",
    complexity: "complex",
    expected: "Kimi K2",
  },
  {
    category: "factual",
    complexity: "advanced",
    expected: "Gemini 2.5 Flash",
  },
  {
    category: "analytical",
    complexity: "simple",
    expected: "Llama 4 Maverick",
  },
  {
    category: "analytical",
    complexity: "moderate",
    expected: "Qwen3 Next Thinking",
  },
  {
    category: "analytical",
    complexity: "complex",
    expected: "Grok 4 Fast",
  },
  {
    category: "analytical",
    complexity: "advanced",
    expected: "Grok 4",
  },
];

test.describe("Model Router", () => {
  modelRouterTestCases.forEach(({ category, complexity, expected }) => {
    test(`should use ${expected} for category ${category} and complexity ${complexity}`, async ({
      page,
      authenticatedUser,
    }) => {
      const chatPage = new ChatPage(page);
      const routerMock = createRouterMock();
      const expectedModelId = languageModelConfigurations(expected).model.modelId;
      const finalModelMock = createMockModel(expectedModelId);

      await page.route("**/api/ai/generation", async (route) => {
        const requestBody = route.request().postDataJSON();
        const model = requestBody.options.model;

        if (model === "openai/gpt-oss-20b") {
          // Mock for the router classification model
          const mockResponse = await routerMock.doGenerate(requestBody.options);
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(mockResponse),
          });
        } else {
          // Mock for the final selected model
          const mockResponse = await finalModelMock.doStream(
            requestBody.options
          );
          const stream = new ReadableStream({
            start(controller) {
              mockResponse.stream.on("data", (chunk) =>
                controller.enqueue(chunk)
              );
              mockResponse.stream.on("end", () => controller.close());
            },
          });
          return route.fulfill({
            status: 200,
            body: stream,
          });
        }
      });

      await chatPage.goto();
      await chatPage.sendMessage(
        `category=${category} complexity=${complexity}`
      );
      await chatPage.waitForLoadingComplete();

      const lastMessage = await chatPage.getLastAssistantMessage();
      expect(lastMessage).toContain(expectedModelId);
    });
  });
});