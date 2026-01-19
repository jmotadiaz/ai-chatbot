import { test, expect } from "../fixtures";
import { ChatPage } from "./pages/chat";

test.describe("Chat functionality", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page, authenticatedUser }) => {
    expect(authenticatedUser.email).toBeDefined();
    chatPage = new ChatPage(page);
    await chatPage.goto();
  });

  test("user sends a message and assistant responds correctly", async () => {
    const userQuery = "What is the capital of France?";

    await chatPage.header.modelPicker.selectModel("Llama 4 Scout");

    await chatPage.chat.sendMessage(userQuery);

    await chatPage.chat.waitForLoadingComplete();
    const lastMessage = await chatPage.chat.getLastAssistantMessage();
    expect(lastMessage).toContain("Hello, I'm meta/llama-4-scout");

    const userMessages = await chatPage.chat.getUserMessages();
    const assistantMessages = await chatPage.chat.getAssistantMessages();

    expect(userMessages.length).toBeGreaterThanOrEqual(1);
    expect(assistantMessages.length).toBeGreaterThanOrEqual(1);

    expect(userMessages.at(-1)).toContain(userQuery);
  });
});
