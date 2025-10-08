import { test, expect } from "./fixtures";
import { ChatPage } from "./chat.page";

test.describe("Chat functionality", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page, authenticatedUser }) => {
    // Initialize page object
    chatPage = new ChatPage(page);

    // Navigate to chat page
    await chatPage.goto();
    // ensure auth cookie fixture executed
    // (can't easily read httpOnly cookie from page script)
    expect(authenticatedUser.email).toBeDefined();
  });

  test("user sends a message and assistant responds correctly", async () => {
    // Arrange
    const userQuery = "What is the capital of France?";

    // Act: Send a message
    await chatPage.sendMessage(userQuery);

    // Wait for assistant to respond
    await chatPage.waitForAssistantResponse();
    await chatPage.waitForLoadingComplete();

    // Assert: Verify assistant responded
    await chatPage.verifyAssistantResponded();

    // Verify the response contains the expected mock text
    await chatPage.verifyAssistantResponseContains(
      "Hello, I'm  meta-llama/llama-4-scout-17b-16e-instruct"
    );

    // Additional verification: Check message count
    const userMessages = await chatPage.getUserMessages();
    const assistantMessages = await chatPage.getAssistantMessages();

    expect(userMessages.length).toBeGreaterThanOrEqual(1);
    expect(assistantMessages.length).toBeGreaterThanOrEqual(1);

    // Verify user message was sent correctly
    expect(userMessages[userMessages.length - 1]).toContain(userQuery);
  });
});
