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
    await chatPage.header.modelPicker.selectModel("Router");
    await expect.soft(chatPage.chat.settingsButton).not.toBeVisible();

    await chatPage.header.modelPicker.selectModel("Claude Sonnet 4.5");
    await expect.soft(chatPage.chat.settingsButton).toBeVisible();

    await chatPage.header.modelPicker.selectModel("Qwen3 Next Instruct");
    await expect.soft(chatPage.chat.settingsButton).toBeVisible();

    await chatPage.chat.openSettings();
    await expect
      .soft(chatPage.chat.settings.temperatureInput)
      .toHaveValue("0.7");

    await chatPage.chat.settings.setTemperature(0.6);
    await chatPage.closeDropdown();

    await chatPage.header.modelPicker.selectModel("Claude Sonnet 4.5");
    await chatPage.chat.openSettings();
    await expect
      .soft(chatPage.chat.settings.temperatureInput)
      .toHaveValue("0.5");
  });

  test("should send config to the assistant correctly", async () => {
    await chatPage.header.modelPicker.selectModel("Qwen3 Next Instruct");

    await chatPage.chat.openSettings();

    await chatPage.chat.settings.setTemperature(0.6);
    await chatPage.closeDropdown();

    await chatPage.chat.sendMessage("Hello with all custom settings");
    await chatPage.chat.waitForLoadingComplete();
    const lastMessage = await chatPage.chat.getLastAssistantMessage();
    expect
      .soft(lastMessage)
      .toContain(
        "Hello, I'm qwen/qwen3-next-80b-a3b-instruct, Temperature: 0.6"
      );
  });
});
