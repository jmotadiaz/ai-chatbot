import { test, expect } from "../fixtures";
import { ChatPage } from "./pages/chat";

test.describe("Chat functionality", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
  });

  // FIXME(e2e, 2026-09-02): el catálogo de modelos expone ahora dos opciones que
  // contienen "MiniMax M3" (paga y (free)) → violation de strict-mode en el
  // selector del model picker. Ajustar el selector cuando se revise el spec.
  test.fixme("should allow modifying chat settings for different models", async () => {
    await chatPage.header.modelPicker.selectModel("basicChat");
    await expect.soft(chatPage.chat.settingsButton).toBeVisible();

    await chatPage.chat.openSettings();
    await expect
      .soft(chatPage.chat.settings.temperatureInput)
      .toHaveValue("0.6");

    // Modify temperature and verify it persists for this model
    await chatPage.chat.settings.setTemperature(0.5);

    await chatPage.closeDropdown();

    // Switch to a model with a different declared temperature
    await chatPage.header.modelPicker.selectModel("alwaysRefuses");
    await chatPage.chat.openSettings();
    await expect.soft(chatPage.chat.settings.temperatureInput).toHaveValue("1");
  });
});
