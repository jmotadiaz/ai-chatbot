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
      "Hello, I'm meta-llama/llama-4-scout-17b-16e-instruct"
    );

    // Additional verification: Check message count
    const userMessages = await chatPage.getUserMessages();
    const assistantMessages = await chatPage.getAssistantMessages();

    expect(userMessages.length).toBeGreaterThanOrEqual(1);
    expect(assistantMessages.length).toBeGreaterThanOrEqual(1);

    // Verify user message was sent correctly
    expect(userMessages[userMessages.length - 1]).toContain(userQuery);
  });

  test("should allow modifying chat settings for different models", async () => {
    // 1. Verify settings button is not visible for Router model.
    // The component returns null, so we check for visibility, not disabled state.
    await expect(chatPage.settingsButton).not.toBeVisible();

    // 2. Switch to a model with only temperature enabled ("Claude Sonnet 4.5")
    await chatPage.selectModel("Claude Sonnet 4.5");
    await expect(chatPage.settingsButton).toBeVisible();

    // 3. Open settings and check defaults.
    await chatPage.openSettings();
    await expect(chatPage.temperatureInput).toHaveValue("0.5");
    await expect(chatPage.topPInput).not.toBeVisible();
    await expect(chatPage.topKInput).not.toBeVisible();

    // 4. Modify temperature and verify response
    await chatPage.setTemperature(0.8);
    await chatPage.closeDropdown();
    await chatPage.sendMessage("Hello with custom temperature");
    await chatPage.waitForAssistantResponse();
    await chatPage.verifyAssistantResponseContains(
      "Hello, I'm claude-sonnet-4-5-20250929, Temperature: 0.8"
    );

    // 5. Switch to a model with all settings enabled ("Qwen3 Next Instruct")
    await chatPage.selectModel("Qwen3 Next Instruct");
    await expect(chatPage.settingsButton).toBeVisible();

    // 6. Open settings and check default values
    await chatPage.openSettings();
    await expect(chatPage.temperatureInput).toHaveValue("0.7");
    await expect(chatPage.topPInput).toHaveValue("0.8");
    await expect(chatPage.topKInput).toHaveValue("20");

    // 7. Modify all settings
    await chatPage.setTemperature(0.6);
    await chatPage.setTopP(0.7);
    await chatPage.setTopK(15);
    await chatPage.closeDropdown();

    // 8. Send message and verify response includes all modified settings
    await chatPage.sendMessage("Hello with all custom settings");
    await chatPage.waitForAssistantResponse();
    await chatPage.verifyAssistantResponseContains(
      "Hello, I'm qwen/qwen3-next-80b-a3b-instruct, Temperature: 0.6, TopP: 0.7, TopK: 15"
    );
  });

  test("should handle tool configuration and model filtering correctly", async () => {
    // 1. Select a model that does not support tools ("Sonar Pro")
    await chatPage.selectModel("Sonar Pro");

    // 2. Verify that the tools control button is not visible
    await expect(chatPage.toolsControl).not.toBeVisible();

    // 3. Select a model that supports tools ("Claude Sonnet 4.5")
    await chatPage.selectModel("Claude Sonnet 4.5");

    // 4. Verify that the tools control button is visible
    await expect(chatPage.toolsControl).toBeVisible();

    // 5. Enable the RAG tool
    await chatPage.toggleTool("rag");

    // 6. Open the model picker and verify that only models with tool support are visible
    await chatPage.modelPicker.click();
    await expect(chatPage.getModelOption("Sonar Pro")).not.toBeAttached();
    await expect(chatPage.getModelOption("Claude Sonnet 4.5")).toBeAttached();
    await chatPage.closeDropdown(); // Close the dropdown

    // 7. Disable the RAG tool
    await chatPage.toggleTool("rag");

    // 8. Open the model picker and verify that all models are visible again
    await chatPage.modelPicker.click();
    await expect(chatPage.getModelOption("Sonar Pro")).toBeAttached();
    await expect(chatPage.getModelOption("Gemini 2.5 Pro")).toBeAttached();
    await chatPage.closeDropdown(); // Close the dropdown
  });
});
