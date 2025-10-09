import { test, expect } from "../fixtures";
import { ChatPage } from "./page";

test.describe("Chat functionality", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page, authenticatedUser }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
    expect(authenticatedUser.email).toBeDefined();
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
});
