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
    // Router model should not show settings button (no configurable params)
    await chatPage.header.modelPicker.selectModel("Router");
    await expect.soft(chatPage.chat.settingsButton).not.toBeVisible();

    // Claude Sonnet 4.5 should show settings (has temperature: 0.6)
    await chatPage.header.modelPicker.selectModel("Claude Sonnet 4.5");
    await expect.soft(chatPage.chat.settingsButton).toBeVisible();

    await chatPage.chat.openSettings();
    await expect
      .soft(chatPage.chat.settings.temperatureInput)
      .toHaveValue("0.6");
    await chatPage.closeDropdown();

    // Qwen3 Instruct should show settings (has temperature: 0.7, topP: 0.8)
    await chatPage.header.modelPicker.selectModel("Qwen3 Instruct");
    await expect.soft(chatPage.chat.settingsButton).toBeVisible();

    await chatPage.chat.openSettings();
    await expect
      .soft(chatPage.chat.settings.temperatureInput)
      .toHaveValue("0.7");

    // Modify temperature and verify it persists for this model
    await chatPage.chat.settings.setTemperature(0.5);
    await chatPage.closeDropdown();

    // Switch back to Claude Sonnet 4.5 - should show its default temperature (0.6)
    await chatPage.header.modelPicker.selectModel("Claude Sonnet 4.5");
    await chatPage.chat.openSettings();
    await expect
      .soft(chatPage.chat.settings.temperatureInput)
      .toHaveValue("0.6");
  });

  test("should send config to the assistant correctly", async () => {
    await chatPage.chat.openTools();
    await chatPage.chat.tools.toggleTool("rag");
    await chatPage.closeDropdown();

    await chatPage.header.modelPicker.selectModel("Qwen3 Instruct");

    await chatPage.chat.openSettings();

    await chatPage.chat.settings.setTemperature(0.6);
    await chatPage.closeDropdown();

    await chatPage.chat.sendMessage("Hello with all custom settings");
    await chatPage.chat.waitForLoadingComplete();
    const lastMessage = await chatPage.chat.getLastAssistantMessage();
    expect
      .soft(lastMessage)
      .toContain("Hello, I'm alibaba/qwen3-next-80b-a3b-instruct, Temperature: 0.6");
  });
});
