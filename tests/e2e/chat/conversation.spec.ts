import { test, expect } from "../fixtures";
import { ChatPage } from "./page";

test.describe("Chat functionality", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page, authenticatedUser }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
    expect(authenticatedUser.email).toBeDefined();
  });

  test("user sends a message and assistant responds correctly", async () => {
    const userQuery = "What is the capital of France?";

    await chatPage.selectModel("Llama 4 Scout");

    await chatPage.sendMessage(userQuery);
    await chatPage.waitForLoadingComplete();

    await chatPage.verifyAssistantResponseContains(
      "Hello, I'm meta-llama/llama-4-scout-17b-16e-instruct"
    );

    const userMessages = await chatPage.getUserMessages();
    const assistantMessages = await chatPage.getAssistantMessages();

    expect(userMessages.length).toBeGreaterThanOrEqual(1);
    expect(assistantMessages.length).toBeGreaterThanOrEqual(1);

    expect(userMessages.at(-1)).toContain(userQuery);
  });
});
