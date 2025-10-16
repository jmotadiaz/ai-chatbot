import { test, expect } from "../fixtures";
import { ChatPage } from "./chat.page";

test.describe("Chat functionality", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page, authenticatedUser }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
    expect(authenticatedUser.email).toBeDefined();
  });

  test("should allow modifying chat settings for different models", async () => {
    await chatPage.header.selectModel("Router");
    await expect.soft(chatPage.settingsButton).not.toBeVisible();

    await chatPage.header.selectModel("Claude Sonnet 4.5");
    await expect.soft(chatPage.settingsButton).toBeVisible();

    await chatPage.header.selectModel("Qwen3 Next Instruct");
    await expect.soft(chatPage.settingsButton).toBeVisible();

    await chatPage.openSettings();
    await expect.soft(chatPage.temperatureInput).toHaveValue("0.7");
    await expect.soft(chatPage.topPInput).toHaveValue("0.8");
    await expect.soft(chatPage.topKInput).toHaveValue("20");

    await chatPage.setTemperature(0.6);
    await chatPage.setTopP(0.7);
    await chatPage.setTopK(15);
    await chatPage.closeDropdown();

    await chatPage.header.selectModel("Claude Sonnet 4.5");
    await chatPage.openSettings();
    await expect.soft(chatPage.temperatureInput).toHaveValue("0.5");
    await expect.soft(chatPage.topPInput).not.toBeVisible();
    await expect.soft(chatPage.topKInput).not.toBeVisible();
  });

  test("should send config to the assistant correctly", async () => {
    await chatPage.header.selectModel("Qwen3 Next Instruct");

    await chatPage.openSettings();

    await chatPage.setTemperature(0.6);
    await chatPage.setTopP(0.7);
    await chatPage.setTopK(15);
    await chatPage.closeDropdown();

    await chatPage.sendMessage("Hello with all custom settings");
    await chatPage.waitForLoadingComplete();
    const lastMessage = await chatPage.getLastAssistantMessage();
    expect
      .soft(lastMessage)
      .toContain(
        "Hello, I'm qwen/qwen3-next-80b-a3b-instruct, Temperature: 0.6, TopP: 0.7, TopK: 15"
      );
  });
});
