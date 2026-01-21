import { test, expect } from "../fixtures";
import { ChatPage } from "./pages/chat";

test.describe("Chat functionality", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page, authenticatedUser }) => {
    expect(authenticatedUser.email).toBeDefined();
    chatPage = new ChatPage(page);
    await chatPage.goto();
  });

  test("should allow modifying chat settings for different models", async () => {
    // Router model should not show settings button (no configurable params)
    await chatPage.header.modelPicker.selectModel("Router");
    await expect.soft(chatPage.chat.settingsButton).not.toBeVisible();

    await chatPage.header.modelPicker.selectModel("Kimi K2 Thinking");
    await expect.soft(chatPage.chat.settingsButton).toBeVisible();

    await chatPage.chat.openSettings();
    await expect.soft(chatPage.chat.settings.temperatureInput).toHaveValue("1");
    await chatPage.closeDropdown();

    await chatPage.header.modelPicker.selectModel("Qwen3 Instruct");
    await expect.soft(chatPage.chat.settingsButton).toBeVisible();

    await chatPage.chat.openSettings();
    await expect
      .soft(chatPage.chat.settings.temperatureInput)
      .toHaveValue("0.7");

    // Modify temperature and verify it persists for this model
    await chatPage.chat.settings.setTemperature(0.5);
    await chatPage.closeDropdown();

    await chatPage.header.modelPicker.selectModel("Kimi K2 Thinking");
    await chatPage.chat.openSettings();
    await expect.soft(chatPage.chat.settings.temperatureInput).toHaveValue("1");
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
    await chatPage.chat.waitForAssistantMessage();
    const lastMessage = await chatPage.chat.getLastAssistantMessage();
    expect
      .soft(lastMessage)
      .toContain(
        "Hello, I'm alibaba/qwen3-next-80b-a3b-instruct, Temperature: 0.6",
      );
  });
});
