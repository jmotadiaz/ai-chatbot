import { test, expect } from "../fixtures";
import { ChatPage } from "./pages/chat";

test.describe("Chat functionality", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
  });

  test("should allow modifying chat settings for different models", async () => {
    await chatPage.header.modelPicker.selectModel("Qwen 3 Next Instruct");
    await expect.soft(chatPage.chat.settingsButton).toBeVisible();

    await chatPage.chat.openSettings();
    await expect
      .soft(chatPage.chat.settings.temperatureInput)
      .toHaveValue("0.7");

    // Modify temperature and verify it persists for this model
    await chatPage.chat.settings.setTemperature(0.5);

    await chatPage.closeDropdown();

    // Switch back to Kimi
    await chatPage.header.modelPicker.selectModel("Kimi K2.5");
    await chatPage.chat.openSettings();
    await expect.soft(chatPage.chat.settings.temperatureInput).toHaveValue("1");
  });
});
