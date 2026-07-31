import { test, expect } from "./fixtures";
import { ChatPage } from "./chat/pages/chat";

test.describe("Chat functionality", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
  });

  test("user sends a message and assistant responds correctly", async () => {
    const userQuery = "What is the capital of France?";

    await chatPage.header.modelPicker.selectModel("basicChat");

    await chatPage.chat.sendMessage(userQuery);

    await chatPage.chat.waitForLoadingComplete();
    const lastMessage = await chatPage.chat.getLastAssistantMessage();
    // The generic mock echoes back the model it was built for.
    expect(lastMessage).toContain("Hello, I'm");

    const userMessages = await chatPage.chat.getUserMessages();
    const assistantMessages = await chatPage.chat.getAssistantMessages();

    expect(userMessages.length).toBeGreaterThanOrEqual(1);
    expect(assistantMessages.length).toBeGreaterThanOrEqual(1);

    expect(userMessages.at(-1)).toContain(userQuery);
  });
});
